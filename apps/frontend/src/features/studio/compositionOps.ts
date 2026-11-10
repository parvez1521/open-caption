import { newId, type CaptionDoc, type CompositionTrackKind, type OverlayItem, type TrackState } from "@capseasy/shared";
import { deleteWordsByIds, shiftWordsByIds } from "@motion-ai/caption-engine/core";
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
 * contiguous partition — first clip at project time 0, every duration > 0 and
 * equal to its source span, timeline AND source continuity between neighbours.
 * Every video op below preserves it by construction (all timeline positions are
 * re-accumulated from the source spans after an edit), and
 * `projectComposition` throwing in tests is the tripwire for a broken op.
 * Consequence for scope: at Stage B the video ops are exactly those whose
 * result is still ONE continuous source range — split, boundary roll, head
 * trim, tail trim, and ripple delete of an END segment only. Removing a
 * MIDDLE segment would delete a source range (breaking source continuity and
 * the clipRange projection), so it is Stage C work and is refused here.
 */

/** Minimum length of a video segment / clip, in ms (matches Timeline's MIN_MS). */
export const MIN_VIDEO_MS = 40;
/** Minimum window an overlay trim may leave, in ms (matches OverlayEditor's clamp). */
export const MIN_OVERLAY_MS = 100;
/** Minimum length of each half produced by a split, in ms. */
const MIN_SPLIT_MS = 40;

/**
 * A side effect a video op has on the REST of the project, reported to the
 * commit layer instead of being applied inside the op:
 * - `none` — nothing outside the video partition moved.
 * - `headShift` — the head of the project was cut by `deltaMs`: project time
 *   re-bases, so the caption document and the marker/overlay content must be
 *   shifted by the same delta (see {@link applyDocEffect} and
 *   {@link applyContentShift}). The video op itself deliberately does NOT
 *   move markers/overlays or touch the caption doc — it only reports the
 *   delta, and the commit layer applies both shifts atomically with the op.
 */
export type DocEffect = { type: "none" } | { type: "headShift"; deltaMs: number };

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

/**
 * Re-lay a list of video clips into a valid partition: timeline positions are
 * re-accumulated from 0 in array order and every duration is re-derived from
 * its source span, so the partition invariant holds by construction whatever
 * source edits the caller made. Also refreshes the composition's
 * `durationMs` (the partition span) and `rangeStartMs` (the first clip's
 * source in-point). Clips are copied, never mutated.
 */
function relayout(comp: EditorComposition, clips: readonly EditorVideoClip[]): EditorComposition {
  let atMs = 0;
  const laidOut: EditorVideoClip[] = clips.map((clip) => {
    const durationMs = clip.sourceOutMs - clip.sourceInMs;
    const next: EditorVideoClip = { ...clip, startMs: atMs, durationMs };
    atMs += durationMs;
    return next;
  });
  return {
    ...comp,
    videoClips: laidOut,
    durationMs: atMs,
    rangeStartMs: laidOut.length > 0 ? laidOut[0]!.sourceInMs : comp.rangeStartMs,
  };
}

/* ------------------------------------------------------------------ */
/* video ops                                                           */
/* ------------------------------------------------------------------ */

