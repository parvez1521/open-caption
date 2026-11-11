import { describe, expect, it } from "vitest";
import { CaptionDocSchema, defaultSettings, defaultStyle, ProjectSettingsSchema, type CaptionDoc, type Word } from "@capseasy/shared";
import {
  autoEmoji, clearAutoEmoji, emojiFor,
  applyFillerFilter, applyProfanity, breakLines, contrastRatio, derivePages, detectEmotion, findReplace, fromWhisperVerboseJson,
  fromWhisperCaptions, importSubtitles, insertWordAfter, legacyStyleToV2, legacyTranscriptToDoc, mergeWithNext, mergeWithPrevious, normalizeTokens,
  pageAt, pickHeroIndex, readMs, retimeWord, setHidden, setWordText, shiftAllWords, shiftWordsByIds, deleteWordsByIds, splitCardAt, toAss, toSrt, toTxt, toVtt, lighten,
} from "./index";

const mk = (text: string, startMs: number, endMs: number, id = text + startMs): Word => ({ id, text, startMs, endMs });
const docOf = (words: Word[], extra: Partial<CaptionDoc> = {}): CaptionDoc => CaptionDocSchema.parse({ version: 2, words, ...extra });
const settings = (over = {}) => ProjectSettingsSchema.parse({ maxWordsPerCard: 3, ...over });

describe("normalize", () => {
  it("merges whisper.cpp sub-word tokens and trims spaces", () => {
    const words = fromWhisperCaptions([
      { text: " Hel", startMs: 0, endMs: 200 },
      { text: "lo", startMs: 200, endMs: 400 },
      { text: " world", startMs: 400, endMs: 800 },
    ]);
    expect(words.map((w) => w.text)).toEqual(["Hello", "world"]);
    expect(words[0]!.endMs).toBe(400);
  });

  it("drops noise markers and makes times monotonic without overlaps", () => {
    const words = normalizeTokens([
      { text: "[BLANK_AUDIO]", startMs: 0, endMs: 500 },
      { text: "b", startMs: 1000, endMs: 1500 },
      { text: "a", startMs: 900, endMs: 1300 },
      { text: "c", startMs: 1200, endMs: 1200 },
    ]);
    expect(words.map((w) => w.text)).toEqual(["a", "b", "c"]);
    for (let i = 1; i < words.length; i++) expect(words[i]!.startMs).toBeGreaterThanOrEqual(words[i - 1]!.startMs);
    for (let i = 0; i < words.length - 1; i++) expect(words[i]!.endMs).toBeLessThanOrEqual(words[i + 1]!.startMs);
    expect(words.every((w) => w.endMs > w.startMs)).toBe(true);
  });

  it("clamps to media duration and drops words past it", () => {
    const words = normalizeTokens([{ text: "in", startMs: 0, endMs: 500 }, { text: "out", startMs: 5000, endMs: 5500 }], { durationMs: 1000 });
    expect(words.map((w) => w.text)).toEqual(["in"]);
  });

  it("removes whisper silence hallucination loops", () => {
    const toks = Array.from({ length: 8 }, (_, i) => ({ text: "Thank you.".split(" ")[i % 2]!, startMs: i * 300, endMs: i * 300 + 250 }));
    const words = normalizeTokens([{ text: "Real", startMs: 0, endMs: 200 }, ...toks.map((t) => ({ ...t, startMs: t.startMs + 300, endMs: t.endMs + 300 }))]);
    expect(words.length).toBeLessThan(9);
    expect(words[0]!.text).toBe("Real");
  });

  it("applies custom vocabulary spelling and romanize hook", () => {
    const words = normalizeTokens(
      [{ text: "capseasy", startMs: 0, endMs: 300 }, { text: "नमस्ते", startMs: 300, endMs: 600 }],
      { vocabulary: ["CapsEasy"], romanize: () => "namaste" },
    );
    expect(words.map((w) => w.text)).toEqual(["CapsEasy", "namaste"]);
  });

  it("parses Whisper verbose_json words", () => {
    const words = fromWhisperVerboseJson({ words: [{ word: "Hi", start: 0, end: 0.4 }, { word: "there", start: 0.4, end: 0.9 }], segments: [{ start: 0, end: 1, avg_logprob: -0.1 }] });
    expect(words).toHaveLength(2);
    expect(words[0]!.confidence).toBeCloseTo(Math.exp(-0.1), 3);
  });
});

