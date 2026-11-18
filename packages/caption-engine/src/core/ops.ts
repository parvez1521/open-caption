import { newId, type CaptionDoc, type Emotion, type Word } from "@capseasy/shared";

/** All operations are immutable and id-based (never array-index based). */

const MIN_WORD_MS = 40;

/**
 * A gap wider than this that an edit opens between two surviving words is a hard card
 * boundary (see derivePages): the earlier card must not hold across it. It matches the
 * default pause that grouping already splits on, so the mark never changes grouping —
 * it only stops the hold-bridge from filling a gap the user deliberately emptied.
 */
const HARD_BREAK_GAP_MS = 400;

/** Add `id` to the doc's manual breaks (a hard card boundary) when it is not there yet. */
const withHardBreak = (doc: CaptionDoc, id: string): string[] =>
  doc.manualBreaks.includes(id) ? doc.manualBreaks : [...doc.manualBreaks, id];

const touch = (doc: CaptionDoc, patch: Partial<CaptionDoc>): CaptionDoc => ({
  ...doc,
  ...patch,
  meta: { ...doc.meta, userEdited: true },
});

const mapWord = (doc: CaptionDoc, id: string, fn: (w: Word) => Word): CaptionDoc => {
  let hit = false;
  const words = doc.words.map((w) => {
    if (w.id !== id) return w;
    hit = true;
    return fn(w);
  });
  return hit ? touch(doc, { words }) : doc;
};

const indexOfWord = (doc: CaptionDoc, id: string) => doc.words.findIndex((w) => w.id === id);

/**
 * Editing a word to empty deletes it from view (timing stays so neighbours don't shift).
 * The text is stored exactly as typed — NOT trimmed — because the caption editor commits
 * on every keystroke from a controlled input: trimming here ate the space a user had just
 * typed after a single word ("Dulha" -> "Dulha " snapped back to "Dulha"), so the next
 * letter landed on it ("DulhaD") and a 2nd word could never be added (owner 2026-11-13).
 * Every render/export site already trims per word (derive `shown`, exporters, `visibleWords`),
 * so a trailing space mid-typing is invisible downstream.
 */
export function setWordText(doc: CaptionDoc, id: string, text: string): CaptionDoc {
  const blank = text.trim().length === 0;
  return mapWord(doc, id, (w) => ({
    ...w,
    text: blank ? w.text : text,
    hidden: blank ? true : w.hidden,
    source: { ...w.source, text: "user" },
  }));
}

export function setHidden(doc: CaptionDoc, id: string, hidden: boolean): CaptionDoc {
  return mapWord(doc, id, (w) => ({ ...w, hidden }));
}

export function setEmphasis(doc: CaptionDoc, id: string, emphasis: "none" | "strong" | "hero"): CaptionDoc {
  // only one hero per card: clear other heroes in the same card is done by the caller via card words;
  // here we simply record the user's choice.
  return mapWord(doc, id, (w) => ({ ...w, emphasis, source: { ...w.source, emphasis: "user" } }));
}

export function setWordColor(doc: CaptionDoc, id: string, color: string | undefined): CaptionDoc {
  return mapWord(doc, id, (w) => ({ ...w, color }));
}

export function setWordEmoji(doc: CaptionDoc, id: string, emoji: Word["emoji"]): CaptionDoc {
  return mapWord(doc, id, (w) => ({ ...w, emoji, source: { ...w.source, emoji: "user" } }));
}

