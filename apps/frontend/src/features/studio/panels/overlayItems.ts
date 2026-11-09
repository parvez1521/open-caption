import { newId, type OverlayItem, type OverlayShape, type OverlaySocialVariant } from "@capseasy/shared";
import { SOCIAL_META } from "@capseasy/compositions";

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

/** An imported image placed as an overlay: it references the media-bin asset by id (bytes stay in
 *  IndexedDB); the composition resolves the id to a URL in the browser for preview + export. */
export function makeImageOverlay(asset: { id: string; name: string }, playheadMs: number, durationMs: number): OverlayItem {
  return {
    id: newId(),
    kind: "image",
    assetId: asset.id,
    assetName: asset.name,
    ...windowAt(playheadMs, durationMs),
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    color: "#FFFFFF",
  };
}

/** An animated Social Media overlay: drawn + animated inside the shared composition (no assets), so it
 *  renders in the preview, the in-browser MP4 export and server renders alike. Social items live a bit
 *  longer than static elements — their phases (enter → tap → flip → hold → exit) need the room. */
export function makeSocialOverlay(variant: OverlaySocialVariant, playheadMs: number, durationMs: number): OverlayItem {
  const meta = SOCIAL_META.find((m) => m.id === variant)!;
  const startMs = Math.max(0, Math.round(playheadMs) || 0);
  let endMs = startMs + 4000;
  if (durationMs > startMs + 400) endMs = Math.min(endMs, durationMs);
  if (endMs <= startMs) endMs = startMs + 400;
  return {
    id: newId(),
    kind: "social",
    variant,
    text: meta.defaultText,
    startMs,
    endMs,
    x: 0.5,
    y: 0.78,
    scale: 1,
    rotation: 0,
    color: meta.defaultColor,
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
