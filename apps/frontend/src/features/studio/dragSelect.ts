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

/** A block's timing span — the input to blocksInRange (marquee selection). */
export interface TimeSpan {
  s: number;
  e: number;
}

/**
 * Marquee selection (owner 2026-11-16): the blocks a dragged rectangle
 * crosses on the timeline — any block whose span overlaps the range (a block
 * merely touched at an edge does not count). Order is the input order.
 */
export function blocksInRange<T extends TimeSpan>(blocks: readonly T[], startMs: number, endMs: number): T[] {
  const [lo, hi] = startMs <= endMs ? [startMs, endMs] : [endMs, startMs];
  return blocks.filter((b) => b.s < hi && b.e > lo);
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

/** A word's timing span, in document order — the input to groupDragBounds. */
export interface WordSpan {
  id: string;
  startMs: number;
  endMs: number;
}

/** The drag window for moving a selection of words together on the timeline. */
export interface GroupBounds {
  /** the selected words form one consecutive run in document order */
  contiguous: boolean;
  firstId: string | null;
  lastId: string | null;
  /** allowed shift of the selection, in ms (negative = earlier, 0 = no movement) */
  minDxMs: number;
  maxDxMs: number;
}

/**
 * How far a word selection may be dragged on the timeline, in milliseconds.
 *
 * A contiguous run uses the give-way window: its start cannot pass the previous
 * word's start + the minimum word length (that word keeps its minimum), and its
 * end cannot pass the next word's end − minimum — the run's neighbours give way
 * at the shared boundary instead of pinning the run in place. Caption words are
 * contiguous, so the old between-neighbours clamp (prev end … next start) collapsed
 * a single word's move window to a point and the drag silently did nothing.
 * With ripple the later words shift along, so the end is bounded only by the video.
 *
 * A scattered (non-contiguous) selection has no run to give way as a whole, so it
 * is clamped to never overlap an unselected neighbour at all: no earlier than the
 * touching previous word's end, no later than the touching next word's start.
 * Both cases also clamp at 0 and at the video end. Returns a zero window when
 * nothing is selected.
 */
export function groupDragBounds(
  words: readonly WordSpan[],
  selected: ReadonlySet<string>,
  minWordMs: number,
  totalMs: number,
  ripple = false,
): GroupBounds {
  const empty: GroupBounds = { contiguous: false, firstId: null, lastId: null, minDxMs: 0, maxDxMs: 0 };
  if (selected.size === 0 || words.length === 0) return empty;
  const idxs: number[] = [];
  for (let i = 0; i < words.length; i++) if (selected.has(words[i]!.id)) idxs.push(i);
  if (idxs.length === 0) return empty;
  const first = words[idxs[0]!]!;
  const last = words[idxs[idxs.length - 1]!]!;
  const contiguous = idxs.every((v, k) => k === 0 || v === idxs[k - 1]! + 1);
  if (contiguous) {
    const prev = idxs[0]! > 0 ? words[idxs[0]! - 1]! : undefined;
    const next = idxs[idxs.length - 1]! + 1 < words.length ? words[idxs[idxs.length - 1]! + 1]! : undefined;
    const lo = prev ? prev.startMs + minWordMs : 0;
    const hi = ripple ? totalMs : next ? next.endMs - minWordMs : totalMs;
    const minDxMs = lo - first.startMs;
    const maxDxMs = Math.max(minDxMs, hi - last.endMs);
    return { contiguous, firstId: first.id, lastId: last.id, minDxMs, maxDxMs };
  }
  let minDxMs = -first.startMs;
  let maxDxMs = totalMs - last.endMs;
  for (const i of idxs) {
    const w = words[i]!;
    const prev = i > 0 ? words[i - 1]! : undefined;
    const next = i + 1 < words.length ? words[i + 1]! : undefined;
    if (prev && !selected.has(prev.id)) minDxMs = Math.max(minDxMs, prev.endMs - w.startMs);
    if (next && !selected.has(next.id)) maxDxMs = Math.min(maxDxMs, next.startMs - w.endMs);
  }
  return { contiguous, firstId: first.id, lastId: last.id, minDxMs, maxDxMs: Math.max(minDxMs, maxDxMs) };
}

