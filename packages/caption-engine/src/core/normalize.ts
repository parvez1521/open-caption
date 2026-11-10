import { newId, type Word } from "@capseasy/shared";

export interface RawToken {
  text: string;
  startMs: number;
  endMs: number;
  confidence?: number | null;
}

export interface NormalizeOptions {
  /** clamp to media duration when known */
  durationMs?: number;
  minWordMs?: number;
  /** transliterate non-Latin tokens (Hinglish romanization fallback) */
  romanize?: (text: string) => string;
  /** custom vocabulary: replace case-insensitive matches with the canonical spelling */
  vocabulary?: string[];
}

const NOISE = /^\s*[\[(<*♪♫]+\s*(blank[_ ]?audio|music|silence|noise|applause|laughter|inaudible|no speech)?[^\])>*]*[\])>*♪♫]*\s*$/i;

/** whisper.cpp emits sub-word tokens ("Hel","lo") with leading spaces marking word starts. */
export function mergeSubwordTokens(tokens: RawToken[]): RawToken[] {
  const out: RawToken[] = [];
  for (const t of tokens) {
    const startsWord = /^\s/.test(t.text) || out.length === 0;
    const text = t.text.trim();
    if (!text) continue;
    const last = out[out.length - 1];
    if (!startsWord && last && !/[.!?।]$/.test(last.text)) {
      last.text += text;
      last.endMs = Math.max(last.endMs, t.endMs);
      if (t.confidence != null) last.confidence = Math.min(last.confidence ?? 1, t.confidence);
    } else {
      out.push({ ...t, text });
    }
  }
  return out;
}

/** Turn raw ASR tokens (whisper.cpp / Whisper JSON / anything) into clean, monotonic, id-stamped Words. */
export function normalizeTokens(input: RawToken[], opts: NormalizeOptions = {}): Word[] {
  const minMs = opts.minWordMs ?? 40;
  const vocab = new Map((opts.vocabulary ?? []).map((v) => [v.toLowerCase(), v]));

  const cleaned = input
    .map((t) => ({ ...t, text: t.text.replace(/\s+/g, " ") }))
    .filter((t) => t.text.trim() && !NOISE.test(t.text.trim()) && Number.isFinite(t.startMs) && Number.isFinite(t.endMs));

  cleaned.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const words: Word[] = [];
  let prevStart = 0;
  for (const t of cleaned) {
    let text = t.text.trim();
    if (opts.romanize && !isAscii(text)) text = opts.romanize(text);
    // \p{M} (combining marks) are part of the word in scripts like Devanagari — the vowel signs in "नमस्ते" are
    // marks, not letters; stripping them would mangle the word and its vocabulary key.
    const canon = vocab.get(text.replace(/[^\p{L}\p{M}\p{N}'-]/gu, "").toLowerCase());
    if (canon) text = text.replace(/[\p{L}\p{M}\p{N}'-]+/u, canon);

    const start = Math.max(Math.round(t.startMs), prevStart);
    let end = Math.max(Math.round(t.endMs), start + minMs);
    if (opts.durationMs != null) {
      if (start >= opts.durationMs) continue;
      end = Math.min(end, opts.durationMs);
      if (end - start < 1) continue;
    }
    words.push({
      id: newId(),
      text,
      startMs: start,
      endMs: end,
      ...(t.confidence != null ? { confidence: clamp01(t.confidence) } : {}),
      source: { text: "asr" },
    });
    prevStart = start; // starts are monotonic
  }

  // resolve overlaps: a word ends no later than the next word starts
  for (let i = 0; i < words.length - 1; i++) {
    const cur = words[i]!;
    const next = words[i + 1]!;
    if (cur.endMs > next.startMs) cur.endMs = Math.max(cur.startMs + 1, next.startMs);
  }
  return dropRepeatedHallucinations(words);
}

/** Whisper loops on silence ("Thank you. Thank you. Thank you."). Drop n-gram runs repeated 4+ times. */
export function dropRepeatedHallucinations(words: Word[], minRepeats = 4): Word[] {
  // keep \p{M}: in Devanagari the vowel signs are marks — without them "काल" and "कल" would compare equal and a
  // real phrase could be misread as a hallucination loop.
  const norm = (w: Word) => w.text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");
  for (const n of [1, 2, 3, 4]) {
    for (let i = 0; i + n * minRepeats <= words.length; i++) {
      let reps = 1;
      while (i + (reps + 1) * n <= words.length && sameRun(words, i, i + reps * n, n, norm)) reps++;
      if (reps >= minRepeats) {
        return dropRepeatedHallucinations([...words.slice(0, i + n), ...words.slice(i + reps * n)], minRepeats);
      }
    }
  }
  return words;
}

function sameRun(w: Word[], a: number, b: number, n: number, norm: (w: Word) => string): boolean {
  for (let k = 0; k < n; k++) if (norm(w[a + k]!) !== norm(w[b + k]!) || !norm(w[a + k]!)) return false;
  return true;
}

const isAscii = (s: string) => /^[\x00-\x7F]*$/.test(s);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** whisper.cpp via @remotion/install-whisper-cpp `toCaptions()` output. */
export function fromWhisperCaptions(
  captions: { text: string; startMs: number; endMs: number; confidence?: number | null }[],
  opts?: NormalizeOptions,
): Word[] {
  return normalizeTokens(mergeSubwordTokens(captions), opts);
}

/** OpenAI-style Whisper verbose_json with `timestamp_granularities[]=word` (seconds). */
export function fromWhisperVerboseJson(
  json: { words?: { word: string; start: number; end: number }[]; segments?: { avg_logprob?: number; start: number; end: number }[] },
  opts?: NormalizeOptions,
): Word[] {
  const segs = json.segments ?? [];
  const conf = (startSec: number) => {
    const s = segs.find((x) => startSec >= x.start && startSec <= x.end);
    return s?.avg_logprob != null ? clamp01(Math.exp(s.avg_logprob)) : undefined;
  };
  const toks = (json.words ?? []).map((w) => ({
    text: w.word,
    startMs: w.start * 1000,
    endMs: w.end * 1000,
    confidence: conf(w.start),
  }));
  return normalizeTokens(toks, opts);
}
