/**
 * Snapping maths for timeline drags (pure — shared by caption-block and overlay-block drags).
 *
 * A dragged edge (or a moved block's start/end) snaps to the nearest candidate — the playhead, 0,
 * the end of the timeline, neighbouring block edges — when it comes within SNAP_THRESHOLD_PX
 * on screen. The result reports WHAT it snapped to so the UI can draw the snap guide line; a drag
 * that snaps to nothing reports null and no guide is shown.
 */

export const SNAP_THRESHOLD_PX = 7;

export interface SnapResult {
  /** the (possibly snapped) value, in ms */
  value: number;
  /** the candidate snapped to, or null when nothing was close enough */
  snappedTo: number | null;
}

export function snapValue(
  value: number,
  candidates: readonly number[],
  pxPerMs: number,
  opts: { thresholdPx?: number; enabled?: boolean } = {},
): SnapResult {
  if (opts.enabled === false || !Number.isFinite(value) || !Number.isFinite(pxPerMs) || pxPerMs <= 0) {
    return { value, snappedTo: null };
  }
  const thresholdMs = (opts.thresholdPx ?? SNAP_THRESHOLD_PX) / pxPerMs;
  let best: number | null = null;
  let bestDist = thresholdMs;
  for (const c of candidates) {
    if (!Number.isFinite(c)) continue;
    const d = Math.abs(c - value);
    if (d < bestDist || (best !== null && d === bestDist && c < best)) {
      best = c;
      bestDist = d;
    }
  }
  return best === null ? { value, snappedTo: null } : { value: best, snappedTo: best };
}

/**
 * Snap a MOVED block (start + fixed duration): try the start edge first, then the end edge; the
 * first edge that snaps wins and the other follows (the block keeps its duration).
 */
export function snapMove(
  startMs: number,
  durationMs: number,
  candidates: readonly number[],
  pxPerMs: number,
  opts: { thresholdPx?: number; enabled?: boolean } = {},
): { startMs: number; snappedTo: number | null } {
  const atStart = snapValue(startMs, candidates, pxPerMs, opts);
  if (atStart.snappedTo !== null) return { startMs: atStart.value, snappedTo: atStart.snappedTo };
  const atEnd = snapValue(startMs + durationMs, candidates, pxPerMs, opts);
  if (atEnd.snappedTo !== null) return { startMs: atEnd.value - durationMs, snappedTo: atEnd.snappedTo };
  return { startMs, snappedTo: null };
}
