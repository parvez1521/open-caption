import { describe, expect, it } from "vitest";
import {
  MIX_HOP_MS,
  combineVoicePeaks,
  dbToGain,
  duckEnvelope,
  fadeGainAt,
  gainToDb,
  peaksFromChannels,
} from "../audio/mixMath";

describe("dbToGain / gainToDb", () => {
  it("round-trips and hits the reference points", () => {
    expect(dbToGain(0)).toBeCloseTo(1, 12);
    expect(dbToGain(-20)).toBeCloseTo(0.1, 12);
    expect(dbToGain(20)).toBeCloseTo(10, 12);
    expect(gainToDb(1)).toBeCloseTo(0, 12);
    expect(gainToDb(0.5)).toBeCloseTo(-6.0206, 3);
    expect(gainToDb(dbToGain(-12))).toBeCloseTo(-12, 10);
  });
});

describe("fadeGainAt", () => {
  const clip = { volume: 0.8, fadeInMs: 1000, fadeOutMs: 500 };
  it("is 0 at the very start when a fade-in is set", () => {
    expect(fadeGainAt(clip, 0, 2000)).toBe(0);
  });
  it("is the full volume at the fade-in midpoint of the ramp region", () => {
    // local 500ms: fadeIn = 0.5, fadeOut still 1 (1500ms of 500ms fade-out left → clamped 1)
    expect(fadeGainAt(clip, 500, 2000)).toBeCloseTo(0.4, 12);
  });
  it("is the full volume between the fades", () => {
    expect(fadeGainAt(clip, 1250, 2000)).toBeCloseTo(0.8, 12);
  });
  it("ramps the fade-out linearly and reaches 0 at the end", () => {
    // local 1750ms: fadeOut = (2000-1750)/500 = 0.5
    expect(fadeGainAt(clip, 1750, 2000)).toBeCloseTo(0.4, 12);
    expect(fadeGainAt(clip, 2000, 2000)).toBe(0);
  });
  it("has no ramps when both fades are 0", () => {
    const plain = { volume: 1, fadeInMs: 0, fadeOutMs: 0 };
    expect(fadeGainAt(plain, 0, 1000)).toBe(1);
    expect(fadeGainAt(plain, 999, 1000)).toBe(1);
  });
});

describe("peaksFromChannels", () => {
  it("takes the max across channels per hop", () => {
    const sr = 1000; // 1 sample per ms → hop of 10ms = 10 samples
    const a = new Float32Array(30).fill(0.1);
    const b = new Float32Array(30).fill(0.2);
    a[15] = -0.9; // second hop, channel A wins via absolute value
    b[25] = 0.5; // third hop
    const peaks = peaksFromChannels([a, b], sr, MIX_HOP_MS);
    expect(peaks.length).toBe(3);
    expect(peaks[0]).toBeCloseTo(0.2, 6);
    expect(peaks[1]).toBeCloseTo(0.9, 6);
    expect(peaks[2]).toBeCloseTo(0.5, 6);
  });
  it("rounds the hop count up for a partial final hop", () => {
    const peaks = peaksFromChannels([new Float32Array(25).fill(0.3)], 1000);
    expect(peaks.length).toBe(3); // ceil(25/10)
  });
  it("is empty for empty input", () => {
    expect(peaksFromChannels([], 48000).length).toBe(0);
    expect(peaksFromChannels([new Float32Array(0)], 48000).length).toBe(0);
  });
});

describe("duckEnvelope", () => {
  it("settles to dbToGain(-amountDb) under constant loud voice peaks", () => {
    const peaks = new Float32Array(200).fill(0.9); // 200 hops = 2s, well past the 10ms attack
    const env = duckEnvelope(peaks, { thresholdDb: -42, amountDb: 12 });
    const target = dbToGain(-12);
    expect(env[env.length - 1]!).toBeCloseTo(target, 2); // ±0.01
    expect(Math.abs(env[env.length - 1]! - target)).toBeLessThan(0.01);
    // attack is fast: already most of the way down within a few hops
    expect(env[5]!).toBeLessThan(0.4);
  });
  it("stays at 1 under silence", () => {
    const env = duckEnvelope(new Float32Array(50).fill(0), { thresholdDb: -42, amountDb: 12 });
    for (const v of env) expect(v).toBe(1);
  });
  it("stays at 1 when peaks are below the threshold", () => {
    const env = duckEnvelope(new Float32Array(50).fill(0.001), { thresholdDb: -42, amountDb: 12 });
    for (const v of env) expect(v).toBe(1);
  });
  it("recovers toward 1 (release direction) after the voice stops", () => {
    const peaks = new Float32Array(300);
    peaks.fill(0.9, 0, 50);
    const env = duckEnvelope(peaks, { thresholdDb: -42, amountDb: 12 });
    const ducked = env[49]!;
    expect(ducked).toBeCloseTo(dbToGain(-12), 2);
    // monotone recovery after the voice ends, slower than the attack
    expect(env[100]!).toBeGreaterThan(ducked);
    expect(env[70]!).toBeLessThan(0.85); // 200ms into the 250ms release: still recovering
    expect(env[299]!).toBeGreaterThan(0.99);
    for (let i = 51; i < env.length; i++) expect(env[i]!).toBeGreaterThanOrEqual(env[i - 1]! - 1e-9);
  });
});

describe("combineVoicePeaks", () => {
  it("max-combines placed peaks onto a zeroed timeline", () => {
    const out = combineVoicePeaks(
      [
        { peaks: new Float32Array([0.5, 0.7]), startHop: 2 },
        { peaks: new Float32Array([0.9, 0.1]), startHop: 3 },
      ],
      6,
    );
    const expected = [0, 0, 0.5, 0.9, 0.1, 0];
    out.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 6));
  });
  it("clips placements past the end", () => {
    const out = combineVoicePeaks([{ peaks: new Float32Array([1, 1, 1]), startHop: 4 }], 5);
    expect([...out]).toEqual([0, 0, 0, 0, 1]);
  });
});
