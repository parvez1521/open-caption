/**
 * Clipper reframing (Phase 5, slice 5.4): turning a landscape clip into a vertical
 * 9:16 clip project by choosing a CROP WINDOW on the source frame.
 *
 * There is deliberately NO second crop mechanism here. A crop window is stored as
 * composition data in the ONE shared composition the whole product already renders
 * from: the clip project's canvas becomes 9:16 (`settings.canvas`) and its single
 * video segment carries a Phase-4.4 `SegmentTransform` whose crop insets are exactly
 * the window's complement. The compositions renderer enlarges the segment's inner
 * box by the cropped-away fractions so the surviving region fills the canvas stage
 * exactly — so the preview and every export show the chosen window by construction,
 * and the segment stays editable afterwards with the normal transform controls.
 *
 * Window model: `{ x, y, zoom }` with x/y in 0..1 — the window's position along the
 * travel available to it (0 = hard against the left/top edge, 0.5 = centred,
 * 1 = hard against the right/bottom edge) — and zoom >= 1 shrinking the window in
 * both dimensions while keeping its 9:16 shape. At zoom 1 the window spans the full
 * source height, so y has no travel and no effect; y only bites once zoomed in.
 * This maps onto the transform honestly: only the four crop insets are used —
 * scale and offsets stay at their identity values, so nothing double-applies.
 *
 * Pure module (no DOM, no network): the client drag UI, the clips API route and
 * the tests all compute the same mapping from the same inputs.
 */
import {
  CompositionSettingsSchema,
  SegmentTransformSchema,
  type CompositionSettings,
  type ProjectSettings,
  type SegmentTransform,
  type VideoSegment,
} from "@capseasy/shared";

/** The vertical canvas every reframed clip targets (the canvas-aspect enum's "9:16"). */
export const VERTICAL_CANVAS_ASPECT = "9:16" as const;
/** 9 / 16 as a number — the window's width ÷ height. */
export const VERTICAL_ASPECT_RATIO = 9 / 16;

/** The canvas aspects the AI Clipping Studio offers as crop targets. */
export type ClipAspectId = "9:16" | "1:1" | "16:9";

/** A target aspect id → its width ÷ height ratio. */
export const ASPECT_RATIOS: Record<ClipAspectId, number> = { "9:16": 9 / 16, "1:1": 1, "16:9": 16 / 9 };

/** How far a crop window may zoom in (the window shrinks to 1/zoom of the frame height). */
export const MAX_CROP_ZOOM = 2.5;

export interface CropWindow {
  /** 0..1 — position along the horizontal travel (0 = left edge, 0.5 = centre, 1 = right edge) */
  x: number;
  /** 0..1 — position along the vertical travel; only has travel when zoom > 1 */
  y: number;
  /** >= 1 — 1 fills the source height; larger zooms into a smaller 9:16 window */
  zoom: number;
}

/** The default window: centred, unzoomed. */
export const DEFAULT_CROP_WINDOW: CropWindow = { x: 0.5, y: 0.5, zoom: 1 };

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);

/** Sanitise a window coming from the UI or the wire: positions into 0..1, zoom into 1..MAX. */
export function clampCropWindow(win: Partial<CropWindow> | null | undefined): CropWindow {
  const zoom = typeof win?.zoom === "number" && Number.isFinite(win.zoom) ? Math.min(MAX_CROP_ZOOM, Math.max(1, win.zoom)) : 1;
  return { x: clamp01(win?.x ?? 0.5), y: clamp01(win?.y ?? 0.5), zoom };
}

/** Source aspect (w/h), or null when the dimensions are missing or unusable. */
export function sourceAspectRatio(sourceWidth: number | null | undefined, sourceHeight: number | null | undefined): number | null {
  if (!sourceWidth || !sourceHeight || !Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)) return null;
  if (sourceWidth <= 0 || sourceHeight <= 0) return null;
  return sourceWidth / sourceHeight;
}

/**
 * The window's size as fractions of the source frame for a source of the given size:
 * height fraction `fh = 1/zoom`, width fraction from the 9:16 shape
 * (`fw = fh · (9/16) / sourceAspect`). Null when the source is not wider than 9:16
 * (no horizontal crop exists to choose) or the dimensions are unknown.
 */
