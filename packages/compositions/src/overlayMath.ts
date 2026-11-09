import { NEUTRAL_VIDEO_ADJUST, type ClipRange, type OverlayItem, type ProjectSettings, type VideoAdjust } from "@capseasy/shared";

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

export function resolveOverlays(input: { overlays?: OverlayItem[]; settings?: Partial<ProjectSettings> | null }): OverlayItem[] {
  return input.overlays ?? input.settings?.overlays ?? [];
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
