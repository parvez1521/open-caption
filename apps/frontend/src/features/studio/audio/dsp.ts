/**
 * dsp — pure digital signal processing for the audio mix (Phase 4 Run 3, 4.8).
 *
 * Conventions (consistent across the module):
 * - `apply*` functions (applyBiquad / applyEq / applyCleanup / applyCompressor and
 *   Biquad.process) MUTATE the channel arrays in place and return void.
 * - `generateImpulse`, `convolveChannels`, `resampleLinear` and `rateShift` RETURN
 *   new arrays and never mutate their inputs (convolution cannot run in place).
 * - Channels are independent Float32Array lanes of equal length (stereo in practice).
 * Everything is plain typed-array maths — no DOM, no Web Audio — so the preview graph
 * and the export mixdown produce bit-identical processing from the same params.
 */
import type { AudioCleanup, AudioEq, AudioMaster } from "@capseasy/shared";
import { dbToGain, gainToDb } from "./mixMath";

/* ------------------------------------------------------------------ */
/* Biquads (RBJ Audio EQ Cookbook, a0-normalised)                      */
/* ------------------------------------------------------------------ */

export type BiquadKind = "lowshelf" | "peaking" | "highshelf" | "highpass";

export interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** Fixed EQ band constants of the mix engine (shared with settings.ts documentation). */
export const EQ_LOW = { kind: "lowshelf", freqHz: 200, q: 0.707 } as const;
export const EQ_MID = { kind: "peaking", freqHz: 1000, q: 1 } as const;
export const EQ_HIGH = { kind: "highshelf", freqHz: 4000, q: 0.707 } as const;

/**
 * RBJ cookbook coefficients for one biquad, normalised by a0 (so the returned shape
 * carries a1/a2 only). `gainDb` is ignored by the highpass kind.
 */
export function biquadCoefficients(
  kind: BiquadKind,
  freqHz: number,
  q: number,
  gainDb: number,
  sampleRate: number,
): BiquadCoefficients {
  const w0 = (2 * Math.PI * freqHz) / sampleRate;
  const cosW = Math.cos(w0);
  const sinW = Math.sin(w0);
  const alpha = sinW / (2 * Math.max(0.0001, q));
  const A = Math.pow(10, gainDb / 40);
  let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
  switch (kind) {
    case "peaking": {
      b0 = 1 + alpha * A;
      b1 = -2 * cosW;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cosW;
      a2 = 1 - alpha / A;
      break;
    }
    case "lowshelf": {
      const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cosW + twoSqrtAAlpha);
      b1 = 2 * A * ((A - 1) - (A + 1) * cosW);
      b2 = A * ((A + 1) - (A - 1) * cosW - twoSqrtAAlpha);
      a0 = (A + 1) + (A - 1) * cosW + twoSqrtAAlpha;
      a1 = -2 * ((A - 1) + (A + 1) * cosW);
      a2 = (A + 1) + (A - 1) * cosW - twoSqrtAAlpha;
      break;
    }
    case "highshelf": {
      const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cosW + twoSqrtAAlpha);
      b1 = -2 * A * ((A - 1) + (A + 1) * cosW);
      b2 = A * ((A + 1) - (A - 1) * cosW - twoSqrtAAlpha);
      a0 = (A + 1) - (A - 1) * cosW + twoSqrtAAlpha;
      a1 = 2 * ((A - 1) - (A + 1) * cosW);
      a2 = (A + 1) - (A - 1) * cosW - twoSqrtAAlpha;
      break;
    }
    case "highpass": {
      b0 = (1 + cosW) / 2;
      b1 = -(1 + cosW);
      b2 = (1 + cosW) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW;
      a2 = 1 - alpha;
      break;
    }
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** One biquad filter with per-instance state (Direct Form I), processing in place. */
export class Biquad {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  constructor(private readonly coeffs: BiquadCoefficients) {}
  process(data: Float32Array): void {
    const { b0, b1, b2, a1, a2 } = this.coeffs;
    let { x1, x2, y1, y2 } = this;
    for (let i = 0; i < data.length; i++) {
      const x = data[i]!;
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      data[i] = y;
      x2 = x1; x1 = x;
      y2 = y1; y1 = y;
    }
    this.x1 = x1; this.x2 = x2; this.y1 = y1; this.y2 = y2;
  }
}

