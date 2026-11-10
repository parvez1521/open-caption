import { describe, expect, it } from "vitest";
import {
  freezeAssetName, remapRangeToReversed, reverseChannelData, reverseChunkWindows,
  reversedAssetName, segmentAssetRecord, sourceMsAtTimeline,
} from "../segmentAssets";
import { isReversedAssetName } from "../segmentView";

describe("remapRangeToReversed", () => {
  it("mirrors a range around the source's midpoint: [in, out] → [D−out, D−in]", () => {
    expect(remapRangeToReversed(10000, 2000, 4000)).toEqual({ sourceInMs: 6000, sourceOutMs: 8000 });
    expect(remapRangeToReversed(10000, 0, 10000)).toEqual({ sourceInMs: 0, sourceOutMs: 10000 });
    expect(remapRangeToReversed(10000, 0, 2500)).toEqual({ sourceInMs: 7500, sourceOutMs: 10000 });
    expect(remapRangeToReversed(10000, 7500, 10000)).toEqual({ sourceInMs: 0, sourceOutMs: 2500 });
  });

  it("is an involution: remapping twice returns the original range", () => {
    const once = remapRangeToReversed(9000, 1000, 3000);
    expect(remapRangeToReversed(9000, once.sourceInMs, once.sourceOutMs)).toEqual({ sourceInMs: 1000, sourceOutMs: 3000 });
  });

  it("clamps out-of-range input into the source and keeps a positive span", () => {
    const r = remapRangeToReversed(5000, -100, 99999);
    expect(r).toEqual({ sourceInMs: 0, sourceOutMs: 5000 });
  });
});

describe("sourceMsAtTimeline", () => {
  it("maps a playhead inside a segment to its source time, rate-aware", () => {
    const seg = { sourceInMs: 2000, startMs: 1000 };
    expect(sourceMsAtTimeline(seg, 1000)).toBe(2000);
    expect(sourceMsAtTimeline(seg, 2000)).toBe(3000);
    expect(sourceMsAtTimeline({ ...seg, playbackRate: 2 }, 2000)).toBe(4000);
    expect(sourceMsAtTimeline({ ...seg, playbackRate: 0.5 }, 2000)).toBe(2500);
  });

  it("clamps a playhead before the segment to its in-point", () => {
    expect(sourceMsAtTimeline({ sourceInMs: 2000, startMs: 1000 }, 0)).toBe(2000);
  });
});

describe("reverseChunkWindows", () => {
  it("covers [0, D] exactly once, in reverse order, each window ≤ chunkMs", () => {
    const wins = reverseChunkWindows(10000, 4000);
    expect(wins).toEqual([
      { startMs: 8000, endMs: 10000 },
      { startMs: 4000, endMs: 8000 },
      { startMs: 0, endMs: 4000 },
    ]);
    const total = wins.reduce((n, w) => n + (w.endMs - w.startMs), 0);
    expect(total).toBe(10000);
  });

  it("a short source is a single window; an empty source none", () => {
    expect(reverseChunkWindows(1500, 4000)).toEqual([{ startMs: 0, endMs: 1500 }]);
    expect(reverseChunkWindows(0)).toEqual([]);
  });
});

describe("reverseChannelData", () => {
  it("reverses frame order per channel without mutating the input", () => {
    const left = new Float32Array([1, 2, 3]);
    const right = new Float32Array([10, 20, 30]);
    const out = reverseChannelData([left, right]);
    expect([...out[0]!]).toEqual([3, 2, 1]);
    expect([...out[1]!]).toEqual([30, 20, 10]);
    expect([...left]).toEqual([1, 2, 3]);
  });
});

describe("asset naming + record", () => {
  it("reversed assets carry the prefix the Timeline badge keys off", () => {
    const name = reversedAssetName("clip.mp4");
    expect(name).toBe("Reversed — clip.mp4");
    expect(isReversedAssetName(name)).toBe(true);
    expect(isReversedAssetName("clip.mp4")).toBe(false);
  });

  it("freeze names keep the source base name and the frame time", () => {
    expect(freezeAssetName("clip.mp4", 2500)).toBe("clip — freeze at 2500ms.png");
  });

  it("builds a media-bin record with a fresh id and the blob's own size/mime", () => {
    const blob = new Blob(["abc"], { type: "video/mp4" });
    const rec = segmentAssetRecord({ projectId: "p1", kind: "video", name: "Reversed — x", blob, durationMs: 5000, width: 1080, height: 1920 });
    expect(rec.id.length).toBeGreaterThan(0);
    expect(rec.projectId).toBe("p1");
    expect(rec.kind).toBe("video");
    expect(rec.size).toBe(3);
    expect(rec.mime).toBe("video/mp4");
    expect(rec.durationMs).toBe(5000);
  });
});
