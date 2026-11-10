import {
  CaptionDocSchema,
  IDENTITY_SEGMENT_TRANSFORM,
  KEYFRAME_VALUE_RANGES,
  newId,
  type AudioBleep,
  type AudioClip,
  type CaptionDoc,
  type CompositionTrackKind,
  type KeyframeEasing,
  type OverlayItem,
  type SegmentEffect,
  type SegmentEffectType,
  type SegmentKeyframe,
  type SegmentKeyframeProperty,
  type SegmentTransform,
  type SegmentTransition,
  type TrackState,
} from "@capseasy/shared";
import { deleteWordsByIds, shiftWordsByIds } from "@motion-ai/caption-engine/core";
import { MIN_AUDIO_MS } from "./audioOps";
import type { OverlayClip } from "./composition";
import type { EditorComposition, EditorVideoClip } from "./compositionDoc";

/**
 * Stage-B clip operations (TRANSFORMATION-ROADMAP Phase 4, Worker C — the clip op
 * layer): pure, immutable edits over the {@link EditorComposition} model.
 *
 * Conventions shared by every op in this file:
 * - PURE + IMMUTABLE. An op never mutates its input (nor anything reachable from
 *   it); a changed result is built from new arrays / objects, with untouched
 *   parts carried over by reference.
 * - NO-OP = SAME REFERENCE. When an op cannot or need not change anything it
 *   returns the input composition itself (video ops wrap that as
 *   `{ comp: <same ref>, docEffect: { type: "none" } }`), so callers can skip
 *   history entries and re-renders with a single `===` check.
 * - IDS come from `newId()` (@capseasy/shared) — never invented locally.
 * - TIMES are milliseconds; float inputs are rounded at the op boundary
 *   (`Math.round`) so every stored time an op produces is an integer number
 *   of milliseconds, matching the rest of the studio.
 * - MINIMUM LENGTHS: a video segment / clip is at least {@link MIN_VIDEO_MS}
 *   (40 ms, matching Timeline's MIN_MS); an overlay window kept by a trim is
 *   at least {@link MIN_OVERLAY_MS} (100 ms, matching OverlayEditor's clamp).
 *   Splits require at least MIN_VIDEO_MS on each side.
 *
 * THE PARTITION INVARIANT (see compositionDoc.ts): `videoClips` always form a
 * TIMELINE partition over independent source ranges — first clip at project
 * time 0, every duration > 0 and equal to its timeline duration (source span ÷
 * playbackRate), starts accumulated from predecessor ends minus any
 * transitionIn overlap. Stage C lifted source continuity, so the Run-2 ops
 * include the edits Stage B had to refuse: middle-segment ripple delete,
 * segment duplication, playback-rate changes, transitions, transforms and
 * freeze-frame still insertion. Every video op below preserves the invariant
 * by construction (all timeline positions are re-accumulated by
 * {@link relayout} after an edit), and `projectComposition` throwing in tests
 * is the tripwire for a broken op.
 *
 * RATE / STILL ARITHMETIC (Run 2): all minimums and all drag targets are
 * TIMELINE milliseconds. A timeline delta Δt inside a clip at rate r moves
 * SOURCE edges by Δt × r. A still clip behaves as a rate-1 clip whose
 * sourceIn/Out are a pseudo-span: trimming its edges adjusts the pseudo-span
 * (and therefore its duration) directly.
 */

/** Minimum length of a video segment / clip, in ms (matches Timeline's MIN_MS). */
export const MIN_VIDEO_MS = 40;
/** Minimum window an overlay trim may leave, in ms (matches OverlayEditor's clamp). */
export const MIN_OVERLAY_MS = 100;
/** Minimum length of each half produced by a split, in ms. */
const MIN_SPLIT_MS = 40;

/**
 * A side effect a video op has on the REST of the project, reported to the
 * commit layer instead of being applied inside the op. The video op itself
 * deliberately does NOT move markers/overlays or touch the caption doc — it
 * only reports the effect, and the commit layer applies
 * {@link applyDocEffect} (caption doc) and {@link applyContentEffect}
 * (markers/overlays) atomically with the op. All times are TIMELINE ms.
 * - `none` — nothing outside the video partition moved.
 * - `headShift` — the head of the project was cut by `deltaMs`: project time
 *   re-bases, so all content shifts earlier by `deltaMs` (the legacy effect;
 *   equivalent to a rangeRemove of [0, deltaMs) for content, kept as its own
 *   type because existing callers/tests key on it).
 * - `rangeRemove` — the timeline range [startMs, startMs+durationMs) was
 *   removed (middle ripple delete): content fully inside is deleted, content
 *   at/after the range end shifts earlier by `durationMs`.
 * - `rangeInsert` — `durationMs` of new timeline was inserted at `atMs`:
 *   content starting at/after `atMs` shifts later by `durationMs`.
 * - `rangeShift` — content starting at/after `fromMs` shifts by `deltaMs`
 *   (either sign; transition length changes compress/expand the total).
 * - `rangeScale` — the range [startMs, startMs+oldDurationMs) was re-timed to
 *   `newDurationMs` (a playback-rate change): content inside rescales
 *   proportionally, content at/after the range end shifts by the difference.
 */
export type DocEffect =
  | { type: "none" }
  | { type: "headShift"; deltaMs: number }
  | { type: "rangeRemove"; startMs: number; durationMs: number }
  | { type: "rangeInsert"; atMs: number; durationMs: number }
  | { type: "rangeShift"; fromMs: number; deltaMs: number }
  | { type: "rangeScale"; startMs: number; oldDurationMs: number; newDurationMs: number };

/** Result of a video op: the (possibly unchanged) composition + its doc effect. */
export interface VideoOpResult {
  comp: EditorComposition;
  docEffect: DocEffect;
}

const NONE: DocEffect = { type: "none" };
const noOp = (comp: EditorComposition): VideoOpResult => ({ comp, docEffect: NONE });
const done = (comp: EditorComposition, docEffect: DocEffect = NONE): VideoOpResult => ({ comp, docEffect });

const roundMs = (ms: number): number => Math.round(ms);

/* ------------------------------------------------------------------ */
/* video helpers                                                       */
/* ------------------------------------------------------------------ */

/** A clip's timeline duration: source span ÷ playbackRate, rounded (shared rule, rate defaulted). */
function timelineDurationMs(clip: Pick<EditorVideoClip, "sourceInMs" | "sourceOutMs" | "playbackRate" | "still">): number {
  const rate = clip.still ? 1 : (clip.playbackRate ?? 1);
  return Math.round((clip.sourceOutMs - clip.sourceInMs) / rate);
}

/**
 * Re-lay a list of video clips into a valid partition: timeline positions are
 * re-accumulated from 0 in array order and every duration is re-derived from
 * its source span via {@link timelineDurationMs}; a clip with a transitionIn
 * starts that many ms BEFORE its predecessor's end (the render overlap), so
 * the composition's `durationMs` is the last clip's end — equal to
 * `compositionDurationMs(clips)`. Also refreshes `rangeStartMs` (the first
 * clip's source in-point). Clips are copied, never mutated.
 */
function relayout(comp: EditorComposition, clips: readonly EditorVideoClip[]): EditorComposition {
  let endMs = 0;
  const laidOut: EditorVideoClip[] = clips.map((clip, i) => {
    const durationMs = timelineDurationMs(clip);
    const startMs = i === 0 ? 0 : endMs - (clip.transitionIn?.durationMs ?? 0);
    const next: EditorVideoClip = { ...clip, startMs, durationMs };
    endMs = startMs + durationMs;
    return next;
  });
  return {
    ...comp,
    videoClips: laidOut,
    durationMs: endMs,
    rangeStartMs: laidOut.length > 0 ? laidOut[0]!.sourceInMs : comp.rangeStartMs,
  };
}

/**
 * Run 3 (4.7): remap a clip's segment-LOCAL keyframes when its head moves by
 * `deltaMs` TIMELINE ms (delta > 0 = material removed from the head, delta
 * < 0 = head extended with earlier material). Per PROPERTY channel (channels
 * are independent in the sampler):
 * - delta > 0: keyframes shift by −delta; ones landing < 0 are dropped EXCEPT
 *   the last one before 0 (greatest atMs < delta), which is clamped to atMs 0
 *   so the value at the cut survives — unless a keyframe on that property
 *   already lands exactly at 0 (it sat at atMs === delta), which wins and the
 *   clamp candidate is dropped.
 * - delta < 0: every keyframe shifts later by −delta; nothing is dropped.
 * - delta = 0 (or no keyframes): the input array is returned as-is.
 */