/**
 * Multilingual gate (Phase 5, Slice 5.2): Devanagari Hindi word timings, in the exact shape the browser Whisper
 * worker emits (leading-space word chunks, millisecond spans, sub-word splits without a leading space), must pass
 * the SAME alignment guarantees the English fixtures above enforce — monotonic starts, no overlaps, end > start,
 * clamped to the media duration, no dropped or duplicated words. This proves the aligner handles Devanagari; it
 * does not prove real-audio transcription accuracy, which is an on-device pass.
 */
describe("normalize — Devanagari Hindi (multilingual gate)", () => {
  const HINDI_CHUNKS = [
    { text: " नमस्", startMs: 0, endMs: 180 },
    { text: "ते", startMs: 180, endMs: 420 }, // sub-word continuation: merges into नमस्ते
    { text: " दोस्तों", startMs: 420, endMs: 900 },
    { text: " यह", startMs: 1000, endMs: 1250 },
    { text: " ट्रिक", startMs: 1250, endMs: 1650 },
    { text: " कमाल", startMs: 1650, endMs: 2050 },
    { text: " है।", startMs: 2050, endMs: 2400 },
  ];

  it("merges Devanagari sub-word tokens and keeps the script untouched (no romanize by default)", () => {
    const words = fromWhisperCaptions(HINDI_CHUNKS, { durationMs: 2400 });
    expect(words.map((w) => w.text)).toEqual(["नमस्ते", "दोस्तों", "यह", "ट्रिक", "कमाल", "है।"]);
    expect(words[0]!.endMs).toBe(420);
  });

  it("makes Devanagari timings monotonic without overlaps, clamped to the media duration", () => {
    const words = normalizeTokens(
      [
        { text: "दूसरा", startMs: 1000, endMs: 1500 },
        { text: "पहला", startMs: 900, endMs: 1300 },
        { text: "तीसरा", startMs: 1200, endMs: 1200 },
        { text: "बाहर", startMs: 9000, endMs: 9500 },
      ],
      { durationMs: 2000 },
    );
    expect(words.map((w) => w.text)).toEqual(["पहला", "दूसरा", "तीसरा"]);
    for (let i = 1; i < words.length; i++) expect(words[i]!.startMs).toBeGreaterThanOrEqual(words[i - 1]!.startMs);
    for (let i = 0; i < words.length - 1; i++) expect(words[i]!.endMs).toBeLessThanOrEqual(words[i + 1]!.startMs);
    expect(words.every((w) => w.endMs > w.startMs && w.startMs >= 0 && w.endMs <= 2000)).toBe(true);
  });

  it("removes a Devanagari hallucination loop and keeps the real words", () => {
    const loop = Array.from({ length: 6 }, (_, i) => ({ text: " धन्यवाद।", startMs: 600 + i * 300, endMs: 600 + i * 300 + 250 }));
    const words = fromWhisperCaptions([{ text: " असली", startMs: 0, endMs: 300 }, { text: " बात", startMs: 300, endMs: 600 }, ...loop]);
    expect(words.map((w) => w.text)).toEqual(["असली", "बात", "धन्यवाद।"]);
  });

  it("parses Devanagari Whisper verbose_json words", () => {
    const words = fromWhisperVerboseJson({ words: [{ word: "नमस्ते", start: 0, end: 0.42 }, { word: "दोस्तों", start: 0.42, end: 0.9 }] });
    expect(words.map((w) => w.text)).toEqual(["नमस्ते", "दोस्तों"]);
    expect(words[1]!.startMs).toBe(420);
  });

  it("derives pages over Devanagari words: danda ends a sentence, no word dropped or duplicated", () => {
    const ws = [
      mk("नमस्ते", 0, 400), mk("दोस्तों", 400, 800), mk("यह", 800, 1100), mk("है।", 1100, 1500),
      mk("अब", 2100, 2400), mk("दूसरा", 2400, 2800), mk("वाक्य", 2800, 3200), mk("है।", 3200, 3600),
    ];
    const pages = derivePages(docOf(ws), settings());
    // every input word appears on exactly one page, in order
    expect(pages.flatMap((p) => p.words.map((w) => w.text))).toEqual(ws.map((w) => w.text));
    // a page never crosses the danda sentence boundary
    for (const p of pages) {
      const idx = p.words.findIndex((w) => /।$/.test(w.text));
      if (idx !== -1) expect(idx).toBe(p.words.length - 1);
    }
    for (let i = 0; i < pages.length - 1; i++) expect(pages[i]!.endMs).toBeLessThanOrEqual(pages[i + 1]!.startMs);
    expect(pages.every((p) => p.endMs > p.startMs)).toBe(true);
  });
});

