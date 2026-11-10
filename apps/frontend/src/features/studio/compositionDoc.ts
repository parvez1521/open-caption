import {
  DEFAULT_TRACK_STATE,
  IDENTITY_SEGMENT_TRANSFORM,
  segmentTimelineDurationMs,
  type CompositionMarker,
  type CompositionTrackKind,
  type OverlayItem,
  type ProjectSettings,
  type SegmentTransform,
  type SegmentTransition,
  type TrackState,
  type VideoSegment,
} from "@capseasy/shared";
import {
  overlayClipsOf,
  trackOf,
  type CaptionClip,
  type Composition,
  type OverlayClip,
} from "./composition";

/**
 * Stage-B editing model (STUDIO-ARCHITECTURE.md §1.2 Stage B, TRANSFORMATION-ROADMAP
 * Phase 4.1): the composition as the editor holds it in memory, plus the two pure
 * conversions at its edges —
 *
 *   buildEditorComposition:  Stage-A view + stored settings  ->  EditorComposition
 *   projectComposition:      EditorComposition + base settings ->  ProjectSettings
 *
 * Storage at Stage B is still today's shape: caption words keep their revisioned RPC,
 * and everything timeline-shaped is projected back into the settings patch — video
 * segments / markers / track state into the declared `settings.composition` slice,
 * overlays into `settings.overlays`, and the overall trim into `settings.clipRange`.
 * Nothing here persists anything and nothing here touches `useStudio`: the slice
 * plugs into the existing settings history/patch path only.
 *
 * THE PARTITION INVARIANT (the invariant every op must preserve) — Run 2 / Stage C:
 * `videoClips` is ALWAYS a partition of the rendered TIMELINE over INDEPENDENT source
 * ranges. Gate G4 lifted the Stage-B source-continuity clause: a clip's source range
 * no longer has to continue its predecessor's — jump cuts are legal data now.
 *   - the first clip starts at project time 0;
 *   - every clip's durationMs is > 0 and equals its TIMELINE duration,
 *     `segmentTimelineDurationMs(clip)` = (sourceOutMs − sourceInMs) / playbackRate;
 *   - clip i+1 starts exactly where clip i ends (startMs accumulation), MINUS its
 *     `transitionIn.durationMs` when it carries a transition: at render the two clips
 *     overlap by the transition, so the total duration is
 *     `compositionDurationMs(clips)` (sum of timeline durations − transitions on
 *     clips[1..]), which is exactly the last clip's end under this accumulation.
 * projectComposition VALIDATES the invariant and throws on violation — ops must never
 * produce such a state, and the throw is the tripwire that catches a broken op in
 * tests instead of letting it persist a composition the renderer would desync on.
 *
 * THE RENDER-SYNC INVARIANT (why clipRange is projected, never just kept):
 * clipRange remains the SPAN rule — first clip's sourceInMs → last clip's sourceOutMs —
 * exactly as at Stage B. That is sound because clipRange is consumed only by the
 * legacy single-layer render path, which runs only when there are NO stored segments
 * or exactly the synthesised main clip; in both cases the span IS the single clip's
 * own range, so span == range and nothing drifts. Multi-segment compositions render
 * from the segments themselves, never from clipRange. projectComposition therefore
 * still recomputes clipRange from the segment span on every projection (see its
 * rules below); it is never copied through blindly when there are video clips.
 *
 * Times are milliseconds throughout. Build and projection copy stored times
 * verbatim (no rounding, no re-derivation beyond accumulation), which is what makes
 * the round trips in the tests exact rather than approximately equal.
 */

export interface EditorVideoClip {
  id: string;
  kind: "video";
  /** project (rendered) timeline position of the clip's first frame */
  startMs: number;
  /** TIMELINE duration: (sourceOutMs − sourceInMs) / playbackRate — see the invariant above */
  durationMs: number;
  /** in/out points into the source video (a PSEUDO-span for a `still` clip) */
  sourceInMs: number;
  sourceOutMs: number;
  /** Run-2 fields, carried verbatim from/to the stored segment */
  playbackRate: number;
  transform: SegmentTransform;
  transitionIn: SegmentTransition | null;
  /** device-local media-bin asset replacing the main source for this clip; null = main source */
  assetId: string | null;
  /** freeze-frame still clip: sourceIn/Out are a pseudo-span whose length is the on-screen duration */
  still: boolean;
}

