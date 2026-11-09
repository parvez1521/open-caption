import { newId, type CaptionDoc, type Emotion, type Word } from "@capseasy/shared";

/** All operations are immutable and id-based (never array-index based). */

const MIN_WORD_MS = 40;

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

/** Editing a word to empty deletes it from view (timing stays so neighbours don't shift). */
export function setWordText(doc: CaptionDoc, id: string, text: string): CaptionDoc {
  const t = text.trim();
  return mapWord(doc, id, (w) => ({
    ...w,
    text: t || w.text,
    hidden: t ? w.hidden : true,
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
  return touch(doc, { words });
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
  return touch(doc, { words });
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
  return touch(doc, {
    words: doc.words.filter((w) => !set.has(w.id)),
    manualBreaks: doc.manualBreaks.filter((x) => !set.has(x)),
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
