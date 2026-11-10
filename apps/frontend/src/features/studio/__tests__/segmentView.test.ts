import { describe, expect, it } from "vitest";
import { DEFAULT_COMPOSITION_TRACKS } from "@capseasy/shared";
import {
  applyReversedSegment, buildSegmentAssetUrls, collectSegmentAssetIds, compositionDurationMs, formatPlaybackRate,
  pickStudioDurationMs, resolveSegmentView, segmentBadges, segmentExtras,
  segmentTimelineDurationMs, IDENTITY_TRANSFORM, type SegmentLike,
} from "../segmentView";
import { editorClipDefaults, type EditorComposition, type EditorVideoClip } from "../compositionDoc";

const seg = (p: Partial<SegmentLike> & { id: string }): SegmentLike => ({ sourceInMs: 0, sourceOutMs: 1000, ...p });

describe("segmentExtras defaults", () => {
  it("fills the pinned identity defaults for a pre-Run-2 segment", () => {
    const x = segmentExtras(seg({ id: "a" }));
    expect(x.playbackRate).toBe(1);
    expect(x.transform).toEqual(IDENTITY_TRANSFORM);
    expect(x.transitionIn).toBeNull();
    expect(x.assetId).toBeNull();
    expect(x.still).toBe(false);
  });

  it("keeps stored values, merging a partial transform over the identity", () => {
    const x = segmentExtras(seg({ id: "a", playbackRate: 2, transform: { ...IDENTITY_TRANSFORM, rotateDeg: 45 } }));
    expect(x.playbackRate).toBe(2);
    expect(x.transform.rotateDeg).toBe(45);
    expect(x.transform.scale).toBe(1);
  });
});

describe("segmentTimelineDurationMs", () => {
  it("is the source span at rate 1, span / rate otherwise", () => {
    expect(segmentTimelineDurationMs(seg({ id: "a", sourceOutMs: 4000 }))).toBe(4000);
    expect(segmentTimelineDurationMs(seg({ id: "a", sourceOutMs: 4000, playbackRate: 2 }))).toBe(2000);
    expect(segmentTimelineDurationMs(seg({ id: "a", sourceOutMs: 4000, playbackRate: 0.5 }))).toBe(8000);
  });

  it("a still's pseudo-span IS its duration — rate never applies", () => {
    expect(segmentTimelineDurationMs(seg({ id: "a", sourceInMs: 0, sourceOutMs: 2000, still: true, playbackRate: 4 }))).toBe(2000);
  });
});

describe("compositionDurationMs", () => {
  it("sums timeline durations and subtracts transition overlaps (not the first segment's)", () => {
    const segs = [
      seg({ id: "a", sourceOutMs: 4000 }),
      seg({ id: "b", sourceInMs: 4000, sourceOutMs: 8000, playbackRate: 2, transitionIn: { type: "fade", durationMs: 300 } }),
      seg({ id: "c", sourceInMs: 8000, sourceOutMs: 10000, transitionIn: { type: "wipe", durationMs: 200 } }),
    ];
    // 4000 + 2000 + 2000 − 300 − 200
    expect(compositionDurationMs(segs)).toBe(7500);
    const first = [seg({ id: "a", sourceOutMs: 1000, transitionIn: { type: "fade", durationMs: 500 } })];
    expect(compositionDurationMs(first)).toBe(1000);
  });

  it("is 0 for no segments and never negative", () => {
    expect(compositionDurationMs([])).toBe(0);
  });
});

describe("pickStudioDurationMs (StudioPage duration selection)", () => {
  it("uses the composition duration when ≥1 segment is stored", () => {
    expect(pickStudioDurationMs({ storedSegments: [seg({ id: "a", sourceOutMs: 3000 })], fallbackDurationMs: 9999 })).toBe(3000);
  });

  it("falls back to the effective-duration path when nothing is stored", () => {
    expect(pickStudioDurationMs({ storedSegments: [], fallbackDurationMs: 9999 })).toBe(9999);
  });
});

