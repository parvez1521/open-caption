import type { CSSProperties } from "react";
import {
  DEFAULT_TRACK_STATE,
  NEUTRAL_VIDEO_ADJUST,
  framesForDurationMs,
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

/* ---------------- Phase 4 Run 2: per-segment rate / transform / transition / canvas ----------------
 *
 * PINNED INTERFACE (Worker B, packages/shared): VideoSegment gains playbackRate (default 1),
 * transform {crop*, rotateDeg, flipH/flipV, scale, offsetX/offsetY}, transitionIn, assetId and
 * still; ProjectSettings gains canvas {aspect, background}; shared gains the helpers
 * segmentTimelineDurationMs / compositionDurationMs. Until that lands on main, the fields are
 * read STRUCTURALLY here (every field optional, defaults applied at read time) so this package
 * compiles and behaves identically against both the old and the new shared schema. The local
 * helper implementations below mirror the pinned shared formulas exactly; on merged main they
 * are value-identical to the shared ones.
 */

export interface SegmentTransform {
  cropLeft: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
  rotateDeg: number;
  flipH: boolean;
  flipV: boolean;
  scale: number;
  offsetX: number;
  offsetY: number;
}

export const IDENTITY_SEGMENT_TRANSFORM: SegmentTransform = {
  cropLeft: 0,
  cropTop: 0,
  cropRight: 0,
  cropBottom: 0,
  rotateDeg: 0,
  flipH: false,
  flipV: false,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

export type SegmentTransitionType = "fade" | "wipe" | "slide" | "zoom" | "blur";

export interface SegmentTransition {
  type: SegmentTransitionType;
  durationMs: number;
}

/** A stored segment plus the Run-2 extension fields, all optional (absent = the pinned defaults). */
export type RenderVideoSegment = VideoSegment & {
  playbackRate?: number;
  transform?: Partial<SegmentTransform> | null;
  transitionIn?: SegmentTransition | null;
  assetId?: string | null;
  still?: boolean;
};

/** The segment's playback rate, sanitized: a missing / non-finite / non-positive rate is 1. */
export function segmentPlaybackRate(segment: Pick<RenderVideoSegment, "playbackRate">): number {
  const rate = segment.playbackRate;
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : 1;
}

/**
 * PINNED shared formula: how long a segment occupies on the PROJECT timeline —
 * `round((sourceOut − sourceIn) / playbackRate)`. For stills, sourceIn/Out are a pseudo-span
 * (the on-screen duration) and the stored rate is 1, so the formula is the duration itself.
 */
export function segmentTimelineDurationMs(segment: RenderVideoSegment): number {
  return Math.round((segment.sourceOutMs - segment.sourceInMs) / segmentPlaybackRate(segment));
}

/**
 * PINNED shared formula: the whole chain's project duration — the sum of timeline durations
 * minus every boundary transition (transitionIn lives on segments[1..]; a transitionIn stored
 * on the first segment has no boundary and is ignored), clamped at 0.
 */
export function compositionDurationMs(segments: readonly RenderVideoSegment[]): number {
  if (segments.length === 0) return 0;
  const total = segments.reduce((sum, s) => sum + segmentTimelineDurationMs(s), 0);
  const transitions = segments.slice(1).reduce((sum, s) => sum + Math.max(0, s.transitionIn?.durationMs ?? 0), 0);
  return Math.max(0, total - transitions);
}

/** The segment's full transform with every pinned default applied. */
export function resolveSegmentTransform(segment: Pick<RenderVideoSegment, "transform">): SegmentTransform {
  const t = segment.transform ?? {};
  const crop = (v: number | undefined) => Math.min(0.9, Math.max(0, v ?? 0));
  return {
    cropLeft: crop(t.cropLeft),
    cropTop: crop(t.cropTop),
    cropRight: crop(t.cropRight),
    cropBottom: crop(t.cropBottom),
    rotateDeg: t.rotateDeg ?? 0,
    flipH: t.flipH ?? false,
    flipV: t.flipV ?? false,
    scale: typeof t.scale === "number" && Number.isFinite(t.scale) && t.scale > 0 ? t.scale : 1,
    offsetX: t.offsetX ?? 0,
    offsetY: t.offsetY ?? 0,
  };
}

export function isIdentitySegmentTransform(t: SegmentTransform): boolean {
  return (
    t.cropLeft === 0 &&
    t.cropTop === 0 &&
    t.cropRight === 0 &&
    t.cropBottom === 0 &&
    t.rotateDeg === 0 &&
    !t.flipH &&
    !t.flipV &&
    t.scale === 1 &&
    t.offsetX === 0 &&
    t.offsetY === 0
  );
}

/**
 * Wrapper/inner styles implementing a segment transform, or null for the identity transform
 * (no wrapper is rendered at all then, so untouched projects stay pixel-identical).
 *
 * Crop: the wrapper is an overflow-hidden stage filling the canvas; the inner box is enlarged
 * by the cropped-away fractions (`width = 100% / (1 − cropLeft − cropRight)`, shifted left by
 * the cropped-left share of its own width) so the surviving region exactly fills the stage.
 * Rotate / flip / scale / offset compose into one CSS transform on that inner box; offsets are
 * fractions of the inner box's own size (translate %). Flip folds into the scale signs.
 */
export function segmentTransformStyle(segment: Pick<RenderVideoSegment, "transform">): { wrapper: CSSProperties; inner: CSSProperties } | null {
  const t = resolveSegmentTransform(segment);
  if (isIdentitySegmentTransform(t)) return null;
  const widthDen = Math.max(0.02, 1 - t.cropLeft - t.cropRight);
  const heightDen = Math.max(0.02, 1 - t.cropTop - t.cropBottom);
  const scaleX = t.scale * (t.flipH ? -1 : 1);
  const scaleY = t.scale * (t.flipV ? -1 : 1);
  const transformParts: string[] = [];
  if (t.offsetX !== 0 || t.offsetY !== 0) transformParts.push(`translate(${t.offsetX * 100}%, ${t.offsetY * 100}%)`);
  if (t.rotateDeg !== 0) transformParts.push(`rotate(${t.rotateDeg}deg)`);
  if (scaleX !== 1 || scaleY !== 1) transformParts.push(`scale(${scaleX}, ${scaleY})`);
  return {
    wrapper: { position: "absolute", inset: 0, overflow: "hidden" },
    inner: {
      position: "absolute",
      width: `${100 / widthDen}%`,
      height: `${100 / heightDen}%`,
      left: `${(-t.cropLeft / widthDen) * 100}%`,
      top: `${(-t.cropTop / heightDen) * 100}%`,
      ...(transformParts.length ? { transform: transformParts.join(" ") } : {}),
    },
  };
}

/**
 * Merge Run-2 extension fields from RAW (unparsed) settings segments onto parsed segments,
 * matched by array position. Why: the Player passes props verbatim and a payload produced
 * before the new shared schema landed parses through an older zod schema that strips the new
 * fields; the render must still honour them. A field present on the raw segment wins; absent
 * fields keep the parsed value (on the new schema, the parsed defaults). No raw segments (or
 * a length mismatch) returns the parsed segments untouched.
 */
export function withRawSegmentExtensions<T extends VideoSegment>(segments: readonly T[], rawSettings: unknown): RenderVideoSegment[] {
  const raw = (rawSettings as { composition?: { videoSegments?: unknown } } | null | undefined)?.composition?.videoSegments;
  if (!Array.isArray(raw) || raw.length !== segments.length) return segments as unknown as RenderVideoSegment[];
  return segments.map((segment, i) => {
    const r = raw[i] as Partial<RenderVideoSegment> | null;
    if (!r || typeof r !== "object") return segment as unknown as RenderVideoSegment;
    const merged: RenderVideoSegment = { ...segment };
    if (r.playbackRate !== undefined) merged.playbackRate = r.playbackRate;
    if (r.transform !== undefined) merged.transform = r.transform;
    if (r.transitionIn !== undefined) merged.transitionIn = r.transitionIn;
    if (r.assetId !== undefined) merged.assetId = r.assetId;
    if (r.still !== undefined) merged.still = r.still;
    return merged;
  });
}

export type CanvasAspect = "source" | "9:16" | "16:9" | "1:1" | "4:5";
export interface CanvasSettings {
  aspect: CanvasAspect;
  /** "blur" (cover-blur backdrop) or a CSS colour painted behind a contain-fit main chain. */
  background: string;
}

/** settings.canvas with the pinned defaults (aspect "source", background "blur"); raw settings win over parsed for the same strip-proofing reason as segments. */
export function resolveCanvasSettings(input: { rawSettings?: unknown; settings?: Partial<ProjectSettings> | null }): CanvasSettings {
  const raw = (input.rawSettings as { canvas?: Partial<CanvasSettings> } | null | undefined)?.canvas;
  const parsed = (input.settings as { canvas?: Partial<CanvasSettings> } | null | undefined)?.canvas;
  const canvas = raw ?? parsed;
  const aspects: CanvasAspect[] = ["source", "9:16", "16:9", "1:1", "4:5"];
  return {
    aspect: canvas?.aspect && aspects.includes(canvas.aspect) ? canvas.aspect : "source",
    background: typeof canvas?.background === "string" && canvas.background.length > 0 ? canvas.background : "blur",
  };
}

/**
 * Frame windows for a segment chain, one per segment, in composition (project) time.
 *
 * Rounding choice: each window boundary is the ROUNDED CUMULATIVE project time —
 * `from_k = round(startMs_k * fps/1000)` where startMs accumulates segment TIMELINE durations
 * (see segmentTimelineDurationMs: the source span divided by the segment's playback rate) from
 * 0, and `durationInFrames_k = round(endMs_k * fps/1000) − from_k` (endMs_k = startMs_k +
 * timeline duration), clamped to a minimum of 1 frame. Deriving the duration from two rounded
 * cumulative boundaries (rather than rounding each segment's duration independently) is what
 * makes the windows TILE EXACTLY: consecutive windows share a boundary, so there are no gaps
 * or overlaps and the durations sum to `round(totalMs * fps/1000)`, matching the composition
 * duration. The min-1 clamp only engages for a segment shorter than half a frame, which valid
 * segmentations do not contain.
 *
 * trimBefore/trimAfter stay per segment in SOURCE frames, via videoTrimFrames on that
 * segment's own source range — the same trim contract the single-layer clip path uses — and
 * each window also carries the segment's playbackRate for the video engines.
 */
export function videoSegmentFrames(
  segments: readonly RenderVideoSegment[],
  fps: number,
): { from: number; durationInFrames: number; trimBefore: number; trimAfter: number; playbackRate: number }[] {
  const f = Math.max(1, fps);
  let projectStartMs = 0;
  return segments.map((segment) => {
    const projectEndMs = projectStartMs + segmentTimelineDurationMs(segment);
    const from = Math.round((projectStartMs / 1000) * f);
    const durationInFrames = Math.max(1, Math.round((projectEndMs / 1000) * f) - from);
    const trim = videoTrimFrames({ startMs: segment.sourceInMs, endMs: segment.sourceOutMs }, f) ?? { trimBefore: 0, trimAfter: 0 };
    projectStartMs = projectEndMs;
    return { from, durationInFrames, trimBefore: trim.trimBefore, trimAfter: trim.trimAfter, playbackRate: segmentPlaybackRate(segment) };
  });
}

/**
 * Layout for a transition chain (TransitionSeries): per-segment sequence durations plus the
 * frame count of every boundary transition (transitions[j] sits between segments j and j+1).
 *
 * PARITY CONTRACT (the identity the tests pin):
 *   Σ sequence frames − Σ transition frames === framesForDurationMs(compositionDurationMs(segments), fps)
 * Sequence durations come from CEIL cumulative boundaries over timeline durations — ceil, not
 * the round used by videoSegmentFrames, because framesForDurationMs itself ceils: with round
 * boundaries a chain whose total lands on a sub-half frame (e.g. 1040ms at 30fps = 31.2) would
 * sum BELOW the composition's frame count and no non-negative transition allocation could make
 * the identity hold. The total transition frames are then DEFINED as Σ sequences − target, and
 * distributed over the boundaries that carry a transitionIn proportionally to their durationMs
 * (largest remainder), each clamped to ≤ min(adjacent sequence durations) − 1 (the
 * TransitionSeries validity bound) and, whenever the total allows, ≥ 1. When the requested
 * transitions exceed the clamp capacity (e.g. a 1000ms transition into a 400ms segment), the
 * total is capacity-bounded FIRST and the preceding sequences shrink by the difference — the
 * frames move into the overlap — so the identity AND the clamp both hold. A boundary whose
 * allocation ends at 0 (transition shorter than the frame quantum) renders as a plain cut.
 */
export function videoTransitionLayout(
  segments: readonly RenderVideoSegment[],
  fps: number,
): { sequences: { durationInFrames: number }[]; transitions: { durationInFrames: number }[] } {
  const f = Math.max(1, fps);
  const durationsMs = segments.map((s) => segmentTimelineDurationMs(s));
  let cumMs = 0;
  const sequences = durationsMs.map((d) => {
    const start = Math.ceil((cumMs / 1000) * f);
    cumMs += d;
    const end = Math.ceil((cumMs / 1000) * f);
    return { durationInFrames: Math.max(1, end - start) };
  });
  const transitions: { durationInFrames: number }[] = segments.slice(1).map(() => ({ durationInFrames: 0 }));
  if (segments.length < 2) return { sequences, transitions };
  const transMs = segments.map((s, i) => (i === 0 ? 0 : Math.max(0, s.transitionIn?.durationMs ?? 0)));
  const target = framesForDurationMs(compositionDurationMs(segments), f);
  const totalTrans = sequences.reduce((sum, s) => sum + s.durationInFrames, 0) - target;
  const active = transMs.map((ms, i) => i > 0 && ms > 0);
  if (totalTrans <= 0 || !active.some(Boolean)) return { sequences, transitions };
  // Per-boundary capacity: a boundary can hold at most min(adjacent sequences) - 1 frames, and
  // the boundaries together can never hold more than the frames the composition actually has.
  // The CAPACITY-BOUNDED total decides each boundary's frames as round(durationMs * fps/1000),
  // clamped to its capacity; when the capacities shrink the total below the raw target, the
  // sequence durations shrink with it (transferred into the boundary they overlap), which is
  // what keeps the parity identity exact in the clamped case too.
  const caps = transMs.map((_, i) => (i === 0 ? 0 : Math.min(sequences[i - 1].durationInFrames, sequences[i].durationInFrames) - 1));
  const rawFrames = transMs.map((ms, i) => (i === 0 ? 0 : Math.max(0, Math.round((ms / 1000) * f))));
  const boundedTotal = Math.min(
    totalTrans,
    rawFrames.reduce((sum, fr, i) => sum + Math.min(fr, Math.max(0, caps[i])), 0),
  );
  let shrink = totalTrans - boundedTotal;
  for (let i = segments.length - 1; i >= 1 && shrink > 0; i--) {
    if (rawFrames[i] <= 0) continue; // only boundaries carrying a transition shrink their predecessor
    // Shrink the sequence BEFORE the boundary (its tail is what the transition overlaps);
    // never below bounded transition + 1, so the clamp bound survives the shrink.
    const capHere = Math.min(rawFrames[i], Math.max(0, caps[i]));
    const room = sequences[i - 1].durationInFrames - (capHere + 1);
    const cut = Math.min(Math.max(0, room), shrink);
    sequences[i - 1].durationInFrames -= cut;
    shrink -= cut;
  }
  const alloc = new Array<number>(segments.length).fill(0);
  // Capacities are re-derived after any shrink (sequence durations changed above).
  for (let i = 1; i < segments.length; i++) caps[i] = Math.min(sequences[i - 1].durationInFrames, sequences[i].durationInFrames) - 1;
  // Largest-remainder distribution of the total over active boundaries, weighted by durationMs.
  const activeIdx = transMs.map((_, i) => i).filter((i) => active[i] && caps[i] >= 1);
  if (activeIdx.length > 0) {
    const weightSum = activeIdx.reduce((sum, i) => sum + transMs[i], 0);
    let assigned = 0;
    const shares = activeIdx.map((i) => {
      const share = (boundedTotal * transMs[i]) / weightSum;
      const base = Math.floor(share);
      alloc[i] = base;
      assigned += base;
      return { i, frac: share - base };
    });
    shares.sort((a, b) => b.frac - a.frac || transMs[b.i] - transMs[a.i]);
    for (let k = 0; assigned < boundedTotal && k < shares.length; k++, assigned++) alloc[shares[k].i] += 1;
    // Clamp to capacity; redistribute the excess one frame at a time to boundaries with room.
    for (let guard = 0; guard < boundedTotal + segments.length; guard++) {
      let excess = 0;
      for (const i of activeIdx) {
        if (alloc[i] > caps[i]) {
          excess += alloc[i] - caps[i];
          alloc[i] = caps[i];
        }
      }
      if (excess === 0) break;
      let placed = 0;
      const byWeight = [...activeIdx].sort((a, b) => transMs[b] - transMs[a]);
      for (let k = 0; placed < excess && k < byWeight.length * Math.max(1, excess); k++) {
        const i = byWeight[k % byWeight.length];
        if (alloc[i] < caps[i]) {
          alloc[i] += 1;
          placed += 1;
        }
      }
      if (placed < excess) {
        // Pathological: total clamp capacity below the required total — preserve the identity
        // on the largest-capacity boundary (see the contract note above).
        const largest = activeIdx.reduce((best, i) => (caps[i] > caps[best] ? i : best), activeIdx[0]);
        alloc[largest] += excess - placed;
        break;
      }
    }
    // Minimum 1 frame per active boundary whenever the total allows: steal from the largest holder.
    for (const i of activeIdx) {
      if (alloc[i] === 0) {
        const donor = activeIdx.reduce((best, j) => (alloc[j] > alloc[best] ? j : best), activeIdx[0]);
        if (alloc[donor] > 1) {
          alloc[donor] -= 1;
          alloc[i] = 1;
        }
      }
    }
  }
  for (let j = 0; j < transitions.length; j++) transitions[j] = { durationInFrames: alloc[j + 1] };
  return { sequences, transitions };
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
