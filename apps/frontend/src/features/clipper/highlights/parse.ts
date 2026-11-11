/**
 * Parsing the model's highlight reply — strict where it matters, forgiving
 * where it's safe (the emphasis/AI-Edit parser discipline):
 *
 * - The reply must contain a JSON object with a `clips` array; anything else
 *   throws, and the engine retries once with the error appended
 *   (retry-with-feedback) before giving up on that window.
 * - A candidate is kept only with usable word indices, a non-empty title and a
 *   numeric score — a candidate that cannot be ranked honestly is dropped, not
 *   repaired. Text fields are trimmed and length-capped.
 * - A missing score_breakdown field falls back to the candidate's overall
 *   score (the model judged the clip; it just didn't split the judgment).
 *   Breakdown values are clamped to 0–100.
 * - Indices are clamped into the window that was actually shown to the model;
 *   indices wildly outside it mark the candidate unusable.
 */
import type { ModelSubScores, RawCandidate } from "./types";

const TITLE_MAX = 80;
const TEXT_MAX = 240;

const clampScore = (v: number): number => Math.min(100, Math.max(0, Math.round(v)));

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max).trim() : "";
}

export function parseHighlightReply(
  raw: string,
  window: { index: number; firstWord: number; lastWord: number },
): RawCandidate[] {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("the reply contained no JSON object");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error("the reply was not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("the reply was not a JSON object");
  const clips = (parsed as { clips?: unknown }).clips;
  if (!Array.isArray(clips)) throw new Error("the reply had no clips array");

  const out: RawCandidate[] = [];
  for (const item of clips) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const startWord = num(it.start_word_index);
    const endWord = num(it.end_word_index);
    const score = num(it.score);
    const title = str(it.title, TITLE_MAX);
    if (startWord === null || endWord === null || score === null || !title) continue;

    let s = Math.round(startWord);
    let e = Math.round(endWord);
    // entirely outside the shown window → the model cited another section; unusable
    if (e < window.firstWord || s > window.lastWord) continue;
    s = Math.max(window.firstWord, Math.min(s, window.lastWord));
    e = Math.max(window.firstWord, Math.min(e, window.lastWord));
    if (e <= s) continue;

    const bd = (it.score_breakdown && typeof it.score_breakdown === "object" ? it.score_breakdown : {}) as Record<string, unknown>;
    const overall = clampScore(score);
    const sub = (key: keyof ModelSubScores): number => {
      const v = num(bd[key === "storyCompleteness" ? "story_completeness" : key]);
      return v === null ? overall : clampScore(v);
    };
    out.push({
      startWord: s,
      endWord: e,
      title,
      summary: str(it.summary, TEXT_MAX),
      reason: str(it.reason, TEXT_MAX),
      modelScore: overall,
      breakdown: {
        hook: sub("hook"),
        value: sub("value"),
        storyCompleteness: sub("storyCompleteness"),
        engagement: sub("engagement"),
      },
      windowIndex: window.index,
    });
  }
  return out;
}
