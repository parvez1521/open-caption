/**
 * Face-aware reframing (G5 Level 1): turning sampled face detections into ONE
 * suggested CropWindow — the same plain data the drag control produces, so
 * everything downstream (storage, preview, export) is the shipped reframing
 * path unchanged, and the user sees and can override the suggestion before
 * the clip is created.
 *
 * The rules are the evaluation's (research/g5-face-tracking-evaluation.md §4/§6):
 *  - aggregate, don't chase: the MEDIAN face centre across samples (a few
 *    wild detections must not drag the window);
 *  - per frame, the LARGEST face is "the speaker" (the closest one — the
 *    defensible default for interviews and panels);
 *  - a presence gate: faces in fewer than FACE_PRESENCE_MIN of the samples →
 *    NO suggestion (null) and the caller leaves the window exactly as it was.
 *
 * The suggestion keeps the window's CURRENT zoom: it only re-centres. (A
 * wider window for a wide face is geometrically impossible here — zooming
 * only ever narrows a 9:16 window on a landscape source — so Level 1 does
 * not pretend to fit faces, it centres on them; the user can still zoom and
 * drag afterwards.)
 *
 * Pure module: detections arrive in SOURCE pixel coordinates (the worker +
 * sampling glue convert from the model's letterbox space via yunet.ts).
 */
import {
  clampCropWindow,
  cropWindowFractions,
  DEFAULT_CROP_WINDOW,
  type CropWindow,
} from "./reframe";
import type { FaceBox } from "./yunet";

/** Faces must appear in at least this share of sampled frames for a suggestion to be made. */
export const FACE_PRESENCE_MIN = 0.25;
/** Default sampling rate for a clip range (the evaluation's 2–4 fps band). */
export const FACE_SAMPLE_FPS = 3;
/** Hard cap on sampled frames per clip, however long the range (the clipper's clips are ≤ 60 s by design). */
export const FACE_MAX_SAMPLES = 90;

/** The sample times (ms, source time) for a clip range: ~fps spacing, capped, endpoints included. */
export function sampleTimesForRange(startMs: number, endMs: number, fps = FACE_SAMPLE_FPS, cap = FACE_MAX_SAMPLES): number[] {
  if (!(endMs > startMs) || fps <= 0) return [];
  const step = 1000 / fps;
  const wanted = Math.floor((endMs - startMs) / step) + 1;
  const count = Math.max(1, Math.min(cap, wanted));
  if (count === 1) return [Math.round((startMs + endMs) / 2)];
  const times: number[] = [];
  for (let i = 0; i < count; i++) times.push(Math.round(startMs + ((endMs - startMs) * i) / (count - 1)));
  return times;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** The face a frame contributes: the largest by area, or null when the frame has none. */
export function largestFace(faces: FaceBox[]): FaceBox | null {
  let best: FaceBox | null = null;
  for (const f of faces) if (!best || f.w * f.h > best.w * best.h) best = f;
  return best;
}

/**
 * Samples (one face-list per sampled frame, source pixel coords) → a
 * suggested window, or null when there is nothing defensible to suggest
 * (too few faces, unusable source size, or a window that cannot exist).
 * The current window supplies the zoom — the suggestion only re-centres.
 */
export function suggestWindowFromFaces(
  samples: FaceBox[][],
  sourceWidth: number | null | undefined,
  sourceHeight: number | null | undefined,
  current: CropWindow = DEFAULT_CROP_WINDOW,
): CropWindow | null {
  if (!sourceWidth || !sourceHeight || sourceWidth <= 0 || sourceHeight <= 0 || samples.length === 0) return null;
  const fractions = cropWindowFractions(current, sourceWidth, sourceHeight);
  if (!fractions) return null;

  const chosen = samples.map(largestFace).filter((f): f is FaceBox => f !== null);
  if (chosen.length / samples.length < FACE_PRESENCE_MIN) return null;

  const cx = median(chosen.map((f) => (f.x + f.w / 2) / sourceWidth));
  const cy = median(chosen.map((f) => (f.y + f.h / 2) / sourceHeight));
  const { fw, fh } = fractions;
  const pos = (centre: number, f: number) => (f >= 1 ? 0.5 : Math.min(1, Math.max(0, (centre - f / 2) / (1 - f))));
  return clampCropWindow({ x: pos(cx, fw), y: pos(cy, fh), zoom: current.zoom });
}
