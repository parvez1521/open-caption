/**
 * mixMath — pure level / fade / peak / ducking maths for the audio mix (Phase 4 Run 3, 4.8).
 *
 * ONE mix definition, several consumers: the export mixdown (mixdown.ts) and the preview
 * Web Audio graph (another worker) both compute fades, peaks and ducking envelopes from
 * these exact functions, so a mix sounds the same in preview and in the exported file.
 * No DOM, no Web Audio, no Mediabunny — plain numbers and Float32Arrays only.
 */

/** Hop size (ms) at which peaks and ducking envelopes are computed. 10 ms at 48 kHz = 480 samples. */
export const MIX_HOP_MS = 10;

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Decibels → linear gain multiplier. */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** Linear gain multiplier → decibels. gain <= 0 maps to -Infinity. */
export function gainToDb(gain: number): number {
  return gain > 0 ? 20 * Math.log10(gain) : -Infinity;
}

/**
 * Instantaneous gain of a clip at a clip-local time.
 *
 * `clip.volume` is the clip's overall gain; the fades are LINEAR ramps:
 * fade-in contributes clamp01(localMs / fadeInMs) (1 when fadeInMs is 0) and fade-out
 * contributes clamp01((durationMs - localMs) / fadeOutMs) (1 when fadeOutMs is 0).
 * `localMs` is clip-local timeline time (0 at the clip's first timeline sample).
 */
export function fadeGainAt(
  clip: { volume: number; fadeInMs: number; fadeOutMs: number },
  localMs: number,
  durationMs: number,
): number {
  const fadeIn = clip.fadeInMs > 0 ? clamp01(localMs / clip.fadeInMs) : 1;
  const fadeOut = clip.fadeOutMs > 0 ? clamp01((durationMs - localMs) / clip.fadeOutMs) : 1;
  return clip.volume * fadeIn * fadeOut;
}

/**
 * Absolute peaks (max across channels) per hop.
 * Length = ceil(totalSamples / samplesPerHop), where totalSamples is the longest
 * channel's length and samplesPerHop = round(sampleRate * hopMs / 1000) (min 1).
 * Empty input → empty result.
 */
export function peaksFromChannels(
  channels: Float32Array[],
  sampleRate: number,
  hopMs: number = MIX_HOP_MS,
): Float32Array {
  const totalSamples = channels.reduce((m, ch) => Math.max(m, ch.length), 0);
  if (totalSamples === 0 || !(sampleRate > 0)) return new Float32Array(0);
  const samplesPerHop = Math.max(1, Math.round((sampleRate * hopMs) / 1000));
  const hops = Math.ceil(totalSamples / samplesPerHop);
  const out = new Float32Array(hops);
  for (let h = 0; h < hops; h++) {
    const start = h * samplesPerHop;
    const end = Math.min(totalSamples, start + samplesPerHop);
    let peak = 0;
    for (const ch of channels) {
      const lim = Math.min(ch.length, end);
      for (let i = start; i < lim; i++) {
        const a = Math.abs(ch[i]!);
        if (a > peak) peak = a;
      }
    }
    out[h] = peak;
  }
  return out;
}

/**
 * Ducking gain envelope, one gain multiplier per hop.
 *
 * Per hop the target is dbToGain(-amountDb) when the voice peak exceeds
 * dbToGain(thresholdDb), else 1. The state starts at 1 (no ducking) and moves toward
 * the target with a one-pole smoother: coeff = 1 - exp(-hopMs / tauMs), using the
 * attack tau (default 10 ms) when the target is BELOW the state (ducking down) and
 * the release tau (default 250 ms) otherwise (recovering).
 */
export function duckEnvelope(
  voicePeaks: Float32Array,
  opts: { thresholdDb: number; amountDb: number; attackMs?: number; releaseMs?: number },
  hopMs: number = MIX_HOP_MS,
): Float32Array {
  const threshold = dbToGain(opts.thresholdDb);
  const duckGain = dbToGain(-Math.abs(opts.amountDb));
  const attackMs = opts.attackMs ?? 10;
  const releaseMs = opts.releaseMs ?? 250;
  const attackCoeff = attackMs > 0 ? 1 - Math.exp(-hopMs / attackMs) : 1;
  const releaseCoeff = releaseMs > 0 ? 1 - Math.exp(-hopMs / releaseMs) : 1;
  const out = new Float32Array(voicePeaks.length);
  let state = 1;
  for (let i = 0; i < voicePeaks.length; i++) {
    const target = voicePeaks[i]! > threshold ? duckGain : 1;
    const coeff = target < state ? attackCoeff : releaseCoeff;
    state += coeff * (target - state);
    out[i] = state;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Bleeps (Phase 5, A6): range mute + synthesised tone                 */
/* ------------------------------------------------------------------ */

/** The minimal bleep shape the mix maths reads — the shared `AudioBleep` satisfies it. */
export interface BleepRange {
  startMs: number;
  endMs: number;
  toneHz: number;
  level: number;
}

/** Edge ramp of the bleep tone, ms: long enough to avoid a click, short enough
 *  that a short word still gets a clear tone. Applied symmetrically. */
export const BLEEP_EDGE_MS = 5;

/** The bleep active at a project-timeline instant, or null. Ranges are [startMs, endMs). */
export function bleepAt(bleeps: readonly BleepRange[], timelineMs: number): BleepRange | null {
  for (const b of bleeps) {
    if (timelineMs >= b.startMs && timelineMs < b.endMs) return b;
  }
  return null;
}

/**
 * Gain of the SOURCE audio at a project-timeline instant under the bleeps:
 * exactly 0 inside an approved bleep range, exactly 1 outside — a hard mute,
 * so the original signal inside a bleep is fully suppressed, not ducked.
 */
export function bleepMuteGain(bleeps: readonly BleepRange[], timelineMs: number): number {
  return bleepAt(bleeps, timelineMs) ? 0 : 1;
}

/**
 * One sample of the synthesised bleep tone at a project-timeline instant:
 * `level * sin(2π · toneHz · t)` with t measured from the range START (so the
 * tone always starts at a zero crossing), shaped by a linear BLEEP_EDGE_MS
 * ramp in and out. 0 outside the range. Both mix consumers — the export
 * mixdown and the preview graph — generate the tone from THIS function, so
 * the tone is sample-identical between preview and export.
 */
export function bleepToneSample(bleep: BleepRange, timelineMs: number): number {
  const localMs = timelineMs - bleep.startMs;
  const durationMs = bleep.endMs - bleep.startMs;
  if (localMs < 0 || localMs >= durationMs || !(durationMs > 0)) return 0;
  const edge = Math.min(BLEEP_EDGE_MS, durationMs / 2);
  const ramp = edge > 0 ? Math.min(1, localMs / edge, (durationMs - localMs) / edge) : 1;
  return bleep.level * ramp * Math.sin((2 * Math.PI * bleep.toneHz * localMs) / 1000);
}

/**
 * Max-combine several placed peak trains onto one zeroed timeline of `totalHops` hops.
 * Each entry contributes its peaks starting at `startHop`; overlapping regions take
 * the maximum, and anything placed past the end is clipped.
 */
export function combineVoicePeaks(
  list: { peaks: Float32Array; startHop: number }[],
  totalHops: number,
): Float32Array {
  const out = new Float32Array(Math.max(0, totalHops));
  for (const entry of list) {
    const start = Math.max(0, Math.round(entry.startHop));
    for (let i = 0; i < entry.peaks.length; i++) {
      const at = start + i;
      if (at >= out.length) break;
      const v = entry.peaks[i]!;
      if (v > out[at]!) out[at] = v;
    }
  }
  return out;
}
