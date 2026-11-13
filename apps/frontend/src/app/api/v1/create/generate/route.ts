import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rateLimit";
import { cloudAiConfig, cloudAiStatus, runCloudChat } from "@/lib/api/cloudAi";

/**
 * Creator Studio "Free AI" proxy (see lib/api/cloudAi.ts for the provider record).
 *
 * GET  — status only: is a provider key configured on this deployment, and which model serves?
 *        The /create page probes this once and only offers the cloud path when configured.
 * POST — one chat completion with the prompt the client built (features/create/prompts.ts).
 *
 * The key is a single shared free-tier key, so the POST is rate-limited twice: per user
 * (30/hour — generous for a person, useless for a script) and site-wide (600/day — sized to sit
 * just under Groq's free 200K tokens/day at our short prompt/response sizes, so no day's traffic
 * can drain the tier for everyone). Any upstream failure becomes UPSTREAM_FAILED and the client
 * falls back to the template engine / local model with an honest note — never an empty screen.
 *
 * The `user` cap is 12,000 chars, not 4,000: the emphasis feature sends one numbered line per
 * transcript word plus ~724 chars of instructions, so a 4,000 cap rejected every transcript
 * over ~250–365 words (a 2–3 minute video) with VALIDATION — which the client reported as
 * "the free AI service was not available", a failure no retry could ever fix. 12,000 chars is
 * ~3,000 prompt tokens worst case, still small against the 200K/day tier (the clipper's
 * highlight route already allows 24,000 for the same reason).
 */

const Body = z.object({
  system: z.string().min(1).max(4000),
  user: z.string().min(1).max(12000),
});

export const GET = route(async (req: Request) => {
  await requireUser(req);
  return ok(cloudAiStatus());
});

export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "create_ai", 30, 3600);
  await rateLimit("site", "create_ai_global", 600, 86_400);
  const body = await parseBody(req, Body);
  if (!cloudAiConfig()) {
    throw new ApiFailure("UPSTREAM_FAILED", "The free AI service is not switched on for this site yet.");
  }
  try {
    const text = await runCloudChat(body);
    return ok({ text });
  } catch {
    throw new ApiFailure("UPSTREAM_FAILED", "The free AI service could not be reached. Please try again in a moment.");
  }
});
