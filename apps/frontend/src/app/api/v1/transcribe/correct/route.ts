import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rateLimit";
import { CloudAiError, cloudAiConfig, runCloudChat } from "@/lib/api/cloudAi";
import {
  buildCorrectionPrompt,
  cleanCorrectionOutput,
  CORRECTION_MAX_CHARS,
  CORRECTION_MAX_TOKENS,
  splitTranscriptForCorrection,
} from "@/features/transcribe/correctTranscript";

/**
 * Correct a /transcribe plain-text transcript (Hinglish mistakes, misheard
 * words, spelling, grammar) with the SAME free server-side text AI as
 * Growth Coach and the AI Edit planner (`runCloudChat`). Plain text ONLY:
 * a rewrite would break timed caption words, so captions never come here.
 * No model or provider name is ever returned to the client.
 *
 * The text is split into sentence-aware chunks (one AI call per chunk, low
 * temperature so fixes stay conservative). Per-user rate limit keeps one
 * user from spending the shared free budget; the global site bucket is the
 * same one Growth Coach and AI Edit share. When the free AI service is not
 * configured the route answers configured:false and the page says so —
 * there is no canned correction.
 *
 * When the AI call itself fails, the user gets the reason, not one generic
 * message: a 401/403 means the free AI key is dead (expired or revoked),
 * a 429 means the free daily limit is used up, anything else keeps the
 * "could not be reached" wording. The upstream status is also logged
 * server-side (no key, no transcript text) so the failure can be traced
 * in the deployment logs.
 */

const Body = z.object({
  text: z.string().trim().min(1).max(CORRECTION_MAX_CHARS),
  language: z.string().min(1).max(30),
});

export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  const body = await parseBody(req, Body);
  if (!cloudAiConfig()) return ok({ configured: false as const });
  await rateLimit(user.id, "transcribe_correct", 10, 3600);
  await rateLimit("site", "create_ai_global", 600, 86_400);

  const chunks = splitTranscriptForCorrection(body.text);
  const corrected: string[] = [];
  for (const chunk of chunks) {
    let answer: string;
    try {
      answer = await runCloudChat(buildCorrectionPrompt(chunk, body.language), {
        temperature: 0.2,
        maxTokens: CORRECTION_MAX_TOKENS,
      });
    } catch (err) {
      const status = err instanceof CloudAiError ? err.status : undefined;
      console.error(
        JSON.stringify({ level: "error", msg: "transcribe/correct free AI call failed", status: status ?? "unknown" }),
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
    corrected.push(cleanCorrectionOutput(answer));
  }
  return ok({ configured: true as const, corrected: corrected.join("\n"), chunks: chunks.length });
});
