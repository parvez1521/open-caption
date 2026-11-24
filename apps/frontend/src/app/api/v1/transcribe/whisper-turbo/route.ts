import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rateLimit";
import { CloudAiError } from "@/lib/api/cloudAi";
import { cloudSpeechConfig, runCloudSpeech } from "@/lib/api/cloudSpeech";

/**
 * Server-side transcription with Cloudflare Workers AI Whisper-large-v3-turbo
 * (the same free 10,000 Neurons/day pool as the text planner and FLUX images).
 * The client sends ONE audio chunk (base64, up to ~30 s — the client helper in
 * features/transcribe/cloudTranscribe.ts cuts longer audio into 28 s chunks with
 * a 2 s overlap) and the route returns the transcript plus whatever timed data
 * the answer carried that could be validated: word times when the words array
 * is fully valid, else segment times, else text alone. No model or provider
 * name is ever returned to the client, and the in-browser Whisper-base path
 * stays the fallback/offline path — this route never replaces it.
 *
 * Accuracy, honestly: turbo is a genuine word-accuracy upgrade over
 * Whisper-base (LibriSpeech WER 4.98% down to 2.01%), but it does NOT fix
 * timing — every Whisper model produces word times from DTW alignment, so
 * turbo's times carry the same systematic lag, and the Studio's bias
 * correction (refineWordTimings) applies to them too. Its `words[]` response
 * field is UNVERIFIED live (the documented turbo output lists `segments`,
 * not `words`): the parser accepts words only when every entry validates,
 * and the route flags which kind of times it is returning, so the client
 * falls back to segments or to the in-browser path instead of trusting
 * invented word times.
 *
 * Cost guard: ~47 neurons per audio minute, so a 30 s chunk costs ~23
 * neurons. The buckets below (20 calls/day per user, 100/day site-wide)
 * are about 10 and 50 audio minutes a day — roughly 2,300 neurons at the
 * site cap, inside the shared 10,000/day pool even alongside text/image.
 *
 * Failure wording follows the plan/generate-image routes: a 401/403 means
 * the free AI key is dead, a 429 means the free daily limit is used up, a
 * 410 means Cloudflare retired the model, a timeout means the model took too
 * long, an empty answer means it returned no transcription — anything else
 * keeps the "could not be reached" wording. The upstream status, failure
 * kind and error message are also logged server-side (no key, no audio) so
 * the failure can be traced in the deployment logs.
 */

export const GET = route(async (req: Request) => {
  await requireUser(req);
  return ok({ configured: !!cloudSpeechConfig() });
});

/** Base64 text: 6,000,000 chars is ~4.5 MB of audio — a 30 s chunk in any compressed codec. */
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const Body = z.object({
  audioBase64: z.string().min(1).max(6_000_000).regex(BASE64_RE, "audioBase64 must be base64"),
  language: z.string().min(1).max(10).optional(),
  chunkStartMs: z.number().int().min(0).max(3_600_000).optional(),
  chunkDurationMs: z.number().int().min(1).max(60_000).optional(),
});

export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  const body = await parseBody(req, Body);
  if (!cloudSpeechConfig()) return ok({ configured: false as const });
  const bytes = Buffer.from(body.audioBase64, "base64");
  if (bytes.length === 0 || bytes.length > 4_500_000) {
    throw new ApiFailure("VALIDATION", "Audio chunk is empty or too large");
  }
  await rateLimit(user.id, "transcribe_whisper_turbo", 20, 86_400);
  await rateLimit("site", "transcribe_whisper_turbo_site", 100, 86_400);

  let result: Awaited<ReturnType<typeof runCloudSpeech>>;
  try {
    result = await runCloudSpeech(body.audioBase64, {
      language: body.language,
      chunkStartMs: body.chunkStartMs,
      chunkDurationMs: body.chunkDurationMs,
    });
  } catch (err) {
    const status = err instanceof CloudAiError ? err.status : undefined;
    const kind = err instanceof CloudAiError ? err.kind : undefined;
    const detail = err instanceof CloudAiError ? err.detail : undefined;
    console.error(
      JSON.stringify({
        level: "error",
        msg: "transcribe/whisper-turbo free AI call failed",
        status: status ?? "unknown",
        kind: kind ?? "unknown",
        error: err instanceof Error ? err.message : String(err),
        ...(detail !== undefined ? { detail } : {}),
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
        "Cloudflare retired this free speech model, so no transcription can be made right now. The site needs a newer model set in Vercel.",
      );
    }
    if (kind === "timeout") {
      throw new ApiFailure(
        "UPSTREAM_FAILED",
        "The free AI took too long to transcribe the audio. Try again — a shorter chunk transcribes faster.",
      );
    }
    if (kind === "empty") {
      throw new ApiFailure("UPSTREAM_FAILED", "The free AI answered but transcribed nothing. Try again.");
    }
    throw new ApiFailure("UPSTREAM_FAILED", "The free AI service could not be reached. Please try again in a moment.");
  }
  console.info(
    JSON.stringify({
      level: "info",
      msg: "transcribe/whisper-turbo free AI call succeeded",
      textLength: result.text.length,
      words: result.words.length,
      segments: result.segments.length,
      wordTimestamps: result.wordTimestamps,
      segmentTimestamps: result.segmentTimestamps,
    }),
  );
  return ok({
    configured: true as const,
    text: result.text,
    words: result.words,
    segments: result.segments,
    wordTimestamps: result.wordTimestamps,
    segmentTimestamps: result.segmentTimestamps,
  });
});
