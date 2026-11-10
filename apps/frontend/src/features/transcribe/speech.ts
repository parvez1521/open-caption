/**
 * Speech-only windows for Whisper. A light energy-based voice-activity pass finds where someone is talking; the
 * speech is packed into windows of up to ~28 s with the silence between segments dropped (Whisper's cost is per
 * window, so a clip with pauses, intros or music beds needs fewer windows) and a piecewise map puts every word
 * timestamp back on the original clock. Pure functions: no DOM, unit-tested.
 */

export const SR = 16_000;
export const WINDOW_S = 28;
/** The very first window is short so the first captions appear after seconds, not after a full 28 s window. */
export const FIRST_WINDOW_S = 10;
const FRAME = Math.round(SR * 0.03);
const PAD_S = 0.2;
const JOIN_GAP_S = 0.4; // gaps shorter than this are part of the same sentence
const MAX_JOIN_S = 2; // never pack segments further apart than this into one window
const GLUE_S = 0.1; // silence inserted between packed segments so Whisper hears a boundary

export interface Seg { start: number; end: number } // sample indices on the original clock
export interface Piece { packedStart: number; packedEnd: number; origStart: number }
export interface PackedWindow { pieces: Piece[]; samples: number; origStart: number; origEnd: number }

const frameRms = (a: Float32Array, s: number, e: number) => {
  let sum = 0;
  for (let i = s; i < e; i++) sum += a[i]! * a[i]!;
  return Math.sqrt(sum / Math.max(1, e - s));
};

/** Speech segments: frames above an adaptive noise floor, bridged over short gaps, padded, ignoring blips. */
export function detectSpeech(audio: Float32Array): Seg[] {
  const n = Math.floor(audio.length / FRAME);
  if (!n) return [];
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) e[i] = frameRms(audio, i * FRAME, (i + 1) * FRAME);
  const sorted = Float32Array.from(e).sort();
  const floor = sorted[Math.floor(n * 0.1)]!;
  const peak = sorted[Math.floor(n * 0.98)]!;
  if (peak < 0.004) return []; // near-silence: nothing to say, and Whisper would invent text
  const thr = Math.max(0.0035, Math.min(floor * 3.5, peak * 0.3), peak * 0.06); // continuous speech has no quiet floor: cap it
  const hang = Math.round(0.3 / 0.03);
  const raw: Seg[] = [];
  let start = -1, quiet = 0;
  for (let i = 0; i < n; i++) {
    if (e[i]! >= thr) {
      if (start < 0) start = i;
      quiet = 0;
    } else if (start >= 0 && ++quiet > hang) {
      raw.push({ start: start * FRAME, end: (i - quiet + 1) * FRAME });
      start = -1;
    }
  }
  if (start >= 0) raw.push({ start: start * FRAME, end: n * FRAME });
  // drop clicks shorter than 150 ms, bridge short gaps, then pad (never past the neighbour's midpoint)
  const kept = raw.filter((s) => s.end - s.start >= SR * 0.15);
  const merged: Seg[] = [];
  for (const s of kept) {
    const last = merged[merged.length - 1];
    if (last && s.start - last.end < SR * JOIN_GAP_S) last.end = s.end;
    else merged.push({ ...s });
  }
  return merged.map((s, i) => ({
    start: Math.max(i ? Math.floor((merged[i - 1]!.end + s.start) / 2) : 0, s.start - PAD_S * SR),
    end: Math.min(i < merged.length - 1 ? Math.ceil((s.end + merged[i + 1]!.start) / 2) : audio.length, s.end + PAD_S * SR),
  }));
}

/** Cut a too-long segment at its quietest 50 ms near each 28 s boundary. */
function splitLong(audio: Float32Array, seg: Seg, firstCapS = WINDOW_S): Seg[] {
  const out: Seg[] = [];
  let start = seg.start;
  let cap = firstCapS;
  while (seg.end - start > cap * SR) {
    const nominal = start + cap * SR;
    cap = WINDOW_S;
    const from = Math.max(start + SR * Math.min(10, firstCapS * 0.6), nominal - 2.5 * SR);
    const step = SR * 0.05;
    let best = nominal, bestE = Infinity;
    for (let i = from; i + step <= nominal; i += step) {
      const en = frameRms(audio, Math.round(i), Math.round(i + step));
      if (en < bestE) { bestE = en; best = i + step / 2; }
    }
    out.push({ start, end: Math.round(best) });
    start = Math.round(best);
  }
  out.push({ start, end: seg.end });
  return out;
}

