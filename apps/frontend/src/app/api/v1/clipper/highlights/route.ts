import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rateLimit";
import { cloudAiConfig, cloudAiStatus, runCloudChat } from "@/lib/api/cloudAi";

/**
 * AI Clipping Studio "Free AI" proxy — the sibling of /api/v1/create/generate
 * (same provider record: lib/api/cloudAi.ts, Groq free tier, key server-side
 * only), sized for transcript work instead of short batches:
 *
 * GET  — status only: is the free AI configured on this deployment?
 * POST — one chat completion with the highlight prompt the client built
 *        (features/clipper/highlights/prompt.ts). The client sends TRANSCRIPT
 *        TEXT ONLY — no audio or video ever reaches this route or the provider.
 *
 * Caps and limits are sized for windows: a window prompt carries up to ~8
 * minutes of index-tagged transcript (24,000 chars), and a reply carries
 * several scored candidates (2,000 tokens at temperature 0.4 — editorial
 * judgment, not creative writing). Rate-limited per user (90/hour — a
 * two-hour video is ~17 windows, with headroom for retries) and site-wide
 * (500/day, under the free tier's 200K tokens/day at these prompt sizes).
 * Any upstream failure becomes UPSTREAM_FAILED and the client falls back to
 * the on-device model or the measured-signals path with an honest note.
 */

const Body = z.object({
  system: z.string().min(1).max(3000),
  user: z.string().min(1).max(24000),
});

export const GET = route(async (req: Request) => {
  await requireUser(req);
  return ok(cloudAiStatus());
});

export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "clip_ai", 90, 3600);
  await rateLimit("site", "clip_ai_global", 500, 86_400);
  const body = await parseBody(req, Body);
  if (!cloudAiConfig()) {
    throw new ApiFailure("UPSTREAM_FAILED", "The free AI service is not switched on for this site yet.");
  }
  try {
    const text = await runCloudChat(body, { maxTokens: 2000, temperature: 0.4 });
    return ok({ text });
  } catch {
    throw new ApiFailure("UPSTREAM_FAILED", "The free AI service could not be reached. Please try again in a moment.");
  }
});