describe("derivePages", () => {
  const ws = [mk("Hello", 0, 300), mk("there", 300, 600), mk("my", 600, 800), mk("friend.", 800, 1200), mk("How", 1300, 1500), mk("are", 1500, 1700), mk("you?", 1700, 2000)];

  it("splits on sentence end and word limit", () => {
    const pages = derivePages(docOf(ws), settings());
    expect(pages.map((p) => p.words.map((w) => w.text).join(" "))).toEqual(["Hello there my", "friend.", "How are you?"]);
    // sentence boundary must never be crossed inside a page
    for (const p of pages) {
      const idx = p.words.findIndex((w) => /[.!?]$/.test(w.text));
      if (idx !== -1) expect(idx).toBe(p.words.length - 1);
    }
  });

  it("splits on long pauses", () => {
    const pages = derivePages(docOf([mk("one", 0, 200), mk("two", 200, 400), mk("three", 2000, 2200)]), settings({ maxWordsPerCard: 6, pauseMs: 400 }));
    expect(pages).toHaveLength(2);
  });

  it("never produces overlapping pages and clamps hold to the next page", () => {
    const pages = derivePages(docOf(ws), settings({ holdMs: 1000 }));
    for (let i = 0; i < pages.length - 1; i++) expect(pages[i]!.endMs).toBeLessThanOrEqual(pages[i + 1]!.startMs);
    expect(pages.every((p) => p.endMs > p.startMs)).toBe(true);
  });

  it("gapBehavior hold bridges short gaps, clear does not", () => {
    const words = [mk("a", 0, 200), mk("b", 1000, 1200)];
    const hold = derivePages(docOf(words), settings({ maxWordsPerCard: 1, gapBehavior: "hold", holdMs: 100 }));
    const clear = derivePages(docOf(words), settings({ maxWordsPerCard: 1, gapBehavior: "clear", holdMs: 100 }));
    expect(hold[0]!.endMs).toBe(1000);
    // clear: the card leaves in the gap, but only once it has been up long enough to read
    expect(clear[0]!.endMs).toBe(readMs([words[0]!]));
    expect(clear[0]!.endMs).toBeLessThan(1000);
  });

  it("reveals every word of a card well before it ends, overlapping the next with the previous", () => {
    const words = [mk("one", 0, 300), mk("two", 300, 600), mk("three", 600, 900), mk("four", 900, 1200)];
    const [p] = derivePages(docOf(words), settings({ maxWordsPerCard: 4, maxCharsPerLine: 40, gapBehavior: "clear", holdMs: 0 }));
    const at = p!.words.map((w) => w.revealMs!);
    expect(at[0]).toBe(p!.startMs);
    // each word starts appearing no later than half-way through the previous one, and never after it is spoken
    for (let i = 1; i < at.length; i++) {
      expect(at[i]!).toBeGreaterThanOrEqual(at[i - 1]!);
      expect(at[i]!).toBeLessThanOrEqual(Math.min(p!.words[i]!.startMs, at[i - 1]! + 150));
    }
    // the whole card is on screen for most of its life
    expect(at[at.length - 1]! - p!.startMs).toBeLessThanOrEqual((p!.endMs - p!.startMs) * 0.4 + 1);
  });

  it("respects manual breaks and merges (noBreakAfter)", () => {
    const base = [mk("a", 0, 200, "a"), mk("b", 200, 400, "b"), mk("c", 400, 600, "c"), mk("d", 600, 800, "d")];
    expect(derivePages(docOf(base, { manualBreaks: ["c"] }), settings({ maxWordsPerCard: 6 })).map((p) => p.words.length)).toEqual([2, 2]);
    // merge beats the word cap up to 2x
    const merged = derivePages(docOf(base, { noBreakAfter: ["c"] }), settings({ maxWordsPerCard: 3 }));
    expect(merged.map((p) => p.words.length)).toEqual([4]);
  });

  it("skips hidden words and applies sync offset", () => {
    const d = docOf([mk("a", 100, 300, "a"), { ...mk("um", 300, 500, "um"), hidden: true }, mk("b", 500, 700, "b")]);
    const pages = derivePages(d, settings({ maxWordsPerCard: 6, syncOffsetMs: 50 }));
    expect(pages[0]!.words.map((w) => w.text)).toEqual(["a", "b"]);
    expect(pages[0]!.startMs).toBe(150);
  });

  it("breaks lines by chars and honors maxLines through page splitting", () => {
    const words = ["extraordinarily", "long", "words", "everywhere"].map((t, i) => mk(t, i * 200, i * 200 + 150));
    const lines = breakLines(words, settings({ maxCharsPerLine: 16 }));
    expect(lines.length).toBeGreaterThan(1);
    const pages = derivePages(docOf(words), settings({ maxWordsPerCard: 8, maxLines: 1, maxCharsPerLine: 16 }));
    expect(pages.every((p) => p.lines.length === 1 || p.words.length === 1)).toBe(true);
  });

  it("uses an injected measurer for real font widths", () => {
    const words = ["WWWW", "WWWW", "WWWW"].map((t, i) => mk(t, i * 200, i * 200 + 150, `w${i}`));
    const pages = derivePages(docOf(words), settings({ maxWordsPerCard: 6, maxLines: 1 }), { measure: (t) => t.length * 10, maxLineWidth: 90 });
    expect(pages.length).toBeGreaterThan(1);
  });

  it("carries card meta and finds the page at a time", () => {
    const d = docOf([mk("hi", 0, 200, "h1"), mk("you", 200, 400, "h2")], { cards: { h1: { emotion: "funny", emotionSource: "user", position: { x: 0.2, y: 0.3 } } } });
    const pages = derivePages(d, settings());
    expect(pages[0]!.emotion).toBe("funny");
    expect(pages[0]!.position).toEqual({ x: 0.2, y: 0.3 });
    expect(pageAt(pages, 100)?.id).toBe("h1");
    expect(pageAt(pages, 99999)).toBeNull();
  });

  // Perf guard — Phase 9 W6 investigation (2026-11-10, this repo's shared 4-vCPU VM; full data in the
  // commit message). The original version timed ONE cold call with docOf()/settings() evaluated after
  // t0 and asserted dt < 500, and it flaked under parallel CPU contention. Measured facts:
  //  - The timed region was ~half fixture setup: Zod-parsing 10k words alone is 17–21 ms median,
  //    vs 17–23 ms median for warmed derivePages itself. JIT warmup is real too: cold first run
  //    131–140 ms decaying to ~44 ms by run 5 (quiet machine).
  //  - The algorithm is NOT the problem: scaling is linear, 1.4–2.2 µs/word flat from 1k to 40k words.
  //  - Contention is the problem, and it is huge on this host: with 4 saturating busy-loops the
  //    original test reproduced at dt = 1217 ms and 977 ms; warmed single runs spiked to 771 ms and
  //    even the MEDIAN of samples reached 609 ms in a full-suite run — so median-of-N at 500 still
  //    flakes (proven, not theorised). The statistic that stays stable is the MINIMUM: contention only
  //    ever adds time, and across every loaded window observed the min of a sample set stayed at
  //    80–200 ms while medians swung 20 → 609 ms.
  // Method: parse outside the timed region, 2 warmup runs, 9 timed runs, assert on min + median.
  // Budgets: min < 300 ms is ~19x the quiet min (~16 ms) and 1.5x above the worst loaded min observed
  // (200 ms); median < 1500 ms is ~2.5x the worst loaded median observed (609 ms). A genuine 10x
  // algorithmic regression fails both under the loaded conditions where the flake lived (min ~800 ms+,
  // median ~4000 ms+) and trips the min at ~19x on a quiet machine. The 30 s test timeout exists only
  // because collecting 11 samples on a saturated host takes wall-time (observed >5 s, the vitest
  // default, which was itself one of the flake's failure modes); it is not a retry or a loosened budget.
  it("handles 10k words fast", () => {
    const words = Array.from({ length: 10000 }, (_, i) => mk(`w${i}`, i * 250, i * 250 + 200, `id${i}`));
    const doc = docOf(words);
    const st = settings({ maxWordsPerCard: 4 });
    let pages = derivePages(doc, st);
    expect(pages.length).toBeGreaterThan(2000);
    for (let i = 0; i < 2; i++) derivePages(doc, st); // JIT warmup
    const times: number[] = [];
    for (let i = 0; i < 9; i++) {
      const t0 = performance.now();
      pages = derivePages(doc, st);
      times.push(performance.now() - t0);
    }
    expect(pages.length).toBeGreaterThan(2000);
    times.sort((a, b) => a - b);
    const min = times[0]!;
    const median = times[4]!;
    expect(min).toBeLessThan(300);
    expect(median).toBeLessThan(1500);
  }, 30_000);
});