/** Group speech into windows of up to WINDOW_S seconds of packed audio. */
export function planWindows(audio: Float32Array, segs: Seg[] = detectSpeech(audio), fromSample = 0, shortFirst = true): PackedWindow[] {
  const wins: PackedWindow[] = [];
  let cur: PackedWindow | null = null;
  const glue = Math.round(GLUE_S * SR);
  // continue after audio that was already captioned: clip speech to start at `fromSample`
  const todo = segs.map((s) => ({ start: Math.max(s.start, fromSample), end: s.end })).filter((s) => s.end - s.start >= SR * 0.15);
  const pieces = todo.flatMap((s, i) => splitLong(audio, s, shortFirst && i === 0 ? FIRST_WINDOW_S : WINDOW_S));
  for (const seg of pieces) {
    const len = seg.end - seg.start;
    const cap = (shortFirst && wins.length === 1 ? FIRST_WINDOW_S : WINDOW_S) * SR;
    const needsNew = !cur || cur.samples + glue + len > cap || seg.start - cur.origEnd > MAX_JOIN_S * SR;
    if (needsNew) {
      cur = { pieces: [], samples: 0, origStart: seg.start, origEnd: seg.start };
      wins.push(cur);
    }
    const w = cur!;
    if (w.pieces.length) w.samples += glue;
    w.pieces.push({ packedStart: w.samples, packedEnd: w.samples + len, origStart: seg.start });
    w.samples += len;
    w.origEnd = seg.end;
  }
  return wins;
}

/**
 * Places decoded audio samples on the MEDIA clock before anything else sees them.
 *
 * A decoded sample carries a presentation timestamp (seconds, can be negative for codec priming), and the
 * decoded stream is NOT guaranteed to start at 0 or to be gapless: phone recordings and screen captures
 * often start their audio a few hundred ms into the container, edited clips have holes, and AAC priming
 * samples sit before t=0. Concatenating decoded PCM as if it started at 0 (what this pipeline used to do)
 * shifts EVERY word timestamp by that start offset, and collapses every mid-stream gap so everything after
 * it lands early too — the "captions are a bit off, more so later" bug. The aligner inserts silence for
 * gaps/offsets and trims priming overlap, so sample N of the output is media time N / sampleRate.
 */
export class TimelineAligner {
  private nextPos = 0; // source-rate frame index where the next sample belongs on the media clock

  constructor(private readonly sampleRate: number) {}

  /** Append one decoded sample; returns the PCM to append to the stream (silence-padded or head-trimmed). */
  align(timestampSec: number, mono: Float32Array): Float32Array {
    const frames = mono.length;
    if (!Number.isFinite(timestampSec)) {
      this.nextPos += frames;
      return mono;
    }
    const start = Math.round(timestampSec * this.sampleRate);
    if (start >= this.nextPos) {
      const gap = start - this.nextPos;
      this.nextPos = start + frames;
      if (!gap) return mono;
      const out = new Float32Array(gap + frames);
      out.set(mono, gap);
      return out;
    }
    // the sample starts before the current position: codec priming or overlap — keep only the part at/after it
    const skip = this.nextPos - start;
    if (skip >= frames) return new Float32Array(0);
    this.nextPos += frames - skip;
    return mono.subarray(skip);
  }

  /** Media-clock position (seconds) the stream has been filled up to. */
  get positionSec(): number {
    return this.nextPos / this.sampleRate;
  }
}

/** The packed samples for a window (zero glue between segments). */
export function renderWindow(audio: Float32Array, w: PackedWindow): Float32Array {
  const out = new Float32Array(w.samples);
  for (const p of w.pieces) out.set(audio.subarray(p.origStart, p.origStart + (p.packedEnd - p.packedStart)), p.packedStart);
  return out;
}