/** Move a word's edges. Neighbours give way (their touching edge moves) but never below the minimum duration. */
export function retimeWord(doc: CaptionDoc, id: string, startMs: number, endMs: number): CaptionDoc {
  const i = indexOfWord(doc, id);
  if (i < 0) return doc;
  const prev = doc.words[i - 1];
  const next = doc.words[i + 1];
  const orig = doc.words[i]!;
  const lo = prev ? prev.startMs + MIN_WORD_MS : 0;
  const hi = next ? next.endMs - MIN_WORD_MS : Number.POSITIVE_INFINITY;
  const s = Math.round(Math.max(lo, Math.min(startMs, hi - MIN_WORD_MS)));
  const e = Math.round(Math.min(hi, Math.max(endMs, s + MIN_WORD_MS)));
  const words = doc.words.map((w, k) => {
    if (k === i) return { ...w, startMs: s, endMs: e };
    if (k === i - 1 && w.endMs > s) return { ...w, endMs: Math.max(w.startMs + MIN_WORD_MS, s) };
    if (k === i + 1 && w.startMs < e) return { ...w, startMs: Math.min(w.endMs - MIN_WORD_MS, e) };
    return w;
  });
  // A right-edge trim shortens the word on purpose: the next card must not hold back
  // across the gap the trim opened. Moves and stretches leave no boundary.
  const nextStart = words[i + 1]?.startMs;
  const trimmedShorter = next != null && nextStart != null && e < orig.endMs && Math.abs(s - orig.startMs) < 1 && nextStart - e > HARD_BREAK_GAP_MS;
  return touch(doc, { words, manualBreaks: trimmedShorter ? withHardBreak(doc, next.id) : doc.manualBreaks });
}

/**
 * Move and/or stretch a run of consecutive words (one word, or a whole caption line) to [startMs, endMs],
 * keeping their relative timing. Without ripple the run stays between its neighbours; with ripple every later
 * word shifts by as much as the run's end moved (like a linked/ripple edit in an NLE).
 */
export function retimeRun(doc: CaptionDoc, firstId: string, lastId: string, startMs: number, endMs: number, ripple = false): CaptionDoc {
  const i0 = indexOfWord(doc, firstId);
  const i1 = indexOfWord(doc, lastId);
  if (i0 < 0 || i1 < i0) return doc;
  const s0 = doc.words[i0]!.startMs;
  const e0 = doc.words[i1]!.endMs;
  const prev = doc.words[i0 - 1];
  const next = doc.words[i1 + 1];
  const count = i1 - i0 + 1;
  let s = Math.max(prev ? prev.endMs : 0, startMs);
  let e = Math.max(s + MIN_WORD_MS * count, endMs);
  if (!ripple && next && e > next.startMs) {
    const len = e - s;
    e = next.startMs;
    // a pure move keeps its length; a stretch just stops at the neighbour
    if (Math.abs(len - (e0 - s0)) < 1) s = Math.max(prev ? prev.endMs : 0, e - len);
    if (e - s < MIN_WORD_MS * count) return doc;
  }
  s = Math.round(s);
  e = Math.round(e);
  const k = (e - s) / Math.max(1, e0 - s0);
  const at = (t: number) => Math.round(s + (t - s0) * k);
  const delta = e - e0;
  const words = doc.words.map((w, j) => {
    if (j >= i0 && j <= i1) {
      const ns = at(w.startMs);
      return { ...w, startMs: ns, endMs: Math.max(ns + MIN_WORD_MS, at(w.endMs)) };
    }
    if (ripple && j > i1) return { ...w, startMs: Math.max(0, w.startMs + delta), endMs: Math.max(MIN_WORD_MS, w.endMs + delta) };
    return w;
  });
  // A right-edge trim shortens the run on purpose (start untouched, end earlier): the
  // next card must not hold back across the gap the trim opened. Moves, stretches and
  // ripple edits (where the following words shift along) leave no boundary.
  const nextStart = words[i1 + 1]?.startMs;
  const trimmedShorter = !ripple && next != null && nextStart != null && e < e0 && Math.abs(s - s0) < 1 && nextStart - e > HARD_BREAK_GAP_MS;
  return touch(doc, { words, manualBreaks: trimmedShorter ? withHardBreak(doc, next.id) : doc.manualBreaks });
}

/**
 * Move and/or stretch a run of consecutive words to [startMs, endMs], keeping their
 * relative timing — like retimeRun, but the run's immediate neighbours GIVE WAY at the
 * shared boundaries (their touching edge moves to the run's new edge) instead of
 * pinning the run between them. This is the edit the timeline drags need: caption
 * words are contiguous, so retimeRun's between-neighbours clamp collapses a single
 * word's move window to a point and the drag silently does nothing. Each neighbour
 * keeps at least MIN_WORD_MS, so the run cannot slide past a neighbour's far edge.
 * With ripple, every later word shifts by the run's end delta (like retimeRun).
 * No-op (same doc reference) when the clamped window equals the run's current window.
 */