/** The Run-2 defaults a clip built from pre-Run-2 data (or the synthesised main clip) carries. */
export const editorClipDefaults = (): Pick<EditorVideoClip, "playbackRate" | "transform" | "transitionIn" | "assetId" | "still"> => ({
  playbackRate: 1,
  transform: { ...IDENTITY_SEGMENT_TRANSFORM },
  transitionIn: null,
  assetId: null,
  still: false,
});

export interface EditorComposition {
  version: 1;
  /** rendered (project) duration: the span of the video partition, or the view's duration when there is no video */
  durationMs: number;
  /** full source length; 0 when unknown */
  sourceDurationMs: number;
  /** source time shown at project time 0 (the first segment's / clip range's start) */
  rangeStartMs: number;
  /** ALWAYS a contiguous partition — see the invariant above */
  videoClips: EditorVideoClip[];
  /** display-only, from the Stage-A view; caption edits keep going through the caption doc */
  captionClips: CaptionClip[];
  /** from the Stage-A view, in timeline order; each carries its OverlayItem by reference */
  overlayClips: OverlayClip[];
  markers: CompositionMarker[];
  trackState: Record<CompositionTrackKind, TrackState>;
}

const TRACK_KINDS: CompositionTrackKind[] = ["video", "captions", "text", "graphics"];

/** True when a clip transform is absent or exactly the identity transform. */
function isIdentityTransform(t: SegmentTransform | undefined): boolean {
  if (!t) return true;
  const id = IDENTITY_SEGMENT_TRANSFORM;
  return (
    t.cropLeft === id.cropLeft && t.cropTop === id.cropTop && t.cropRight === id.cropRight && t.cropBottom === id.cropBottom &&
    t.rotateDeg === id.rotateDeg && t.flipH === id.flipH && t.flipV === id.flipV && t.scale === id.scale &&
    t.offsetX === id.offsetX && t.offsetY === id.offsetY
  );
}

const isDefaultTrackState = (t: TrackState): boolean =>
  t.locked === DEFAULT_TRACK_STATE.locked && t.visible === DEFAULT_TRACK_STATE.visible && t.muted === DEFAULT_TRACK_STATE.muted;

/** A complete, own-copy track-state record in canonical track order, defaults filled per track. */
function normalizeTrackState(input: Partial<Record<CompositionTrackKind, TrackState>> | undefined): Record<CompositionTrackKind, TrackState> {
  const out = {} as Record<CompositionTrackKind, TrackState>;
  for (const kind of TRACK_KINDS) out[kind] = { ...DEFAULT_TRACK_STATE, ...(input?.[kind] ?? {}) };
  return out;
}

/**
 * The source span covered by an ordered list of segments (or segment-shaped clips):
 * the first item's sourceInMs through the last item's sourceOutMs. Null for an empty
 * list — "no span" is a real state (no media) and callers must not invent one.
 */
export function segmentsSpan(segments: readonly { sourceInMs: number; sourceOutMs: number }[]): { startMs: number; endMs: number } | null {
  if (segments.length === 0) return null;
  return { startMs: segments[0]!.sourceInMs, endMs: segments[segments.length - 1]!.sourceOutMs };
}

function partitionProblem(clips: readonly EditorVideoClip[]): string | null {
  if (clips.length === 0) return null;
  if (clips[0]!.startMs !== 0) return `first clip "${clips[0]!.id}" starts at ${clips[0]!.startMs}ms, expected 0ms`;
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]!;
    if (!(clip.durationMs > 0)) return `clip "${clip.id}" has non-positive durationMs ${clip.durationMs}`;
    const timelineMs = segmentTimelineDurationMs({
      sourceInMs: clip.sourceInMs,
      sourceOutMs: clip.sourceOutMs,
      playbackRate: clip.playbackRate ?? 1,
    });
    if (timelineMs !== clip.durationMs)
      return `clip "${clip.id}" durationMs ${clip.durationMs} does not equal its timeline duration ${timelineMs} (source span ${clip.sourceInMs}..${clip.sourceOutMs} at rate ${clip.playbackRate ?? 1})`;
    if (i === 0) continue;
    const prev = clips[i - 1]!;
    // a transition into this clip overlaps it with its predecessor by the transition's duration
    const expectedStart = prev.startMs + prev.durationMs - (clip.transitionIn?.durationMs ?? 0);
    if (clip.startMs !== expectedStart)
      return `clip "${clip.id}" starts at ${clip.startMs}ms, expected ${expectedStart}ms (end of clip "${prev.id}", minus its transitionIn) — timeline gap or overlap`;
    // NOTE: no source-continuity check — Stage C lifted it; jump cuts are legal.
  }
  return null;
}