/** Run one biquad (fresh state per channel) over every channel, in place. */
export function applyBiquad(channels: Float32Array[], coeffs: BiquadCoefficients): void {
  for (const ch of channels) new Biquad(coeffs).process(ch);
}

/** 3-band EQ: low shelf → mid peak → high shelf, in place. Bands at 0 dB are skipped. */
export function applyEq(channels: Float32Array[], sampleRate: number, eq: AudioEq): void {
  if (eq.lowDb !== 0) applyBiquad(channels, biquadCoefficients(EQ_LOW.kind, EQ_LOW.freqHz, EQ_LOW.q, eq.lowDb, sampleRate));
  if (eq.midDb !== 0) applyBiquad(channels, biquadCoefficients(EQ_MID.kind, EQ_MID.freqHz, EQ_MID.q, eq.midDb, sampleRate));
  if (eq.highDb !== 0) applyBiquad(channels, biquadCoefficients(EQ_HIGH.kind, EQ_HIGH.freqHz, EQ_HIGH.q, eq.highDb, sampleRate));
}

/* ------------------------------------------------------------------ */
/* Cleanup: high-pass + noise gate                                     */
/* ------------------------------------------------------------------ */

/**
 * Basic cleanup, in place. No-op when `cleanup.enabled` is false.
 * 1. High-pass biquad at `highPassHz` (Q 0.707) removes rumble.
 * 2. Noise gate: per sample, the peak (max-abs across channels) is compared with
 *    dbToGain(gateDb); the gate gain's target is 1 at/above threshold, else 0, and
 *    the gain is smoothed toward the target with a 1 ms attack (opening) / 150 ms
 *    release (closing) one-pole, then applied to every channel. The gate starts
 *    closed (gain 0). This silences a track between phrases — it is NOT noise
 *    removal and is never labelled as such.
 */
