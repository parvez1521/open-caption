import {
  DEFAULT_TRACK_STATE,
  type CompositionMarker,
  type CompositionTrackKind,
  type OverlayItem,
  type ProjectSettings,
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
 * THE PARTITION INVARIANT (the invariant every op must preserve):
 * `videoClips` is ALWAYS a contiguous partition of the rendered timeline over one
 * contiguous source span:
 *   - the first clip starts at project time 0;
 *   - every clip's durationMs is > 0 and equals sourceOutMs - sourceInMs;
 *   - clip i+1 starts exactly where clip i ends (startMs), AND its sourceInMs is
 *     exactly clip i's sourceOutMs (no timeline gaps, no source jumps).
 * Stage B represents split points in a single source, not removed ranges, so source
 * continuity is part of the invariant, not an accident. projectComposition VALIDATES
 * the invariant and throws on violation — ops must never produce such a state, and
 * the throw is the tripwire that catches a broken op in tests instead of letting it
 * persist a composition the renderer would desync on.
 *
 * THE RENDER-SYNC INVARIANT (why clipRange is projected, never just kept):
 * the renderer (packages/compositions CaptionedVideo) trims the single video layer
 * via `settings.clipRange` and derives the authored duration via
 * `effectiveDurationMs(sourceDurationMs, clipRange)`. The projected clipRange must
 * therefore ALWAYS describe exactly the span of the video segments, or preview and
 * export drift apart from the timeline. projectComposition recomputes clipRange
 * from the segment span on every projection (see its rules below); it is never
 * copied through blindly when there are video clips.
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
  durationMs: number;
  /** in/out points into the source video */
  sourceInMs: number;
  sourceOutMs: number;
}

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
    if (clip.sourceOutMs - clip.sourceInMs !== clip.durationMs)
      return `clip "${clip.id}" durationMs ${clip.durationMs} does not equal its source span ${clip.sourceOutMs - clip.sourceInMs} (${clip.sourceInMs}..${clip.sourceOutMs})`;
    if (i === 0) continue;
    const prev = clips[i - 1]!;
    const expectedStart = prev.startMs + prev.durationMs;
    if (clip.startMs !== expectedStart)
      return `clip "${clip.id}" starts at ${clip.startMs}ms, expected ${expectedStart}ms (end of clip "${prev.id}") — timeline gap or overlap`;
    if (clip.sourceInMs !== prev.sourceOutMs)
      return `clip "${clip.id}" sourceInMs ${clip.sourceInMs} does not continue clip "${prev.id}" sourceOutMs ${prev.sourceOutMs} — source discontinuity`;
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
 *   duration is its source span, and rangeStartMs is the first segment's sourceInMs.
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
    let atMs = 0;
    videoClips = segments.map((seg) => {
      const clip: EditorVideoClip = {
        id: seg.id,
        kind: "video",
        startMs: atMs,
        durationMs: seg.sourceOutMs - seg.sourceInMs,
        sourceInMs: seg.sourceInMs,
        sourceOutMs: seg.sourceOutMs,
      };
      atMs += clip.durationMs;
      return clip;
    });
    durationMs = atMs;
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
 *    mapped to `{id, sourceInMs, sourceOutMs}` — EXCEPT that it is written as []
 *    when ALL of the following hold: `videoClips.length <= 1` AND `markers` is
 *    empty AND every track's state is the default. Rationale: a project that has
 *    never used a timeline feature must keep EXACTLY today's stored shape, and a
 *    single (possibly trimmed) clip projects losslessly through clipRange alone,
 *    so storing one segment would add a slice without adding information. As soon
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
  const untouched = comp.videoClips.length <= 1 && markers.length === 0 && allTracksDefault;

  const videoSegments: VideoSegment[] = untouched
    ? []
    : comp.videoClips.map((clip) => ({ id: clip.id, sourceInMs: clip.sourceInMs, sourceOutMs: clip.sourceOutMs }));

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
