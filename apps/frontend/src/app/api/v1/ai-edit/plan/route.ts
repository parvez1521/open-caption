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
 * the free daily limit is used up, a 410 means Cloudflare retired the
 * model (the Llama 3.1 8B default did exactly this on 2026-11-21 — five
 * logged 410s, no plan ever), a timeout means the model took too long to
 * answer, an empty completion means it answered with nothing usable —
 * anything else keeps the "could not be reached" wording. The upstream
 * status, failure kind and error message are also logged server-side (no
 * key, no transcript text) so the failure can be traced in the deployment
 * logs. (Before 2026-11-21 the log carried only the status, so timeouts
 * and empty answers both showed up as "unknown" — that is what the Gemma
 * retest hit twice.)
 */

/** A full plan is at most 8 items (aiEditPlanner.ts) with prompts up to 500
 *  chars each — the shared 700-token default would truncate it mid-JSON,
 *  so the planner asks for a larger cap (8 items x ~150 tokens).
 *  The cap used to be 12 items / 2000 tokens, but the live test project
 *  timed out twice at 25s per attempt on 2026-11-21 (two attempts, ~60s,
 *  "could not be reached") — a 2000-token reply does not finish inside the
 *  25s budget on the shared free tier. One 45s attempt for a shorter plan
 *  fits the route's serverless budget instead. */
const PLAN_MAX_TOKENS = 1200;
/** One long attempt, not two short ones: the retry would push the route
 *  past its serverless budget (see cloudAi.ts). */
const PLAN_TIMEOUT_MS = 45_000;

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
    answer = await runCloudChat(prompt, {
      temperature: 0.4,
      maxTokens: PLAN_MAX_TOKENS,
      timeoutMs: PLAN_TIMEOUT_MS,
      maxAttempts: 1,
    });
  } catch (err) {
    const status = err instanceof CloudAiError ? err.status : undefined;
    const kind = err instanceof CloudAiError ? err.kind : undefined;
    console.error(
      JSON.stringify({
        level: "error",
        msg: "ai-edit/plan free AI call failed",
        status: status ?? "unknown",
        kind: kind ?? "unknown",
        error: err instanceof Error ? err.message : String(err),
      }),
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
    if (status === 410) {
      throw new ApiFailure(
        "UPSTREAM_FAILED",
        "Cloudflare retired this free AI model, so no plan can be made right now. The site needs a newer model set in Vercel.",
      );
    }
    if (kind === "timeout") {
      throw new ApiFailure(
        "UPSTREAM_FAILED",
        "The free AI took too long to answer. Try again — a shorter video plans faster.",
      );
    }
    if (kind === "empty") {
      throw new ApiFailure(
        "UPSTREAM_FAILED",
        "The free AI answered but made no visuals from this transcript. Try again.",
      );
    }
    throw new ApiFailure("UPSTREAM_FAILED", "The free AI service could not be reached. Please try again in a moment.");
  }
  const { plan, dropped } = parsePlannerResponse(answer, { durationMs: body.durationMs });
  return ok({ configured: true as const, plan, dropped });
});