export function applyCleanup(channels: Float32Array[], sampleRate: number, cleanup: AudioCleanup): void {
  if (!cleanup.enabled || channels.length === 0) return;
  applyBiquad(channels, biquadCoefficients("highpass", cleanup.highPassHz, 0.707, 0, sampleRate));
  const threshold = dbToGain(cleanup.gateDb);
  const attackCoeff = 1 - Math.exp(-1 / (0.001 * sampleRate));
  const releaseCoeff = 1 - Math.exp(-1 / (0.15 * sampleRate));
  const length = channels.reduce((m, ch) => Math.max(m, ch.length), 0);
  let gain = 0;
  for (let i = 0; i < length; i++) {
    let peak = 0;
    for (const ch of channels) {
      if (i < ch.length) peak = Math.max(peak, Math.abs(ch[i]!));
    }
    const target = peak >= threshold ? 1 : 0;
    gain += (target > gain ? attackCoeff : releaseCoeff) * (target - gain);
    for (const ch of channels) {
      if (i < ch.length) ch[i] = ch[i]! * gain;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Master compressor                                                   */
/* ------------------------------------------------------------------ */

/**
 * Holds the compressor's detector envelope across a buffer. Exported as a class so
 * the state machine is testable/inspectable; applyCompressor uses one instance per call.
 */
export class CompressorState {
  envelope = 0;
  constructor(
    private readonly sampleRate: number,
    private readonly attackCoeff: number,
    private readonly releaseCoeff: number,
  ) {}
  static forParams(sampleRate: number, params: AudioMaster["compressor"]): CompressorState {
    const coeff = (ms: number) => (ms > 0 ? 1 - Math.exp(-1 / ((ms / 1000) * sampleRate)) : 1);
    return new CompressorState(sampleRate, coeff(params.attackMs), coeff(params.releaseMs));
  }
  /** Advance the peak envelope by one sample's cross-channel peak; returns the envelope. */
  advance(peak: number): number {
    const coeff = peak > this.envelope ? this.attackCoeff : this.releaseCoeff;
    this.envelope += coeff * (peak - this.envelope);
    return this.envelope;
  }
  get sampleRateValue(): number {
    return this.sampleRate;
  }
}

/** Soft-knee gain reduction (dB, <= 0) for a detector level in dB. Exported for tests. */
export function compressorGainDb(levelDb: number, params: AudioMaster["compressor"]): number {
  const x = levelDb - params.thresholdDb;
  const knee = params.kneeDb;
  const ratio = Math.max(1, params.ratio);
  let outDb: number;
  if (knee > 0 && x > -knee / 2 && x < knee / 2) {
    // inside the knee: quadratic interpolation between unity and the compressed slope
    outDb = levelDb + ((1 / ratio - 1) * Math.pow(x + knee / 2, 2)) / (2 * knee);
  } else if (x >= knee / 2) {
    outDb = params.thresholdDb + x / ratio;
  } else {
    outDb = levelDb;
  }
  return Math.min(0, outDb - levelDb);
}

/**
 * Feed-forward master compressor, in place. No-op when disabled.
 *
 * Simplification (documented): ONE smoothed peak envelope (attack/release one-pole
 * over the per-sample max-abs across channels) serves as BOTH the detector and the
 * gain smoothing — there is no separate gain-reduction smoother. The gain computer
 * is the standard soft-knee formula (see compressorGainDb) applied to the envelope
 * level, and the resulting gain is applied to every channel at that sample.
 */
export function applyCompressor(
  channels: Float32Array[],
  sampleRate: number,
  params: AudioMaster["compressor"],
): void {
  if (!params.enabled || channels.length === 0) return;
  const state = CompressorState.forParams(sampleRate, params);
  const length = channels.reduce((m, ch) => Math.max(m, ch.length), 0);
  for (let i = 0; i < length; i++) {
    let peak = 0;
    for (const ch of channels) {
      if (i < ch.length) peak = Math.max(peak, Math.abs(ch[i]!));
    }
    const env = state.advance(peak);
    const gain = env > 0 ? dbToGain(compressorGainDb(gainToDb(env), params)) : 1;
    if (gain !== 1) {
      for (const ch of channels) {
        if (i < ch.length) ch[i] = ch[i]! * gain;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Generated impulse response (reverb)                                 */
/* ------------------------------------------------------------------ */

/** mulberry32 PRNG — deterministic across engines for a given seed. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A generated stereo impulse response for the convolver reverb: white noise shaped
 * by (1 - t/T)^decay, `seconds` long, from a seeded PRNG (default seed 1337) so the
 * preview and the export use the IDENTICAL impulse. Left is generated first; the
 * right channel continues the same PRNG stream, so the two are decorrelated.
 * This is a synthetic decay burst — never a recorded room.
 */
export function generateImpulse(
  sampleRate: number,
  seconds = 1.8,
  decay = 3.0,
  seed = 1337,
): [Float32Array, Float32Array] {
  const length = Math.max(1, Math.round(sampleRate * seconds));
  const rand = mulberry32(seed);
  const make = (): Float32Array => {
    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      out[i] = (rand() * 2 - 1) * Math.pow(1 - t, decay);
    }
    return out;
  };
  return [make(), make()];
}

/* ------------------------------------------------------------------ */
/* FFT convolution (overlap-add)                                       */
/* ------------------------------------------------------------------ */

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** In-place iterative radix-2 FFT. `inverse` scales by 1/n. Lengths must be powers of two. */
function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let size = 2; size <= n; size *= 2) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / size;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    const half = size / 2;
    for (let base = 0; base < n; base += size) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < half; k++) {
        const a = base + k;
        const b = a + half;
        const tRe = curRe * re[b]! - curIm * im[b]!;
        const tIm = curRe * im[b]! + curIm * re[b]!;
        re[b] = re[a]! - tRe;
        im[b] = im[a]! - tIm;
        re[a] = re[a]! + tRe;
        im[a] = im[a]! + tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] = re[i]! / n;
      im[i] = im[i]! / n;
    }
  }
}

/** Full linear convolution of one channel with one IR via one FFT block. */
function convolveOne(data: Float32Array, ir: Float32Array): Float32Array {
  const fullLength = data.length + ir.length - 1;
  const out = new Float32Array(Math.max(0, fullLength));
  if (data.length === 0 || ir.length === 0) return out.slice(0, data.length);
  const BLOCK = 4096;
  const fftSize = nextPow2(BLOCK + ir.length - 1);
  // Precompute the IR spectrum at this FFT size.
  const irRe = new Float64Array(fftSize);
  const irIm = new Float64Array(fftSize);
  for (let i = 0; i < ir.length; i++) irRe[i] = ir[i]!;
  fft(irRe, irIm, false);
  // Overlap-add over input blocks.
  for (let start = 0; start < data.length; start += BLOCK) {
    const blockLen = Math.min(BLOCK, data.length - start);
    const re = new Float64Array(fftSize);
    const im = new Float64Array(fftSize);
    for (let i = 0; i < blockLen; i++) re[i] = data[start + i]!;
    fft(re, im, false);
    for (let i = 0; i < fftSize; i++) {
      const aRe = re[i]!, aIm = im[i]!;
      re[i] = aRe * irRe[i]! - aIm * irIm[i]!;
      im[i] = aRe * irIm[i]! + aIm * irRe[i]!;
    }
    fft(re, im, true);
    const writeLen = blockLen + ir.length - 1;
    for (let i = 0; i < writeLen && start + i < out.length; i++) {
      out[start + i] = out[start + i]! + re[i]!;
    }
  }
  return out;
}

/**
 * Convolve every channel with the stereo impulse (channel i uses ir[i], falling back
 * to ir[0]), FFT-based overlap-add. RETURNS NEW arrays; inputs are untouched.
 * Output length = input length: the reverb tail past the end is TRUNCATED (documented
 * behaviour — tails are cut at the composition end / item end in the master sum).
 */
export function convolveChannels(
  channels: Float32Array[],
  ir: [Float32Array, Float32Array],
): Float32Array[] {
  return channels.map((ch, i) => {
    const kernel = ir[i] ?? ir[0]!;
    const full = convolveOne(ch, kernel);
    return full.slice(0, ch.length);
  });
}

/* ------------------------------------------------------------------ */
/* Resampling                                                          */
/* ------------------------------------------------------------------ */

/** Linear-interpolation resample to a new sample rate. Returns a new array. */
export function resampleLinear(data: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || data.length === 0) return data.slice();
  if (!(fromRate > 0) || !(toRate > 0)) throw new RangeError("resampleLinear: rates must be positive");
  const outLength = Math.max(1, Math.round((data.length * toRate) / fromRate));
  const out = new Float32Array(outLength);
  const step = fromRate / toRate;
  for (let i = 0; i < outLength; i++) {
    const pos = i * step;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = data[idx] ?? 0;
    const b = data[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/**
 * Playback-rate resample: output length = len / rate, sample i reads the input at
 * i * rate (linear interpolation). This DROPS pitch with rate, exactly like the
 * render paths' playbackRate behaviour (no pitch correction anywhere in the app).
 * Returns a new array.
 */
export function rateShift(data: Float32Array, rate: number): Float32Array {
  if (!(rate > 0)) throw new RangeError("rateShift: rate must be positive");
  if (rate === 1 || data.length === 0) return data.slice();
  const outLength = Math.max(1, Math.floor(data.length / rate));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * rate;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = data[idx] ?? 0;
    const b = data[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Measurement                                                         */
/* ------------------------------------------------------------------ */

/** Root-mean-square over [fromSample, toSample) (clamped to the data). 0 for an empty range. */
export function rms(data: Float32Array, fromSample = 0, toSample = data.length): number {
  const start = Math.max(0, Math.min(data.length, Math.floor(fromSample)));
  const end = Math.max(start, Math.min(data.length, Math.floor(toSample)));
  if (end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) sum += data[i]! * data[i]!;
  return Math.sqrt(sum / (end - start));
}

/** Peak absolute value. 0 for empty data. */
export function peakAbs(data: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]!);
    if (a > peak) peak = a;
  }
  return peak;
}
