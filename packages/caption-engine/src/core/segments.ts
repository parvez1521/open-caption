import { CaptionDocSchema, type CaptionDoc, type Word } from "@capseasy/shared";
import { pruneDoc } from "./ops";

/**
 * Clipper segmentation — pure, deterministic, and honestly explainable in one line:
 * proposals are the speech runs between silences, merged or split to land between 15s and 60s.
 * Nothing here scores, ranks or "detects highlights": the only signals are word timings
 * (silence gaps) and durations. Same words in, same proposals out, every time.
 */

/** A silence at least this long ends one speech run and starts the next. */
export const SEGMENT_GAP_MS = 900;
/** Proposals shorter than this merge with a neighbouring run. */
export const SEGMENT_MIN_MS = 15_000;
/** Proposals longer than this split at their largest internal silence gap. */
export const SEGMENT_MAX_MS = 60_000;
/** How many opening words a proposal's text snippet carries. */
export const SEGMENT_SNIPPET_WORDS = 8;

export interface SegmentProposal {
  startMs: number;
  endMs: number;
  durationMs: number;
  wordCount: number;
  /** the proposal's opening words, for recognising it in a list */
  text: string;
}

export interface ProposeSegmentsOptions {
  gapMs?: number;
  minMs?: number;
  maxMs?: number;
  snippetWords?: number;
}

type TimedWord = Pick<Word, "text" | "startMs" | "endMs">;

interface Run {
  words: TimedWord[];
  startMs: number;
  endMs: number;
}

const runOf = (words: TimedWord[]): Run => ({ words, startMs: words[0]!.startMs, endMs: words[words.length - 1]!.endMs });
const duration = (r: Run) => r.endMs - r.startMs;

/** Split one over-long run at its largest internal gap, recursively, until every piece fits maxMs. */
function splitLong(run: Run, minMs: number, maxMs: number): Run[] {
  if (duration(run) <= maxMs || run.words.length < 2) return [run];
  // candidate split points: between consecutive words; prefer the largest gap that leaves
  // both sides at least minMs, otherwise fall back to the largest gap there is; equal gaps
  // break ties toward the middle of the run, so equal-spaced speech splits into even pieces
  let best: { at: number; gap: number; bothFit: boolean; offMid: number } | null = null;
  const mid = (run.startMs + run.endMs) / 2;
  for (let i = 0; i < run.words.length - 1; i++) {
    const left = run.words[i]!;
    const right = run.words[i + 1]!;
    const gap = right.startMs - left.endMs;
    const bothFit = left.endMs - run.startMs >= minMs && run.endMs - right.startMs >= minMs;
    const offMid = Math.abs((left.endMs + right.startMs) / 2 - mid);
    if (!best || (bothFit && !best.bothFit) || (bothFit === best.bothFit && (gap > best.gap || (gap === best.gap && offMid < best.offMid)))) {
      best = { at: i, gap, bothFit, offMid };
    }
  }
  if (!best) return [run];
  const leftRun = runOf(run.words.slice(0, best.at + 1));
  const rightRun = runOf(run.words.slice(best.at + 1));
  return [...splitLong(leftRun, minMs, maxMs), ...splitLong(rightRun, minMs, maxMs)];
}

/**
 * Propose clip segments from a transcript's word timings.
 * 1. Split the word stream into speech runs at silences >= gapMs.
 * 2. A run shorter than minMs merges forward with the next run (a trailing short run merges back).
 * 3. A run longer than maxMs splits at its largest internal silence gap, recursively.
 * Segment edges are always word edges: startMs is a word's start, endMs a word's end.
 */
export function proposeSegments(words: readonly TimedWord[], opts: ProposeSegmentsOptions = {}): SegmentProposal[] {
  const gapMs = opts.gapMs ?? SEGMENT_GAP_MS;
  const minMs = opts.minMs ?? SEGMENT_MIN_MS;
  const maxMs = opts.maxMs ?? SEGMENT_MAX_MS;
  const snippetWords = opts.snippetWords ?? SEGMENT_SNIPPET_WORDS;

  const sorted = [...words]
    .filter((w) => w.endMs > w.startMs && w.text.trim().length > 0)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  if (sorted.length === 0) return [];

  // 1. speech runs between silences
  const runs: Run[] = [];
  let current: TimedWord[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const next = sorted[i]!;
    if (next.startMs - prev.endMs >= gapMs) {
      runs.push(runOf(current));
      current = [next];
    } else {
      current.push(next);
    }
  }
  runs.push(runOf(current));

  // 2. merge short runs forward; a short final run merges back into its neighbour
  const merged: Run[] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && duration(last) < minMs) {
      merged[merged.length - 1] = runOf([...last.words, ...run.words]);
    } else {
      merged.push(run);
    }
  }
  if (merged.length > 1) {
    const last = merged[merged.length - 1]!;
    if (duration(last) < minMs) {
      const prev = merged[merged.length - 2]!;
      merged.splice(merged.length - 2, 2, runOf([...prev.words, ...last.words]));
    }
  }

  // 3. split long runs at their largest internal gap
  const pieces = merged.flatMap((r) => splitLong(r, minMs, maxMs));

  return pieces.map((r) => ({
    startMs: r.startMs,
    endMs: r.endMs,
    durationMs: duration(r),
    wordCount: r.words.length,
    text: r.words.slice(0, snippetWords).map((w) => w.text).join(" "),
  }));
}

/**
 * The caption document for one clip: the words overlapping [startMs, endMs), shifted so the
 * segment start becomes 0 and clamped to the segment's length. Word ids are kept (they are
 * unique inside this new project's own document), and pruneDoc drops break/card bookkeeping
 * that pointed at words outside the segment. The source document is not mutated.
 */
export function clipDocForSegment(doc: CaptionDoc, range: { startMs: number; endMs: number }): CaptionDoc {
  const start = Math.max(0, Math.round(range.startMs));
  const end = Math.max(start + 1, Math.round(range.endMs));
  const length = end - start;
  const words: Word[] = [];
  for (const w of doc.words) {
    if (w.endMs <= start || w.startMs >= end) continue;
    const startMs = Math.max(0, w.startMs - start);
    const endMs = Math.min(length, w.endMs - start);
    if (endMs <= startMs) continue;
    words.push({ ...w, startMs, endMs });
  }
  return pruneDoc(CaptionDocSchema.parse({ ...doc, words, meta: { ...doc.meta, userEdited: false } }));
}
