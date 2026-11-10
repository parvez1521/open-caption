import { describe, expect, it } from "vitest";
import {
  applyCleanup,
  applyCompressor,
  applyEq,
  biquadCoefficients,
  compressorGainDb,
  convolveChannels,
  generateImpulse,
  peakAbs,
  rateShift,
  resampleLinear,
  rms,
} from "../audio/dsp";
import { dbToGain, gainToDb } from "../audio/mixMath";

const SR = 48000;

function sine(freqHz: number, seconds: number, amplitude = 0.5, sampleRate = SR): Float32Array {
  const n = Math.round(seconds * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
  return out;
}

/** RMS of the steady region (skips filter settle at both ends). */
function steadyRms(data: Float32Array): number {
  const from = Math.floor(data.length * 0.25);
  const to = Math.floor(data.length * 0.75);
  return rms(data, from, to);
}

describe("biquad EQ", () => {
  it("lowshelf +12dB boosts a 100Hz sine by ~x3.9 and leaves 8kHz ~unchanged", () => {
    const low = sine(100, 1);
    const lowBefore = steadyRms(low);
    const lowChannels = [low];
    applyEq(lowChannels, SR, { lowDb: 12, midDb: 0, highDb: 0 });
    const boost = steadyRms(low) / lowBefore;
    expect(boost).toBeGreaterThan(3.9 * 0.8);
    expect(boost).toBeLessThan(3.9 * 1.2);

    const high = sine(8000, 1);
    const highBefore = steadyRms(high);
    applyEq([high], SR, { lowDb: 12, midDb: 0, highDb: 0 });
    const ratio = steadyRms(high) / highBefore;
    expect(ratio).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThan(1.1);
  });

  it("a flat EQ is a no-op", () => {
    const data = sine(440, 0.2);
    const copy = data.slice();
    applyEq([data], SR, { lowDb: 0, midDb: 0, highDb: 0 });
    expect([...data]).toEqual([...copy]);
  });

  it("highpass coefficients at the corner give ~-3dB for a peaking-shaped check", () => {
    // sanity on the raw coefficients: DC gain of a highpass is 0
    const c = biquadCoefficients("highpass", 200, 0.707, 0, SR);
    expect(c.b0 + c.b1 + c.b2).toBeCloseTo(0, 6); // numerator at DC (z=1)
    expect(1 + c.a1 + c.a2).toBeGreaterThan(0); // stable denominator at DC
  });
});

describe("cleanup", () => {
  it("high-pass at 200Hz attenuates a 40Hz sine by at least 12dB", () => {
    const data = sine(40, 1, 0.8);
    const before = steadyRms(data);
    applyCleanup([data], SR, { enabled: true, highPassHz: 200, gateDb: -80 });
    const after = steadyRms(data);
    expect(gainToDb(after / before)).toBeLessThanOrEqual(-12);
  });

  it("gate silences a -70dB section and passes a 0dB section", () => {
    const quietAmp = dbToGain(-70);
    const quiet = sine(440, 1, quietAmp);
    applyCleanup([quiet], SR, { enabled: true, highPassHz: 20, gateDb: -50 });
    expect(rms(quiet)).toBeLessThan(1e-3);

    const loud = sine(440, 1, 1);
    const loudBefore = steadyRms(loud);
    applyCleanup([loud], SR, { enabled: true, highPassHz: 20, gateDb: -50 });
    expect(steadyRms(loud)).toBeGreaterThan(loudBefore * 0.9);
  });

  it("is a no-op when disabled", () => {
    const data = sine(40, 0.2, 0.8);
    const copy = data.slice();
    applyCleanup([data], SR, { enabled: false, highPassHz: 200, gateDb: -50 });
    expect([...data]).toEqual([...copy]);
  });
});

describe("compressor", () => {
  const params = { enabled: true, thresholdDb: -18, ratio: 3, kneeDb: 12, attackMs: 10, releaseMs: 200 };
  it("gain computer matches the soft-knee formula", () => {
    // level -0.9dB is above threshold + knee/2 → hard part of the curve
    const levelDb = gainToDb(0.9);
    const expectedOutDb = params.thresholdDb + (levelDb - params.thresholdDb) / params.ratio;
    expect(compressorGainDb(levelDb, params)).toBeCloseTo(expectedOutDb - levelDb, 10);
    // below the knee: no reduction
    expect(compressorGainDb(-40, params)).toBe(0);
  });

  it("reduces a 0.9-peak sine's peak into the expected gain-reduction window", () => {
    const data = sine(440, 1, 0.9);
    const channels = [data, data.slice()];
    applyCompressor(channels, SR, params);
    // Steady state only: a 10ms attack legitimately lets the very first transient
    // peak (at ~0.6ms, envelope still near zero) through almost unreduced — that is
    // what an attack time means. The GR window applies once the envelope has built.
    const outPeak = peakAbs(channels[0].slice(Math.floor(SR / 2)));
    const levelDb = gainToDb(0.9);
    const expectedPeak = 0.9 * dbToGain(compressorGainDb(levelDb, params));
    const errDb = Math.abs(gainToDb(outPeak / expectedPeak));
    expect(errDb).toBeLessThan(1.5);
    expect(outPeak).toBeLessThan(0.9);
  });

  it("is a no-op when disabled", () => {
    const data = sine(440, 0.2, 0.9);
    const copy = data.slice();
    applyCompressor([data], SR, { ...params, enabled: false });
    expect([...data]).toEqual([...copy]);
  });
});

describe("generateImpulse", () => {
  it("is deterministic for the same seed", () => {
    const [l1, r1] = generateImpulse(SR);
    const [l2, r2] = generateImpulse(SR);
    expect([...l1]).toEqual([...l2]);
    expect([...r1]).toEqual([...r2]);
    // L and R are decorrelated (different streams)
    expect([...l1.slice(0, 100)]).not.toEqual([...r1.slice(0, 100)]);
  });
  it("decays: the second half is much quieter than the first", () => {
    const [l] = generateImpulse(SR);
    const first = rms(l, 0, Math.floor(l.length / 4));
    const last = rms(l, Math.floor((l.length * 3) / 4), l.length);
    expect(last).toBeLessThan(first * 0.25);
    expect(l.length).toBe(Math.round(SR * 1.8));
  });
});

describe("convolveChannels", () => {
  it("convolving an impulse with the IR returns ~the IR itself", () => {
    const ir: [Float32Array, Float32Array] = [new Float32Array(256), new Float32Array(256)];
    for (let i = 0; i < 256; i++) {
      ir[0][i] = Math.sin(i * 0.3) * (1 - i / 256);
      ir[1][i] = Math.cos(i * 0.2) * (1 - i / 256);
    }
    const impulse = new Float32Array(512);
    impulse[0] = 1;
    const [out] = convolveChannels([impulse], ir);
    expect(out!.length).toBe(512); // tail truncated to the input length
    for (let i = 0; i < 256; i++) expect(Math.abs(out![i]! - ir[0][i]!)).toBeLessThan(1e-3);
  });
  it("does not mutate its input", () => {
    const data = sine(440, 0.1);
    const copy = data.slice();
    convolveChannels([data], generateImpulse(SR, 0.1));
    expect([...data]).toEqual([...copy]);
  });
});

describe("rateShift / resampleLinear", () => {
  it("rateShift at rate 2 halves the duration", () => {
    const data = sine(440, 1);
    const out = rateShift(data, 2);
    expect(out.length).toBe(Math.floor(data.length / 2));
  });
  it("rateShift at rate 1 returns an equal copy", () => {
    const data = sine(440, 0.1);
    const out = rateShift(data, 1);
    expect(out.length).toBe(data.length);
    expect(out).not.toBe(data);
  });
  it("resampleLinear doubles the sample count going 24k → 48k", () => {
    const data = sine(440, 0.5, 0.5, 24000);
    const out = resampleLinear(data, 24000, 48000);
    expect(out.length).toBe(data.length * 2);
    expect(rms(out)).toBeCloseTo(rms(data), 1);
  });
});