/**
 * Validation helper for the partition invariant (used by the projection guard and by
 * tests). An empty clip list is vacuously a partition — a project with no media has
 * no partition to break; projectComposition keeps the stored clipRange untouched
 * in that case instead of deriving one.
 */
export function isPartition(clips: readonly EditorVideoClip[]): boolean {
  return partitionProblem(clips) === null;
}

/**
 * Build the in-memory editor composition from the Stage-A read-side view plus the
 * stored settings.
 *
 * Video clips:
 * - If `settings.composition.videoSegments` is non-empty, the segments ARE the
 *   partition: clips are laid out from project time 0 in stored order, each clip's
 *   duration is its TIMELINE duration (source span ÷ playbackRate), each clip after
 *   the first starts its transitionIn duration EARLIER than its predecessor's end
 *   (the render overlap), every Run-2 field is carried verbatim from the stored
 *   segment, and rangeStartMs is the first segment's sourceInMs.
 *   The view's synthesised main clip is ignored in this branch.
 * - Otherwise a single clip is synthesised from the Stage-A view's video clip
 *   (id "main-video"): its source in-point is `settings.clipRange?.startMs ?? 0`
 *   (the view already authorises only the effective, i.e. trimmed, duration) and
 *   its source out-point is in + view duration. No view video clip (no media)
 *   yields an empty clip list.
 *
 * Markers and track state come from `settings.composition` (schema defaults when
 * the project never stored any); caption and overlay clips pass through from the
 * view — overlays in the view's timeline order, carrying their items by reference.
 */
export function buildEditorComposition(input: {
  view: Composition;
  settings: ProjectSettings;
  sourceDurationMs: number;
}): EditorComposition {
  const { view, settings } = input;
  const sourceDurationMs = Math.max(0, input.sourceDurationMs || 0);
  const stored = settings.composition;
  const segments: VideoSegment[] = stored?.videoSegments ?? [];
  const markers: CompositionMarker[] = [...(stored?.markers ?? [])];
  const trackState = normalizeTrackState(stored?.tracks);

  const captionClips = [...trackOf(view, "captions").clips] as CaptionClip[];
  const overlayClips = overlayClipsOf(view);

  let videoClips: EditorVideoClip[];
  let durationMs: number;
  let rangeStartMs: number;

  if (segments.length > 0) {
    let endMs = 0;
    videoClips = segments.map((seg, i) => {
      const durationMs = segmentTimelineDurationMs({
        sourceInMs: seg.sourceInMs,
        sourceOutMs: seg.sourceOutMs,
        playbackRate: seg.playbackRate ?? 1,
      });
      const startMs = i === 0 ? 0 : endMs - (seg.transitionIn?.durationMs ?? 0);
      const clip: EditorVideoClip = {
        id: seg.id,
        kind: "video",
        startMs,
        durationMs,
        sourceInMs: seg.sourceInMs,
        sourceOutMs: seg.sourceOutMs,
        playbackRate: seg.playbackRate ?? 1,
        transform: { ...IDENTITY_SEGMENT_TRANSFORM, ...(seg.transform ?? {}) },
        transitionIn: seg.transitionIn ? { ...seg.transitionIn } : null,
        assetId: seg.assetId ?? null,
        still: seg.still ?? false,
      };
      endMs = startMs + durationMs;
      return clip;
    });
    durationMs = endMs;
    rangeStartMs = segments[0]!.sourceInMs;
  } else {
    const viewClip = trackOf(view, "video").clips[0];
    rangeStartMs = settings.clipRange?.startMs ?? 0;
    if (viewClip && viewClip.durationMs > 0) {
      const sourceInMs = rangeStartMs;
      videoClips = [
        {
          id: "main-video",
          kind: "video",
          startMs: 0,
          durationMs: viewClip.durationMs,
          sourceInMs,
          sourceOutMs: sourceInMs + viewClip.durationMs,
          ...editorClipDefaults(),
        },
      ];
      durationMs = view.durationMs;
    } else {
      videoClips = [];
      durationMs = view.durationMs;
    }
  }

  return {
    version: 1,
    durationMs,
    sourceDurationMs,
    rangeStartMs,
    videoClips,
    captionClips,
    overlayClips,
    markers,
    trackState,
  };
}