export function retimeRunGiveWay(doc: CaptionDoc, firstId: string, lastId: string, startMs: number, endMs: number, ripple = false): CaptionDoc {
  const i0 = indexOfWord(doc, firstId);
  const i1 = indexOfWord(doc, lastId);
  if (i0 < 0 || i1 < i0) return doc;
  const s0 = doc.words[i0]!.startMs;
  const e0 = doc.words[i1]!.endMs;
  const prev = doc.words[i0 - 1];
  const next = doc.words[i1 + 1];
  const count = i1 - i0 + 1;
  const minLen = MIN_WORD_MS * count;
  // the run's start cannot pass the previous word's start + its minimum (that word
  // keeps at least MIN_WORD_MS); the end cannot pass the next word's end - minimum,
  // unless ripple is on and the later words shift along instead.
  const lo = prev ? prev.startMs + MIN_WORD_MS : 0;
  const hi = ripple ? Number.POSITIVE_INFINITY : next ? next.endMs - MIN_WORD_MS : Number.POSITIVE_INFINITY;
  let s = Math.max(lo, Math.min(startMs, hi - minLen));
  let e = Math.max(s + minLen, Math.min(endMs, hi));
  s = Math.round(s);
  e = Math.round(e);
  if (s === s0 && e === e0) return doc;
  const k = (e - s) / Math.max(1, e0 - s0);
  const at = (t: number) => Math.round(s + (t - s0) * k);
  const delta = e - e0;
  const words = doc.words.map((w, j) => {
    if (j >= i0 && j <= i1) {
      const ns = at(w.startMs);
      return { ...w, startMs: ns, endMs: Math.max(ns + MIN_WORD_MS, at(w.endMs)) };
    }
    if (j === i0 - 1 && w.endMs > s) return { ...w, endMs: Math.max(w.startMs + MIN_WORD_MS, s) };
    if (j === i1 + 1 && !ripple && w.startMs < e) return { ...w, startMs: Math.min(w.endMs - MIN_WORD_MS, e) };
    if (ripple && j > i1) return { ...w, startMs: Math.max(0, w.startMs + delta), endMs: Math.max(MIN_WORD_MS, w.endMs + delta) };
    return w;
  });
  // Same boundary rule as retimeRun: a right-edge trim shortens the run on purpose
  // (start untouched, end earlier), so the next card must not hold back across the
  // gap the trim opened. This is the op the timeline drags actually call — without
  // it a trim in the timeline changed the words but the preview kept showing the
  // card ahead. Moves, stretches and ripple edits leave no boundary.
  const nextStart = words[i1 + 1]?.startMs;
  const trimmedShorter = !ripple && next != null && nextStart != null && e < e0 && Math.abs(s - s0) < 1 && nextStart - e > HARD_BREAK_GAP_MS;
  return touch(doc, { words, manualBreaks: trimmedShorter ? withHardBreak(doc, next.id) : doc.manualBreaks });
}

/**
 * Shift EVERY word in the document by the same amount (the owner's manual re-alignment tool: when a whole
 * transcript sits a little early or late against the picture, one shift fixes all of it at once). Applied
 * destructively to the stored word times, so the editor, the saved document and every export (MP4, SRT,
 * VTT) see the same shifted times — there is no separate offset that could drift apart. Starts clamp at 0
 * (words already at the very beginning compress against 0 but keep their order and minimum length), and
 * every word keeps end > start.
 */
export function shiftAllWords(doc: CaptionDoc, deltaMs: number): CaptionDoc {
  const d = Math.round(deltaMs);
  if (!d || doc.words.length === 0) return doc;
  const words = doc.words.map((w) => {
    const startMs = Math.max(0, w.startMs + d);
    const endMs = Math.max(startMs + MIN_WORD_MS, w.endMs + d);
    return startMs === w.startMs && endMs === w.endMs ? w : { ...w, startMs, endMs };
  });
  return touch(doc, { words });
}