/** Packed time (seconds into the window) -> original clip time (seconds). Times in glue snap to the nearest piece edge. */
export function toOriginalSeconds(w: PackedWindow, packedSec: number): number {
  const t = packedSec * SR;
  const ps = w.pieces;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]!;
    if (t <= p.packedEnd) {
      if (t >= p.packedStart) return (p.origStart + (t - p.packedStart)) / SR;
      const prev = ps[i - 1];
      const toPrev = prev ? t - prev.packedEnd : Infinity;
      return prev && toPrev < p.packedStart - t ? (prev.origStart + (prev.packedEnd - prev.packedStart)) / SR : p.origStart / SR;
    }
  }
  const last = ps[ps.length - 1]!;
  return (last.origStart + (last.packedEnd - last.packedStart)) / SR;
}

/** Longest looping phrase (in words) that is searched for. */
const MAX_LOOP_WORDS = 16;

/**
 * Whisper sometimes loops on music or silence and writes the same phrase over and over, with the words crammed into a
 * fraction of a second (these are the "duplicate captions stacked on top of each other"). Short loops keep two copies
 * (>= 4 times for one word, >= 3 times for 2-4 words; ordinary speech like "no, no" is untouched). A phrase of 5+ words
 * that repeats back to back 3+ times is a loop for certain: one copy is kept, and so is nothing of a cut-off last copy.
 */
export function dropRepeatedRuns<T extends { text: string }>(words: T[]): T[] {
  // keep \p{M} (combining marks): Devanagari vowel signs are marks, and stripping them would make distinct Hindi
  // words ("काल" vs "कल") compare equal, so real repetition could be misread as a Whisper loop.
  const norm = words.map((w) => w.text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ""));
  const drop = new Set<number>();
  // long phrases first, so a loop is judged as a whole and not as repeats of a piece of it
  const sizes = [...Array.from({ length: MAX_LOOP_WORDS - 4 }, (_, k) => MAX_LOOP_WORDS - k), 1, 2, 3, 4];
  for (const n of sizes) {
    const need = n === 1 ? 4 : 3;
    const long = n >= 5;
    for (let i = 0; i + n * need <= words.length; ) {
      let reps = 1;
      while (i + (reps + 1) * n <= words.length && sameRun(norm, i, i + reps * n, n)) reps++;
      if (reps >= need) {
        const keep = long ? 1 : 2;
        for (let j = i + keep * n; j < i + reps * n; j++) drop.add(j);
        if (long) {
          // a last copy that was cut off mid-phrase is part of the same loop
          const tail = i + reps * n;
          let k = 0;
          while (k < n - 1 && tail + k < words.length && norm[tail + k] && norm[tail + k] === norm[i + k]) k++;
          if (k >= Math.ceil(n / 2)) for (let j = 0; j < k; j++) drop.add(tail + j);
          i = tail + k;
        } else i += reps * n;
      } else i++;
    }
  }
  return drop.size ? words.filter((_, i) => !drop.has(i)) : words;
}

function sameRun(norm: string[], a: number, b: number, n: number) {
  for (let k = 0; k < n; k++) if (!norm[a + k] || norm[a + k] !== norm[b + k]) return false;
  return true;
}

/**
 * Whisper's word alignment sometimes stretches a window's last word over the silence (or padding) after it, so the
 * caption would hang on screen. A word never lasts longer than a slow speaker needs for it, nor past the audio.
 */
export function capWordEnd(text: string, start: number, end: number, audioSec: number): number {
  const longest = 0.6 + 0.12 * text.trim().length;
  return Math.max(start + 0.05, Math.min(end, start + longest, audioSec));
}

/**
 * Is the decoder stuck in a loop? True when the newest tokens are one short phrase said over and over (a phrase of
 * 3+ tokens three times, 2 tokens four times, or one token eight times). Real speech repeats a word or two ("aur aur
 * roya"), never this. Checked after every generated token, so a loop is cut off at once instead of filling the window's
 * whole token budget; dropRepeatedRuns then removes the copies that were written.
 */
export function isLooping(ids: ArrayLike<number | bigint>, maxPhrase = 20): boolean {
  const n = ids.length;
  for (let k = 1; k <= maxPhrase; k++) {
    const reps = k === 1 ? 8 : k === 2 ? 4 : 3;
    if (k * reps > n) break;
    let same = true;
    for (let i = 1; i < reps && same; i++) {
      for (let j = 0; j < k; j++) {
        if (ids[n - 1 - j] != ids[n - 1 - j - i * k]) { same = false; break; }
      }
    }
    if (same) return true;
  }
  return false;
}
