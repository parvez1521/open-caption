import { newId } from "@capseasy/shared";
import type { EditorComposition, EditorVideoClip } from "./compositionDoc";
import type { DocEffect, VideoOpResult } from "./compositionOps";
import {
  IDENTITY_TRANSFORM,
  segmentExtras,
  segmentTimelineDurationMs,
  type SegmentExtras,
  type SegmentTransition,
  type SegmentTransform,
} from "./segmentView";

/**
 * Run-2 segment ops (Worker D — studio UI side).
 *
 * IMPORTANT — read before merging: the task pins these op names/signatures for
 * `compositionOps.ts` (owned by another worker, off-limits to this branch):
 *   setSegmentPlaybackRate(comp, clipId, rate), setSegmentTransition(comp, segmentId, transition|null),
 *   setSegmentTransform(comp, clipId, patch), duplicateVideoSegment(comp, clipId),
 *   rippleDeleteVideoSegment (middle segments allowed), insertStillSegmentAt(comp, atMs, durationMs, assetId)
 * On the base this branch was cut from (main @ 751f699) NONE of them exist yet, so they are
 * implemented here, in a studio-UI-owned module, with exactly the pinned names, signatures and
 * `{ comp, docEffect }` result shape, operating on the EditorComposition the way the Run-1 ops
 * do (pure, immutable, no-op = same reference). If the composition worker lands the same names
 * in compositionOps.ts, the coordinator should delete this file and repoint the imports in
 * StudioPage.tsx (they are the only imports of this module besides its tests).
 *
 * Model notes:
 * - Clips carry the Run-2 fields as extra properties (see segmentView.ts); every op spreads
 *   the clip it touches, so fields it does not know about survive untouched.
 * - Timeline layout is re-accumulated after every structural edit using RATE-AWARE timeline
 *   durations (segmentTimelineDurationMs): a segment's `durationMs` is its on-screen length,
 *   which for a rate ≠ 1 segment is no longer its source span. Source continuity between
 *   neighbours is NOT required any more at this layer — duplicate / middle-ripple / still /
 *   per-segment-asset edits all break it by design, and the Run-2 projection owns that.
 * - `applyReversedSegment` is an extra op beyond the pinned list: no pinned op covers
 *   committing a reverse conform (assetId + remapped source range) onto a segment.
 */

export type SegmentClip = EditorVideoClip & Partial<SegmentExtras>;

const NONE: DocEffect = { type: "none" };
const noOp = (comp: EditorComposition): VideoOpResult => ({ comp, docEffect: NONE });
const done = (comp: EditorComposition, docEffect: DocEffect = NONE): VideoOpResult => ({ comp, docEffect });

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Re-lay clips from project time 0 with rate-aware timeline durations. Copies, never mutates. */
function relayout(comp: EditorComposition, clips: readonly SegmentClip[]): EditorComposition {
  let atMs = 0;
  const laidOut: SegmentClip[] = clips.map((clip) => {
    const durationMs = Math.round(segmentTimelineDurationMs(clip));
    const next: SegmentClip = { ...clip, startMs: atMs, durationMs };
    atMs += durationMs;
    return next;
  });
  // total rendered length: the partition span minus the transitions' overlaps
  let total = atMs;
  laidOut.forEach((clip, i) => {
    const t = segmentExtras(clip).transitionIn;
    if (i > 0 && t) total -= Math.max(0, t.durationMs);
  });
  return {
    ...comp,
    videoClips: laidOut,
    durationMs: Math.max(0, total),
    rangeStartMs: laidOut.length > 0 ? laidOut[0]!.sourceInMs : comp.rangeStartMs,
  };
}

function replaceClip(comp: EditorComposition, clipId: string, patch: Partial<SegmentClip>): VideoOpResult {
  const idx = comp.videoClips.findIndex((c) => c.id === clipId);
  if (idx < 0) return noOp(comp);
  const clips = comp.videoClips.map((c, i) => (i === idx ? { ...c, ...patch } : c));
  return done(relayout(comp, clips as SegmentClip[]));
}

