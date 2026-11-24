import "server-only";

import { CloudAiError, type CloudAiEnv } from "./cloudAi";

/**
 * Server-side Whisper-large-v3-turbo transcription through Cloudflare Workers AI
 * (the same free 10,000 Neurons/day pool as the text planner and FLUX images).
 *
 * Why this model: it is a genuine accuracy upgrade over the in-browser Whisper-base
 * the Studio uses today — LibriSpeech WER 4.98% down to 2.01% — at ~47 neurons per
 * audio minute, so the shared free pool buys roughly 214 audio minutes a day. It is
 * an accuracy track, NOT a timing fix: like every Whisper model it still produces
 * word timestamps from DTW alignment, so its times carry the same systematic lag
 * the in-browser path has (see refineWordTimings in speech.ts), and the bias
 * correction applies to its words too when they reach the Studio.
 *
 * What is UNVERIFIED: the turbo `words[]` response field. The documented turbo
 * output lists `text`, `word_count`, `segments` and `vtt` — no `words` (the older
 * `@cf/openai/whisper` model is the one documented with `words`). The parser below
 * therefore treats `words` as a candidate shape only: a words array is accepted
 * solely when every entry validates (finite start/end, start < end, monotonic,
 * inside the chunk, seconds not milliseconds), and otherwise the result falls back
 * to segment timestamps, then to plain text. Word times are NEVER invented — a
 * response with no usable timed data returns text only, and the caller (the
 * client helper, or the Studio later) falls back to the in-browser path instead
 * of trusting made-up times. A live call against the real endpoint is still owed
 * before the UI may use word-level times from this route.
 *
 * Input shape (Cloudflare's own Whisper-large-v3-turbo tutorial): JSON
 * `{ audio: <base64> }` on the REST `/ai/run/<model>` endpoint, with the
 * documented optional `language` parameter. No other parameters are sent: extra
 * fields have 400'd this endpoint's siblings before (the FLUX `seed` case).
 * No retry: every attempt costs Neurons from the shared free pool.
 *
 * Nothing in here may run without the Cloudflare credentials: with no account
 * id or token the config is null, the status route reports "not configured",
 * and the route answers configured:false.
 */

export const WHISPER_TURBO_MODEL = "@cf/openai/whisper-large-v3-turbo";
export const WHISPER_TURBO_MODEL_NAME = "Whisper large-v3-turbo";

const WORKERS_AI_BASE = "https://api.cloudflare.com/client/v4/accounts";
const SPEECH_TIMEOUT_MS = 45_000;
/** A word longer than this cannot be real speech in a <= 30 s chunk — it is a units mix-up. */
const MAX_WORD_MS = 10_000;

export interface CloudSpeechConfig {
  apiKey: string;
  /** The Workers AI `/ai/run/<model>` endpoint for Whisper-large-v3-turbo. */
  endpoint: string;
}

/**
 * Null when CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_KEY is unset or blank —
 * the speech path simply does not exist then (same rule as the text/image paths).
 */
export function cloudSpeechConfig(env: CloudAiEnv = (process.env as unknown as CloudAiEnv)): CloudSpeechConfig | null {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiKey = env.CLOUDFLARE_API_KEY?.trim();
  if (!accountId || !apiKey) return null;
  return { apiKey, endpoint: `${WORKERS_AI_BASE}/${accountId}/ai/run/${WHISPER_TURBO_MODEL}` };
}

export interface CloudSpeechWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface CloudSpeechSegment {
  text: string;
  startMs: number;
  endMs: number;
}

export interface CloudSpeechResult {
  /** The transcript text (from `text`, else the segment texts joined). */
  text: string;
  /** Word times — empty unless `wordTimestamps` is true. */
  words: CloudSpeechWord[];
  /** Segment times — empty unless `segmentTimestamps` is true. */
  segments: CloudSpeechSegment[];
  /** True only when every word entry validated (see above). */
  wordTimestamps: boolean;
  /** True only when every segment entry validated. */
  segmentTimestamps: boolean;
}