/**
 * Split the video segment strictly containing `atMs` into two segments at
 * that point. Both halves must be at least 40 ms long; the second half gets
 * a new id, the first keeps the original id. The split point is the same
 * offset in timeline and source time (clips play 1:1), so source continuity
 * is preserved exactly. Refusals (same-reference no-op): `atMs` on a segment
 * boundary or outside every segment, or either side shorter than 40 ms.
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
  const sourceMidMs = clip.sourceInMs + leftMs;
  const first: EditorVideoClip = { ...clip, sourceOutMs: sourceMidMs };
  const second: EditorVideoClip = {
    id: newId(),
    kind: "video",
    startMs: at,
    durationMs: rightMs,
    sourceInMs: sourceMidMs,
    sourceOutMs: clip.sourceOutMs,
  };
  const clips = [...comp.videoClips.slice(0, idx), first, second, ...comp.videoClips.slice(idx + 1)];
  return done(relayout(comp, clips));
}

/**
 * Move one edge of one video clip to the TIMELINE position `targetMs`
 * (the position the dragged edge should land on). What that means depends on
 * which edge of which clip it is — the four cases:
 *
 * - START edge of the FIRST clip — HEAD TRIM, inward only. `targetMs` is the
 *   amount of head to cut (the first clip starts at 0): the first clip's
 *   `sourceInMs` advances by `delta = targetMs`, its duration shrinks, every
 *   later clip re-accumulates, and `durationMs` shrinks by `delta`. A
 *   `targetMs <= 0` (no cut / an outward drag) is a no-op, and the op REFUSES
 *   (no-op) when the resulting first-clip duration would be < 40 ms.
 *   Markers and overlays are NOT moved by this op; the result carries
 *   `docEffect: { type: "headShift", deltaMs: delta }` so the commit layer
 *   can shift the caption doc and the marker/overlay content by the same
 *   delta (see {@link applyDocEffect} / {@link applyContentShift}).
 * - START edge of clip i > 0 — BOUNDARY ROLL with clip i−1. The shared
 *   boundary moves by `targetMs − clip.startMs`, clamped so both neighbours
 *   stay ≥ 40 ms: the previous clip's `sourceOutMs` and this clip's
 *   `sourceInMs` move together (source continuity preserved), durations
 *   adjust in opposite directions, total duration unchanged. No docEffect.
 * - END edge of clip i < last — BOUNDARY ROLL with clip i+1, the same
 *   mechanics from the other side. No docEffect.
 * - END edge of the LAST clip — TAIL TRIM / EXTEND. The duration changes by
 *   `targetMs − clip.endMs`: inward shrinks (clamped so ≥ 40 ms remains);
 *   outward extends, bounded by `sourceDurationMs` when it is > 0 (the
 *   source end) and unbounded when the source length is unknown (0).
 *   No docEffect.
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

  // --- head trim: start edge of the first clip ---
  if (edge === "start" && idx === 0) {
    const delta = target - clip.startMs; // clip.startMs is 0 by the invariant
    if (delta <= 0) return noOp(comp);
    if (clip.durationMs - delta < MIN_VIDEO_MS) return noOp(comp);
    const first: EditorVideoClip = { ...clip, sourceInMs: clip.sourceInMs + delta };
    const clips = [first, ...comp.videoClips.slice(1)];
    return done(relayout(comp, clips), { type: "headShift", deltaMs: delta });
  }

  // --- boundary roll: start edge of clip i > 0, against clip i−1 ---
  if (edge === "start") {
    const prev = comp.videoClips[idx - 1]!;
    const rawDelta = target - clip.startMs;
    // prev grows by delta, this clip shrinks by delta; both must stay >= MIN
    const delta = Math.max(MIN_VIDEO_MS - prev.durationMs, Math.min(rawDelta, clip.durationMs - MIN_VIDEO_MS));
    if (delta === 0) return noOp(comp);
    const boundary = prev.sourceOutMs + delta; // === clip.sourceInMs + delta
    const clips = comp.videoClips.map((c, i) => {
      if (i === idx - 1) return { ...c, sourceOutMs: boundary };
      if (i === idx) return { ...c, sourceInMs: boundary };
      return c;
    });
    return done(relayout(comp, clips));
  }

  // --- tail trim / extend: end edge of the last clip ---
  if (idx === lastIdx) {
    const clipEndMs = clip.startMs + clip.durationMs;
    const rawDelta = target - clipEndMs;
    if (rawDelta === 0) return noOp(comp);
    let delta = rawDelta;
    if (delta < 0) {
      // inward: clamp so at least MIN_VIDEO_MS of the clip remains
      delta = Math.max(delta, MIN_VIDEO_MS - clip.durationMs);
    } else if (comp.sourceDurationMs > 0) {
      // outward: never extend past the end of the source
      delta = Math.min(delta, comp.sourceDurationMs - clip.sourceOutMs);
    }
    if (delta === 0) return noOp(comp);
    const last: EditorVideoClip = { ...clip, sourceOutMs: clip.sourceOutMs + delta };
    const clips = [...comp.videoClips.slice(0, lastIdx), last];
    return done(relayout(comp, clips));
  }

  // --- boundary roll: end edge of clip i < last, against clip i+1 ---
  const next = comp.videoClips[idx + 1]!;
  const clipEndMs = clip.startMs + clip.durationMs;
  const rawDelta = target - clipEndMs;
  // this clip grows by delta, next shrinks by delta; both must stay >= MIN
  const delta = Math.max(MIN_VIDEO_MS - clip.durationMs, Math.min(rawDelta, next.durationMs - MIN_VIDEO_MS));
  if (delta === 0) return noOp(comp);
  const boundary = clip.sourceOutMs + delta; // === next.sourceInMs + delta
  const clips = comp.videoClips.map((c, i) => {
    if (i === idx) return { ...c, sourceOutMs: boundary };
    if (i === idx + 1) return { ...c, sourceInMs: boundary };
    return c;
  });
  return done(relayout(comp, clips));
}

/**
 * Whether {@link rippleDeleteVideoSegment} would delete the segment: true
 * only for the FIRST or LAST segment of a composition with at least two
 * segments. Middle segments and the only segment of a single-clip
 * composition are not ripple-deletable at Stage B (see the op's comment).
 */
