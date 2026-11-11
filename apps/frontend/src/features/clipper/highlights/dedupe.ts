/**
 * Duplicate elimination over word ranges.
 *
 * Overlapping windows legitimately propose the same moment two or three
 * times, with slightly different edges. Two rules, both greedy by score
 * (highest first, the rest must justify their existence):
 *
 * 1. IoU over word ranges > 0.4 → the same clip (AutoClip's threshold).
 * 2. Same START SENTENCE → the same clip, however different the lengths: a
 *    20-word and a 100-word proposal opening on the same sentence are one
 *    moment, and their IoU (0.2) would otherwise let both through.
 *
 * The engine runs this on raw candidates AND again after boundary refinement
 * (refinement can move two distinct proposals onto the same sentences).
 */

export interface RangeLike {
  startWord: number;
  endWord: number;
}

export const DEDUPE_IOU = 0.4;

/** Intersection over union of two inclusive word-index ranges. */
export function wordRangeIou(a: RangeLike, b: RangeLike): number {
  const intersection = Math.max(0, Math.min(a.endWord, b.endWord) - Math.max(a.startWord, b.startWord) + 1);
  if (intersection === 0) return 0;
  const union = a.endWord - a.startWord + 1 + (b.endWord - b.startWord + 1) - intersection;
  return union > 0 ? intersection / union : 0;
}

export function isDuplicate(
  a: RangeLike & { firstSentence?: number },
  b: RangeLike & { firstSentence?: number },
  iouThreshold: number = DEDUPE_IOU,
): boolean {
  if (a.firstSentence !== undefined && a.firstSentence === b.firstSentence) return true;
  return wordRangeIou(a, b) > iouThreshold;
}

/**
 * Greedy dedupe: `items` arrive with a score; the highest-scored item of each
 * overlapping cluster survives. Input order is not trusted — sorting happens
 * here. The survivors are returned in score order.
 */
export function dedupeByScore<T extends RangeLike & { firstSentence?: number }>(
  items: readonly T[],
  scoreOf: (item: T) => number,
  iouThreshold: number = DEDUPE_IOU,
): T[] {
  const ordered = [...items].sort((a, b) => scoreOf(b) - scoreOf(a) || a.startWord - b.startWord);
  const kept: T[] = [];
  for (const item of ordered) {
    if (kept.some((k) => isDuplicate(item, k, iouThreshold))) continue;
    kept.push(item);
  }
  return kept;
}