export interface ParseWhisperTurboOptions {
  /** Offset (ms) of this chunk inside the full clip; added to every time. */
  chunkStartMs?: number;
  /** Length (ms) of the audio chunk, when known — times past it are rejected. */
  chunkDurationMs?: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** One timed entry, seconds -> ms. Accepts `start`/`end` numbers or a `timestamp: [start, end]` pair. */
function timedEntry(
  entry: unknown,
  opts: ParseWhisperTurboOptions,
): { text: string; startMs: number; endMs: number } | null {
  if (!isRecord(entry)) return null;
  const textRaw = entry.word ?? entry.text;
  if (typeof textRaw !== "string" || textRaw.trim().length === 0) return null;
  let start: unknown = entry.start;
  let end: unknown = entry.end;
  if ((start === undefined || end === undefined) && Array.isArray(entry.timestamp) && entry.timestamp.length === 2) {
    [start, end] = entry.timestamp;
  }
  if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  const offset = opts.chunkStartMs ?? 0;
  const startMs = Math.round(start * 1000) + offset;
  const endMs = Math.round(end * 1000) + offset;
  if (startMs < offset || endMs <= startMs) return null;
  if (endMs - startMs > MAX_WORD_MS) return null;
  if (opts.chunkDurationMs !== undefined && endMs > offset + opts.chunkDurationMs + 1000) return null;
  return { text: textRaw.trim(), startMs, endMs };
}

/** A whole timed array validates only when EVERY entry validates and the times are monotonic. */
function timedArray(
  value: unknown,
  opts: ParseWhisperTurboOptions,
): { text: string; startMs: number; endMs: number }[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: { text: string; startMs: number; endMs: number }[] = [];
  for (const entry of value) {
    const parsed = timedEntry(entry, opts);
    if (!parsed) return null;
    if (out.length > 0 && parsed.startMs < out[out.length - 1]!.endMs - 50) return null;
    out.push(parsed);
  }
  return out;
}

/**
 * Defensive parse of a turbo response body. Reads `result` when the REST envelope is
 * present, else the body itself. Word times are accepted only as a whole valid array;
 * any invalid entry voids the array and the result falls back to segments, then to
 * text alone. Never throws for a malformed body — it returns what could be trusted.
 */
export function parseWhisperTurboResult(body: unknown, opts: ParseWhisperTurboOptions = {}): CloudSpeechResult {
  const empty: CloudSpeechResult = { text: "", words: [], segments: [], wordTimestamps: false, segmentTimestamps: false };
  const root = isRecord(body) ? (isRecord(body.result) ? body.result : body) : null;
  if (!root) return empty;
  const words = timedArray(root.words, opts);
  const segments = timedArray(root.segments, opts);
  const textField = typeof root.text === "string" ? root.text.trim() : "";
  const text = textField || segments?.map((s) => s.text).join(" ").trim() || words?.map((w) => w.text).join(" ").trim() || "";
  return {
    text,
    words: words ?? [],
    segments: segments ?? [],
    wordTimestamps: words !== null,
    segmentTimestamps: segments !== null,
  };
}

export interface RunCloudSpeechOptions {
  config?: CloudSpeechConfig | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** BCP-47-ish language hint ("en", "hi") — sent only when given. */
  language?: string;
  chunkStartMs?: number;
  chunkDurationMs?: number;
}

/**
 * One audio chunk through Whisper-large-v3-turbo. Resolves with the parsed result;
 * throws CloudAiError on any failure (same kinds as the text/image paths: "http"
 * with a status, "timeout", "network", "empty"). `fetchImpl`/`config` are injectable
 * so tests never touch the network or a real token.
 */
export async function runCloudSpeech(
  audioBase64: string,
  opts: RunCloudSpeechOptions = {},
): Promise<CloudSpeechResult> {
  const config = opts.config !== undefined ? opts.config : cloudSpeechConfig();
  if (!config) throw new CloudAiError("The free AI service is not configured (Cloudflare credentials are unset).");
  const doFetch = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? SPEECH_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await doFetch(config.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ audio: audioBase64, ...(opts.language ? { language: opts.language } : {}) }),
        signal: ctrl.signal,
      });
    } catch (err) {
      if (ctrl.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
        throw new CloudAiError("The free AI speech request timed out.", undefined, "timeout");
      }
      throw new CloudAiError("The free AI speech request failed before answering.", undefined, "network");
    }
    if (!res.ok) {
      let upstream: string | undefined;
      try {
        const text = typeof res.text === "function" ? await res.text() : "";
        if (text) upstream = text.slice(0, 300);
      } catch {
        // Reading the error body must never mask the failure itself.
      }
      throw new CloudAiError(
        `The free AI service answered with HTTP ${res.status}.`,
        res.status,
        "http",
        upstream !== undefined ? { upstream } : undefined,
      );
    }
    const body: unknown = await res.json().catch(() => null);
    const parsed = parseWhisperTurboResult(body, { chunkStartMs: opts.chunkStartMs, chunkDurationMs: opts.chunkDurationMs });
    if (!parsed.text && !parsed.wordTimestamps && !parsed.segmentTimestamps) {
      throw new CloudAiError("The free AI service returned an empty transcription.", undefined, "empty");
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}