export function canRippleDeleteVideoSegment(comp: EditorComposition, clipId: string): boolean {
  if (comp.videoClips.length <= 1) return false;
  const idx = comp.videoClips.findIndex((c) => c.id === clipId);
  if (idx < 0) return false;
  return idx === 0 || idx === comp.videoClips.length - 1;
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
 * - MIDDLE segment: REFUSED — a same-reference no-op. Removing a middle
 *   segment would remove a range from the middle of the source, breaking
 *   source continuity (and with it the partition invariant and the
 *   clipRange projection); representing that jump cut is Stage C work.
 * - The ONLY segment of a single-clip composition: refused (no-op) — a
 *   composition may not ripple-delete its way to no video at all here.
 * An unknown `clipId` is likewise a no-op.
 */
export function rippleDeleteVideoSegment(comp: EditorComposition, clipId: string): VideoOpResult {
  if (!canRippleDeleteVideoSegment(comp, clipId)) return noOp(comp);
  const idx = comp.videoClips.findIndex((c) => c.id === clipId);
  const clip = comp.videoClips[idx]!;
  const rest = comp.videoClips.filter((_, i) => i !== idx);
  if (idx === 0) {
    return done(relayout(comp, rest), { type: "headShift", deltaMs: roundMs(clip.durationMs) });
  }
  return done(relayout(comp, rest));
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
 * `videoClips` and `durationMs` are NOT touched — the video op that produced
 * the headShift already handled those. A zero (or negative) delta, or a
 * composition whose markers/overlays would not change, returns the same
 * reference.
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

  if (!markersChanged && !overlaysChanged) return comp;
  return { ...comp, markers, overlayClips };
}

/**
 * Apply a video op's {@link DocEffect} to the caption document:
 * - `none` (or a headShift of 0, or a document with no words) returns the
 *   SAME document reference;
 * - `headShift` deletes every word ending at or before the cut
 *   (`endMs <= deltaMs` — it was spoken entirely inside the removed head)
 *   via the caption engine's `deleteWordsByIds`, then shifts every remaining
 *   word earlier by `deltaMs` via `shiftWordsByIds`. The engine clamps
 *   starts at 0 keeping its 40 ms minimum, so a word SPANNING the cut lands
 *   at 0 with its tail (the part after the cut) intact.
 */
export function applyDocEffect(doc: CaptionDoc, effect: DocEffect): CaptionDoc {
  if (effect.type === "none") return doc;
  const delta = roundMs(effect.deltaMs);
  if (delta <= 0 || doc.words.length === 0) return doc;
  const deleteIds = doc.words.filter((w) => w.endMs <= delta).map((w) => w.id);
  const remainingIds = doc.words.filter((w) => w.endMs > delta).map((w) => w.id);
  const afterDelete = deleteWordsByIds(doc, deleteIds);
  if (remainingIds.length === 0) return afterDelete;
  return shiftWordsByIds(afterDelete, remainingIds, -delta);
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
