import type { SegmentEffect, SegmentKeyframe, VideoSegment } from "@capseasy/shared";
import type { EditorComposition, EditorVideoClip } from "./compositionDoc";

/**
 * Run-2 segment view layer (Worker D — studio UI).
 *
 * The pinned Run-2 segment fields (playbackRate / transform / transitionIn / assetId / still)
 * are owned by the shared schema + composition workers (Workers B/C). On the base this branch
 * was cut from (main @ 751f699) those fields do not exist yet in `VideoSegment` /
 * `EditorVideoClip`, so this module is the ONE place in the UI that knows their shape: every
 * read of a segment's Run-2 fields goes through the resolvers here, which apply the pinned
 * identity defaults when a stored segment predates them. When B/C's fields land, stored
 * segments simply start carrying the values and nothing here changes.
 *
 * Times are milliseconds throughout, matching the rest of the studio.
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
  /** Run 3 (4.7): base opacity 0..1 (also the "opacity" keyframe channel's base) */
  opacity: number;
}

export const IDENTITY_TRANSFORM: SegmentTransform = {
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
  opacity: 1,
};

export type SegmentTransitionType = "fade" | "wipe" | "slide" | "zoom" | "blur";
export interface SegmentTransition {
  type: SegmentTransitionType;
  durationMs: number;
}

export interface SegmentExtras {
  playbackRate: number;
  transform: SegmentTransform;
  transitionIn: SegmentTransition | null;
  assetId: string | null;
  still: boolean;
  /** Run 3 (4.7): segment-local keyframes + the ordered effects stack */
  keyframes: SegmentKeyframe[];
  effects: SegmentEffect[];
}

export const DEFAULT_SEGMENT_EXTRAS: SegmentExtras = {
  playbackRate: 1,
  transform: IDENTITY_TRANSFORM,
  transitionIn: null,
  assetId: null,
  still: false,
  keyframes: [],
  effects: [],
};

/** A stored segment or editor clip, with the Run-2 fields possibly absent (pre-Run-2 data). */
export type SegmentLike = Pick<VideoSegment, "id" | "sourceInMs" | "sourceOutMs"> & Partial<SegmentExtras>;

/** Resolve a segment-like record to its full Run-2 extras, pinned identity defaults filled in. */
export function segmentExtras(seg: Partial<SegmentExtras> | null | undefined): SegmentExtras {
  if (!seg) return DEFAULT_SEGMENT_EXTRAS;
  return {
    playbackRate: typeof seg.playbackRate === "number" && seg.playbackRate > 0 ? seg.playbackRate : 1,
    transform: { ...IDENTITY_TRANSFORM, ...(seg.transform ?? {}) },
    transitionIn: seg.transitionIn ?? null,
    assetId: seg.assetId ?? null,
    still: seg.still === true,
    keyframes: seg.keyframes ?? [],
    effects: seg.effects ?? [],
  };
}

/**
 * How long a segment occupies on the rendered timeline:
 * - a still's sourceIn/Out are a pseudo-span that IS its on-screen duration (rate never applies);
 * - a video segment plays its source span at `playbackRate`, so the timeline span is span / rate.
 */
export function segmentTimelineDurationMs(seg: SegmentLike): number {
  const span = Math.max(0, seg.sourceOutMs - seg.sourceInMs);
  const { playbackRate, still } = segmentExtras(seg);
  if (still) return span;
  return span / playbackRate;
}

/**
 * The rendered duration of a whole composition: the sum of the segments' timeline durations
 * MINUS the transition durations — each segment with a `transitionIn` (other than the first,
 * which has nothing to transition from) overlaps its predecessor by that much.
 */
export function compositionDurationMs(segments: readonly SegmentLike[]): number {
  let total = 0;
  segments.forEach((seg, i) => {
    total += segmentTimelineDurationMs(seg);
    const t = segmentExtras(seg).transitionIn;
    if (i > 0 && t) total -= Math.max(0, t.durationMs);
  });
  return Math.max(0, Math.round(total));
}

/**
 * Which duration the studio should run on (StudioPage item 1): when at least one segment is
 * stored, the composition's own duration is the truth; otherwise the caller falls back to the
 * pre-Run-2 path (`effectiveDurationMs(sourceDurationMs, clipRange)`), passed in ready-made.
 */
export function pickStudioDurationMs(input: {
  storedSegments: readonly SegmentLike[];
  fallbackDurationMs: number;
}): number {
  return input.storedSegments.length >= 1 ? compositionDurationMs(input.storedSegments) : input.fallbackDurationMs;
}

/** The fully-resolved view of one selected segment, as the inspector + timeline consume it. */
export interface SegmentView extends SegmentExtras {
  id: string;
  index: number;
  sourceInMs: number;
  sourceOutMs: number;
  /** project-timeline position of the segment's first frame (from the editor clip) */
  startMs: number;
  /** on-screen (timeline) duration, rate-aware */
  timelineDurationMs: number;
}

/**
 * Build the view for one editor clip: timeline geometry from the clip, Run-2 fields from the
 * stored segment of the same id when one exists (the stored record is the persistence truth),
 * else from the clip itself, else the pinned defaults.
 */
