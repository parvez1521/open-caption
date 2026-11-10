/**
 * Clipper real analysis — PURE cores (Phase 5, slice 5.3).
 *
 * Two deterministic measurements, no DOM / Web Audio / canvas in this file:
 *  1. Audio-energy silence detection over the existing waveform-peaks pipeline
 *     (`useWaveform`: normalised peaks, PEAKS_PER_SECOND = 50, so one peak per 20 ms hop).
 *  2. Scene-change detection by frame difference over sampled grayscale (luma) frames.
 *
 * Both are plain arithmetic on samples the browser already decoded — deterministic:
 * same samples in, same spans / cut points out, every time. Nothing here is a model,
 * and nothing here produces a quality or "virality" score.
 */

/** One low-energy span of the audio, in media milliseconds. */
export interface SilenceSpan {
  startMs: number;
  endMs: number;
  /** mean peak energy (0–1, on the normalised peaks scale) across the span */
  meanEnergy: number;
}

export interface SilenceOptions {
  /** peaks at or below this normalised energy count as silence (default 0.08) */
  threshold?: number;
  /** spans shorter than this are dropped — a breath is not a silence (default 400 ms) */
  minSilenceMs?: number;
}

export const SILENCE_THRESHOLD = 0.08;
export const SILENCE_MIN_MS = 400;

/**
 * Detect silence spans in a peaks array.
 *
 * `peaks[i]` covers the media interval [i*hopMs, (i+1)*hopMs). A maximal run of peaks
 * <= threshold whose duration reaches minSilenceMs becomes one span; meanEnergy is the
 * arithmetic mean of that run's peaks. Empty / all-loud input returns [].
 */
export function detectSilences(
  peaks: Float32Array,
  hopMs: number,
  opts: SilenceOptions = {},
): SilenceSpan[] {
  const threshold = opts.threshold ?? SILENCE_THRESHOLD;
  const minSilenceMs = opts.minSilenceMs ?? SILENCE_MIN_MS;
  if (!peaks.length || !(hopMs > 0)) return [];
  const spans: SilenceSpan[] = [];
  let runStart = -1;
  let runSum = 0;
  const flush = (endIdx: number) => {
    if (runStart < 0) return;
    const startMs = Math.round(runStart * hopMs);
    const endMs = Math.round(endIdx * hopMs);
    if (endMs - startMs >= minSilenceMs) {
      spans.push({ startMs, endMs, meanEnergy: runSum / (endIdx - runStart) });
    }
    runStart = -1;
    runSum = 0;
  };
  for (let i = 0; i < peaks.length; i++) {
    if (peaks[i]! <= threshold) {
      if (runStart < 0) runStart = i;
      runSum += peaks[i]!;
    } else {
      flush(i);
    }
  }
  flush(peaks.length);
  return spans;
}

/** One sampled video frame reduced to a grayscale luma plane. */
export interface LumaFrame {
  atMs: number;
  /** one byte (0–255) or float (0–1) per pixel; every frame in a batch must share a length */
  luma: Uint8Array | Float32Array;
}

/** Mean absolute per-pixel difference between one frame and its predecessor. */
export interface FrameDiff {
  /** timestamp of the LATER frame of the pair */
  atMs: number;
  /** 0–1: 0 = identical frames, 1 = every pixel flipped black↔white */
  score: number;
}

export interface SceneChange {
  atMs: number;
  /** the frame-difference score that crossed the threshold */
  score: number;
}

export const SCENE_DIFF_THRESHOLD = 0.35;

/**
 * Per-sample frame-difference scores. The scale is detected from the data: if any
 * value exceeds 1.5 the planes are treated as 0–255 bytes, otherwise as 0–1 floats.
 * Frame pairs with mismatched plane lengths are skipped (score 0 is never invented).
 */
export function frameDiffScores(frames: readonly LumaFrame[]): FrameDiff[] {
  if (frames.length < 2) return [];
  let scale = 1;
  outer: for (const f of frames) {
    for (let i = 0; i < f.luma.length; i++) {
      if (f.luma[i]! > 1.5) { scale = 255; break outer; }
    }
  }
  const out: FrameDiff[] = [];
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1]!.luma;
    const cur = frames[i]!.luma;
    if (prev.length === 0 || prev.length !== cur.length) continue;
    let sum = 0;
    for (let j = 0; j < cur.length; j++) sum += Math.abs(cur[j]! - prev[j]!);
    out.push({ atMs: frames[i]!.atMs, score: sum / cur.length / scale });
  }
  return out;
}

/** Cut points: the samples whose difference score reaches `threshold`, in time order. */
export function sceneCutPoints(diffs: readonly FrameDiff[], threshold: number = SCENE_DIFF_THRESHOLD): SceneChange[] {
  return diffs
    .filter((d) => d.score >= threshold)
    .map((d) => ({ atMs: d.atMs, score: d.score }))
    .sort((a, b) => a.atMs - b.atMs);
}

/** Convenience: frames in, { scores, cuts } out. */
export function detectSceneChanges(
  frames: readonly LumaFrame[],
  opts: { threshold?: number } = {},
): { scores: FrameDiff[]; cuts: SceneChange[] } {
  const scores = frameDiffScores(frames);
  return { scores, cuts: sceneCutPoints(scores, opts.threshold) };
}

/** The silence span covering `atMs`, if any (edges inclusive). */
export function silenceAt(spans: readonly SilenceSpan[], atMs: number): SilenceSpan | null {
  return spans.find((s) => atMs >= s.startMs && atMs <= s.endMs) ?? null;
}

/** Distance from `atMs` to the nearest edge (start or end) of any silence span; null when there are no spans. */
export function nearestSilenceEdgeMs(spans: readonly SilenceSpan[], atMs: number): number | null {
  let best: number | null = null;
  for (const s of spans) {
    for (const edge of [s.startMs, s.endMs]) {
      const d = Math.abs(edge - atMs);
      if (best === null || d < best) best = d;
    }
  }
  return best;
}

/** Distance from `atMs` to the nearest scene cut; null when there are no cuts. */
export function nearestSceneCutMs(cuts: readonly SceneChange[], atMs: number): number | null {
  let best: number | null = null;
  for (const c of cuts) {
    const d = Math.abs(c.atMs - atMs);
    if (best === null || d < best) best = d;
  }
  return best;
}