export function cropWindowFractions(
  win: CropWindow,
  sourceWidth: number | null | undefined,
  sourceHeight: number | null | undefined,
): { fw: number; fh: number } | null {
  return cropWindowFractionsFor(win, sourceWidth, sourceHeight, VERTICAL_ASPECT_RATIO);
}

/**
 * The same computation for any target aspect ratio (the AI Clipping Studio's
 * 1:1 and 16:9 targets): the window is the largest rectangle of the target
 * shape that fits the source at the window's zoom; null when the source is
 * not wider than the target (no crop exists to choose) or dims are unknown.
 */
export function cropWindowFractionsFor(
  win: CropWindow,
  sourceWidth: number | null | undefined,
  sourceHeight: number | null | undefined,
  targetRatio: number,
): { fw: number; fh: number } | null {
  const aspect = sourceAspectRatio(sourceWidth, sourceHeight);
  if (aspect === null || aspect <= targetRatio) return null;
  const fh = 1 / clampCropWindow(win).zoom;
  const fw = (fh * targetRatio) / aspect;
  if (!(fw > 0) || fw >= 1) return null;
  return { fw, fh };
}

/** True when a source of this size has a crop window of the target aspect to choose. */
export function needsReframeFor(
  sourceWidth: number | null | undefined,
  sourceHeight: number | null | undefined,
  targetRatio: number,
): boolean {
  return cropWindowFractionsFor(DEFAULT_CROP_WINDOW, sourceWidth, sourceHeight, targetRatio) !== null;
}

/** True when a source of this size has a 9:16 crop window to choose (it is wider than 9:16). */
export function needsVerticalReframe(sourceWidth: number | null | undefined, sourceHeight: number | null | undefined): boolean {
  return cropWindowFractions(DEFAULT_CROP_WINDOW, sourceWidth, sourceHeight) !== null;
}

/**
 * THE mapping: crop window → the segment transform stored in the composition.
 * The window's left edge sits at `x · (1 − fw)` of the source width (its full travel),
 * so `cropLeft` is that share, `cropRight` the remainder on the other side, and the
 * vertical pair follows the same rule. Everything else stays identity.
 * A window that cannot exist for this source (portrait / 9:16 / unknown dims) maps to
 * the identity transform — callers gate on {@link needsVerticalReframe} first.
 */
export function cropWindowToTransform(
  win: CropWindow,
  sourceWidth: number | null | undefined,
  sourceHeight: number | null | undefined,
): SegmentTransform {
  return cropWindowToTransformFor(win, sourceWidth, sourceHeight, VERTICAL_ASPECT_RATIO);
}

/** {@link cropWindowToTransform} for any target aspect ratio. */
export function cropWindowToTransformFor(
  win: CropWindow,
  sourceWidth: number | null | undefined,
  sourceHeight: number | null | undefined,
  targetRatio: number,
): SegmentTransform {
  const w = clampCropWindow(win);
  const fractions = cropWindowFractionsFor(w, sourceWidth, sourceHeight, targetRatio);
  if (!fractions) return SegmentTransformSchema.parse({});
  const { fw, fh } = fractions;
  // Keep every inset inside the schema's 0..0.9 range even for extreme aspect/zoom
  // combinations (an ultrawide source at max zoom could otherwise push an inset
  // past 0.9): the window slides the last fraction rather than storing an
  // unparseable transform.
  const left = Math.min(Math.max(w.x * (1 - fw), Math.max(0, 0.1 - fw)), Math.min(1 - fw, 0.9));
  const top = Math.min(Math.max(w.y * (1 - fh), Math.max(0, 0.1 - fh)), Math.min(1 - fh, 0.9));
  return SegmentTransformSchema.parse({
    cropLeft: left,
    cropTop: top,
    cropRight: 1 - left - fw,
    cropBottom: 1 - top - fh,
  });
}

/**
 * The inverse mapping: a stored transform → the crop window it represents, for a
 * source of the given size. Round-trips {@link cropWindowToTransform}'s output
 * (positions recover exactly where the 0.9 schema guard did not have to slide the
 * window). A transform with no crop at all reads back as the default window.
 */
export function transformToCropWindow(
  transform: Pick<SegmentTransform, "cropLeft" | "cropTop" | "cropRight" | "cropBottom">,
  sourceWidth: number | null | undefined,
  sourceHeight: number | null | undefined,
): CropWindow {
  void sourceWidth;
  void sourceHeight;
  const fw = 1 - transform.cropLeft - transform.cropRight;
  const fh = 1 - transform.cropTop - transform.cropBottom;
  if (!(fw > 0) || !(fh > 0) || fw >= 1) return { ...DEFAULT_CROP_WINDOW };
  return {
    x: 1 - fw > 0 ? transform.cropLeft / (1 - fw) : 0.5,
    y: 1 - fh > 0 ? transform.cropTop / (1 - fh) : 0.5,
    zoom: 1 / fh,
  };
}

