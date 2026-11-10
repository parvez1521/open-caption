import { describe, expect, it } from "vitest";
import { DEFAULT_COMPOSITION_TRACKS } from "@capseasy/shared";
import type { EditorComposition } from "../compositionDoc";
import {
  applyReversedSegment, canRippleDeleteSegment, duplicateVideoSegment, insertStillSegmentAt,
  rippleDeleteVideoSegment, setSegmentPlaybackRate, setSegmentTransform, setSegmentTransition,
  type SegmentClip,
} from "../segmentOps";
import { segmentExtras, type SegmentExtras } from "../segmentView";

/** read a plain editor clip's Run-2 extras (clips carry them as extra properties) */
const extrasOf = (c: unknown) => segmentExtras(c as Partial<SegmentExtras>);

const clip = (p: Partial<SegmentClip> & { id: string }): SegmentClip => ({
  kind: "video", startMs: 0, durationMs: 2000, sourceInMs: 0, sourceOutMs: 2000, ...p,
});

function compOf(clips: SegmentClip[]): EditorComposition {
  let at = 0;
  const laid = clips.map((c) => { const n = { ...c, startMs: at }; at += c.durationMs; return n; });
  return {
    version: 1,
    durationMs: at,
    sourceDurationMs: 10000,
    rangeStartMs: laid[0]?.sourceInMs ?? 0,
    videoClips: laid,
    captionClips: [],
    overlayClips: [],
    markers: [],
    trackState: structuredClone(DEFAULT_COMPOSITION_TRACKS),
  };
}

const three = () => compOf([
  clip({ id: "a", sourceInMs: 0, sourceOutMs: 2000 }),
  clip({ id: "b", sourceInMs: 2000, sourceOutMs: 4000 }),
  clip({ id: "c", sourceInMs: 4000, sourceOutMs: 6000 }),
]);

describe("setSegmentPlaybackRate", () => {
  it("patches the rate and re-lays out: the segment's timeline duration is span / rate", () => {
    const r = setSegmentPlaybackRate(three(), "b", 2);
    const b = r.comp.videoClips[1]!;
    expect(extrasOf(b).playbackRate).toBe(2);
    expect(b.durationMs).toBe(1000);
    expect(r.comp.videoClips[2]!.startMs).toBe(3000);
    expect(r.comp.durationMs).toBe(5000);
    expect(r.docEffect).toEqual({ type: "none" });
  });

  it("clamps to 0.25–4 and no-ops on the same rate / unknown id / a still", () => {
    const comp = three();
    expect(setSegmentPlaybackRate(comp, "b", 99).comp.videoClips[1]!.durationMs).toBe(500);
    expect(setSegmentPlaybackRate(comp, "b", 1).comp).toBe(comp);
    expect(setSegmentPlaybackRate(comp, "nope", 2).comp).toBe(comp);
    const withStill = compOf([clip({ id: "s", still: true, sourceInMs: 0, sourceOutMs: 2000 })]);
    expect(setSegmentPlaybackRate(withStill, "s", 2).comp).toBe(withStill);
  });
});

describe("setSegmentTransform / setSegmentTransition", () => {
  it("merges a transform patch over the current transform", () => {
    const r = setSegmentTransform(three(), "a", { rotateDeg: 30, flipH: true });
    const t = extrasOf(r.comp.videoClips[0]).transform;
    expect(t.rotateDeg).toBe(30);
    expect(t.flipH).toBe(true);
    expect(t.scale).toBe(1);
    const r2 = setSegmentTransform(r.comp, "a", { scale: 2 });
    expect(extrasOf(r2.comp.videoClips[0]).transform.rotateDeg).toBe(30);
    expect(extrasOf(r2.comp.videoClips[0]).transform.scale).toBe(2);
  });

  it("sets and clears a transition, clamping its duration to 100–2000 ms", () => {
    const r = setSegmentTransition(three(), "b", { type: "fade", durationMs: 5000 });
    expect(extrasOf(r.comp.videoClips[1]).transitionIn).toEqual({ type: "fade", durationMs: 2000 });
    // the overlap shortens the composition's rendered duration
    expect(r.comp.durationMs).toBe(6000 - 2000);
    const cleared = setSegmentTransition(r.comp, "b", null);
    expect(extrasOf(cleared.comp.videoClips[1]).transitionIn).toBeNull();
    expect(cleared.comp.durationMs).toBe(6000);
  });
});

describe("duplicateVideoSegment", () => {
  it("inserts a copy with a new id directly after the original, same source range", () => {
    const r = duplicateVideoSegment(three(), "b");
    expect(r.comp.videoClips.map((c) => c.id)).toEqual(["a", "b", expect.any(String), "c"]);
    const copy = r.comp.videoClips[2]!;
    expect(copy.id).not.toBe("b");
    expect([copy.sourceInMs, copy.sourceOutMs]).toEqual([2000, 4000]);
    expect(copy.startMs).toBe(4000);
    expect(r.comp.durationMs).toBe(8000);
  });

  it("no-ops for an unknown id", () => {
    const comp = three();
    expect(duplicateVideoSegment(comp, "nope").comp).toBe(comp);
  });
});