describe("resolveSegmentView", () => {
  const clip: EditorVideoClip = { id: "c1", kind: "video", startMs: 500, durationMs: 2000, sourceInMs: 1000, sourceOutMs: 3000, ...editorClipDefaults() };
  it("takes geometry from the clip and Run-2 fields from the stored segment", () => {
    const view = resolveSegmentView(clip, 1, seg({ id: "c1", sourceInMs: 1000, sourceOutMs: 3000, playbackRate: 2 }));
    expect(view.startMs).toBe(500);
    expect(view.index).toBe(1);
    expect(view.playbackRate).toBe(2);
    expect(view.timelineDurationMs).toBe(1000);
  });

  it("defaults everything when there is no stored segment", () => {
    const view = resolveSegmentView(clip, 0, null);
    expect(view.playbackRate).toBe(1);
    expect(view.timelineDurationMs).toBe(2000);
    expect(view.still).toBe(false);
  });
});

describe("segment asset resolution", () => {
  it("collects distinct asset ids in first-seen order", () => {
    expect(collectSegmentAssetIds([{ assetId: "x" }, { assetId: null }, { assetId: "x" }, { assetId: "y" }, {}])).toEqual(["x", "y"]);
  });

  it("builds assetId → URL only for ids whose asset is on this device", () => {
    const assets = [{ id: "x", blob: 1 }, { id: "z", blob: 3 }];
    const urls = buildSegmentAssetUrls([{ assetId: "x" }, { assetId: "missing" }], assets, (a) => `url:${a.id}`);
    expect(urls).toEqual({ x: "url:x" });
  });
});

describe("segmentBadges", () => {
  const base = { still: false, playbackRate: 1, transitionIn: null, assetId: null };
  it("no badges for a plain segment", () => {
    expect(segmentBadges(base)).toEqual([]);
  });

  it("rate badge formats like the inspector (2×, 0.5×)", () => {
    expect(formatPlaybackRate(2)).toBe("2×");
    expect(segmentBadges({ ...base, playbackRate: 2 })).toEqual([{ kind: "rate", label: "2×" }]);
    expect(segmentBadges({ ...base, playbackRate: 0.5 })).toEqual([{ kind: "rate", label: "0.5×" }]);
  });

  it("still badge wins over rate, and a reversed asset badges by its bin name", () => {
    expect(segmentBadges({ ...base, still: true, assetId: "a1" }, "frame.png")).toEqual([{ kind: "still", label: "Freeze" }]);
    expect(segmentBadges({ ...base, assetId: "a1" }, "Reversed — clip.mp4")).toEqual([{ kind: "reversed", label: "Reversed" }]);
    expect(segmentBadges({ ...base, assetId: "a1" }, "plain.mp4")).toEqual([]);
    expect(segmentBadges({ ...base, assetId: "a1" }, null)).toEqual([]);
  });

  it("transition badge names type + duration", () => {
    expect(segmentBadges({ ...base, transitionIn: { type: "fade", durationMs: 300 } }))
      .toEqual([{ kind: "transition", label: "Fade 300ms" }]);
  });
});

describe("applyReversedSegment", () => {
  const vclip = (p: Partial<EditorVideoClip> & { id: string }): EditorVideoClip => ({
    kind: "video", startMs: 0, durationMs: 2000, sourceInMs: 0, sourceOutMs: 2000,
    ...editorClipDefaults(), ...p,
  });
  const compOf = (clips: EditorVideoClip[]): EditorComposition => {
    let at = 0;
    const laid = clips.map((c) => { const n = { ...c, startMs: at }; at += c.durationMs; return n; });
    return {
      version: 1, durationMs: at, sourceDurationMs: 10000,
      rangeStartMs: laid[0]?.sourceInMs ?? 0,
      videoClips: laid, captionClips: [], overlayClips: [], markers: [],
      trackState: structuredClone(DEFAULT_COMPOSITION_TRACKS),
    };
  };

  it("points the segment at the reversed asset with the remapped range, still cleared", () => {
    const comp = compOf([vclip({ id: "a", still: true })]);
    const r = applyReversedSegment(comp, "a", "rev-1", 6000, 8000);
    const a = r.comp.videoClips[0]!;
    expect(a.assetId).toBe("rev-1");
    expect(a.still).toBe(false);
    expect([a.sourceInMs, a.sourceOutMs]).toEqual([6000, 8000]);
    expect(r.docEffect).toEqual({ type: "none" });
    // the remap preserves the span, so the layout is untouched
    expect(r.comp.durationMs).toBe(comp.durationMs);
    expect(a.durationMs).toBe(2000);
  });

  it("is a same-reference no-op for an unknown clip", () => {
    const comp = compOf([vclip({ id: "a" })]);
    const r = applyReversedSegment(comp, "nope", "rev-1", 0, 1000);
    expect(r.comp).toBe(comp);
  });
});
