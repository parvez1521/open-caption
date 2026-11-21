import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rateLimit";
import { CloudAiError, cloudAiConfig, cloudAiStatus, runCloudChat } from "@/lib/api/cloudAi";
import {
  buildPlannerPrompt,
  parsePlannerResponse,
  segmentsOfTranscript,
  type TranscriptSegment,
} from "@/features/studio/aiEditPlanner";

/**
 * AI Edit visual plan (Studio revision, Task 9): the client sends ONLY the
 * timestamped transcript segments (from the in-browser Whisper run — the
 * video itself never leaves the tab) plus the chosen style. The route runs
 * the SAME free server-side text AI as Growth Coach (`runCloudChat`) and
 * returns a validated per-segment visual plan. No model or provider name
 * is ever returned to the client.
 *
 * When the free AI service is not configured the route answers
 * configured:false and the panel says so — there is no canned plan.
 *
 * When the AI call itself fails, the user gets the reason, not one generic
 * message (same rule as POST /api/v1/transcribe/correct, 2026-11-20): a
 * 401/403 means the free AI key is dead (expired or revoked), a 429 means
 * the free daily limit is used up, anything else keeps the "could not be
 * reached" wording. The upstream status is also logged server-side (no
 * key, no transcript text) so the failure can be traced in the deployment
 * logs.
 */

/** A full plan is at most 12 items (aiEditPlanner.ts) with prompts up to 500
 *  chars each — the shared 700-token default would truncate it mid-JSON,
 *  so the planner asks for a larger cap (12 items x ~150 tokens). */
const PLAN_MAX_TOKENS = 2000;

export const GET = route(async (req: Request) => {
  await requireUser(req);
  return ok(cloudAiStatus());
});

const Segment = z.object({
  startMs: z.number().finite().min(0),
  endMs: z.number().finite().min(0),
  text: z.string().min(1).max(2000),
});

const Body = z.object({
  segments: z.array(Segment).min(1).max(200),
  styleId: z.string().min(1).max(50),
  durationMs: z.number().finite().min(0).max(3_600_000),
});

export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  const body = await parseBody(req, Body);
  if (!cloudAiConfig()) return ok({ configured: false as const });
  await rateLimit(user.id, "ai_edit_plan", 30, 3600);
  await rateLimit("site", "create_ai_global", 600, 86_400);

  const segments: TranscriptSegment[] = segmentsOfTranscript(body.segments);
  const prompt = buildPlannerPrompt(segments, body.styleId, body.durationMs);
  let answer: string;
  try {
    answer = await runCloudChat(prompt, { temperature: 0.4, maxTokens: PLAN_MAX_TOKENS });
  } catch (err) {
    const status = err instanceof CloudAiError ? err.status : undefined;
    console.error(
      JSON.stringify({ level: "error", msg: "ai-edit/plan free AI call failed", status: status ?? "unknown" }),
    );
    if (status === 401 || status === 403) {
      throw new ApiFailure(
        "UPSTREAM_FAILED",
        "The free AI key isn't working. It may have expired, so check the key in Vercel.",
      );
    }
    if (status === 429) {
      throw new ApiFailure("RATE_LIMITED", "The free AI daily limit is used up. Try again tomorrow.");
    }
    throw new ApiFailure("UPSTREAM_FAILED", "The free AI service could not be reached. Please try again in a moment.");
  }
  const { plan, dropped } = parsePlannerResponse(answer, { durationMs: body.durationMs });
  return ok({ configured: true as const, plan, dropped });
});
