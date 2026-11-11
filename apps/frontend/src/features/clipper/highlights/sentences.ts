/**
 * Word-indexed sentences over a transcript.
 *
 * The boundary rule is the product's existing one (the same rule the AI Edit
 * context builder uses): a sentence ends at terminal punctuation (`. ! ? …`,
 * allowing a closing quote/bracket after it) or at a pause of 800 ms or more
 * before the next word. Whisper transcripts of natural speech are unevenly
 * punctuated, so the pause rule is what keeps sentences — and therefore clip
 * edges — aligned with how the speech actually falls.
 *
 * Sentences are the engine's atomic unit: a clip may only ever start on a
 * sentence's first word and end on a sentence's last word, so no clip can open
 * or close mid-thought.
 */
import type { HighlightWord, SentenceSpan } from "./types";

/** A pause at least this long before the next word also ends a sentence. */
export const SENTENCE_GAP_MS = 800;

const TERMINAL = /[.!?…]["'")\]]*$/;

export function buildSentences(words: readonly HighlightWord[]): SentenceSpan[] {
  const out: SentenceSpan[] = [];
  let first = -1;
  const flush = (last: number) => {
    if (first < 0) return;
    const slice = words.slice(first, last + 1);
    const text = slice.map((w) => w.text).join(" ").trim();
    out.push({
      index: out.length,
      firstWord: first,
      lastWord: last,
      startMs: words[first]!.startMs,
      endMs: words[last]!.endMs,
      text,
      isQuestion: /\?["'")\]]*$/.test(words[last]!.text.trim()),
    });
    first = -1;
  };
  words.forEach((w, i) => {
    if (first < 0) first = i;
    const next = words[i + 1];
    if (TERMINAL.test(w.text.trim()) || (next && next.startMs - w.endMs >= SENTENCE_GAP_MS)) {
      flush(i);
    }
  });
  if (first >= 0) flush(words.length - 1);
  return out;
}

/** The sentence containing a word index (indices are clamped into range). */
export function sentenceAt(sentences: readonly SentenceSpan[], wordIndex: number): SentenceSpan | null {
  if (sentences.length === 0) return null;
  const idx = Math.max(0, Math.min(wordIndex, sentences[sentences.length - 1]!.lastWord));
  // sentences are contiguous and ordered — binary search by lastWord
  let lo = 0;
  let hi = sentences.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = sentences[mid]!;
    if (idx < s.firstWord) hi = mid - 1;
    else if (idx > s.lastWord) lo = mid + 1;
    else return s;
  }
  return null;
}

/**
 * Does this sentence open like the tail of the previous thought — a leading
 * conjunction or answer particle ("Yes,", "So the thing is", "And then…")?
 * Such a sentence must not open a clip: the clip would start mid-exchange.
 */
const FRAGMENT_OPENERS = new Set([
  "yes", "no", "yeah", "yep", "nope", "right", "exactly", "so", "well", "and", "but", "also", "or", "anyway", "anyways", "okay", "ok",
]);

export function opensLikeFragment(sentence: SentenceSpan): boolean {
  const first = sentence.text.trim().toLowerCase().replace(/^[^a-z0-9]+/, "").split(/\s+/)[0] ?? "";
  return FRAGMENT_OPENERS.has(first.replace(/[^a-z0-9]/g, ""));
}
