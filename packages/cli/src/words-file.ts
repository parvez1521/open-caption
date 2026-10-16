import { readFileSync } from "node:fs";
import { CaptionsEasyError } from "./errors";
import { existingFile } from "./fsutil";
import type { TranscriptWord } from "./types";

/** Read words from JSON: a bare array, or any object with a `words` array (a transcribe() result, a studio export). */
export function readWordsFile(path: string): { words: TranscriptWord[]; language?: string } {
  const abs = existingFile(path, "Words file");
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(abs, "utf8"));
  } catch (e) {
    throw new CaptionsEasyError("BAD_WORDS", `${abs} is not valid JSON: ${(e as Error).message}`);
  }
  const words = Array.isArray(data) ? data : (data as { words?: unknown })?.words;
  if (!Array.isArray(words)) throw new CaptionsEasyError("BAD_WORDS", `${abs} must hold an array of { text, startMs, endMs } or an object with a "words" array.`);
  const language = !Array.isArray(data) && typeof (data as { language?: unknown }).language === "string" ? (data as { language: string }).language : undefined;
  return { words: words as TranscriptWord[], language };
}
