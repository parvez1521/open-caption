/**
 * Overlapping transcript windows for the highlight model.
 *
 * Windows are 8 minutes of speech with a 60-second overlap (AutoClip's numbers,
 * adopted as methodology): a moment straddling a window edge is seen whole by at
 * least one window, and the overlap is measured in TIME then converted back to
 * word indices, so it stays constant regardless of speaking pace. A moment on a
 * seam is therefore proposed by the window that contains it fully — and the
 * duplicate proposals the overlap also creates are removed later by IoU dedupe
 * over the shared global index space.
 *
 * One extra guard AutoClip (a local tool with a big context) did not need: our
 * cloud route caps the user prompt, so a window's rendered text has a character
 * budget. Fast speech can overflow 8 minutes of `[index]word` text; when it
 * would, the window is shortened from the end (the next window still starts
 * 60 s before the shortened end, so no seam opens up).
 */
import type { HighlightWord } from "./types";

export const WINDOW_SECONDS = 480;
export const WINDOW_OVERLAP_SECONDS = 60;
/**
 * Character budget for one window's rendered `[index]word` text. The route cap
 * for the whole user prompt is 24,000; the rubric + contract header takes
 * roughly 2,000, leaving this for the transcript itself.
 */
export const WINDOW_TEXT_BUDGET = 21_000;

/** Rendered length of a word in `[index]word` form, plus its separating space. */
const renderedLen = (index: number, word: HighlightWord): number =>
  word.text.length + String(index).length + 3; // "[" + index + "]" + space

export interface HighlightWindow {
  /** 0-based window number, in transcript order */
  index: number;
  firstWord: number;
  lastWord: number;
  startMs: number;
  endMs: number;
}

/** First word index whose start is at or after `atMs` (words are time-ordered). */
function indexAtTime(words: readonly HighlightWord[], atMs: number): number {
  let lo = 0;
  let hi = words.length - 1;
  let ans = words.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid]!.startMs >= atMs) {
      ans = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return ans;
}

export function buildWindows(
  words: readonly HighlightWord[],
  opts: { windowSec?: number; overlapSec?: number; textBudget?: number } = {},
): HighlightWindow[] {
  const windowMs = (opts.windowSec ?? WINDOW_SECONDS) * 1000;
  const overlapMs = (opts.overlapSec ?? WINDOW_OVERLAP_SECONDS) * 1000;
  const budget = opts.textBudget ?? WINDOW_TEXT_BUDGET;
  if (words.length === 0) return [];
  if (overlapMs >= windowMs) throw new Error("window overlap must be smaller than the window");

  const windows: HighlightWindow[] = [];
  let cursor = 0;
  while (cursor < words.length) {
    const windowEndTime = words[cursor]!.startMs + windowMs;
    let last = cursor;
    while (last + 1 < words.length && words[last + 1]!.endMs <= windowEndTime) last++;

    // char-budget shrink: drop words from the end until the rendering fits
    // (never below a 30 s floor of speech, so a pathological word still yields
    // a usable — if over-budget — window rather than an empty one)
    let cost = 0;
    let fit = cursor;
    while (fit <= last) {
      cost += renderedLen(fit, words[fit]!);
      if (cost > budget && words[fit]!.endMs - words[cursor]!.startMs > 30_000) break;
      fit++;
    }
    if (fit <= last) last = Math.max(cursor, fit - 1);

    windows.push({
      index: windows.length,
      firstWord: cursor,
      lastWord: last,
      startMs: words[cursor]!.startMs,
      endMs: words[last]!.endMs,
    });
    if (last >= words.length - 1) break;

    const nextTime = words[last]!.endMs - overlapMs;
    cursor = Math.max(cursor + 1, indexAtTime(words, nextTime));
  }
  return windows;
}

/**
 * Render a window's words as `[index]word` text with a newline at each sentence
 * start — the model copies indices it can see; it never has to count or to
 * estimate seconds.
 */
export function renderWindowText(
  words: readonly HighlightWord[],
  window: HighlightWindow,
  sentenceStarts: ReadonlySet<number>,
): string {
  const parts: string[] = [];
  for (let i = window.firstWord; i <= window.lastWord; i++) {
    if (i > window.firstWord && sentenceStarts.has(i)) parts.push("\n");
    parts.push(`[${i}]${words[i]!.text}`);
  }
  return parts.join(" ").replace(/ \n /g, "\n");
}