describe("hero + emotion", () => {
  it("prefers user hero, then content words over stopwords", () => {
    expect(pickHeroIndex([mk("the", 0, 1), mk("Incredible", 1, 2), mk("and", 2, 3)])).toBe(1);
    expect(pickHeroIndex([{ ...mk("the", 0, 1), emphasis: "hero" }, mk("Incredible", 1, 2)])).toBe(0);
    expect(pickHeroIndex([mk("hai", 0, 1), mk("2024", 1, 2), mk("ka", 2, 3)])).toBe(1);
  });
  it("detects emotions heuristically", () => {
    expect(detectEmotion("Are you sure?")).toBe("question");
    expect(detectEmotion("lol that was hilarious")).toBe("funny");
    expect(detectEmotion("This is amazing!")).toBe("excited");
    expect(detectEmotion("THIS IS HUGE")).toBe("hype");
    expect(detectEmotion("the table is brown")).toBe("neutral");
  });
});

describe("doc ops", () => {
  const base = docOf([mk("a", 0, 200, "a"), mk("b", 200, 400, "b"), mk("c", 400, 600, "c")]);
  it("edits text; empty text hides the word", () => {
    expect(setWordText(base, "a", "Z").words[0]!.text).toBe("Z");
    expect(setWordText(base, "a", "   ").words[0]!.hidden).toBe(true);
    expect(setWordText(base, "a", "Z").meta.userEdited).toBe(true);
    expect(base.meta.userEdited).toBe(false); // immutable
  });
  it("split/merge are mutually exclusive bookkeeping", () => {
    const s = splitCardAt(base, "b");
    expect(s.manualBreaks).toEqual(["b"]);
    const m = mergeWithPrevious(s, "b");
    expect(m.manualBreaks).toEqual([]);
    expect(m.noBreakAfter).toEqual(["a"]);
    expect(splitCardAt(m, "b").noBreakAfter).toEqual([]);
  });
  it("mergeWithNext mirrors mergeWithPrevious: the word's card continues into the following card", () => {
    // start from an explicit break before c: a b | c
    const s = splitCardAt(base, "c");
    expect(s.manualBreaks).toEqual(["c"]);
    const m = mergeWithNext(s, "b");
    expect(m.manualBreaks).toEqual([]);
    expect(m.noBreakAfter).toEqual(["b"]);
    expect(m.meta.userEdited).toBe(true);
    expect(base.manualBreaks).toEqual([]); // immutable
    // splitting at c again undoes the join-next bookkeeping exactly
    expect(splitCardAt(m, "c").noBreakAfter).toEqual([]);
    expect(splitCardAt(m, "c").manualBreaks).toEqual(["c"]);
  });
  it("mergeWithNext actually merges the derived pages (and mergeWithPrevious still does)", () => {
    const twoCards = settings({ maxWordsPerCard: 2 });
    const before = derivePages(base, twoCards);
    expect(before.length).toBe(2); // [a b] [c]
    // noBreakAfter wins over the 2-word cap: the joined card holds all three words
    const joined = derivePages(mergeWithNext(base, "b"), twoCards);
    expect(joined.length).toBe(1);
    expect(joined[0]!.words.map((w) => w.id)).toEqual(["a", "b", "c"]);
    // parity under the engine's hard cap (a user merge beats breaks only up to 2x the word
    // limit — derive.ts): with a 1-word cap BOTH directions stop at the same 2 pages
    const cap = settings({ maxWordsPerCard: 1 });
    expect(derivePages(mergeWithNext(base, "b"), cap).length).toBe(2);
    expect(derivePages(mergeWithPrevious(base, "c"), cap).length).toBe(2);
    expect(derivePages(mergeWithPrevious(base, "c"), twoCards).length).toBe(1);
  });
  it("mergeWithNext is a no-op (same reference) on the last word and for unknown ids", () => {
    expect(mergeWithNext(base, "c")).toBe(base);
    expect(mergeWithNext(base, "nope")).toBe(base);
    expect(mergeWithPrevious(base, "a")).toBe(base);
  });
  it("retime clamps to neighbours with a minimum duration", () => {
    const r = retimeWord(base, "b", 100, 500);
    const w = r.words;
    expect(w[1]!.endMs - w[1]!.startMs).toBeGreaterThanOrEqual(40);
    for (let i = 0; i < w.length - 1; i++) expect(w[i]!.endMs).toBeLessThanOrEqual(w[i + 1]!.startMs);
    const tiny = retimeWord(base, "b", 300, 300).words[1]!;
    expect(tiny.endMs - tiny.startMs).toBeGreaterThanOrEqual(40);
  });
  it("shiftAllWords moves every word by the same amount, both ways", () => {
    const fwd = shiftAllWords(base, 500);
    expect(fwd.words.map((w) => [w.startMs, w.endMs])).toEqual([[500, 700], [700, 900], [900, 1100]]);
    const back = shiftAllWords(fwd, -200);
    expect(back.words.map((w) => [w.startMs, w.endMs])).toEqual([[300, 500], [500, 700], [700, 900]]);
    expect(fwd.meta.userEdited).toBe(true);
    expect(base.words[0]!.startMs).toBe(0); // immutable
    expect(shiftAllWords(base, 0)).toBe(base); // no-op keeps the same doc
  });
  it("shiftAllWords clamps at 0, keeps order and end > start, and exports see the shift", () => {
    const clamped = shiftAllWords(base, -300);
    for (const w of clamped.words) {
      expect(w.startMs).toBeGreaterThanOrEqual(0);
      expect(w.endMs).toBeGreaterThan(w.startMs);
      expect(w.endMs - w.startMs).toBeGreaterThanOrEqual(40);
    }
    expect(clamped.words.map((w) => w.startMs)).toEqual([0, 0, 100]);
    // the shifted times are the stored times, so derived pages and subtitle exports carry them verbatim
    const pages = derivePages(shiftAllWords(base, 1000), settings());
    expect(pages[0]!.startMs).toBe(1000);
    expect(toSrt(pages)).toContain("00:00:01,000 --> 00:00:02,100"); // page end includes the derived min display time
    expect(toVtt(pages)).toContain("00:00:01.000 --> 00:00:02.100");
  });
  it("shiftWordsByIds shifts only the selected words", () => {
    const out = shiftWordsByIds(base, ["a", "c"], 500);
    expect(out.words.map((w) => [w.startMs, w.endMs])).toEqual([[500, 700], [200, 400], [900, 1100]]);
    expect(out.words[1]).toBe(base.words[1]); // unselected word keeps identity
    expect(out.meta.userEdited).toBe(true);
    expect(base.words[0]!.startMs).toBe(0); // immutable
    // derived pages and SRT carry the selected words' new times verbatim
    const pages = derivePages(shiftWordsByIds(base, new Set(["a", "b", "c"]), 1000), settings());
    expect(pages[0]!.startMs).toBe(1000);
    expect(toSrt(pages)).toContain("00:00:01,000 -->");
  });
  it("shiftWordsByIds clamps at 0 with minimum span and no-ops cleanly", () => {
    const clamped = shiftWordsByIds(base, ["a", "b"], -300);
    expect(clamped.words.map((w) => [w.startMs, w.endMs])).toEqual([[0, 40], [0, 100], [400, 600]]);
    for (const w of clamped.words) expect(w.endMs - w.startMs).toBeGreaterThanOrEqual(40);
    expect(shiftWordsByIds(base, [], 500)).toBe(base);
    expect(shiftWordsByIds(base, ["a"], 0)).toBe(base);
    expect(shiftWordsByIds(base, ["nope"], 500)).toBe(base);
  });
  it("deleteWordsByIds removes exactly the selected words and their bookkeeping", () => {
    const withBreaks = splitCardAt(base, "b"); // manualBreaks: ["b"]
    const out = deleteWordsByIds(withBreaks, ["b"]);
    expect(out.words.map((w) => w.id)).toEqual(["a", "c"]);
    expect(out.manualBreaks).toEqual([]);
    expect(out.meta.userEdited).toBe(true);
    expect(deleteWordsByIds(base, [])).toBe(base);
    expect(deleteWordsByIds(base, ["nope"])).toBe(base);
    const pages = derivePages(deleteWordsByIds(base, ["a", "b"]), settings());
    expect(pages.flatMap((p) => p.words.map((w) => w.text))).toEqual(["c"]);
    expect(toTxt(pages)).toBe("c");
  });
  it("find/replace counts matches and respects whole word", () => {
    const d = docOf([mk("cat", 0, 1, "1"), mk("category", 1, 2, "2"), mk("Cat!", 2, 3, "3")]);
    expect(findReplace(d, "cat", "dog", { wholeWord: true }).count).toBe(2);
    expect(findReplace(d, "cat", "dog").count).toBe(3);
    expect(findReplace(d, "cat", "dog", { matchCase: true }).count).toBe(2);
  });
  it("inserts a word into the gap and hides fillers/profanity reversibly", () => {
    const ins = insertWordAfter(base, "a", "new");
    expect(ins.words.map((w) => w.text)).toEqual(["a", "new", "b", "c"]);
    const f = applyFillerFilter(docOf([mk("um", 0, 1, "u"), mk("hi", 1, 2, "h")]));
    expect(f.words[0]!.hidden).toBe(true);
    expect(applyFillerFilter(f, undefined, false).words[0]!.hidden).toBe(false);
    expect(applyProfanity(docOf([mk("shit", 0, 1)]), "mask").words[0]!.text).toBe("s***");
    expect(setHidden(base, "a", true).words[0]!.hidden).toBe(true);
  });
});