/**
 * Shift ONLY the selected words by the same amount (the multi-select group tool in the captions panel:
 * tick several lines, then nudge them together). Same invariants as shiftAllWords — starts clamp at 0,
 * every word keeps end > start with at least MIN_WORD_MS, the doc is marked userEdited — and words that
 * are not selected are returned untouched (same object identity), so derived pages and subtitle exports
 * reflect exactly the selected words' new times. No-op (same doc reference) for an empty selection, a
 * zero delta, or ids that match nothing, so the editor's history is not polluted.
 */
export function shiftWordsByIds(doc: CaptionDoc, ids: Iterable<string>, deltaMs: number): CaptionDoc {
  const d = Math.round(deltaMs);
  const set = new Set(ids);
  if (!d || set.size === 0 || doc.words.length === 0) return doc;
  let hit = false;
  const words = doc.words.map((w) => {
    if (!set.has(w.id)) return w;
    hit = true;
    const startMs = Math.max(0, w.startMs + d);
    const endMs = Math.max(startMs + MIN_WORD_MS, w.endMs + d);
    return startMs === w.startMs && endMs === w.endMs ? w : { ...w, startMs, endMs };
  });
  return hit ? touch(doc, { words }) : doc;
}

/**
 * Hard-delete exactly the selected words (the group bar's Delete). Cleans up the same break/card
 * bookkeeping as deleteWord for every removed id. No-op (same doc reference) when nothing matches.
 */
export function deleteWordsByIds(doc: CaptionDoc, ids: Iterable<string>): CaptionDoc {
  const set = new Set(ids);
  if (set.size === 0 || doc.words.length === 0) return doc;
  if (!doc.words.some((w) => set.has(w.id))) return doc;
  const cards = { ...doc.cards };
  for (const id of set) delete cards[id];
  const manualBreaks = doc.manualBreaks.filter((x) => !set.has(x));
  // Deleting words opens a gap between the surviving neighbours: when that gap is wide
  // enough to be a card boundary on its own, mark the first surviving word after each
  // deleted run as a hard break, so the earlier card does not hold across the emptied
  // stretch. Tight deletions (a filler inside a run) leave no mark and keep one card.
  for (let i = 0; i < doc.words.length; i++) {
    if (!set.has(doc.words[i]!.id)) continue;
    if (i > 0 && set.has(doc.words[i - 1]!.id)) continue; // only the start of each deleted run
    const prev = doc.words[i - 1];
    const next = doc.words.slice(i).find((w) => !set.has(w.id));
    if (prev && next && next.startMs - prev.endMs > HARD_BREAK_GAP_MS && !manualBreaks.includes(next.id)) {
      manualBreaks.push(next.id);
    }
  }
  return touch(doc, {
    words: doc.words.filter((w) => !set.has(w.id)),
    manualBreaks,
    noBreakAfter: doc.noBreakAfter.filter((x) => !set.has(x)),
    cards,
  });
}

/** "Split here": the word starts a new card. */
export function splitCardAt(doc: CaptionDoc, wordId: string): CaptionDoc {
  const i = indexOfWord(doc, wordId);
  if (i <= 0) return doc;
  const prev = doc.words[i - 1]!;
  return touch(doc, {
    manualBreaks: doc.manualBreaks.includes(wordId) ? doc.manualBreaks : [...doc.manualBreaks, wordId],
    noBreakAfter: doc.noBreakAfter.filter((x) => x !== prev.id),
  });
}

/** "Merge with previous card": the word continues the previous card. */
export function mergeWithPrevious(doc: CaptionDoc, wordId: string): CaptionDoc {
  const i = indexOfWord(doc, wordId);
  if (i <= 0) return doc;
  const prev = doc.words[i - 1]!;
  return touch(doc, {
    manualBreaks: doc.manualBreaks.filter((x) => x !== wordId),
    noBreakAfter: doc.noBreakAfter.includes(prev.id) ? doc.noBreakAfter : [...doc.noBreakAfter, prev.id],
  });
}

/** "Merge with next card" (Package 2 item B): the mirror of mergeWithPrevious — the word's
 *  card continues into the FOLLOWING card: the break before the next word is removed and a
 *  break after this word is forbidden. Same touch/undo semantics; no-op on the last word. */