describe("rippleDeleteVideoSegment — middle segments allowed (Run 2)", () => {
  it("deletes a MIDDLE segment and closes the gap", () => {
    const r = rippleDeleteVideoSegment(three(), "b");
    expect(r.comp.videoClips.map((c) => c.id)).toEqual(["a", "c"]);
    expect(r.comp.videoClips[1]!.startMs).toBe(2000);
    expect(r.comp.durationMs).toBe(4000);
    expect(r.docEffect).toEqual({ type: "none" });
  });

  it("deleting the first segment reports a headShift of its timeline duration", () => {
    const r = rippleDeleteVideoSegment(three(), "a");
    expect(r.comp.videoClips.map((c) => c.id)).toEqual(["b", "c"]);
    expect(r.docEffect).toEqual({ type: "headShift", deltaMs: 2000 });
  });

  it("refuses the only segment; canRippleDeleteSegment matches", () => {
    const single = compOf([clip({ id: "a" })]);
    expect(canRippleDeleteSegment(single, "a")).toBe(false);
    expect(rippleDeleteVideoSegment(single, "a").comp).toBe(single);
    expect(canRippleDeleteSegment(three(), "b")).toBe(true);
    expect(canRippleDeleteSegment(three(), "nope")).toBe(false);
  });
});

describe("insertStillSegmentAt", () => {
  it("splits the containing segment and inserts a 2 s still at the playhead", () => {
    const r = insertStillSegmentAt(three(), 3000, 2000, "asset-1");
    expect(r.comp.videoClips).toHaveLength(5); // a, b-left, still, b-right, c
    const still = r.comp.videoClips[2]!;
    const extras = extrasOf(still);
    expect(extras.still).toBe(true);
    expect(extras.assetId).toBe("asset-1");
    expect([still.sourceInMs, still.sourceOutMs]).toEqual([0, 2000]); // pseudo-span = on-screen duration
    expect(still.startMs).toBe(3000);
    expect(still.durationMs).toBe(2000);
    // the split halves of "b" keep their source ranges around the still
    expect([r.comp.videoClips[1]!.sourceInMs, r.comp.videoClips[1]!.sourceOutMs]).toEqual([2000, 3000]);
    expect([r.comp.videoClips[3]!.sourceInMs, r.comp.videoClips[3]!.sourceOutMs]).toEqual([3000, 4000]);
    expect(r.comp.durationMs).toBe(8000);
  });

  it("the split point is rate-aware: a 2× segment splits its source twice as fast", () => {
    const comp = compOf([clip({ id: "a", sourceInMs: 0, sourceOutMs: 4000, playbackRate: 2, durationMs: 2000 })]);
    const r = insertStillSegmentAt(comp, 1000, 1000, "asset-1");
    expect([r.comp.videoClips[0]!.sourceInMs, r.comp.videoClips[0]!.sourceOutMs]).toEqual([0, 2000]);
    expect([r.comp.videoClips[2]!.sourceInMs, r.comp.videoClips[2]!.sourceOutMs]).toEqual([2000, 4000]);
  });

  it("inserts at a boundary without splitting, and appends at the very end", () => {
    const atBoundary = insertStillSegmentAt(three(), 2000, 1500, "asset-1");
    expect(atBoundary.comp.videoClips.map((c) => extrasOf(c).still)).toEqual([false, true, false, false]);
    const atEnd = insertStillSegmentAt(three(), 6000, 1500, "asset-1");
    expect(extrasOf(atEnd.comp.videoClips[3]!).still).toBe(true);
    expect(atEnd.comp.durationMs).toBe(7500);
  });

  it("trims/splits keep working on stills: a still can itself be split by a later insert", () => {
    const withStill = insertStillSegmentAt(three(), 2000, 2000, "asset-1").comp;
    const r = insertStillSegmentAt(withStill, 3000, 1000, "asset-2");
    const stills = r.comp.videoClips.filter((c) => extrasOf(c).still);
    expect(stills).toHaveLength(3); // the original still split into two halves + the new one between
    expect(r.comp.durationMs).toBe(8000 + 1000);
  });
});

describe("applyReversedSegment", () => {
  it("points the segment at the reversed asset with the remapped range, still cleared", () => {
    const comp = compOf([clip({ id: "a", still: true, sourceInMs: 0, sourceOutMs: 2000 })]);
    const r = applyReversedSegment(comp, "a", "rev-1", 6000, 8000);
    const a = r.comp.videoClips[0]!;
    expect(extrasOf(a).assetId).toBe("rev-1");
    expect(extrasOf(a).still).toBe(false);
    expect([a.sourceInMs, a.sourceOutMs]).toEqual([6000, 8000]);
  });
});