/**
 * Project the editor composition back to stored settings — a NEW ProjectSettings
 * built as `{...base, composition, overlays, clipRange}`; every other field of
 * `base` passes through untouched, and `base` is never mutated.
 *
 * Rules, exactly as implemented:
 *
 * 1. PARTITION GUARD. A non-empty videoClips list must satisfy the partition
 *    invariant; a violation throws a descriptive Error (see the header). Nothing
 *    is projected from a broken partition.
 *
 * 2. SEGMENTS + THE UNTOUCHED-SHAPE RULE. `composition.videoSegments` is the clips
 *    mapped to stored segments, every Run-2 field (playbackRate, transform,
 *    transitionIn, assetId, still) carried verbatim — EXCEPT that it is written
 *    as [] when ALL of the following hold: `videoClips.length <= 1` AND `markers`
 *    is empty AND every track's state is the default AND the single clip (if any)
 *    is PLAIN (rate 1, identity transform, no transition, main source, not a
 *    still). Rationale: a project that has never used a timeline feature must keep
 *    EXACTLY today's stored shape, and a single plain (possibly trimmed) clip
 *    projects losslessly through clipRange alone, so storing one segment would
 *    add a slice without adding information. The plain-clip clause is the Run-2
 *    extension of the same rule: a lone clip carrying Run-2 data does NOT project
 *    losslessly through clipRange, so its segment is written explicitly. As soon
 *    as markers or track state are non-default the composition slice is non-empty
 *    anyway, and the segments are then written explicitly even for a single clip.
 *    Markers and track state themselves are always written from the composition
 *    (normalised to the full four-track record), so in the untouched case the
 *    whole written slice is exactly the schema's empty default.
 *
 * 3. CLIPRANGE (render-sync). When videoClips is empty (no media), base.clipRange
 *    is kept unchanged — there is no span to derive one from. Otherwise, with
 *    span = segmentsSpan(videoClips): clipRange is null when the span starts at 0
 *    AND (sourceDurationMs <= 0 OR the span end reaches the source end) — i.e. the
 *    partition covers the whole (known) source, which is precisely what a null
 *    clipRange already means to the renderer — and `{startMs: span.startMs,
 *    endMs: span.endMs}` otherwise.
 *
 * 4. OVERLAYS. `overlays` is the overlay clips' items, sorted by startMs then id
 *    (the Stage-A ordering), written back by reference — overlay clip ⇄ OverlayItem
 *    is a bijection, so this is lossless.
 */
export function projectComposition(comp: EditorComposition, base: ProjectSettings): ProjectSettings {
  const problem = partitionProblem(comp.videoClips);
  if (problem) throw new Error(`projectComposition: video clips do not form a contiguous partition — ${problem}`);

  const markers = [...comp.markers];
  const trackState = normalizeTrackState(comp.trackState);
  const allTracksDefault = TRACK_KINDS.every((kind) => isDefaultTrackState(trackState[kind]));
  const only = comp.videoClips[0];
  const onlyPlain =
    !only ||
    ((only.playbackRate ?? 1) === 1 &&
      !only.transitionIn &&
      (only.assetId ?? null) === null &&
      !(only.still ?? false) &&
      isIdentityTransform(only.transform));
  const untouched = comp.videoClips.length <= 1 && markers.length === 0 && allTracksDefault && onlyPlain;

  const videoSegments: VideoSegment[] = untouched
    ? []
    : comp.videoClips.map((clip) => ({
        id: clip.id,
        sourceInMs: clip.sourceInMs,
        sourceOutMs: clip.sourceOutMs,
        playbackRate: clip.playbackRate ?? 1,
        transform: { ...IDENTITY_SEGMENT_TRANSFORM, ...(clip.transform ?? {}) },
        transitionIn: clip.transitionIn ? { ...clip.transitionIn } : null,
        assetId: clip.assetId ?? null,
        still: clip.still ?? false,
      }));

  let clipRange = base.clipRange;
  if (comp.videoClips.length > 0) {
    const span = segmentsSpan(comp.videoClips)!;
    clipRange =
      span.startMs === 0 && (comp.sourceDurationMs <= 0 || span.endMs >= comp.sourceDurationMs)
        ? null
        : { startMs: span.startMs, endMs: span.endMs };
  }

  const overlays: OverlayItem[] = [...comp.overlayClips]
    .sort((a, b) => a.startMs - b.startMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((clip) => clip.overlay);

  return {
    ...base,
    composition: {
      version: 1,
      videoSegments,
      markers,
      tracks: trackState,
    },
    overlays,
    clipRange,
  };
}