export function mergeWithNext(doc: CaptionDoc, wordId: string): CaptionDoc {
  const i = indexOfWord(doc, wordId);
  if (i < 0 || i >= doc.words.length - 1) return doc;
  const next = doc.words[i + 1]!;
  return touch(doc, {
    manualBreaks: doc.manualBreaks.filter((x) => x !== next.id),
    noBreakAfter: doc.noBreakAfter.includes(wordId) ? doc.noBreakAfter : [...doc.noBreakAfter, wordId],
  });
}

export function setCardEmotion(doc: CaptionDoc, firstWordId: string, emotion: Emotion | undefined, source: "user" | "ai" | "heuristic" = "user"): CaptionDoc {
  const cards = { ...doc.cards };
  const cur = { ...cards[firstWordId] };
  if (emotion) {
    cur.emotion = emotion;
    cur.emotionSource = source;
  } else {
    delete cur.emotion;
    delete cur.emotionSource;
  }
  cards[firstWordId] = cur;
  return touch(doc, { cards });
}

export function setCardPosition(doc: CaptionDoc, firstWordId: string, position: { x: number; y: number } | null): CaptionDoc {
  return touch(doc, { cards: { ...doc.cards, [firstWordId]: { ...doc.cards[firstWordId], position } } });
}

/** Insert a new word after `afterId` (or at the start when null), timed inside the available gap. */
export function insertWordAfter(doc: CaptionDoc, afterId: string | null, text: string): CaptionDoc {
  const i = afterId ? indexOfWord(doc, afterId) : -1;
  const prev = doc.words[i];
  const next = doc.words[i + 1];
  const start = prev ? prev.endMs : 0;
  const end = next ? Math.max(start + MIN_WORD_MS, Math.min(next.startMs, start + 400)) : start + 400;
  const word: Word = { id: newId(), text: text.trim(), startMs: start, endMs: end, source: { text: "user" } };
  const words = [...doc.words.slice(0, i + 1), word, ...doc.words.slice(i + 1)];
  return touch(doc, { words });
}

/** Hard delete (use setHidden for reversible removal). Cleans up break bookkeeping. */
export function deleteWord(doc: CaptionDoc, id: string): CaptionDoc {
  const cards = { ...doc.cards };
  delete cards[id];
  return touch(doc, {
    words: doc.words.filter((w) => w.id !== id),
    manualBreaks: doc.manualBreaks.filter((x) => x !== id),
    noBreakAfter: doc.noBreakAfter.filter((x) => x !== id),
    cards,
  });
}

export interface FindReplaceOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function findMatches(doc: CaptionDoc, find: string, o: FindReplaceOptions = {}): string[] {
  if (!find) return [];
  const re = new RegExp(o.wholeWord ? `^${esc(find)}$` : esc(find), o.matchCase ? "" : "i");
  const core = (t: string) => (o.wholeWord ? t.replace(/[^\p{L}\p{N}'-]/gu, "") : t);
  return doc.words.filter((w) => re.test(core(w.text))).map((w) => w.id);
}

export function findReplace(doc: CaptionDoc, find: string, replace: string, o: FindReplaceOptions = {}): { doc: CaptionDoc; count: number } {
  const ids = new Set(findMatches(doc, find, o));
  if (ids.size === 0) return { doc, count: 0 };
  const re = new RegExp(esc(find), o.matchCase ? "g" : "gi");
  const words = doc.words.map((w) => (ids.has(w.id) ? { ...w, text: w.text.replace(re, replace), source: { ...w.source, text: "user" as const } } : w));
  return { doc: touch(doc, { words }), count: ids.size };
}

/** Drop bookkeeping that points at words that no longer exist. */
export function pruneDoc(doc: CaptionDoc): CaptionDoc {
  const ids = new Set(doc.words.map((w) => w.id));
  const cards = Object.fromEntries(Object.entries(doc.cards).filter(([k]) => ids.has(k)));
  return {
    ...doc,
    manualBreaks: doc.manualBreaks.filter((x) => ids.has(x)),
    noBreakAfter: doc.noBreakAfter.filter((x) => ids.has(x)),
    cards,
  };
}