/**
 * The single video segment a reframed clip project stores: it covers exactly the
 * clip range in source time and carries the window as its transform. Null when
 * the source needs no reframing — the caller then stores no segment at all and
 * the clip project keeps today's exact shape.
 */
export function reframeSegmentForClip(input: {
  window: CropWindow;
  sourceWidth: number | null | undefined;
  sourceHeight: number | null | undefined;
  startMs: number;
  endMs: number;
}): VideoSegment | null {
  if (!needsVerticalReframe(input.sourceWidth, input.sourceHeight)) return null;
  const startMs = Math.round(input.startMs);
  const endMs = Math.round(input.endMs);
  if (!(endMs > startMs)) return null;
  return {
    id: "main-video",
    sourceInMs: startMs,
    sourceOutMs: endMs,
    playbackRate: 1,
    transform: cropWindowToTransform(input.window, input.sourceWidth, input.sourceHeight),
    transitionIn: null,
    assetId: null,
    still: false,
    keyframes: [],
    effects: [],
  };
}

/**
 * Apply a reframing to a clip project's settings: canvas → 9:16 (the source
 * project's background choice is kept) and the composition slice → a fresh slice
 * holding only the reframe segment. A fresh composition is correct here for the
 * same reason the clips route drops overlays: any segments/markers the SOURCE
 * project stored are timed on the source timeline, not the clip's. Returns null
 * when no reframing applies, so the caller keeps the settings it already had —
 * byte-for-byte the pre-slice behaviour.
 */
export function reframedClipSettings(input: {
  settings: ProjectSettings;
  window: CropWindow;
  sourceWidth: number | null | undefined;
  sourceHeight: number | null | undefined;
  startMs: number;
  endMs: number;
}): { settings: ProjectSettings; composition: CompositionSettings } | null {
  const segment = reframeSegmentForClip(input);
  if (!segment) return null;
  const composition = CompositionSettingsSchema.parse({ videoSegments: [segment] });
  const settings: ProjectSettings = {
    ...input.settings,
    canvas: { aspect: VERTICAL_CANVAS_ASPECT, background: input.settings.canvas?.background ?? "blur" },
    composition,
  };
  return { settings, composition };
}

/** {@link reframeSegmentForClip} for any of the Clipping Studio's target aspects. */
export function reframeSegmentForClipAspect(input: {
  window: CropWindow;
  aspect: ClipAspectId;
  sourceWidth: number | null | undefined;
  sourceHeight: number | null | undefined;
  startMs: number;
  endMs: number;
}): VideoSegment | null {
  if (!needsReframeFor(input.sourceWidth, input.sourceHeight, ASPECT_RATIOS[input.aspect])) return null;
  const startMs = Math.round(input.startMs);
  const endMs = Math.round(input.endMs);
  if (!(endMs > startMs)) return null;
  return {
    id: "main-video",
    sourceInMs: startMs,
    sourceOutMs: endMs,
    playbackRate: 1,
    transform: cropWindowToTransformFor(input.window, input.sourceWidth, input.sourceHeight, ASPECT_RATIOS[input.aspect]),
    transitionIn: null,
    assetId: null,
    still: false,
    keyframes: [],
    effects: [],
  };
}

/** {@link reframedClipSettings} for any target aspect: canvas → that aspect, one window segment. */
export function reframedClipSettingsAspect(input: {
  settings: ProjectSettings;
  window: CropWindow;
  aspect: ClipAspectId;
  sourceWidth: number | null | undefined;
  sourceHeight: number | null | undefined;
  startMs: number;
  endMs: number;
}): { settings: ProjectSettings; composition: CompositionSettings } | null {
  const segment = reframeSegmentForClipAspect(input);
  if (!segment) return null;
  const composition = CompositionSettingsSchema.parse({ videoSegments: [segment] });
  const settings: ProjectSettings = {
    ...input.settings,
    canvas: { aspect: input.aspect, background: input.settings.canvas?.background ?? "blur" },
    composition,
  };
  return { settings, composition };
}