describe("exporters + import", () => {
  const d = docOf([mk("Hello", 0, 400, "1"), mk("world", 400, 900, "2"), mk("Second", 2000, 2400, "3"), mk("card", 2400, 3000, "4")]);
  const pages = derivePages(d, settings({ maxWordsPerCard: 2 }));

  it("writes valid SRT and VTT", () => {
    const srt = toSrt(pages);
    expect(srt).toContain("1\n00:00:00,000 --> ");
    expect(srt).toContain("Hello world");
    expect(toVtt(pages).startsWith("WEBVTT")).toBe(true);
    expect(toTxt(pages)).toBe("Hello world\nSecond card");
  });

  it("round-trips SRT into a doc with per-cue cards", () => {
    const back = importSubtitles(toSrt(pages));
    expect(back.words.map((w) => w.text)).toEqual(["Hello", "world", "Second", "card"]);
    expect(back.manualBreaks).toHaveLength(1);
    const again = derivePages(back, settings({ maxWordsPerCard: 6 }));
    expect(again).toHaveLength(2);
  });

  it("imports VTT with short timestamps and tags", () => {
    const doc = importSubtitles("WEBVTT\n\n00:01.000 --> 00:02.500\n<b>Hi</b> there\n");
    expect(doc.words.map((w) => w.text)).toEqual(["Hi", "there"]);
    expect(doc.words[0]!.startMs).toBe(1000);
  });

  it("writes ASS with a style line and positioned events", () => {
    const ass = toAss(pages, defaultStyle({ fontId: "Anton", position: { x: 0.5, y: 0.5 } }), { width: 1080, height: 1920, casing: "upper" });
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("Style: Default,Anton,");
    expect(ass).toContain("\\pos(540,960)");
    expect(ass).toContain("HELLO WORLD");
  });
});

