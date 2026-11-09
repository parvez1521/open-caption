/**
 * Drag-selection + drag-retime maths for the caption editor (owner correction #5, 2026-11-10).
 *
 * Pure helpers, shared by the two drag surfaces:
 *  - the caption list (CaptionsPanel): drag across word chips to select a contiguous range of words,
 *    then drag the selection horizontally to retime it;
 *  - the timeline captions track (Timeline): drag selected blocks horizontally to retime them.
 *
 * Selection is a Set of word ids over ONE flat document order (the visible words, in page order),
 * so a range can span caption cards. Timing commits go through the caption-engine's
 * `shiftWordsByIds` exactly once, on pointer release — these helpers only compute the selection
 * and the delta; they never touch the document.
 */

/** Pointer movement (px) before a press counts as a drag rather than a click. */
export const DRAG_THRESHOLD_PX = 6;

/**
 * Drag sensitivity in the caption list, which is not drawn to a time scale: 100 px of horizontal
 * drag = 1 second of retime (0.1 px per ms). The timeline uses its own zoom scale instead.
 */
export const PANEL_PX_PER_MS = 0.1;

/** True once a press has moved far enough to be a drag (select / retime) instead of a click. */
export function isPastThreshold(dx: number, dy: number, threshold: number = DRAG_THRESHOLD_PX): boolean {
  return Math.hypot(dx, dy) > threshold;
}

/**
 * The contiguous range of word ids between `anchorId` and `focusId` (inclusive, either direction)
 * in the flat ordered id list. Unknown anchor → empty set; unknown focus → just the anchor, so a
 * drag that starts on a word always selects at least that word.
 */
export function rangeSelection(orderedIds: readonly string[], anchorId: string, focusId: string): Set<string> {
  const a = orderedIds.indexOf(anchorId);
  if (a < 0) return new Set();
  const f = orderedIds.indexOf(focusId);
  if (f < 0) return new Set([anchorId]);
  const [lo, hi] = a <= f ? [a, f] : [f, a];
  return new Set(orderedIds.slice(lo, hi + 1));
}

/** Toggle every id in `ids` in the selection (Shift+click on timeline blocks). Returns a new Set. */
export function toggleIds(current: ReadonlySet<string>, ids: Iterable<string>): Set<string> {
  const next = new Set(current);
  for (const id of ids) {
    if (next.has(id)) next.delete(id);
    else next.add(id);
  }
  return next;
}

/** Convert a horizontal pixel drag to milliseconds at the given scale, rounded to whole ms. */
export function pxToMs(deltaPx: number, pxPerMs: number): number {
  if (!Number.isFinite(deltaPx) || !Number.isFinite(pxPerMs) || pxPerMs <= 0) return 0;
  return Math.round(deltaPx / pxPerMs);
}

/** Live drag readout, e.g. "+0.32s" / "−0.15s" (U+2212 minus, matching the panel's nudge labels). */
export function formatDelta(deltaMs: number): string {
  const sign = deltaMs < 0 ? "−" : "+";
  return `${sign}${(Math.abs(deltaMs) / 1000).toFixed(2)}s`;
}
