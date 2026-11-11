/**
 * Boundary refinement — turning a model's proposed word range into a cut a
 * human editor would defend. The model proposes; this code disposes:
 *
 * 1. SENTENCE SNAP — both edges expand to their containing sentences. A clip
 *    can only ever start on a sentence's first word and end on a sentence's
 *    last word, so it never opens or closes mid-thought.
 * 2. COMPLETENESS — a clip opening on an answer-fragment sentence ("Yes, and
 *    that's why…") pulls the previous sentence in; a clip ending on a
 *    question extends to include its answer (up to 2 sentences).
 * 3. DURATION FIT — whole sentences are added (forward first, then backward)
 *    to reach the preset minimum, and removed from the end to fit the
 *    maximum. If no sentence-respecting fit exists the candidate is DROPPED —
 *    a clip that would need butchery is worse than no clip. A fit that would
 *    end the clip on an unanswered question is also dropped.
 * 4. SILENCE ALIGNMENT — the final CUT times (not the word edges) are nudged
 *    into measured silence: the start sits 0.12 s into the silence before the
 *    first word, the end 0.28 s into the silence after the last word, with
 *    fixed pads (0.25 s / 0.35 s) only when no silence is measurable nearby.
 *    The cut therefore always lands in a breath, and no word is ever clipped.
 *
 * (Passes 1–3 are AutoClip's boundary discipline re-implemented over our
 * sentence model; the constants in pass 4 are theirs, adopted as methodology.)
 */
import type { SilenceSpan } from "../analysis";
import { nearestSilenceEdgeMs } from "../analysis";
import { opensLikeFragment, sentenceAt } from "./sentences";
import type { HighlightWord, RawCandidate, SentenceSpan } from "./types";

export interface RefinedRange {
  startWord: number;
  endWord: number;
  firstSentence: number;
  lastSentence: number;
  /** exact first/last word edges */
  speechStartMs: number;
  speechEndMs: number;
  /** silence-aligned cut times */
  startMs: number;
  endMs: number;
}

const SILENCE_SEARCH_RADIUS_MS = 750;
const SILENCE_LEAD_MS = 120;
const SILENCE_TAIL_MS = 280;
const SILENCE_MARGIN_MS = 40;
const FALLBACK_LEAD_MS = 250;
const FALLBACK_TAIL_MS = 350;

function alignStart(speechStartMs: number, silences: readonly SilenceSpan[]): number {
  // the silence that ENDS nearest before/at the first word
  let best: SilenceSpan | null = null;
  let bestDist = SILENCE_SEARCH_RADIUS_MS;
  for (const s of silences) {
    const d = Math.abs(s.endMs - speechStartMs);
    if (d <= bestDist && s.endMs <= speechStartMs + SILENCE_MARGIN_MS) {
      bestDist = d;
      best = s;
    }
  }
  if (!best) return Math.max(0, speechStartMs - FALLBACK_LEAD_MS);
  const earliest = Math.min(best.startMs + SILENCE_MARGIN_MS, best.endMs);
  const preferred = best.endMs - SILENCE_LEAD_MS;
  return Math.max(0, Math.max(earliest, Math.min(preferred, speechStartMs)));
}

function alignEnd(speechEndMs: number, silences: readonly SilenceSpan[], mediaEndMs: number): number {
  let best: SilenceSpan | null = null;
  let bestDist = SILENCE_SEARCH_RADIUS_MS;
  for (const s of silences) {
    const d = Math.abs(s.startMs - speechEndMs);
    if (d <= bestDist && s.startMs >= speechEndMs - SILENCE_MARGIN_MS) {
      bestDist = d;
      best = s;
    }
  }
  if (!best) return Math.min(mediaEndMs, speechEndMs + FALLBACK_TAIL_MS);
  const latest = Math.max(best.endMs - SILENCE_MARGIN_MS, best.startMs);
  const preferred = best.startMs + SILENCE_TAIL_MS;
  return Math.min(mediaEndMs, Math.max(speechEndMs, Math.min(preferred, latest)));
}

export function refineCandidate(
  words: readonly HighlightWord[],
  sentences: readonly SentenceSpan[],
  candidate: Pick<RawCandidate, "startWord" | "endWord">,
  opts: { minMs: number; maxMs: number; silences?: readonly SilenceSpan[] },
): RefinedRange | null {
  if (words.length === 0 || sentences.length === 0) return null;
  const startSentence = sentenceAt(sentences, candidate.startWord);
  const endSentence = sentenceAt(sentences, candidate.endWord);
  if (!startSentence || !endSentence) return null;

  let s0 = startSentence.index;
  let s1 = endSentence.index;
  if (s1 < s0) return null;

  // 2. completeness
  if (s0 > 0 && opensLikeFragment(sentences[s0]!)) s0 -= 1;
  if (sentences[s1]!.isQuestion) {
    let added = 0;
    while (s1 + 1 < sentences.length && added < 2) {
      s1 += 1;
      added += 1;
      if (!sentences[s1]!.isQuestion) break;
    }
  }

  const durationOf = (a: number, b: number): number =>
    sentences[b]!.endMs - sentences[a]!.startMs;

  // 3. duration fit
  while (durationOf(s0, s1) < opts.minMs && s1 + 1 < sentences.length) s1 += 1;
  while (durationOf(s0, s1) < opts.minMs && s0 > 0) s0 -= 1;
  while (durationOf(s0, s1) > opts.maxMs && s1 > s0) s1 -= 1;
  const duration = durationOf(s0, s1);
  if (duration < opts.minMs || duration > opts.maxMs) return null;
  // never ship a clip that ends on an unanswered question
  if (sentences[s1]!.isQuestion && s1 < sentences.length - 1) return null;

  const firstWord = sentences[s0]!.firstWord;
  const lastWord = sentences[s1]!.lastWord;
  const speechStartMs = words[firstWord]!.startMs;
  const speechEndMs = words[lastWord]!.endMs;
  const mediaEndMs = words[words.length - 1]!.endMs;
  const silences = opts.silences ?? [];
  return {
    startWord: firstWord,
    endWord: lastWord,
    firstSentence: s0,
    lastSentence: s1,
    speechStartMs,
    speechEndMs,
    startMs: silences.length ? alignStart(speechStartMs, silences) : Math.max(0, speechStartMs - FALLBACK_LEAD_MS),
    endMs: silences.length ? alignEnd(speechEndMs, silences, mediaEndMs) : Math.min(mediaEndMs, speechEndMs + FALLBACK_TAIL_MS),
  };
}

/** Re-exported for the panel's boundary readouts (distance of a cut to the nearest silence edge). */
export { nearestSilenceEdgeMs };

/**
 * The silence-aligned cut times for an exact speech range — pass 4 on its own,
 * for callers (the signals path) whose ranges are already sentence-exact.
 */
export function cutTimesForRange(
  speechStartMs: number,
  speechEndMs: number,
  silences: readonly SilenceSpan[],
  mediaEndMs: number,
): { startMs: number; endMs: number } {
  return {
    startMs: silences.length ? alignStart(speechStartMs, silences) : Math.max(0, speechStartMs - FALLBACK_LEAD_MS),
    endMs: silences.length ? alignEnd(speechEndMs, silences, mediaEndMs) : Math.min(mediaEndMs, speechEndMs + FALLBACK_TAIL_MS),
  };
}