describe("legacy migration + color", () => {
  it("migrates legacy transcript seconds to ms words", () => {
    const doc = legacyTranscriptToDoc({ language: "hi", words: [{ word: "Namaste", start: 0.5, end: 1.1, probability: 0.9 }, { word: "dost", start: 1.1, end: 1.6 }] });
    expect(doc.language).toBe("hi");
    expect(doc.words[0]).toMatchObject({ text: "Namaste", startMs: 500, endMs: 1100, confidence: 0.9 });
  });
  it("migrates the real legacy {text,start_ms,end_ms,highlighted} shape", () => {
    const doc = legacyTranscriptToDoc({ words: [{ text: "naam", start_ms: 0, end_ms: 440, confidence: 0.5, highlighted: false }, { text: "clients?", start_ms: 440, end_ms: 900, highlighted: true }] });
    expect(doc.words.map((w) => [w.text, w.startMs, w.endMs])).toEqual([["naam", 0, 440], ["clients?", 440, 900]]);
    expect(doc.words[1]!.emphasis).toBe("strong");
    expect(doc.words[0]!.emphasis).toBeUndefined();
  });
  it("maps a legacy style blob into CaptionStyleV2", () => {
    const s = legacyStyleToV2({ caption_template: "word_by_word", highlight_color: "#00F5FF", font: "Lilita One", size: 58, weight: "900", outline: 4, shadow: 4, text_transform: "uppercase", y_position_percent: 71.4, background_style: "pill", highlight_anim: "glow" });
    expect(s).toMatchObject({ templateId: "word_by_word", fontId: "Lilita One", fontWeight: 900, casing: "upper" });
    expect(s.active.color).toBe("#00F5FF");
    expect(s.active.effect).toBe("glow");
    expect(s.stroke.enabled).toBe(true);
    expect(s.position.y).toBeCloseTo(0.714, 3);
    expect(s.background.type).toBe("pill");
  });
  it("computes contrast and lightens", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 1);
    expect(lighten("#000000", 0.5)).toBe("#808080");
  });
  it("style + settings defaults parse from empty input", () => {
    expect(defaultStyle().active.effect).toBe("color");
    expect(defaultSettings().maxLines).toBe(2);
  });
});