/** Set a segment's playback rate (clamped to the inspector's 0.25×–4× range). Stills are
 *  rate-1 by definition (their source span is a pseudo-span) and refuse the change. */
export function setSegmentPlaybackRate(comp: EditorComposition, clipId: string, rate: number): VideoOpResult {
  const clip = comp.videoClips.find((c) => c.id === clipId) as SegmentClip | undefined;
  if (!clip) return noOp(comp);
  if (segmentExtras(clip).still) return noOp(comp);
  const next = clamp(Math.round(rate * 100) / 100, 0.25, 4);
  if (next === segmentExtras(clip).playbackRate) return noOp(comp);
  return replaceClip(comp, clipId, { playbackRate: next });
}

/** Set or clear the transition INTO a segment. Any segment may carry one; the UI only offers
 *  it from the second segment on, and the duration helpers ignore a first segment's. */
export function setSegmentTransition(
  comp: EditorComposition,
  segmentId: string,
  transition: SegmentTransition | null,
): VideoOpResult {
  const clip = comp.videoClips.find((c) => c.id === segmentId) as SegmentClip | undefined;
  if (!clip) return noOp(comp);
  const next = transition ? { type: transition.type, durationMs: clamp(Math.round(transition.durationMs), 100, 2000) } : null;
  const cur = segmentExtras(clip).transitionIn;
  if (cur?.type === next?.type && cur?.durationMs === next?.durationMs) return noOp(comp);
  if (!cur && !next) return noOp(comp);
  return replaceClip(comp, segmentId, { transitionIn: next });
}

/** Patch a segment's transform; the patch merges over the current (default-filled) transform. */
export function setSegmentTransform(
  comp: EditorComposition,
  clipId: string,
  patch: Partial<SegmentTransform>,
): VideoOpResult {
  const clip = comp.videoClips.find((c) => c.id === clipId) as SegmentClip | undefined;
  if (!clip) return noOp(comp);
  const current = { ...IDENTITY_TRANSFORM, ...segmentExtras(clip).transform };
  const next: SegmentTransform = { ...current, ...patch };
  if ((Object.keys(patch) as Array<keyof SegmentTransform>).every((k) => next[k] === current[k])) return noOp(comp);
  return replaceClip(comp, clipId, { transform: next });
}

/**
 * Duplicate a video segment: a copy with a NEW id is inserted directly after the original,
 * playing the same source range (or the same asset range) again. The copy's transitionIn is
 * cleared — the transition belonged to the original's left boundary, and keeping it would
 * double-count its overlap in the composition duration.
 */
export function duplicateVideoSegment(comp: EditorComposition, clipId: string): VideoOpResult {
  const idx = comp.videoClips.findIndex((c) => c.id === clipId);
  if (idx < 0) return noOp(comp);
  const clip = comp.videoClips[idx] as SegmentClip;
  const copy: SegmentClip = { ...clip, id: newId(), transitionIn: null };
  const clips = [...comp.videoClips.slice(0, idx + 1), copy, ...comp.videoClips.slice(idx + 1)];
  return done(relayout(comp, clips as SegmentClip[]));
}

/** Whether a segment can ripple-delete under the Run-2 rule: any segment of a multi-segment
 *  composition, middle ones included (the Stage-B first/last-only gating is gone). */
export function canRippleDeleteSegment(comp: EditorComposition, clipId: string): boolean {
  return comp.videoClips.length > 1 && comp.videoClips.some((c) => c.id === clipId);
}

/**
 * Ripple-delete a video segment — first, middle or last — closing the timeline gap it leaves.
 * Deleting the FIRST segment re-bases project time, reported as a headShift of the segment's
 * TIMELINE duration (the commit layer shifts captions/markers/overlays by it, as in Run 1);
 * deleting any other segment reports no doc effect (content after it keeps its project times
 * in the doc; the timeline itself closes up in the relayout).
 * The only segment of a single-clip composition refuses (same-reference no-op).
 */