export function resolveSegmentView(
  clip: EditorVideoClip,
  index: number,
  stored?: SegmentLike | null,
): SegmentView {
  const extras = segmentExtras({ ...(clip as Partial<SegmentExtras>), ...(stored ?? {}) });
  const segLike: SegmentLike = {
    id: clip.id,
    sourceInMs: stored?.sourceInMs ?? clip.sourceInMs,
    sourceOutMs: stored?.sourceOutMs ?? clip.sourceOutMs,
    ...extras,
  };
  return {
    id: clip.id,
    index,
    sourceInMs: segLike.sourceInMs,
    sourceOutMs: segLike.sourceOutMs,
    startMs: clip.startMs,
    timelineDurationMs: segmentTimelineDurationMs(segLike),
    ...extras,
  };
}

/** Every distinct asset id referenced by a list of segments/clips, in first-seen order. */
export function collectSegmentAssetIds(segments: readonly Partial<SegmentExtras>[]): string[] {
  const out: string[] = [];
  for (const s of segments) {
    const id = s.assetId ?? null;
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Build the assetId → URL map for segment assets, exactly the shape the overlay-assets flow
 * builds for image overlays: ids with no matching asset on this device are simply absent
 * (renderers skip what they cannot resolve — the standing device-local rule). The URL factory
 * is injected so this stays unit-testable without a DOM (`URL.createObjectURL` in the page).
 */
export function buildSegmentAssetUrls<T extends { id: string }>(
  segments: readonly Partial<SegmentExtras>[],
  assets: readonly T[],
  makeUrl: (asset: T) => string,
): Record<string, string> {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const urls: Record<string, string> = {};
  for (const id of collectSegmentAssetIds(segments)) {
    const asset = byId.get(id);
    if (asset) urls[id] = makeUrl(asset);
  }
  return urls;
}

/** "2×", "0.5×", "1.25×" — trailing zeros trimmed, never "2.00×". */
export function formatPlaybackRate(rate: number): string {
  const r = Math.round(rate * 100) / 100;
  return `${r}×`;
}

export interface SegmentBadge {
  kind: "still" | "reversed" | "rate" | "transition";
  label: string;
}

/**
 * The badges a timeline block shows for a segment (Timeline item 4), as pure data so the
 * rendering stays a thin map: a still gets its Freeze badge, a segment playing a reversed
 * asset (identified by the asset's name, see segmentAssets.ts) gets "Reversed", a non-1 rate
 * gets "2×"-style text, and a transitionIn gets a chip naming it (rendered at the block's
 * left boundary by the Timeline).
 */
export function segmentBadges(
  view: Pick<SegmentView, "still" | "playbackRate" | "transitionIn" | "assetId">,
  assetName?: string | null,
): SegmentBadge[] {
  const badges: SegmentBadge[] = [];
  if (view.still) badges.push({ kind: "still", label: "Freeze" });
  else if (view.assetId && assetName && isReversedAssetName(assetName)) badges.push({ kind: "reversed", label: "Reversed" });
  if (!view.still && view.playbackRate !== 1) badges.push({ kind: "rate", label: formatPlaybackRate(view.playbackRate) });
  if (view.transitionIn) {
    const name = view.transitionIn.type[0]!.toUpperCase() + view.transitionIn.type.slice(1);
    badges.push({ kind: "transition", label: `${name} ${Math.round(view.transitionIn.durationMs)}ms` });
  }
  return badges;
}

/**
 * Commit a reverse conform onto a segment: the segment now plays media-bin asset
 * `assetId` over the source range the caller remapped onto the reversed copy (see
 * remapRangeToReversed in segmentAssets.ts), and it is a normal video segment again
 * (still cleared). Lives here, not in compositionOps, because the op layer must not
 * know about media-bin production. The remap preserves the span, so in practice the
 * timeline layout is unchanged; if the defensive clamp ever changed the span, later
 * clips shift by the same delta (transition overlaps between them are preserved,
 * since they all shift together) and the composition duration follows — the same
 * accounting the op layer's relayout performs. Unknown id = same-composition
 * no-op, matching the op layer's convention; docEffect is always "none" (nothing
 * outside the segment moves).
 */
export function applyReversedSegment(
  comp: EditorComposition,
  clipId: string,
  assetId: string,
  sourceInMs: number,
  sourceOutMs: number,
): { comp: EditorComposition; docEffect: { type: "none" } } {
  const idx = comp.videoClips.findIndex((c) => c.id === clipId);
  if (idx < 0) return { comp, docEffect: { type: "none" } };
  const clip = comp.videoClips[idx]!;
  const inMs = Math.max(0, Math.round(sourceInMs));
  const outMs = Math.max(inMs + 40, Math.round(sourceOutMs));
  const next: EditorVideoClip = { ...clip, assetId, sourceInMs: inMs, sourceOutMs: outMs, still: false };
  next.durationMs = segmentTimelineDurationMs(next);
  const delta = next.durationMs - clip.durationMs;
  const videoClips = comp.videoClips.map((c, i) => {
    if (i === idx) return next;
    if (i > idx && delta !== 0) return { ...c, startMs: c.startMs + delta };
    return c;
  });
  return { comp: { ...comp, videoClips, durationMs: comp.durationMs + delta }, docEffect: { type: "none" } };
}

/** Reversed copies produced by segmentAssets.ts carry this name prefix — the timeline's only
 *  signal that a segment's asset is a reversed conform (the pinned segment fields carry no
 *  reversed flag). Defined here to avoid a circular import with segmentAssets.ts. */
export const REVERSED_ASSET_PREFIX = "Reversed — ";

export function isReversedAssetName(name: string): boolean {
  return name.startsWith(REVERSED_ASSET_PREFIX);
}
