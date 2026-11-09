import { newId, type OverlayItem, type OverlayShape } from "@capseasy/shared";

/** How long a freshly added overlay stays on screen. */
export const NEW_OVERLAY_MS = 3000;

/** Start at the playhead (or 0), run for NEW_OVERLAY_MS, never past the end of the video when known. */
function windowAt(playheadMs: number, durationMs: number): { startMs: number; endMs: number } {
  const startMs = Math.max(0, Math.round(playheadMs) || 0);
  let endMs = startMs + NEW_OVERLAY_MS;
  if (durationMs > startMs + 400) endMs = Math.min(endMs, durationMs);
  if (endMs <= startMs) endMs = startMs + 400;
  return { startMs, endMs };
}

export function makeTextOverlay(playheadMs: number, durationMs: number): OverlayItem {
  return {
    id: newId(),
    kind: "text",
    text: "Your text",
    ...windowAt(playheadMs, durationMs),
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    color: "#FFFFFF",
    fontSize: 64,
  };
}

export function makeShapeOverlay(shape: OverlayShape, playheadMs: number, durationMs: number): OverlayItem {
  return {
    id: newId(),
    kind: "shape",
    shape,
    ...windowAt(playheadMs, durationMs),
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    color: "#FFA946",
  };
}
