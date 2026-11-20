/**
 * Correction pass for the /transcribe plain text.
 *
 * Whisper (base-size, in-browser) mishears Roman-Hinglish words often
 * enough that the owner asked for the transcript to be "trained". Real
 * fine-tuning is not feasible free/in-browser, so the fix is a short
 * correction pass over the PLAIN transcript text with the existing free
 * server text AI (the same path Growth Coach and the AI Edit planner use):
 * it fixes misheard words, spelling, and grammar after Whisper runs.
 *
 * Plain text ONLY — never timed captions. A rewrite changes word counts
 * and order, which would break word timings, so caption words are never
 * sent through this pass.
 *
 * No model or provider name ever appears here or in the UI.
 */

import { apiClient } from "@/services/api-client";

/** Longest transcript the route accepts (about 1,500 words). */
export const CORRECTION_MAX_CHARS = 6000;
/** One correction call covers at most this much text. */
export const CORRECTION_CHUNK_CHARS = 1200;
/** Response cap per chunk call (the free-AI default is 700; a chunk's fix fits in 800). */
export const CORRECTION_MAX_TOKENS = 800;

const SENTENCE_END = /(?<=[.!?।])\s+/;

/**
 * Split transcript text into sentence-aware chunks of at most `maxChars`.
 * Sentences are packed in order; a single sentence longer than the cap is
 * hard-split on word boundaries so no chunk ever exceeds the cap.
 */
export function splitTranscriptForCorrection(text: string, maxChars: number = CORRECTION_CHUNK_CHARS): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];
  const sentences = clean.split(SENTENCE_END).filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  const push = () => {
    if (cur) chunks.push(cur);
    cur = "";
  };
  const hardSplit = (s: string) => {
    const words = s.split(" ");
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (next.length > maxChars && cur) {
        push();
        cur = w;
      } else {
        cur = next;
      }
    }
  };
  for (const s of sentences) {
    const next = cur ? `${cur} ${s}` : s;
    if (next.length <= maxChars) {
      cur = next;
    } else if (cur) {
      push();
      if (s.length <= maxChars) cur = s;
      else hardSplit(s);
    } else {
      hardSplit(s);
    }
  }
  push();
  return chunks;
}

const LANGUAGE_LABEL: Record<string, string> = {
  hinglish: "Hinglish — Hindi written in Roman letters, mixed with English words",
  hindi: "Hindi in Devanagari script",
  en: "English",
};

const SCRIPT_RULE: Record<string, string> = {
  hinglish: "Roman Hinglish stays Roman — never convert it to Devanagari",
  hindi: "Devanagari stays Devanagari",
  en: "English stays English",
};

/**
 * The prompt for one chunk. Strict on purpose: fix errors, change nothing
 * else. The model must return only the corrected text — no preamble, no
 * explanation — so the result can replace the chunk as-is.
 */
export function buildCorrectionPrompt(chunk: string, language: string): { system: string; user: string } {
  const label = LANGUAGE_LABEL[language] ?? "the language it is written in";
  const scriptRule = SCRIPT_RULE[language] ?? "keep the text in the language and script it is written in";
  return {
    system: `You fix transcription mistakes in a ${label} transcript. Fix misheard words, spelling, and grammar. Keep the same language and script — ${scriptRule}. Do not add new content, do not remove content, do not reword sentences beyond fixing errors. Keep proper nouns as spoken. Return only the corrected text, nothing else.`,
    user: chunk,
  };
}

/**
 * Strip the wrapping the model sometimes adds around the corrected text
 * (markdown fences, surrounding quotes, a "Corrected text:" label line).
 * Conservative: only strips when the WHOLE output is wrapped, never edits
 * the middle of the text.
 */
export function cleanCorrectionOutput(text: string): string {
  let out = text.trim();
  const fence = out.match(/^```(?:\w+)?\s*\n([\s\S]*?)\n```$/);
  if (fence) out = fence[1]!.trim();
  const label = out.match(/^(?:corrected(?: transcript| text)?|here is the corrected[^:]*):\s*\n?([\s\S]*)$/i);
  if (label) out = label[1]!.trim();
  if (
    out.length >= 2 &&
    ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'")))
  ) {
    out = out.slice(1, -1).trim();
  }
  return out;
}

export interface TranscriptCorrectionClient {
  post<T>(path: string, init?: { json?: unknown; signal?: AbortSignal }): Promise<T>;
}

/**
 * Ask the server to correct a transcript's plain text. The app's own API
 * goes through the authed apiClient (never raw fetch). Throws a plain
 * message when the free AI service is not switched on, so the page can say
 * so instead of spinning.
 */
export async function requestTranscriptCorrection(
  text: string,
  language: string,
  client: TranscriptCorrectionClient = apiClient,
): Promise<string> {
  const res = await client.post<{ configured: boolean; corrected?: string }>(`/transcribe/correct`, {
    json: { text, language },
  });
  if (!res.configured) throw new Error("The free AI service is not switched on yet, so the transcript can't be checked.");
  if (!res.corrected?.trim()) throw new Error("The check came back empty. Please try again.");
  return res.corrected;
}
