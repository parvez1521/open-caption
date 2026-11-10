import {
  DEFAULT_TRACK_STATE,
  NEUTRAL_VIDEO_ADJUST,
  type ClipRange,
  type CompositionTrackKind,
  type OverlayItem,
  type ProjectSettings,
  type TrackState,
  type VideoAdjust,
  type VideoSegment,
} from "@capseasy/shared";

/**
 * Pure helpers for the Slice 1(d) editor elements: the CSS filter string for the video layer and the
 * Sequence timing for overlays. Kept free of React/Remotion so they can be unit-tested directly.
 */

/** `brightness() contrast() saturate()` for the video layer, or undefined when everything is neutral
 *  (the filter is then omitted entirely, so untouched projects render exactly as before). */
export function buildVideoFilter(adjust: VideoAdjust | null | undefined): string | undefined {
  if (!adjust) return undefined;
  const { brightness, contrast, saturation } = adjust;
  if (brightness === 1 && contrast === 1 && saturation === 1) return undefined;
  return `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`;
}

/** Frame window for an overlay item at a given fps (mirrors how caption pages are sequenced). */
export function overlayFrames(item: Pick<OverlayItem, "startMs" | "endMs">, fps: number): { from: number; durationInFrames: number } {
  const from = Math.max(0, Math.floor((item.startMs / 1000) * fps));
  const durationInFrames = Math.max(1, Math.ceil(((item.endMs - item.startMs) / 1000) * fps));
  return { from, durationInFrames };
}

/** Is an overlay on screen at this media time? (Edges inclusive at start, exclusive at end, like caption pages.) */
export function overlayVisibleAt(item: Pick<OverlayItem, "startMs" | "endMs">, timeMs: number): boolean {
  return timeMs >= item.startMs && timeMs < item.endMs;
}

/**
 * Where the composition reads editor elements from: explicit top-level props win; otherwise they come
 * from the project settings (which is how the companion/server render payload already carries them).
 */
export function resolveVideoAdjust(input: { videoAdjust?: VideoAdjust; settings?: Partial<ProjectSettings> | null }): VideoAdjust {
  return input.videoAdjust ?? input.settings?.videoAdjust ?? NEUTRAL_VIDEO_ADJUST;
}

/** Which overlay track an overlay kind lives on: text + image are the "text" track, shape + social are "graphics". */
export function overlayTrackKind(kind: OverlayItem["kind"]): "text" | "graphics" {
  return kind === "text" || kind === "image" ? "text" : "graphics";
}

/**
 * Per-track state from settings, or the neutral default (unlocked / visible / unmuted) when the
 * project never stored state for that track — legacy settings with no `composition` slice at all
 * therefore resolve every track to the default. Partial stored state is completed with defaults.
 */
export function resolveTrackState(input: { settings?: Partial<ProjectSettings> | null }, kind: CompositionTrackKind): TrackState {
  const stored = input.settings?.composition?.tracks?.[kind];
  if (!stored) return { ...DEFAULT_TRACK_STATE };
  return {
    locked: stored.locked ?? DEFAULT_TRACK_STATE.locked,
    visible: stored.visible ?? DEFAULT_TRACK_STATE.visible,
    muted: stored.muted ?? DEFAULT_TRACK_STATE.muted,
  };
}

export function resolveOverlays(input: { overlays?: OverlayItem[]; settings?: Partial<ProjectSettings> | null }): OverlayItem[] {
  const all = input.overlays ?? input.settings?.overlays ?? [];
  // Track visibility lives in settings and applies whichever source supplied the overlays: the studio
  // passes overlays explicitly AND carries settings, so filtering only the settings copy would leak
  // hidden overlays in preview. Legacy settings (no composition / all tracks visible) filter nothing.
  const textVisible = resolveTrackState(input, "text").visible;
  const graphicsVisible = resolveTrackState(input, "graphics").visible;
  if (textVisible && graphicsVisible) return all;
  return all.filter((item) => (overlayTrackKind(item.kind) === "text" ? textVisible : graphicsVisible));
}

/**
 * The stored video segmentation, or null when there is none: an absent `composition` slice and an
 * empty `videoSegments` array both mean "no segmentation stored" (the single-layer render path).
 */
export function resolveVideoSegments(input: { settings?: Partial<ProjectSettings> | null }): VideoSegment[] | null {
  const segments = input.settings?.composition?.videoSegments;
  return segments && segments.length > 0 ? segments : null;
}

/**
 * Frame windows for a segment chain, one per segment, in composition (project) time.
 *
 * Rounding choice: each window boundary is the ROUNDED CUMULATIVE project time —
 * `from_k = round(startMs_k * fps/1000)` where startMs accumulates segment durations from 0, and
 * `durationInFrames_k = round(endMs_k * fps/1000) − from_k` (endMs_k = startMs_k + segment duration),
 * clamped to a minimum of 1 frame. Deriving the duration from two rounded cumulative boundaries
 * (rather than rounding each segment's duration independently) is what makes the windows TILE
 * EXACTLY: consecutive windows share a boundary, so there are no gaps or overlaps and the durations
 * sum to `round(totalMs * fps/1000)`, matching the composition duration. The min-1 clamp only
 * engages for a segment shorter than half a frame, which valid segmentations do not contain.
 *
 * trimBefore/trimAfter are per segment in SOURCE frames, via videoTrimFrames on that segment's
 * source range — the same trim contract the single-layer clip path uses.
 */
export function videoSegmentFrames(
  segments: readonly VideoSegment[],
  fps: number,
): { from: number; durationInFrames: number; trimBefore: number; trimAfter: number }[] {
  const f = Math.max(1, fps);
  let projectStartMs = 0;
  return segments.map((segment) => {
    const projectEndMs = projectStartMs + (segment.sourceOutMs - segment.sourceInMs);
    const from = Math.round((projectStartMs / 1000) * f);
    const durationInFrames = Math.max(1, Math.round((projectEndMs / 1000) * f) - from);
    const trim = videoTrimFrames({ startMs: segment.sourceInMs, endMs: segment.sourceOutMs }, f) ?? { trimBefore: 0, trimAfter: 0 };
    projectStartMs = projectEndMs;
    return { from, durationInFrames, trimBefore: trim.trimBefore, trimAfter: trim.trimAfter };
  });
}

/** A clip project's range lives in its settings (the only channel every render path already carries). */
export function resolveClipRange(input: { settings?: Partial<ProjectSettings> | null }): ClipRange | null {
  return input.settings?.clipRange ?? null;
}

/**
 * The video layer's trim for a clip range, in SOURCE frames: both video engines (Remotion's
 * OffthreadVideo and @remotion/media's Video) take trimBefore/trimAfter as the source frame the
 * picture starts / ends at, so frame 0 of the composition shows the source frame at clipRange.startMs
 * and the picture stops at clipRange.endMs. Null range -> no trim props at all (untouched projects
 * render exactly as before).
 */
export function videoTrimFrames(range: ClipRange | null | undefined, fps: number): { trimBefore: number; trimAfter: number } | undefined {
  if (!range) return undefined;
  const f = Math.max(1, fps);
  const trimBefore = Math.max(0, Math.round((range.startMs / 1000) * f));
  const trimAfter = Math.max(trimBefore + 1, Math.round((range.endMs / 1000) * f));
  return { trimBefore, trimAfter };
}