function remapKeyframesForHeadTrim(
  keyframes: readonly SegmentKeyframe[],
  deltaMs: number,
): SegmentKeyframe[] {
  const delta = roundMs(deltaMs);
  if (delta === 0 || keyframes.length === 0) return keyframes as SegmentKeyframe[];
  if (delta < 0) return keyframes.map((k) => ({ ...k, atMs: k.atMs - delta }));
  // per-property clamp candidate: index of the last keyframe before the cut
  const clampIndex = new Map<SegmentKeyframeProperty, number>();
  const properties = new Set(keyframes.map((k) => k.property));
  for (const property of properties) {
    const hasZero = keyframes.some((k) => k.property === property && k.atMs === delta);
    if (hasZero) continue;
    let best = -1;
    keyframes.forEach((k, i) => {
      if (k.property === property && k.atMs < delta && (best < 0 || k.atMs >= keyframes[best]!.atMs)) best = i;
    });
    if (best >= 0) clampIndex.set(property, best);
  }
  const out: SegmentKeyframe[] = [];
  keyframes.forEach((k, i) => {
    if (k.atMs < delta) {
      if (clampIndex.get(k.property) === i) out.push({ ...k, atMs: 0 });
      return;
    }
    out.push(k.atMs === delta ? { ...k, atMs: 0 } : { ...k, atMs: k.atMs - delta });
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* video ops                                                           */
/* ------------------------------------------------------------------ */

/**
 * Split the video segment strictly containing `atMs` into two segments at
 * that point. Both halves must be at least 40 TIMELINE ms long; the second
 * half gets a new id, the first keeps the original id. A split at timeline
 * offset Δt inside a clip cuts its SOURCE at `sourceInMs + Δt × playbackRate`
 * (a still, rate 1, cuts its pseudo-span at Δt). Both halves inherit the
 * clip's rate / transform / assetId / still; the second half's transitionIn
 * is null (the transition belongs to the join INTO the first half).
 * Refusals (same-reference no-op): `atMs` on a segment boundary or outside
 * every segment, or either side shorter than 40 timeline ms.
 * docEffect: none — nothing outside the partition moves.
 */
export function splitVideoClipAt(comp: EditorComposition, atMs: number): VideoOpResult {
  const at = roundMs(atMs);
  const idx = comp.videoClips.findIndex((c) => at > c.startMs && at < c.startMs + c.durationMs);
  if (idx < 0) return noOp(comp);
  const clip = comp.videoClips[idx]!;
  const leftMs = at - clip.startMs;
  const rightMs = clip.durationMs - leftMs;
  if (leftMs < MIN_SPLIT_MS || rightMs < MIN_SPLIT_MS) return noOp(comp);
  const rate = clip.still ? 1 : (clip.playbackRate ?? 1);
  const sourceMidMs = clip.sourceInMs + roundMs(leftMs * rate);
  // Run 3 (4.7): keyframes are segment-LOCAL, so the split partitions them at
  // Δt = leftMs — the first half keeps atMs < Δt verbatim (same ids/objects);
  // the second half gets atMs >= Δt shifted by −Δt with FRESH ids. Effects are
  // copied to BOTH halves; the second half's copies get fresh ids.
  const keyframes = clip.keyframes ?? [];
  const effects = clip.effects ?? [];
  const first: EditorVideoClip = {
    ...clip,
    sourceOutMs: sourceMidMs,
    keyframes: keyframes.filter((k) => k.atMs < leftMs),
    effects: [...effects],
  };
  const second: EditorVideoClip = {
    ...clip,
    id: newId(),
    startMs: at,
    durationMs: rightMs,
    sourceInMs: sourceMidMs,
    transitionIn: null,
    transform: clip.transform ? { ...clip.transform } : { ...IDENTITY_SEGMENT_TRANSFORM },
    keyframes: keyframes.filter((k) => k.atMs >= leftMs).map((k) => ({ ...k, id: newId(), atMs: k.atMs - leftMs })),
    effects: effects.map((e) => ({ ...e, id: newId() })),
  };
  const clips = [...comp.videoClips.slice(0, idx), first, second, ...comp.videoClips.slice(idx + 1)];
  return done(relayout(comp, clips));
}

/**
 * Move one edge of one video clip to the TIMELINE position `targetMs`
 * (the position the dragged edge should land on). ALL deltas and minimums
 * below are TIMELINE ms; a timeline delta Δt at rate r moves source edges by
 * Δt × r (Run 2 rate arithmetic; at rate 1 this is exactly the Stage-B
 * behaviour). What the drag means depends on which edge of which clip it is:
 *
 * - START edge of the FIRST clip — HEAD TRIM, inward only. `targetMs` is the
 *   amount of head to cut (the first clip starts at 0): the first clip's
 *   `sourceInMs` advances by `delta × rate_first`, its timeline duration
 *   shrinks by `delta`, every later clip re-accumulates. A `targetMs <= 0`
 *   is a no-op, and the op REFUSES (no-op) when the resulting first-clip
 *   TIMELINE duration would be < 40 ms. Markers and overlays are NOT moved
 *   by this op; the result carries `docEffect: { type: "headShift",
 *   deltaMs: delta }` (timeline ms) for the commit layer.
 * - START edge of clip i > 0 — BOUNDARY ROLL with clip i−1. The shared source
 *   boundary moves by `Δt × rate_i`, applied to BOTH the previous clip's
 *   `sourceOutMs` AND this clip's `sourceInMs` (for a jump cut the two source
 *   ranges are independent, so both edges move by the same source amount and
 *   the source gap between them is preserved). The source delta is clamped
 *   so both neighbours keep ≥ 40 TIMELINE ms: this clip's shrink is bounded
 *   by its own rate, the previous clip's shrink by the previous rate. When
 *   both neighbours share a rate the timeline boundary lands exactly on
 *   `targetMs`. No docEffect.
 * - END edge of clip i < last — BOUNDARY ROLL with clip i+1, the same
 *   mechanics from the other side (source delta `Δt × rate_i` applied to
 *   this clip's `sourceOutMs` and the next clip's `sourceInMs`). No docEffect.
 * - END edge of the LAST clip — TAIL TRIM / EXTEND. The timeline duration
 *   changes by `targetMs − clip.endMs`; the source advance is
 *   `Δt × rate_last`: inward shrinks (clamped so ≥ 40 timeline ms remains);
 *   outward extends, bounded by `sourceDurationMs` when it is > 0 (the
 *   source end) and unbounded when the source length is unknown (0).
 *   No docEffect.
 * - STILLS behave as rate-1 clips throughout: their edges move within the
 *   pseudo-span (sourceIn ≥ 0 side is the head rule; a tail extend grows the
 *   pseudo-span unbounded, since a freeze frame has no source end), keeping
 *   ≥ 40 ms of pseudo-span.
 *
 * An unknown `clipId`, or a drag that clamps to zero movement, is a
 * same-reference no-op.
 */
export function trimVideoClipEdge(
  comp: EditorComposition,
  clipId: string,
  edge: "start" | "end",
  targetMs: number,
): VideoOpResult {
  const target = roundMs(targetMs);
  const idx = comp.videoClips.findIndex((c) => c.id === clipId);
  if (idx < 0) return noOp(comp);
  const clip = comp.videoClips[idx]!;
  const lastIdx = comp.videoClips.length - 1;
  const rateOf = (c: EditorVideoClip): number => (c.still ? 1 : (c.playbackRate ?? 1));
  const rate = rateOf(clip);

  // --- head trim: start edge of the first clip (source advance = delta × rate) ---
  if (edge === "start" && idx === 0) {
    const delta = target - clip.startMs; // clip.startMs is 0 by the invariant
    if (delta <= 0) return noOp(comp);
    if (clip.durationMs - delta < MIN_VIDEO_MS) return noOp(comp);
    const first: EditorVideoClip = {
      ...clip,
      sourceInMs: clip.sourceInMs + roundMs(delta * rate),
      // Run 3: head trim removes `delta` timeline ms of material — keyframes shift by −delta
      keyframes: remapKeyframesForHeadTrim(clip.keyframes ?? [], delta),
    };
    const clips = [first, ...comp.videoClips.slice(1)];
    return done(relayout(comp, clips), { type: "headShift", deltaMs: delta });
  }

  // --- boundary roll: start edge of clip i > 0, against clip i−1 ---
  if (edge === "start") {
    const prev = comp.videoClips[idx - 1]!;
    const rawDelta = target - clip.startMs;
    // source boundary moves by rawDelta × rate_i, clamped so BOTH neighbours keep
    // >= MIN timeline ms (this clip's shrink bound uses rate_i, prev's uses rate_{i-1})
    const maxSource = (clip.durationMs - MIN_VIDEO_MS) * rate;
    const minSource = -(prev.durationMs - MIN_VIDEO_MS) * rateOf(prev);
    const sourceDelta = roundMs(Math.max(minSource, Math.min(rawDelta * rate, maxSource)));
    if (sourceDelta === 0) return noOp(comp);
    // Run 3: this clip's head moves by sourceDelta ÷ its rate (timeline ms);
    // the previous clip only changes its END edge, so its keyframes are unchanged.
    const headDeltaMs = roundMs(sourceDelta / rate);
    const clips = comp.videoClips.map((c, i) => {
      if (i === idx - 1) return { ...c, sourceOutMs: c.sourceOutMs + sourceDelta };
      if (i === idx)
        return { ...c, sourceInMs: c.sourceInMs + sourceDelta, keyframes: remapKeyframesForHeadTrim(c.keyframes ?? [], headDeltaMs) };
      return c;
    });
    return done(relayout(comp, clips));
  }

  // --- tail trim / extend: end edge of the last clip (source advance = delta × rate) ---
  // Run 3: END-edge trims leave keyframes unchanged — any beyond the new
  // duration are inert (the sampler never reaches them).
  if (idx === lastIdx) {
    const clipEndMs = clip.startMs + clip.durationMs;
    const rawDelta = target - clipEndMs;
    if (rawDelta === 0) return noOp(comp);
    let sourceDelta = roundMs(rawDelta * rate);
    if (rawDelta < 0) {
      // inward: clamp so at least MIN_VIDEO_MS of TIMELINE remains
      sourceDelta = Math.max(sourceDelta, -roundMs((clip.durationMs - MIN_VIDEO_MS) * rate));
    } else if (!clip.still && comp.sourceDurationMs > 0) {
      // outward: never extend past the end of the source (a still has no source end)
      sourceDelta = Math.min(sourceDelta, comp.sourceDurationMs - clip.sourceOutMs);
    }
    if (sourceDelta === 0) return noOp(comp);
    const last: EditorVideoClip = { ...clip, sourceOutMs: clip.sourceOutMs + sourceDelta };
    const clips = [...comp.videoClips.slice(0, lastIdx), last];
    return done(relayout(comp, clips));
  }

  // --- boundary roll: end edge of clip i < last, against clip i+1 ---
  const next = comp.videoClips[idx + 1]!;
  const clipEndMs = clip.startMs + clip.durationMs;
  const rawDelta = target - clipEndMs;
  // source boundary moves by rawDelta × rate_i, clamped so both keep >= MIN timeline ms
  const maxSource = (next.durationMs - MIN_VIDEO_MS) * rateOf(next);
  const minSource = -(clip.durationMs - MIN_VIDEO_MS) * rate;
  const sourceDelta = roundMs(Math.max(minSource, Math.min(rawDelta * rate, maxSource)));
  if (sourceDelta === 0) return noOp(comp);
  // Run 3: this clip only changes its END edge (keyframes unchanged); the NEXT
  // clip's head moves by sourceDelta ÷ the next clip's rate (timeline ms).
  const nextHeadDeltaMs = roundMs(sourceDelta / rateOf(next));
  const clips = comp.videoClips.map((c, i) => {
    if (i === idx) return { ...c, sourceOutMs: c.sourceOutMs + sourceDelta };
    if (i === idx + 1)
      return { ...c, sourceInMs: c.sourceInMs + sourceDelta, keyframes: remapKeyframesForHeadTrim(c.keyframes ?? [], nextHeadDeltaMs) };
    return c;
  });
  return done(relayout(comp, clips));
}

/**
 * Whether {@link rippleDeleteVideoSegment} would delete the segment: true
 * for ANY segment of a composition with at least two segments (Stage C
 * lifted the Stage-B end-segments-only restriction — a middle deletion is a
 * timeline range removal now, not a source-continuity break). The only
 * segment of a single-clip composition is still refused.
 */
export function canRippleDeleteVideoSegment(comp: EditorComposition, clipId: string): boolean {
  if (comp.videoClips.length <= 1) return false;
  return comp.videoClips.some((c) => c.id === clipId);
}

/**
 * Ripple-delete one video segment, closing the gap it leaves:
 * - FIRST segment: the segment is removed and the project head shifts by its
 *   duration — exactly a head trim of that length. Later clips re-accumulate
 *   from 0, `durationMs` shrinks, and the result carries
 *   `docEffect: { type: "headShift", deltaMs: <segment duration> }` (the
 *   commit layer shifts captions / markers / overlays; this op does not).
 * - LAST segment: the segment is removed and `durationMs` shrinks; nothing
 *   else moves, docEffect none.
 * - MIDDLE segment (Stage C): the segment is removed and the result carries
 *   `docEffect: { type: "rangeRemove", startMs: <clip timeline start>,
 *   durationMs: <clip timeline duration> }` — the commit layer deletes /
 *   shifts captions, markers and overlays over exactly that timeline range
 *   (see {@link applyDocEffect} / {@link applyContentEffect}).
 * - The ONLY segment of a single-clip composition: refused (no-op) — a
 *   composition may not ripple-delete its way to no video at all here.
 * An unknown `clipId` is likewise a no-op. When the FIRST segment is deleted
 * the new first segment's transitionIn is cleared (a transition into the
 * project head is meaningless), and deleting any segment keeps every other
 * segment's transitionIn — it now describes the join with its new neighbour.
 */
export function rippleDeleteVideoSegment(comp: EditorComposition, clipId: string): VideoOpResult {
  if (!canRippleDeleteVideoSegment(comp, clipId)) return noOp(comp);
  const idx = comp.videoClips.findIndex((c) => c.id === clipId);
  const clip = comp.videoClips[idx]!;
  let rest = comp.videoClips.filter((_, i) => i !== idx);
  if (idx === 0) {
    rest = rest.map((c, i) => (i === 0 && c.transitionIn ? { ...c, transitionIn: null } : c));
    return done(relayout(comp, rest), { type: "headShift", deltaMs: roundMs(clip.durationMs) });
  }
  if (idx === comp.videoClips.length - 1) {
    return done(relayout(comp, rest));
  }
  return done(relayout(comp, rest), {
    type: "rangeRemove",
    startMs: roundMs(clip.startMs),
    durationMs: roundMs(clip.durationMs),
  });
}

/* ------------------------------------------------------------------ */
/* Run-2 segment ops: duplicate / rate / transition / transform / still */
/* ------------------------------------------------------------------ */

/**
 * Duplicate one video segment: a copy with a NEW id is inserted directly
 * after the original, inheriting its source range, rate, transform, assetId
 * and still flag — except its transitionIn, which is null (the copy starts
 * with a plain cut; the following segment keeps its own transitionIn, now
 * describing its join with the copy).
 * docEffect: `rangeInsert` at the original's timeline END with the copy's
 * timeline duration. CAPTIONS ARE NOT DUPLICATED — the words stay timed to
 * the FIRST copy; the effect only shifts later content (words / markers /
 * overlays from the insertion point onward) later by the copy's duration.
 * An unknown `clipId` is a same-reference no-op.
 */
export function duplicateVideoSegment(comp: EditorComposition, clipId: string): VideoOpResult {
  const idx = comp.videoClips.findIndex((c) => c.id === clipId);
  if (idx < 0) return noOp(comp);
  const clip = comp.videoClips[idx]!;
  const copy: EditorVideoClip = {
    ...clip,
    id: newId(),
    transitionIn: null,
    transform: clip.transform ? { ...clip.transform } : { ...IDENTITY_SEGMENT_TRANSFORM },
    // Run 3: the copy's keyframes/effects are copies with FRESH ids
    keyframes: (clip.keyframes ?? []).map((k) => ({ ...k, id: newId() })),
    effects: (clip.effects ?? []).map((e) => ({ ...e, id: newId() })),
  };
  const clips = [...comp.videoClips.slice(0, idx + 1), copy, ...comp.videoClips.slice(idx + 1)];
  return done(relayout(comp, clips), {
    type: "rangeInsert",
    atMs: roundMs(clip.startMs + clip.durationMs),
    durationMs: roundMs(clip.durationMs),
  });
}

/**
 * Set one segment's playback rate. The rate is clamped to [0.25, 4] and
 * rounded to 2 decimals; setting the already-current rate (after rounding)
 * is a no-op. The segment's source range is untouched — its TIMELINE
 * duration rescales, later segments re-accumulate, and the result carries
 * `rangeScale` over the segment's OLD timeline range so the commit layer
 * remaps the words inside proportionally and shifts later content by the
 * duration difference. REFUSED (no-op) when the new timeline duration would
 * be < {@link MIN_VIDEO_MS}, and for still clips (a still's duration IS its
 * pseudo-span; rate has no meaning for it). Unknown id: no-op.
 */
export function setSegmentPlaybackRate(comp: EditorComposition, clipId: string, rate: number): VideoOpResult {
  const idx = comp.videoClips.findIndex((c) => c.id === clipId);
  if (idx < 0) return noOp(comp);
  const clip = comp.videoClips[idx]!;
  if (clip.still) return noOp(comp);
  if (!Number.isFinite(rate)) return noOp(comp);
  const next = Math.round(Math.max(0.25, Math.min(4, rate)) * 100) / 100;
  if (next === (clip.playbackRate ?? 1)) return noOp(comp);
  const newDurationMs = Math.round((clip.sourceOutMs - clip.sourceInMs) / next);
  if (newDurationMs < MIN_VIDEO_MS) return noOp(comp);
  // Run 3: keyframe atMs are segment-local TIMELINE ms, so a rate change
  // rescales them by oldTimelineDuration / newTimelineDuration (rounded).
  const scaleK = clip.durationMs / newDurationMs;
  const clips = comp.videoClips.map((c, i) =>
    i === idx
      ? {
          ...c,
          playbackRate: next,
          keyframes: (c.keyframes ?? []).map((k) => {
            const atMs = roundMs(k.atMs * scaleK);
            return atMs === k.atMs ? k : { ...k, atMs };
          }),
        }
      : c,
  );
  return done(relayout(comp, clips), {
    type: "rangeScale",
    startMs: roundMs(clip.startMs),
    oldDurationMs: roundMs(clip.durationMs),
    newDurationMs,
  });
}

/**
 * Set (or clear, with `null`) the transition INTO one segment. Only a
 * segment at index ≥ 1 can carry one — index 0 / unknown id / clearing an
 * already-null transition are no-ops. The transition's duration is clamped
 * to ≥ 100 ms and to strictly less than the smaller TIMELINE duration of
 * the two adjacent clips; when even 100 ms cannot fit (the smaller
 * neighbour is ≤ 100 ms) the op is a no-op. Setting a transition identical
 * (type + clamped duration) to the current one is a no-op.
 * docEffect: `rangeShift` with `fromMs` = the segment's timeline start in
 * the OLD layout and `deltaMs` = −(newDuration − oldDuration): adding or
 * lengthening a transition OVERLAPS the join, compressing the total, so
 * content from the boundary onward shifts earlier; shortening/removing one
 * shifts it later. When only the type changes (delta 0) the effect is none.
 */
export function setSegmentTransition(
  comp: EditorComposition,
  segmentId: string,
  transition: SegmentTransition | null,
): VideoOpResult {
  const idx = comp.videoClips.findIndex((c) => c.id === segmentId);
  if (idx < 1) return noOp(comp);
  const clip = comp.videoClips[idx]!;
  const prev = comp.videoClips[idx - 1]!;
  const oldDur = clip.transitionIn?.durationMs ?? 0;

  let nextTransition: SegmentTransition | null = null;
  if (transition) {
    const cap = Math.min(prev.durationMs, clip.durationMs) - 1; // strictly less than both neighbours
    if (cap < 100) return noOp(comp);
    const durationMs = Math.max(100, Math.min(roundMs(transition.durationMs), cap));
    nextTransition = { type: transition.type, durationMs };
  }
  const newDur = nextTransition?.durationMs ?? 0;
  if ((clip.transitionIn?.type ?? null) === (nextTransition?.type ?? null) && oldDur === newDur) return noOp(comp);

  const clips = comp.videoClips.map((c, i) => (i === idx ? { ...c, transitionIn: nextTransition } : c));
  const deltaMs = -(newDur - oldDur);
  return done(
    relayout(comp, clips),
    deltaMs === 0 ? NONE : { type: "rangeShift", fromMs: roundMs(clip.startMs), deltaMs },
  );
}

/**
 * Merge a transform patch into one segment's transform. Returns a
 * VideoOpResult with docEffect `none` (a transform moves no timing, so no
 * content effect exists). When the patch changes nothing — every supplied
 * field already holds that value, including the empty patch — or the id is
 * unknown, the result wraps the SAME composition reference.
 */
export function setSegmentTransform(
  comp: EditorComposition,
  clipId: string,
  patch: Partial<SegmentTransform>,
): VideoOpResult {
  const idx = comp.videoClips.findIndex((c) => c.id === clipId);
  if (idx < 0) return noOp(comp);
  const clip = comp.videoClips[idx]!;
  const current: SegmentTransform = { ...IDENTITY_SEGMENT_TRANSFORM, ...(clip.transform ?? {}) };
  const changes = (Object.keys(patch) as Array<keyof SegmentTransform>).some(
    (k) => patch[k] !== undefined && patch[k] !== current[k],
  );
  if (!changes) return noOp(comp);
  const clips = comp.videoClips.map((c, i) => (i === idx ? { ...c, transform: { ...current, ...patch } } : c));
  // no timing changes, so no relayout: untouched clips keep their references
  return done({ ...comp, videoClips: clips });
}

/* ------------------------------------------------------------------ */
/* Run 3 (4.7): keyframe + effects ops                                 */
/* ------------------------------------------------------------------ */

const clampKeyframeValue = (property: SegmentKeyframeProperty, value: number): number => {
  const range = KEYFRAME_VALUE_RANGES[property];
  return Math.max(range.min, Math.min(range.max, value));
};
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Replace one clip (by index) with a patched copy; no timing changes, so no relayout. */
function replaceVideoClip(comp: EditorComposition, idx: number, patch: Partial<EditorVideoClip>): VideoOpResult {
  const clips = comp.videoClips.map((c, i) => (i === idx ? { ...c, ...patch } : c));
  return done({ ...comp, videoClips: clips });
}

/**
 * Add a keyframe to one segment at segment-LOCAL `atMs` (rounded, clamped to
 * [0, the clip's timeline duration]) with `value` clamped to the property's
 * {@link KEYFRAME_VALUE_RANGES} range and easing "linear". If a keyframe on
 * the SAME property exists within 1 ms of the clamped atMs (|Δ| ≤ 1), its
 * value is REPLACED instead (its id, atMs and easing are kept; if the value
 * is unchanged that is a no-op). Refusals (same-reference no-op): unknown
 * clip, a non-finite atMs/value, and STILL clips — a still has no internal
 * motion, so keyframes on it are meaningless.
 * docEffect: none — keyframes move no timing.
 */
export function addSegmentKeyframe(
  comp: EditorComposition,
  clipId: string,
  property: SegmentKeyframeProperty,
  atMs: number,
  value: number,
): VideoOpResult {
  const idx = comp.videoClips.findIndex((c) => c.id === clipId);
  if (idx < 0) return noOp(comp);
  const clip = comp.videoClips[idx]!;
  if (clip.still) return noOp(comp);
  if (!Number.isFinite(atMs) || !Number.isFinite(value)) return noOp(comp);
  const at = Math.max(0, Math.min(roundMs(atMs), clip.durationMs));
  const v = clampKeyframeValue(property, value);
  const keyframes = clip.keyframes ?? [];
  const existingIdx = keyframes.findIndex((k) => k.property === property && Math.abs(k.atMs - at) <= 1);
  if (existingIdx >= 0) {
    const existing = keyframes[existingIdx]!;
    if (existing.value === v) return noOp(comp);
    const next = keyframes.map((k, i) => (i === existingIdx ? { ...k, value: v } : k));
    return replaceVideoClip(comp, idx, { keyframes: next });
  }
  const keyframe: SegmentKeyframe = { id: newId(), atMs: at, property, value: v, easing: "linear" };
  return replaceVideoClip(comp, idx, { keyframes: [...keyframes, keyframe] });
}

/**
 * Patch one keyframe (atMs / value / easing), with the same clamps as
 * {@link addSegmentKeyframe} (value clamped against the keyframe's own
 * property). A patch that changes nothing — including an empty patch, a
 * non-finite field, or an unknown clip/keyframe id — is a no-op.
 */
export function updateSegmentKeyframe(
  comp: EditorComposition,
  clipId: string,
  keyframeId: string,
  patch: { atMs?: number; value?: number; easing?: KeyframeEasing },
): VideoOpResult {
  const idx = comp.videoClips.findIndex((c) => c.id === clipId);
  if (idx < 0) return noOp(comp);
  const clip = comp.videoClips[idx]!;
  const keyframes = clip.keyframes ?? [];
  const kIdx = keyframes.findIndex((k) => k.id === keyframeId);
  if (kIdx < 0) return noOp(comp);
  const current = keyframes[kIdx]!;
  const next: SegmentKeyframe = { ...current };
  if (patch.atMs !== undefined && Number.isFinite(patch.atMs)) next.atMs = Math.max(0, Math.min(roundMs(patch.atMs), clip.durationMs));
  if (patch.value !== undefined && Number.isFinite(patch.value)) next.value = clampKeyframeValue(current.property, patch.value);
  if (patch.easing !== undefined) next.easing = patch.easing;
  if (next.atMs === current.atMs && next.value === current.value && next.easing === current.easing) return noOp(comp);
  return replaceVideoClip(comp, idx, { keyframes: keyframes.map((k, i) => (i === kIdx ? next : k)) });
}

/** Remove one keyframe. Unknown clip/keyframe ids are same-reference no-ops. */
export function removeSegmentKeyframe(comp: EditorComposition, clipId: string, keyframeId: string): VideoOpResult {
  const idx = comp.videoClips.findIndex((c) => c.id === clipId);
  if (idx < 0) return noOp(comp);
  const clip = comp.videoClips[idx]!;
  const keyframes = clip.keyframes ?? [];
  if (!keyframes.some((k) => k.id === keyframeId)) return noOp(comp);
  return replaceVideoClip(comp, idx, { keyframes: keyframes.filter((k) => k.id !== keyframeId) });
}

/**
 * Append an effect of `type` to one segment's ordered effects stack, with
 * the pinned defaults `{ enabled: true, amount: 0.5, color: "#FFA946" }`
 * (the colour is only read for glow). Unknown clip: no-op. Effects ARE
 * allowed on stills (a blur/vignette over a freeze frame is meaningful).
 */
export function addSegmentEffect(comp: EditorComposition, clipId: string, type: SegmentEffectType): VideoOpResult {
  const idx = comp.videoClips.findIndex((c) => c.id === clipId);
  if (idx < 0) return noOp(comp);
  const clip = comp.videoClips[idx]!;
  const effect: SegmentEffect = { id: newId(), type, enabled: true, amount: 0.5, color: "#FFA946" };
  return replaceVideoClip(comp, idx, { effects: [...(clip.effects ?? []), effect] });
}

/**
 * Patch one effect (amount clamped to 0..1 / enabled / color). A patch that
 * changes nothing, or an unknown clip/effect id, is a no-op.
 */
export function updateSegmentEffect(
  comp: EditorComposition,
  clipId: string,
  effectId: string,
  patch: { amount?: number; enabled?: boolean; color?: string },
): VideoOpResult {
  const idx = comp.videoClips.findIndex((c) => c.id === clipId);
  if (idx < 0) return noOp(comp);
  const clip = comp.videoClips[idx]!;
  const effects = clip.effects ?? [];
  const eIdx = effects.findIndex((e) => e.id === effectId);
  if (eIdx < 0) return noOp(comp);
  const current = effects[eIdx]!;
  const next: SegmentEffect = { ...current };
  if (patch.amount !== undefined && Number.isFinite(patch.amount)) next.amount = clamp01(patch.amount);
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.color !== undefined) next.color = patch.color;
  if (next.amount === current.amount && next.enabled === current.enabled && next.color === current.color) return noOp(comp);
  return replaceVideoClip(comp, idx, { effects: effects.map((e, i) => (i === eIdx ? next : e)) });
}

/** Remove one effect. Unknown clip/effect ids are same-reference no-ops. */
export function removeSegmentEffect(comp: EditorComposition, clipId: string, effectId: string): VideoOpResult {
  const idx = comp.videoClips.findIndex((c) => c.id === clipId);
  if (idx < 0) return noOp(comp);
  const clip = comp.videoClips[idx]!;
  const effects = clip.effects ?? [];
  if (!effects.some((e) => e.id === effectId)) return noOp(comp);
  return replaceVideoClip(comp, idx, { effects: effects.filter((e) => e.id !== effectId) });
}

/** Swap one effect with its neighbour (`dir` −1 = earlier, +1 = later). At either end, or for unknown ids, a no-op. */
export function moveSegmentEffect(comp: EditorComposition, clipId: string, effectId: string, dir: -1 | 1): VideoOpResult {
  const idx = comp.videoClips.findIndex((c) => c.id === clipId);
  if (idx < 0) return noOp(comp);
  const clip = comp.videoClips[idx]!;
  const effects = clip.effects ?? [];
  const eIdx = effects.findIndex((e) => e.id === effectId);
  if (eIdx < 0) return noOp(comp);
  const swapIdx = eIdx + dir;
  if (swapIdx < 0 || swapIdx >= effects.length) return noOp(comp);
  const next = [...effects];
  next[eIdx] = effects[swapIdx]!;
  next[swapIdx] = effects[eIdx]!;
  return replaceVideoClip(comp, idx, { effects: next });
}

/**
 * Insert a freeze-frame STILL segment at timeline position `atMs`, showing
 * media-bin asset `assetId` for `durationMs`. The still clip is
 * `{ still: true, assetId, sourceInMs: 0, sourceOutMs: durationMs,
 * playbackRate: 1, transform: identity, transitionIn: null }` — its
 * pseudo-span's length IS its duration. When `atMs` lies strictly inside a
 * video clip, that clip is split there first (the split's refusals apply:
 * a point < 40 ms from a clip edge refuses the whole insert). Insertion at
 * 0, at a segment boundary, or at the very end of the timeline is allowed.
 * docEffect: `rangeInsert` at `atMs` with the still's duration.
 * Refusals (no-op): `atMs` outside [0, composition duration], or
 * `durationMs` < {@link MIN_VIDEO_MS}.
 */
export function insertStillSegmentAt(
  comp: EditorComposition,
  atMs: number,
  durationMs: number,
  assetId: string,
): VideoOpResult {
  const at = roundMs(atMs);
  const dur = roundMs(durationMs);
  if (dur < MIN_VIDEO_MS) return noOp(comp);
  if (at < 0 || at > comp.durationMs) return noOp(comp);
  if (comp.videoClips.length === 0) return noOp(comp);

  let base = comp;
  const insideIdx = comp.videoClips.findIndex((c) => at > c.startMs && at < c.startMs + c.durationMs);
  if (insideIdx >= 0) {
    const split = splitVideoClipAt(comp, at);
    if (split.comp === comp) return noOp(comp);
    base = split.comp;
  }
  // first clip whose timeline END is past `at`: the still goes before it
  // (at a boundary that is the following clip; at the end, none → append)
  const insertIdx = base.videoClips.findIndex((c) => c.startMs + c.durationMs > at);
  const stillClip: EditorVideoClip = {
    id: newId(),
    kind: "video",
    startMs: at,
    durationMs: dur,
    sourceInMs: 0,
    sourceOutMs: dur,
    playbackRate: 1,
    transform: { ...IDENTITY_SEGMENT_TRANSFORM },
    transitionIn: null,
    assetId,
    still: true,
    keyframes: [],
    effects: [],
  };
  const clips =
    insertIdx < 0
      ? [...base.videoClips, stillClip]
      : [...base.videoClips.slice(0, insertIdx), stillClip, ...base.videoClips.slice(insertIdx)];
  return done(relayout(comp, clips), { type: "rangeInsert", atMs: at, durationMs: dur });
}

/* ------------------------------------------------------------------ */
/* audio retiming (Phase 9, W5 — closes the A3 deferral)               */
/* ------------------------------------------------------------------ */

/**
 * AUDIO RETIMING RULES — how placed audio clips and bleeps follow a
 * {@link DocEffect}. An audio clip is a WINDOW onto source audio (the audio
 * model in audioOps.ts / the AudioClip schema): its timeline position is
 * `startMs`, its used source span is `sourceOutMs − sourceInMs` played at
 * rate 1, and the span IS its timeline duration. Retiming therefore only
 * ever moves the window or trims its edges — it NEVER stretches the audio
 * content itself (there is no rate on an audio clip):
 * - `rangeRemove` [s, e): a clip fully inside drops; fully after shifts by
 *   −duration (start only). A clip spanning the range END keeps its tail:
 *   its start clamps to s and `sourceInMs` advances by the removed head
 *   portion, so the surviving samples are exactly the ones that played
 *   after e. A clip spanning the range START keeps its head: `sourceOutMs`
 *   clamps so the clip ends at s. A clip spanning the WHOLE range SPLITS
 *   into head + tail pieces — a split result IS representable here (the
 *   audio model has splitAudioClipAt, and this function returns a fresh
 *   clip array), so no clamping shortcut is taken: the head keeps the
 *   original id, the tail gets a fresh id, processors are deep-copied to
 *   both halves and the cut edges take fade 0, exactly as splitAudioClipAt
 *   does. Any piece shorter than {@link MIN_AUDIO_MS} (the audio model's
 *   minimum used span) is dropped rather than kept as a sliver.
 * - `headShift` is a rangeRemove of [0, deltaMs) for audio, by the same
 *   rules.
 * - `rangeInsert` / `rangeShift`: the clip's START rules (the word /
 *   overlay precedent) — a clip starting at/after the point shifts whole
 *   (duration, source span and fades unchanged); a clip spanning the point
 *   is left whole.
 * - `rangeScale`: audio content is NOT time-stretched. The clip's START
 *   follows the marker rule (inside the range → proportionally remapped;
 *   at/after the range end → shifted by new − old) and the whole clip
 *   moves by that amount with its duration, source span and fades
 *   unchanged; a clip whose start is before the range is left whole, even
 *   if it overlaps the range.
 * - FADES: on any shortened clip, fadeInMs / fadeOutMs clamp to the new
 *   span (the updateAudioClip invariant); a newly created cut edge takes
 *   fade 0 on that side (the splitAudioClipAt precedent).
 *
 * BLEEPS (`audioBleeps`) are PROJECT-TIMELINE windows (see the AudioBleep
 * schema: a range where the mix mutes the video's own sound), so they
 * follow the same effects as windows — the overlay window rules for
 * remove / insert / shift, and for rangeScale both edges remap
 * proportionally (the muted speech itself rescales with its segment),
 * keeping only a 1 ms minimum rather than the overlay 100 ms floor.
 */

const audioClipSpanMs = (clip: AudioClip): number => clip.sourceOutMs - clip.sourceInMs;

function retimedAudioClip(
  clip: AudioClip,
  patch: {
    startMs: number;
    sourceInMs: number;
    sourceOutMs: number;
    fadeInMs?: number;
    fadeOutMs?: number;
    id?: string;
    copyProcessors?: boolean;
  },
): AudioClip {
  const span = patch.sourceOutMs - patch.sourceInMs;
  return {
    ...clip,
    ...(patch.id !== undefined ? { id: patch.id } : {}),
    startMs: patch.startMs,
    sourceInMs: patch.sourceInMs,
    sourceOutMs: patch.sourceOutMs,
    fadeInMs: Math.max(0, Math.min(patch.fadeInMs ?? clip.fadeInMs, span)),
    fadeOutMs: Math.max(0, Math.min(patch.fadeOutMs ?? clip.fadeOutMs, span)),
    ...(patch.copyProcessors
      ? {
          processors: {
            eq: { ...clip.processors.eq },
            cleanup: { ...clip.processors.cleanup },
            reverb: clip.processors.reverb,
          },
        }
      : {}),
  };
}

/** Map ONE audio clip over a removed timeline range [s, e): 0, 1 or 2 clips. */
function mapAudioClipRemove(clip: AudioClip, s: number, e: number): AudioClip[] {
  const start = clip.startMs;
  const end = start + audioClipSpanMs(clip);
  if (end <= s) return [clip];
  if (start >= e) {
    return [retimedAudioClip(clip, { startMs: start - (e - s), sourceInMs: clip.sourceInMs, sourceOutMs: clip.sourceOutMs })];
  }
  if (start >= s && end <= e) return []; // fully inside: dropped
  if (start >= s) {
    // spanning the range END: keep the tail — start clamps to s, source advances
    const tailMs = end - e;
    if (tailMs < MIN_AUDIO_MS) return [];
    return [
      retimedAudioClip(clip, {
        startMs: s,
        sourceInMs: clip.sourceInMs + (e - start),
        sourceOutMs: clip.sourceOutMs,
        fadeInMs: 0,
      }),
    ];
  }
  if (end <= e) {
    // spanning the range START: keep the head — the end clamps to s
    const headMs = s - start;
    if (headMs < MIN_AUDIO_MS) return [];
    return [
      retimedAudioClip(clip, {
        startMs: start,
        sourceInMs: clip.sourceInMs,
        sourceOutMs: clip.sourceInMs + headMs,
        fadeOutMs: 0,
      }),
    ];
  }
  // spanning the WHOLE range: split into head + tail (see the rules above)
  const headMs = s - start;
  const tailMs = end - e;
  const keepHead = headMs >= MIN_AUDIO_MS;
  const keepTail = tailMs >= MIN_AUDIO_MS;
  const pieces: AudioClip[] = [];
  if (keepHead) {
    pieces.push(
      retimedAudioClip(clip, {
        startMs: start,
        sourceInMs: clip.sourceInMs,
        sourceOutMs: clip.sourceInMs + headMs,
        fadeOutMs: 0,
        copyProcessors: keepTail,
      }),
    );
  }
  if (keepTail) {
    pieces.push(
      retimedAudioClip(clip, {
        // a lone surviving tail keeps the original id; a true split's tail is new
        ...(keepHead ? { id: newId() } : {}),
        startMs: s,
        sourceInMs: clip.sourceInMs + (e - start),
        sourceOutMs: clip.sourceOutMs,
        fadeInMs: 0,
        copyProcessors: keepHead,
      }),
    );
  }
  return pieces;
}

/** Apply a per-clip audio mapping, tracking whether anything changed. */
function remapAudioClips(
  clips: readonly AudioClip[],
  map: (clip: AudioClip) => AudioClip[],
): { audioClips: AudioClip[]; changed: boolean } {
  let changed = false;
  const audioClips: AudioClip[] = [];
  for (const clip of clips) {
    const pieces = map(clip);
    if (pieces.length !== 1 || pieces[0] !== clip) changed = true;
    audioClips.push(...pieces);
  }
  return { audioClips, changed };
}

/** Bleep window over a removed range [s, e): the overlay window rules. */
function mapBleepWindowRemove(startMs: number, endMs: number, s: number, e: number): [number, number] | null {
  const dur = e - s;
  if (endMs <= s) return [startMs, endMs];
  if (startMs >= e) return [startMs - dur, endMs - dur];
  if (startMs >= s) return endMs <= e ? null : [s, endMs - dur];
  return endMs <= e ? [startMs, s] : [startMs, endMs - dur];
}

/* ------------------------------------------------------------------ */
/* content shifting (the commit layer's half of a headShift)           */
/* ------------------------------------------------------------------ */

/**
 * Re-base the composition's markers and overlay clips after a head shift of
 * `deltaMs` (project time 0 moved `deltaMs` later, so every content time
 * moves EARLIER by `deltaMs`):
 * - a marker whose shifted time would be < 0 is dropped; every other marker
 *   shifts by −deltaMs (a marker landing exactly on 0 is kept);
 * - an overlay clip fully before the new 0 (`endMs − deltaMs <= 0`) is
 *   dropped; a clip spanning the cut clamps its start to 0 and shifts its
 *   end; a clip starting at or after the cut shifts wholly. Each surviving
 *   clip's overlay item is replaced with a synced copy (never mutated).
 * - placed audio clips and bleeps follow the rangeRemove-of-[0, deltaMs)
 *   audio rules (see the audio retiming rules above).
 * `videoClips` and `durationMs` are NOT touched — the video op that produced
 * the headShift already handled those. A zero (or negative) delta, or a
 * composition whose markers/overlays/audio would not change, returns the
 * same reference.
 */
export function applyContentShift(comp: EditorComposition, deltaMs: number): EditorComposition {
  const delta = roundMs(deltaMs);
  if (delta <= 0) return comp;

  let markersChanged = false;
  const markers: EditorComposition["markers"] = [];
  for (const marker of comp.markers) {
    const atMs = roundMs(marker.atMs - delta);
    if (atMs < 0) {
      markersChanged = true;
      continue;
    }
    if (atMs !== marker.atMs) markersChanged = true;
    markers.push(atMs === marker.atMs ? marker : { ...marker, atMs });
  }

  let overlaysChanged = false;
  const overlayClips: OverlayClip[] = [];
  for (const clip of comp.overlayClips) {
    const endMs = roundMs(clip.endMs - delta);
    if (endMs <= 0) {
      overlaysChanged = true;
      continue;
    }
    const startMs = Math.max(0, roundMs(clip.startMs - delta));
    if (startMs === clip.startMs && endMs === clip.endMs) {
      overlayClips.push(clip);
      continue;
    }
    overlaysChanged = true;
    overlayClips.push(syncOverlayWindow(clip, startMs, endMs));
  }

  // audio: a head shift removes the timeline range [0, delta) for audio too
  const audio = remapAudioClips(comp.audioClips ?? [], (clip) => mapAudioClipRemove(clip, 0, delta));

  let bleepsChanged = false;
  const audioBleeps: AudioBleep[] = [];
  for (const bleep of comp.audioBleeps ?? []) {
    const win = mapBleepWindowRemove(bleep.startMs, bleep.endMs, 0, delta);
    if (win === null) {
      bleepsChanged = true;
      continue;
    }
    const [ns, ne] = win;
    if (ns === bleep.startMs && ne === bleep.endMs) {
      audioBleeps.push(bleep);
      continue;
    }
    bleepsChanged = true;
    audioBleeps.push({ ...bleep, startMs: ns, endMs: ne });
  }

  if (!markersChanged && !overlaysChanged && !audio.changed && !bleepsChanged) return comp;
  return {
    ...comp,
    markers,
    overlayClips,
    ...(audio.changed ? { audioClips: audio.audioClips } : {}),
    ...(bleepsChanged ? { audioBleeps } : {}),
  };
}

/**
 * Apply a video op's {@link DocEffect} to the composition's markers,
 * overlay clips, placed audio clips and bleeps — the generalised sibling
 * of {@link applyContentShift} (which stays exported as the headShift
 * special case existing callers use; `applyContentEffect(comp,
 * {type:"headShift"})` delegates to it).
 * Rules per effect type (all times timeline ms; "content" = a marker point
 * or an overlay window; audio clips and bleeps follow the audio retiming
 * rules documented with the audio helpers above):
 * - `rangeRemove` [s, e): markers INSIDE the range drop; markers at/after e
 *   shift by −duration. Overlays fully inside drop; an overlay SPANNING THE
 *   RANGE START is kept and clamped per the headShift precedent generalised
 *   (its start stays, its end clamps to s when it ends inside the range, or
 *   shifts by −duration when it ends after the range); an overlay starting
 *   inside and ending after the range keeps its tail (start clamps to s,
 *   end shifts); overlays at/after e shift wholly; overlays ending at/before
 *   s are untouched.
 * - `rangeInsert` / `rangeShift`: markers and overlays STARTING at/after
 *   the point shift by the (signed) amount; an overlay spanning the point
 *   is left whole (mirrors the word rule: a word spanning the point is not
 *   shifted).
 * - `rangeScale`: markers/overlays intersecting the range rescale
 *   proportionally (overlay windows remap both edges, keeping at least
 *   {@link MIN_OVERLAY_MS}); content at/after the range end shifts by
 *   (new − old); content fully before is untouched.
 * `videoClips` and `durationMs` are NOT touched. When nothing would change
 * (including `none` and zero-amount effects) the SAME reference returns.
 */
export function applyContentEffect(comp: EditorComposition, effect: DocEffect): EditorComposition {
  if (effect.type === "none") return comp;
  if (effect.type === "headShift") return applyContentShift(comp, effect.deltaMs);

  // per-effect remapping: a marker point -> new point (null = drop);
  // an overlay window -> new window (null = drop); an audio clip -> its
  // retimed pieces; a bleep window -> new window (null = drop)
  let mapPoint: (atMs: number) => number | null;
  let mapWindow: (startMs: number, endMs: number) => [number, number] | null;
  let mapAudioClip: (clip: AudioClip) => AudioClip[];
  let mapBleepWindow: (startMs: number, endMs: number) => [number, number] | null;

  if (effect.type === "rangeRemove") {
    const s = roundMs(effect.startMs);
    const dur = roundMs(effect.durationMs);
    if (dur <= 0) return comp;
    const e = s + dur;
    mapPoint = (at) => (at < s ? at : at < e ? null : at - dur);
    mapWindow = (start, end) => {
      if (end <= s) return [start, end];
      if (start >= e) return [start - dur, end - dur];
      if (start >= s) return end <= e ? null : [s, end - dur]; // fully inside drops; spanning the end keeps its tail
      return end <= e ? [start, s] : [start, end - dur]; // spanning the start: clamp/shift the end
    };
    mapAudioClip = (clip) => mapAudioClipRemove(clip, s, e);
    mapBleepWindow = (start, end) => mapBleepWindowRemove(start, end, s, e);
  } else if (effect.type === "rangeInsert" || effect.type === "rangeShift") {
    const from = roundMs(effect.type === "rangeInsert" ? effect.atMs : effect.fromMs);
    const delta = roundMs(effect.type === "rangeInsert" ? effect.durationMs : effect.deltaMs);
    if (delta === 0) return comp;
    mapPoint = (at) => (at >= from ? Math.max(0, at + delta) : at);
    mapWindow = (start, end) => {
      if (start < from) return [start, end]; // before, or spanning the point: left whole
      const ns = Math.max(0, start + delta);
      return [ns, ns + (end - start)];
    };
    // the clip's start rules: starting at/after the point shifts whole
    // (duration / source / fades untouched); spanning the point: left whole
    mapAudioClip = (clip) => {
      if (clip.startMs < from) return [clip];
      const ns = Math.max(0, clip.startMs + delta);
      if (ns === clip.startMs) return [clip];
      return [retimedAudioClip(clip, { startMs: ns, sourceInMs: clip.sourceInMs, sourceOutMs: clip.sourceOutMs })];
    };
    mapBleepWindow = mapWindow;
  } else {
    // rangeScale
    const s = roundMs(effect.startMs);
    const oldDur = roundMs(effect.oldDurationMs);
    const newDur = roundMs(effect.newDurationMs);
    if (oldDur <= 0 || newDur === oldDur) return comp;
    const e = s + oldDur;
    const delta = newDur - oldDur;
    const k = newDur / oldDur;
    const remap = (t: number) => roundMs(s + (t - s) * k);
    mapPoint = (at) => (at < s ? at : at >= e ? at + delta : remap(at));
    mapWindow = (start, end) => {
      if (end <= s) return [start, end];
      if (start >= e) return [start + delta, end + delta];
      const ns = remap(start);
      const ne = Math.max(remap(end), ns + MIN_OVERLAY_MS);
      return [Math.max(0, ns), ne];
    };
    // NO time-stretch: the clip's start follows the marker rule and the
    // whole clip moves with it (duration / source / fades unchanged); a
    // clip starting before the range is left whole (see the audio rules)
    mapAudioClip = (clip) => {
      if (clip.startMs < s) return [clip];
      const ns = Math.max(0, clip.startMs >= e ? clip.startMs + delta : remap(clip.startMs));
      if (ns === clip.startMs) return [clip];
      return [retimedAudioClip(clip, { startMs: ns, sourceInMs: clip.sourceInMs, sourceOutMs: clip.sourceOutMs })];
    };
    // bleeps mute the video's own (rescaled) speech, so both edges remap
    // proportionally — the overlay window rule with a 1 ms floor, not 100 ms
    mapBleepWindow = (start, end) => {
      if (end <= s) return [start, end];
      if (start >= e) return [start + delta, end + delta];
      const ns = remap(start);
      const ne = Math.max(remap(end), ns + 1);
      return [Math.max(0, ns), ne];
    };
  }

  let changed = false;
  const markers: EditorComposition["markers"] = [];
  for (const marker of comp.markers) {
    const at = mapPoint(marker.atMs);
    if (at === null) {
      changed = true;
      continue;
    }
    if (at !== marker.atMs) changed = true;
    markers.push(at === marker.atMs ? marker : { ...marker, atMs: at });
  }

  const overlayClips: OverlayClip[] = [];
  for (const clip of comp.overlayClips) {
    const win = mapWindow(clip.startMs, clip.endMs);
    if (win === null) {
      changed = true;
      continue;
    }
    const [ns, ne] = win;
    if (ns === clip.startMs && ne === clip.endMs) {
      overlayClips.push(clip);
      continue;
    }
    changed = true;
    overlayClips.push(syncOverlayWindow(clip, ns, ne));
  }

  const audio = remapAudioClips(comp.audioClips ?? [], mapAudioClip);
  if (audio.changed) changed = true;

  let bleepsChanged = false;
  const audioBleeps: AudioBleep[] = [];
  for (const bleep of comp.audioBleeps ?? []) {
    const win = mapBleepWindow(bleep.startMs, bleep.endMs);
    if (win === null) {
      bleepsChanged = true;
      continue;
    }
    const [ns, ne] = win;
    if (ns === bleep.startMs && ne === bleep.endMs) {
      audioBleeps.push(bleep);
      continue;
    }
    bleepsChanged = true;
    audioBleeps.push({ ...bleep, startMs: ns, endMs: ne });
  }
  if (bleepsChanged) changed = true;

  if (!changed) return comp;
  return {
    ...comp,
    markers,
    overlayClips,
    ...(audio.changed ? { audioClips: audio.audioClips } : {}),
    ...(bleepsChanged ? { audioBleeps } : {}),
  };
}

/**
 * Apply a video op's {@link DocEffect} to the caption document. `none` (or a
 * zero-amount effect, or a document with no words) returns the SAME document
 * reference. Per type:
 * - `headShift`: deletes every word ending at or before the cut
 *   (`endMs <= deltaMs` — it was spoken entirely inside the removed head)
 *   via the caption engine's `deleteWordsByIds`, then shifts every remaining
 *   word earlier by `deltaMs` via `shiftWordsByIds`. The engine clamps
 *   starts at 0 keeping its 40 ms minimum, so a word SPANNING the cut lands
 *   at 0 with its tail (the part after the cut) intact.
 * - `rangeRemove` [s, e): deletes words FULLY inside the range
 *   (`startMs >= s && endMs <= e`) AND any word spanning the range END
 *   (starts inside, ends after e), via `deleteWordsByIds`; shifts words
 *   starting at/after e earlier by the duration via `shiftWordsByIds`. A
 *   word SPANNING THE RANGE START (starts before s) is KEPT UNSHIFTED —
 *   its beginning was not removed, and shifting or truncating it would
 *   rewrite speech that still plays; this asymmetry is deliberate and
 *   mirrors what a head cut does to a word that began before time 0.
 * - `rangeInsert`: shifts words starting at/after `atMs` later by the
 *   duration (a word spanning the point is not shifted — its start rules).
 * - `rangeShift`: shifts words starting at/after `fromMs` by `deltaMs`
 *   (either sign; the engine clamps starts at 0 with its minimum span).
 * - `rangeScale`: remaps every word INTERSECTING [s, s+old) proportionally —
 *   newStart = s + (start−s)×new/old, newEnd likewise, rounded, with the
 *   engine's 40 ms minimum enforced by clamping end above start — shifts
 *   words starting at/after the range end by (new−old), and leaves words
 *   fully before untouched. The engine has no word-remap primitive, so this
 *   is a pure doc transform re-parsed through `CaptionDocSchema` (word ids
 *   and every non-time field — breaks, card metadata, hidden/emphasis —
 *   are preserved verbatim).
 */
export function applyDocEffect(doc: CaptionDoc, effect: DocEffect): CaptionDoc {
  if (effect.type === "none" || doc.words.length === 0) return doc;

  if (effect.type === "headShift") {
    const delta = roundMs(effect.deltaMs);
    if (delta <= 0) return doc;
    const deleteIds = doc.words.filter((w) => w.endMs <= delta).map((w) => w.id);
    const remainingIds = doc.words.filter((w) => w.endMs > delta).map((w) => w.id);
    const afterDelete = deleteWordsByIds(doc, deleteIds);
    if (remainingIds.length === 0) return afterDelete;
    return shiftWordsByIds(afterDelete, remainingIds, -delta);
  }

  if (effect.type === "rangeRemove") {
    const s = roundMs(effect.startMs);
    const dur = roundMs(effect.durationMs);
    if (dur <= 0) return doc;
    const e = s + dur;
    const deleteIds = doc.words
      .filter((w) => (w.startMs >= s && w.endMs <= e) || (w.startMs >= s && w.startMs < e && w.endMs > e))
      .map((w) => w.id);
    const shiftIds = doc.words.filter((w) => w.startMs >= e).map((w) => w.id);
    if (deleteIds.length === 0 && shiftIds.length === 0) return doc;
    const afterDelete = deleteWordsByIds(doc, deleteIds);
    if (shiftIds.length === 0) return afterDelete;
    return shiftWordsByIds(afterDelete, shiftIds, -dur);
  }

  if (effect.type === "rangeInsert" || effect.type === "rangeShift") {
    const from = roundMs(effect.type === "rangeInsert" ? effect.atMs : effect.fromMs);
    const delta = roundMs(effect.type === "rangeInsert" ? effect.durationMs : effect.deltaMs);
    if (delta === 0) return doc;
    const shiftIds = doc.words.filter((w) => w.startMs >= from).map((w) => w.id);
    if (shiftIds.length === 0) return doc;
    return shiftWordsByIds(doc, shiftIds, delta);
  }

  // rangeScale
  const s = roundMs(effect.startMs);
  const oldDur = roundMs(effect.oldDurationMs);
  const newDur = roundMs(effect.newDurationMs);
  if (oldDur <= 0 || newDur === oldDur) return doc;
  const e = s + oldDur;
  const delta = newDur - oldDur;
  const k = newDur / oldDur;
  let changed = false;
  const words = doc.words.map((w) => {
    if (w.endMs <= s) return w; // fully before the range
    if (w.startMs >= e) {
      changed = true; // at/after the range end: shift by the difference
      return { ...w, startMs: w.startMs + delta, endMs: w.endMs + delta };
    }
    // intersecting the range: proportional remap of both edges
    const ns = Math.max(0, roundMs(s + (w.startMs - s) * k));
    const ne = Math.max(roundMs(s + (w.endMs - s) * k), ns + 40); // caption-engine minimum word span
    if (ns === w.startMs && ne === w.endMs) return w;
    changed = true;
    return { ...w, startMs: ns, endMs: ne };
  });
  if (!changed) return doc;
  return CaptionDocSchema.parse({ ...doc, words, meta: { ...doc.meta, userEdited: true } });
}

/* ------------------------------------------------------------------ */
/* overlay ops                                                         */
/* ------------------------------------------------------------------ */

/**
 * The editor track an overlay kind lives on, mirroring the render-side
 * mapping in composition.ts (`toComposition` / `overlayClipsOf`): text and
 * image overlays form the "text" track group; shape and social overlays form
 * the "graphics" track group. Ripple operations group by this track.
 */
export function overlayTrackOf(kind: OverlayItem["kind"]): CompositionTrackKind {
  return kind === "text" || kind === "image" ? "text" : "graphics";
}

/**
 * A copy of an overlay clip re-windowed to [startMs, endMs]: the clip's own
 * start/end/duration AND its overlay item's start/end are kept in sync, and
 * the item is a NEW object (the input item is never mutated).
 */
function syncOverlayWindow(clip: OverlayClip, startMs: number, endMs: number): OverlayClip {
  return {
    ...clip,
    startMs,
    endMs,
    durationMs: endMs - startMs,
    overlay: { ...clip.overlay, startMs, endMs },
  };
}

function replaceOverlayClip(comp: EditorComposition, id: string, next: OverlayClip): EditorComposition {
  return { ...comp, overlayClips: comp.overlayClips.map((c) => (c.id === id ? next : c)) };
}

/**
 * Move an overlay clip by `deltaMs`, keeping its duration. The start clamps
 * at 0 (the delta is effectively clamped with it). A move that clamps to
 * zero, or an unknown id, is a same-reference no-op.
 */
export function moveOverlayClip(comp: EditorComposition, id: string, deltaMs: number): EditorComposition {
  const clip = comp.overlayClips.find((c) => c.id === id);
  if (!clip) return comp;
  const startMs = Math.max(0, roundMs(clip.startMs + roundMs(deltaMs)));
  if (startMs === clip.startMs) return comp;
  return replaceOverlayClip(comp, id, syncOverlayWindow(clip, startMs, startMs + clip.durationMs));
}

/**
 * Move one edge of an overlay clip to the TIMELINE position `targetMs`:
 * - start edge: clamped to [0, endMs − 100] — an overlay keeps at least
 *   {@link MIN_OVERLAY_MS} and never starts before 0;
 * - end edge: clamped to at least startMs + 100, with no upper clamp
 *   (matching today's overlay schema, which bounds no overlay end).
 * Landing exactly on the current edge, or an unknown id, is a no-op.
 */
export function trimOverlayClip(
  comp: EditorComposition,
  id: string,
  edge: "start" | "end",
  targetMs: number,
): EditorComposition {
  const clip = comp.overlayClips.find((c) => c.id === id);
  if (!clip) return comp;
  const target = roundMs(targetMs);
  if (edge === "start") {
    const startMs = Math.max(0, Math.min(target, clip.endMs - MIN_OVERLAY_MS));
    if (startMs === clip.startMs) return comp;
    return replaceOverlayClip(comp, id, syncOverlayWindow(clip, startMs, clip.endMs));
  }
  const endMs = Math.max(target, clip.startMs + MIN_OVERLAY_MS);
  if (endMs === clip.endMs) return comp;
  return replaceOverlayClip(comp, id, syncOverlayWindow(clip, clip.startMs, endMs));
}

/**
 * Split an overlay clip at `atMs`, which must lie strictly inside the clip
 * with at least 40 ms on each side. The first half keeps the original id;
 * the second half is a copy with a NEW id — for both the clip id and its
 * overlay item's id, which Stage A always builds equal — inserted directly
 * after the first half. Anything else is a same-reference no-op.
 */
export function splitOverlayClipAt(comp: EditorComposition, id: string, atMs: number): EditorComposition {
  const idx = comp.overlayClips.findIndex((c) => c.id === id);
  if (idx < 0) return comp;
  const clip = comp.overlayClips[idx]!;
  const at = roundMs(atMs);
  if (at - clip.startMs < MIN_SPLIT_MS || clip.endMs - at < MIN_SPLIT_MS) return comp;
  const secondId = newId();
  const first = syncOverlayWindow(clip, clip.startMs, at);
  const second: OverlayClip = {
    ...syncOverlayWindow(clip, at, clip.endMs),
    id: secondId,
    overlay: { ...clip.overlay, id: secondId, startMs: at, endMs: clip.endMs },
  };
  return {
    ...comp,
    overlayClips: [...comp.overlayClips.slice(0, idx), first, second, ...comp.overlayClips.slice(idx + 1)],
  };
}

/**
 * Duplicate an overlay clip at the same window, with a new id (clip id and
 * overlay item id alike), inserted directly after the original. An unknown
 * id is a same-reference no-op.
 */
export function duplicateOverlayClip(comp: EditorComposition, id: string): EditorComposition {
  const idx = comp.overlayClips.findIndex((c) => c.id === id);
  if (idx < 0) return comp;
  const clip = comp.overlayClips[idx]!;
  const copyId = newId();
  const copy: OverlayClip = { ...clip, id: copyId, overlay: { ...clip.overlay, id: copyId } };
  return {
    ...comp,
    overlayClips: [...comp.overlayClips.slice(0, idx + 1), copy, ...comp.overlayClips.slice(idx + 1)],
  };
}

/** Delete an overlay clip. An unknown id is a same-reference no-op. */
export function deleteOverlayClip(comp: EditorComposition, id: string): EditorComposition {
  if (!comp.overlayClips.some((c) => c.id === id)) return comp;
  return { ...comp, overlayClips: comp.overlayClips.filter((c) => c.id !== id) };
}

/**
 * Ripple-delete an overlay clip: the clip is deleted and every LATER clip
 * IN THE SAME TRACK GROUP (see {@link overlayTrackOf}) shifts earlier by the
 * deleted clip's duration, keeping its own duration — the gap the deleted
 * clip occupied closes on its own track only; the other track group is
 * untouched. "Later" means following the deleted clip in `overlayClips`
 * order, which is timeline order. Starts clamp at 0 (defensive: for a
 * genuinely later clip the shift cannot reach 0, but the clamp is kept so
 * an overlapping same-group clip can never go negative). An unknown id is
 * a same-reference no-op.
 */
export function rippleDeleteOverlayClip(comp: EditorComposition, id: string): EditorComposition {
  const idx = comp.overlayClips.findIndex((c) => c.id === id);
  if (idx < 0) return comp;
  const deleted = comp.overlayClips[idx]!;
  const group = overlayTrackOf(deleted.kind);
  const shiftMs = deleted.durationMs;
  const overlayClips: OverlayClip[] = [];
  comp.overlayClips.forEach((clip, i) => {
    if (i === idx) return;
    if (i > idx && overlayTrackOf(clip.kind) === group && shiftMs !== 0) {
      const startMs = Math.max(0, clip.startMs - shiftMs);
      overlayClips.push(syncOverlayWindow(clip, startMs, startMs + clip.durationMs));
    } else {
      overlayClips.push(clip);
    }
  });
  return { ...comp, overlayClips };
}

/* ------------------------------------------------------------------ */
/* marker + track ops                                                  */
/* ------------------------------------------------------------------ */

/**
 * Add a marker at `atMs` (clamped to ≥ 0 and rounded) with a fresh id,
 * inserted so markers stay sorted by `atMs`; for a tie the new marker goes
 * AFTER the existing markers at that time (stable insertion).
 */
export function addMarker(comp: EditorComposition, atMs: number, label = ""): EditorComposition {
  const at = Math.max(0, roundMs(atMs));
  const marker = { id: newId(), atMs: at, label };
  const insertAt = comp.markers.findIndex((m) => m.atMs > at);
  const markers =
    insertAt < 0
      ? [...comp.markers, marker]
      : [...comp.markers.slice(0, insertAt), marker, ...comp.markers.slice(insertAt)];
  return { ...comp, markers };
}

/** Remove a marker by id. An unknown id is a same-reference no-op. */
export function removeMarker(comp: EditorComposition, id: string): EditorComposition {
  if (!comp.markers.some((m) => m.id === id)) return comp;
  return { ...comp, markers: comp.markers.filter((m) => m.id !== id) };
}

/**
 * Patch one track's state (`locked` / `visible` / `muted`). When the patch
 * changes nothing — every supplied flag already holds that value, including
 * the empty patch — the SAME composition reference is returned.
 */
export function setTrackState(
  comp: EditorComposition,
  kind: CompositionTrackKind,
  patch: Partial<TrackState>,
): EditorComposition {
  const current = comp.trackState[kind];
  const changes = (Object.keys(patch) as Array<keyof TrackState>).some((k) => patch[k] !== undefined && patch[k] !== current[k]);
  if (!changes) return comp;
  return { ...comp, trackState: { ...comp.trackState, [kind]: { ...current, ...patch } } };
}