export function rippleDeleteVideoSegment(comp: EditorComposition, clipId: string): VideoOpResult {
  if (!canRippleDeleteSegment(comp, clipId)) return noOp(comp);
  const idx = comp.videoClips.findIndex((c) => c.id === clipId);
  const clip = comp.videoClips[idx]!;
  const rest = comp.videoClips.filter((_, i) => i !== idx);
  if (idx === 0) return done(relayout(comp, rest as SegmentClip[]), { type: "headShift", deltaMs: Math.round(clip.durationMs) });
  return done(relayout(comp, rest as SegmentClip[]));
}

/**
 * Insert a still segment (a freeze frame) at timeline position `atMs`, showing media-bin asset
 * `assetId` for `durationMs`. If `atMs` falls strictly inside a segment, that segment is split
 * there first (both halves keep their fields; the source split point is rate-aware); at a
 * boundary / the very start / the very end the still simply slots in. Content after the insert
 * shifts later by the still's duration in the relayout. The still's sourceIn/Out are the
 * pseudo-span [0, durationMs] — its on-screen duration, per the pinned still contract.
 */
export function insertStillSegmentAt(
  comp: EditorComposition,
  atMs: number,
  durationMs: number,
  assetId: string,
): VideoOpResult {
  const dur = Math.max(40, Math.round(durationMs));
  const total = comp.videoClips.reduce((sum, c) => sum + c.durationMs, 0);
  const at = clamp(Math.round(atMs), 0, total);
  const still: SegmentClip = {
    id: newId(),
    kind: "video",
    startMs: at,
    durationMs: dur,
    sourceInMs: 0,
    sourceOutMs: dur,
    playbackRate: 1,
    transform: { ...IDENTITY_TRANSFORM },
    transitionIn: null,
    assetId,
    still: true,
  };
  const idx = comp.videoClips.findIndex((c) => at > c.startMs && at < c.startMs + c.durationMs);
  if (idx < 0) {
    const insertAt = comp.videoClips.findIndex((c) => c.startMs >= at);
    const clips = insertAt < 0 ? [...comp.videoClips, still] : [...comp.videoClips.slice(0, insertAt), still, ...comp.videoClips.slice(insertAt)];
    return done(relayout(comp, clips as SegmentClip[]));
  }
  const clip = comp.videoClips[idx] as SegmentClip;
  const extras = segmentExtras(clip);
  const leftTimelineMs = at - clip.startMs;
  // how far into the SOURCE the split point sits: a still's pseudo-span maps 1:1, a video
  // segment's timeline offset scales by its playback rate
  const sourceMidMs = extras.still ? clip.sourceInMs + leftTimelineMs : clip.sourceInMs + leftTimelineMs * extras.playbackRate;
  const first: SegmentClip = { ...clip, sourceOutMs: Math.round(sourceMidMs) };
  const second: SegmentClip = { ...clip, id: newId(), sourceInMs: Math.round(sourceMidMs), transitionIn: null };
  const clips = [...comp.videoClips.slice(0, idx), first, still, second, ...comp.videoClips.slice(idx + 1)];
  return done(relayout(comp, clips as SegmentClip[]));
}

/**
 * Commit a reverse conform onto a segment (extra op — no pinned op covers it): the segment now
 * plays media-bin asset `assetId` over the source range the caller remapped onto the reversed
 * copy (see remapRangeToReversed in segmentAssets.ts), and it is a normal video segment again
 * (still cleared).
 */
export function applyReversedSegment(
  comp: EditorComposition,
  clipId: string,
  assetId: string,
  sourceInMs: number,
  sourceOutMs: number,
): VideoOpResult {
  const clip = comp.videoClips.find((c) => c.id === clipId);
  if (!clip) return noOp(comp);
  const inMs = Math.max(0, Math.round(sourceInMs));
  const outMs = Math.max(inMs + 40, Math.round(sourceOutMs));
  return replaceClip(comp, clipId, { assetId, sourceInMs: inMs, sourceOutMs: outMs, still: false });
}
