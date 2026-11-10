import { describe, expect, it } from "vitest";
import {
  SILENCE_MIN_MS,
  detectSceneChanges,
  detectSilences,
  frameDiffScores,
  nearestSceneCutMs,
  nearestSilenceEdgeMs,
  sceneCutPoints,
  silenceAt,
  type LumaFrame,
} from "./analysis";

const HOP = 20; // PEAKS_PER_SECOND = 50 in useWaveform

/** peaks fixture: loud 1 s, quiet for `quietHops`, loud again */
function peaksWithQuiet(quietHops: number, quietLevel = 0.02, loudLevel = 0.8): Float32Array {
  const loud = new Float32Array(50).fill(loudLevel);
  const quiet = new Float32Array(quietHops).fill(quietLevel);
  const out = new Float32Array(loud.length + quiet.length + loud.length);
  out.set(loud, 0);
  out.set(quiet, loud.length);
  out.set(loud, loud.length + quiet.length);
  return out;
}

describe("detectSilences (audio-energy, synthetic peaks)", () => {
  it("finds a 1 s quiet span with its mean energy, timed by the hop", () => {
    const spans = detectSilences(peaksWithQuiet(50), HOP);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ startMs: 1000, endMs: 2000 });
    expect(spans[0]!.meanEnergy).toBeCloseTo(0.02, 6); // Float32 peaks: mean is float-precise, not exact
  });

  it("drops quiet runs shorter than the minimum silence", () => {
    // 10 hops * 20 ms = 200 ms < SILENCE_MIN_MS
    expect(SILENCE_MIN_MS).toBe(400);
    expect(detectSilences(peaksWithQuiet(10), HOP)).toEqual([]);
  });

  it("a run of exactly the minimum duration is kept; the threshold is inclusive", () => {
    const spans = detectSilences(peaksWithQuiet(20, 0.08), HOP, { threshold: 0.08 });
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ startMs: 1000, endMs: 1400 });
    // just above threshold: not silence at all
    expect(detectSilences(peaksWithQuiet(50, 0.09), HOP)).toEqual([]);
  });

  it("a trailing quiet run is flushed at the end of the array", () => {
    const peaks = new Float32Array([...new Float32Array(10).fill(0.9), ...new Float32Array(30).fill(0)]);
    expect(detectSilences(peaks, HOP)).toEqual([{ startMs: 200, endMs: 800, meanEnergy: 0 }]);
  });

  it("empty and all-loud inputs yield no spans", () => {
    expect(detectSilences(new Float32Array(0), HOP)).toEqual([]);
    expect(detectSilences(new Float32Array(100).fill(0.5), HOP)).toEqual([]);
  });

  it("honours a custom minimum duration", () => {
    expect(detectSilences(peaksWithQuiet(10), HOP, { minSilenceMs: 200 })).toHaveLength(1);
  });
});

describe("silence helpers", () => {
  const spans = [{ startMs: 1000, endMs: 2000, meanEnergy: 0.02 }];
  it("silenceAt covers the span edges inclusively", () => {
    expect(silenceAt(spans, 1000)).not.toBeNull();
    expect(silenceAt(spans, 2000)).not.toBeNull();
    expect(silenceAt(spans, 2001)).toBeNull();
  });
  it("nearest edge distance is to the closer edge; null with no spans", () => {
    expect(nearestSilenceEdgeMs(spans, 1600)).toBe(400);
    expect(nearestSilenceEdgeMs([], 0)).toBeNull();
    expect(nearestSceneCutMs([{ atMs: 5000, score: 0.9 }], 4600)).toBe(400);
    expect(nearestSceneCutMs([], 0)).toBeNull();
  });
});

const frame = (atMs: number, values: number[]): LumaFrame => ({ atMs, luma: new Uint8Array(values) });

describe("frame-difference scene detection (synthetic luma frames)", () => {
  it("identical frames score 0; a full black→white flip scores 1", () => {
    const diffs = frameDiffScores([frame(0, [0, 0, 0, 0]), frame(500, [0, 0, 0, 0]), frame(1000, [255, 255, 255, 255])]);
    expect(diffs).toEqual([
      { atMs: 500, score: 0 },
      { atMs: 1000, score: 1 },
    ]);
  });

  it("a partial change scores by the mean per-pixel difference", () => {
    const diffs = frameDiffScores([frame(0, [0, 0, 0, 0]), frame(500, [255, 0, 0, 0])]);
    expect(diffs[0]!.score).toBeCloseTo(0.25, 10);
  });

  it("float 0–1 planes are read on their own scale", () => {
    const f = (atMs: number, v: number): LumaFrame => ({ atMs, luma: new Float32Array([v, v]) });
    expect(frameDiffScores([f(0, 0), f(500, 0.5)])[0]!.score).toBeCloseTo(0.5, 10);
  });

  it("cut points are exactly the samples at or above the threshold", () => {
    const frames = [frame(0, [0, 0]), frame(500, [10, 10]), frame(1000, [255, 255]), frame(1500, [250, 250])];
    const { scores, cuts } = detectSceneChanges(frames);
    expect(scores.map((s) => s.atMs)).toEqual([500, 1000, 1500]);
    expect(cuts).toEqual([{ atMs: 1000, score: cuts[0]!.score }]);
    expect(cuts[0]!.score).toBeGreaterThanOrEqual(0.35);
    // a lower threshold admits the small change too
    expect(sceneCutPoints(scores, 0.03).map((c) => c.atMs)).toEqual([500, 1000]);
  });

  it("fewer than two frames, and mismatched planes, produce no invented scores", () => {
    expect(frameDiffScores([frame(0, [1, 2])])).toEqual([]);
    expect(frameDiffScores([frame(0, [1, 2]), frame(500, [1, 2, 3])])).toEqual([]);
    expect(detectSceneChanges([])).toEqual({ scores: [], cuts: [] });
  });
});