describe("emoji", () => {
  it("maps keywords incl. simple stems", () => {
    expect(emojiFor("Money!")).toBe("💰");
    expect(emojiFor("rockets")).toBe("🚀");
    expect(emojiFor("table")).toBeNull();
  });
  it("adds spaced-out suggestions and respects user choices", () => {
    const d = docOf([
      { ...mk("money", 0, 300, "a") },
      { ...mk("fire", 400, 700, "b") },
      { ...mk("love", 3000, 3300, "c"), emoji: { char: "🥰", position: "after" as const }, source: { emoji: "user" as const } },
      { ...mk("win", 6000, 6300, "d") },
    ]);
    const out = autoEmoji(d);
    expect(out.words[0]!.emoji?.char).toBe("💰");
    expect(out.words[1]!.emoji ?? null).toBeNull(); // too close to the previous one
    expect(out.words[2]!.emoji?.char).toBe("🥰"); // user choice untouched
    expect(out.words[3]!.emoji?.char).toBe("🏆");
    const cleared = clearAutoEmoji(out);
    expect(cleared.words.filter((w) => w.emoji).map((w) => w.emoji!.char)).toEqual(["🥰"]);
  });
});

describe("retimeRun (timeline line/word moves)", () => {
  it("moves a line keeping relative timing, bounded by neighbours without ripple", async () => {
    const { retimeRun } = await import("./ops");
    const d = docOf([mk("a", 0, 200, "a"), mk("b", 300, 500, "b"), mk("c", 500, 700, "c"), mk("d", 1000, 1200, "d")]);
    const moved = retimeRun(d, "b", "c", 400, 800);
    expect(moved.words.map((w) => [w.startMs, w.endMs])).toEqual([[0, 200], [400, 600], [600, 800], [1000, 1200]]);
    // pushed into the next word: stops at the neighbour and keeps its length
    const blocked = retimeRun(d, "b", "c", 700, 1100);
    expect(blocked.words[2]!.endMs).toBe(1000);
    expect(blocked.words[1]!.startMs).toBe(600);
  });
  it("stretches a line proportionally", async () => {
    const { retimeRun } = await import("./ops");
    const d = docOf([mk("b", 300, 500, "b"), mk("c", 500, 700, "c")]);
    const s = retimeRun(d, "b", "c", 300, 1100);
    expect(s.words.map((w) => [w.startMs, w.endMs])).toEqual([[300, 700], [700, 1100]]);
  });
  it("ripples later words when linked", async () => {
    const { retimeRun } = await import("./ops");
    const d = docOf([mk("a", 0, 200, "a"), mk("b", 300, 500, "b"), mk("d", 1000, 1200, "d")]);
    const r = retimeRun(d, "a", "a", 100, 300, true);
    expect(r.words.map((w) => [w.startMs, w.endMs])).toEqual([[100, 300], [400, 600], [1100, 1300]]);
  });
});
