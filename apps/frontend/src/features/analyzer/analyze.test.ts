import { describe, expect, it } from "vitest";
import { analyzeReel, BEAT_PAUSE_MS, HOOK_WINDOW_MS, type AnalyzerWord } from "./analyze";

/* ---------------- fixture construction ---------------- */

const seg = (texts: string[], startMs: number, stepMs: number, durMs = 400): AnalyzerWord[] =>
  texts.map((text, i) => ({ text, startMs: startMs + i * stepMs, endMs: startMs + i * stepMs + durMs }));

/**
 * ~45 s reel, built from seven speech runs separated by planned gaps / cuts:
 *  A hook (0–2.9 s) · B · C · D · E (long story run) · CTA run · close run.
 * Gaps: A→B 900 ms, B→C 800 ms (scene cut at 10 000 inside it),
 * C→D 400 ms (scene cut at 16 400 inside it — a cut-only boundary),
 * D→E 1 200 ms, E→CTA 1 000 ms, CTA→close 900 ms.
 * Extra cuts at 5 200 / 19 200 / 30 400 / 42 000 land mid-word and must not split beats.
 */
const hookRun = seg(["Kya", "aap", "3", "galti", "karte", "ho?"], 0, 500);
const runB = seg(["Pehle", "apna", "topic", "chuno", "aur", "ek", "line", "mein", "baat", "samjhao"], 3800, 600);
const runC = seg(["Phir", "script", "likho", "chhoti", "lines", "mein", "taaki", "sunne", "wala", "bore"], 10_400, 600);
const runD = seg(["Har", "shot", "mein", "ek", "naya", "angle", "dikhao", "warna", "dhyaan", "bhatkega"], 16_600, 600);
const runE = seg(
  ["Editing", "karte", "waqt", "captions", "hamesha", "padhne", "layak", "rakho", "font", "bada",
   "aur", "saaf", "chuno", "music", "halka", "rakho", "taaki", "awaaz", "saaf", "aaye"],
  23_600, 600,
);
const ctaRun = seg(["Aur", "ab", "link", "in", "bio", "mein", "jao"], 36_400, 500);
const closeRun = seg(["Bas", "yahi", "teen", "kadam", "roz", "dohrao", "aur", "dekho"], 40_700, 500);

const fixtureWords: AnalyzerWord[] = [...hookRun, ...runB, ...runC, ...runD, ...runE, ...ctaRun, ...closeRun];
const fixtureCuts = [5200, 10_000, 16_400, 19_200, 30_400, 42_000];
const breakdown = analyzeReel({ words: fixtureWords, durationMs: 45_000, sceneCutsMs: fixtureCuts });

/** A7 mirror: no key named "score", in any casing, at any depth of the breakdown. */
function expectNoScoreKey(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(expectNoScoreKey);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      expect(key.toLowerCase()).not.toBe("score");
      expectNoScoreKey(v);
    }
  }
}

describe("analyzeReel — 45 s fixture", () => {
  it("hook: first-3s text, question + number signals, last word end", () => {
    expect(breakdown.version).toBe(1);
    expect(breakdown.hook.windowMs).toBe(HOOK_WINDOW_MS);
    expect(breakdown.hook.windowMs).toBe(3000);
    expect(breakdown.hook.text).toBe("Kya aap 3 galti karte ho?");
    expect(breakdown.hook.wordCount).toBe(6);
    expect(breakdown.hook.lastWordEndMs).toBe(2900);
    expect(breakdown.hook.hasQuestion).toBe(true); // "?" in the text AND first word "kya"
    expect(breakdown.hook.hasNumber).toBe(true); // the token "3"
    expect(breakdown.hook.method).toContain("3000");
  });

  it("onScreenText is honestly not-extracted, with the reason in the note", () => {
    expect(breakdown.onScreenText.status).toBe("not-extracted");
    expect(breakdown.onScreenText.note).toContain("NOT read");
    expect(breakdown.onScreenText.note).toContain("not reliable enough on typical phones");
    expect(breakdown.onScreenText.note).toContain("spoken transcript and the picture cuts only");
  });

  it("beats: partition covers every word exactly once, in order, with structural labels", () => {
    expect(breakdown.beats).toHaveLength(7);
    expect(breakdown.beats.map((b) => b.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(breakdown.beats.map((b) => b.label)).toEqual([
      "Hook", "Story", "Story", "Story", "Story", "Call to action", "Close",
    ]);
    expect(breakdown.beats.map((b) => b.startMs)).toEqual([0, 3800, 10_400, 16_600, 23_600, 36_400, 40_700]);
    expect(breakdown.beats.map((b) => b.endMs)).toEqual([2900, 9600, 16_200, 22_400, 35_400, 39_800, 44_600]);
    expect(breakdown.beats.map((b) => b.wordCount)).toEqual([6, 10, 10, 10, 20, 7, 8]);
    // contiguity: the beats' texts re-join to the full transcript, word for word
    expect(breakdown.beats.map((b) => b.text).join(" ")).toBe(fixtureWords.map((w) => w.text).join(" "));
    expect(breakdown.beats.reduce((n, b) => n + b.wordCount, 0)).toBe(fixtureWords.length);
    for (const beat of breakdown.beats) {
      expect(beat.method).toContain(`${BEAT_PAUSE_MS} ms`);
      expect(beat.method).toContain("structural positions only");
      expect(beat.method).toContain("not quality judgements");
    }
  });

  it("cta: 'link in bio' near the end, with its measured position", () => {
    expect(breakdown.cta.method).toBe("Matched against a fixed phrase list in the transcript — not a model.");
    expect(breakdown.cta.hasCta).toBe(true);
    expect(breakdown.cta.found).toEqual([{ phrase: "link in bio", wordIndex: 58, atMs: 37_400 }]);
    expect(breakdown.cta.firstCtaAtMs).toBe(37_400);
    expect(breakdown.cta.firstCtaPositionPct).toBe(83.1); // 37400 / 45000 × 100, 1 decimal
  });

  it("pacing: exact arithmetic on the fixture", () => {
    expect(breakdown.pacing).toMatchObject({
      durationMs: 45_000,
      totalWords: 71,
      wordsPerMin: 94.7, // 71 / 0.75 min
      cutCount: 6,
      cutsPerMin: 8, // 6 / 0.75 min
      avgShotMs: 6429, // round(45000 / (6 + 1))
      pauseCount: 5, // 900, 800, 1200, 1000, 900 — the 400 ms C→D gap is not a pause
      longestPauseMs: 1200,
    });
    expect(breakdown.pacing.method.length).toBeGreaterThan(0);
  });

  it("metrics: every metric carries its method and the same values as the sections", () => {
    const byId = new Map(breakdown.metrics.map((m) => [m.id, m]));
    for (const id of [
      "duration", "total-words", "words-per-minute", "scene-cuts", "cuts-per-minute",
      "average-shot-length", "hook-word-count", "hook-signals", "pause-count",
      "longest-pause", "first-cta-position",
    ]) {
      expect(byId.has(id), `metric ${id}`).toBe(true);
    }
    for (const m of breakdown.metrics) {
      expect(m.label.length, m.id).toBeGreaterThan(0);
      expect(m.display.length, m.id).toBeGreaterThan(0);
      expect(m.method.length, m.id).toBeGreaterThan(0);
    }
    expect(byId.get("duration")!.value).toBe(breakdown.pacing.durationMs);
    expect(byId.get("total-words")!.value).toBe(breakdown.pacing.totalWords);
    expect(byId.get("words-per-minute")!.value).toBe(breakdown.pacing.wordsPerMin);
    expect(byId.get("scene-cuts")!.value).toBe(breakdown.pacing.cutCount);
    expect(byId.get("cuts-per-minute")!.value).toBe(breakdown.pacing.cutsPerMin);
    expect(byId.get("average-shot-length")!.value).toBe(breakdown.pacing.avgShotMs);
    expect(byId.get("hook-word-count")!.value).toBe(breakdown.hook.wordCount);
    expect(byId.get("hook-signals")!.display).toBe("question, number");
    expect(byId.get("pause-count")!.value).toBe(breakdown.pacing.pauseCount);
    expect(byId.get("longest-pause")!.value).toBe(breakdown.pacing.longestPauseMs);
    expect(byId.get("first-cta-position")!.value).toBe(breakdown.cta.firstCtaPositionPct);
    expect(byId.get("first-cta-position")!.display).toBe("83.1%");
  });

  it("A7: no 'score' key anywhere in the breakdown", () => {
    expectNoScoreKey(breakdown);
  });
});

describe("analyzeReel — Hinglish CTA", () => {
  it("'follow karo' matches as one phrase (longest first), never as a bare 'follow'", () => {
    const out = analyzeReel({
      words: seg(["Doston", "follow", "karo", "aur", "seekho"], 0, 500),
      durationMs: 5000,
      sceneCutsMs: [],
    });
    expect(out.cta.found).toEqual([{ phrase: "follow karo", wordIndex: 1, atMs: 500 }]);
    expect(out.cta.hasCta).toBe(true);
    expect(out.cta.firstCtaAtMs).toBe(500);
    expect(out.cta.firstCtaPositionPct).toBe(10);
    // one run of speech = one beat, and a single beat is Hook even though it holds the CTA
    expect(out.beats).toHaveLength(1);
    expect(out.beats[0]!.label).toBe("Hook");
    expectNoScoreKey(out);
  });
});

describe("analyzeReel — beat boundaries", () => {
  it("a scene cut inside a gap creates a boundary even when the gap is < 700 ms", () => {
    const words: AnalyzerWord[] = [
      { text: "Pehla", startMs: 0, endMs: 400 },
      { text: "dusra", startMs: 1000, endMs: 1400 }, // 600 ms gap, cut at 700 inside it
      { text: "teesra", startMs: 1500, endMs: 1900 }, // 100 ms gap, no cut
    ];
    const withCut = analyzeReel({ words, durationMs: 2000, sceneCutsMs: [700] });
    expect(withCut.beats.map((b) => b.text)).toEqual(["Pehla", "dusra teesra"]);
    expect(withCut.pacing.pauseCount).toBe(0); // a cut boundary is not a pause
    const withoutCut = analyzeReel({ words, durationMs: 2000, sceneCutsMs: [] });
    expect(withoutCut.beats).toHaveLength(1);
  });

  it("scene figures report 'not measured' (never a fake zero) when scene detection has not run", () => {
    const out = analyzeReel({ words: fixtureWords, durationMs: 45_000, sceneCutsMs: null });
    expect(out.pacing.cutCount).toBeNull();
    expect(out.pacing.cutsPerMin).toBeNull();
    expect(out.pacing.avgShotMs).toBeNull();
    for (const id of ["scene-cuts", "cuts-per-minute", "average-shot-length"]) {
      const m = out.metrics.find((x) => x.id === id)!;
      expect(m.value).toBeNull();
      expect(m.display).toBe("Not measured");
    }
    // an empty array still means measured-with-no-cuts, and reports a real zero
    const measured = analyzeReel({ words: fixtureWords, durationMs: 45_000, sceneCutsMs: [] });
    expect(measured.metrics.find((x) => x.id === "scene-cuts")!.display).toBe("0");
  });

  it("a gap of exactly 700 ms is a pause and splits beats", () => {
    const out = analyzeReel({
      words: [
        { text: "ek", startMs: 0, endMs: 400 },
        { text: "do", startMs: 1100, endMs: 1500 },
      ],
      durationMs: 2000,
      sceneCutsMs: [],
    });
    expect(out.beats).toHaveLength(2);
    expect(out.beats.map((b) => b.label)).toEqual(["Hook", "Close"]);
    expect(out.pacing.pauseCount).toBe(1);
    expect(out.pacing.longestPauseMs).toBe(700);
  });
});

describe("analyzeReel — hook signal variants", () => {
  it("a question word as the first word counts, without a '?'", () => {
    const out = analyzeReel({
      words: seg(["How", "do", "you", "start"], 0, 500),
      durationMs: 4000,
      sceneCutsMs: [],
    });
    expect(out.hook.hasQuestion).toBe(true);
    expect(out.hook.hasNumber).toBe(false);
  });

  it("plain opening words have no hook signals", () => {
    const out = analyzeReel({
      words: seg(["Hello", "doston", "aaj", "hum"], 0, 500),
      durationMs: 4000,
      sceneCutsMs: [],
    });
    expect(out.hook.hasQuestion).toBe(false);
    expect(out.hook.hasNumber).toBe(false);
    expect(out.metrics.find((m) => m.id === "hook-signals")!.display).toBe("none");
  });
});

describe("analyzeReel — robustness", () => {
  it("empty words + zero duration: empty sections, zeroed pacing, no throw", () => {
    const out = analyzeReel({ words: [], durationMs: 0, sceneCutsMs: [] });
    expect(out.hook).toMatchObject({ text: "", wordCount: 0, lastWordEndMs: null, hasQuestion: false, hasNumber: false });
    expect(out.beats).toEqual([]);
    expect(out.cta).toMatchObject({ found: [], hasCta: false, firstCtaAtMs: null, firstCtaPositionPct: null });
    expect(out.pacing).toMatchObject({
      durationMs: 0, totalWords: 0, wordsPerMin: 0, cutCount: 0, cutsPerMin: 0,
      avgShotMs: 0, pauseCount: 0, longestPauseMs: 0,
    });
    expect(out.metrics.find((m) => m.id === "first-cta-position")!.display).toBe("none");
    expectNoScoreKey(out);
  });

  it("zero duration with a CTA: the match is reported, its position is null (never Infinity)", () => {
    const out = analyzeReel({
      words: seg(["follow", "karo"], 0, 500),
      durationMs: 0,
      sceneCutsMs: [],
    });
    expect(out.cta.hasCta).toBe(true);
    expect(out.cta.firstCtaAtMs).toBe(0);
    expect(out.cta.firstCtaPositionPct).toBeNull();
    expect(out.pacing.wordsPerMin).toBe(0);
  });

  it("unsorted input is sorted on a copy, empty-text words are dropped, caller input is untouched", () => {
    const words: AnalyzerWord[] = [
      { text: "world", startMs: 1000, endMs: 1400 },
      { text: "   ", startMs: 500, endMs: 900 },
      { text: "Hello", startMs: 0, endMs: 400 },
    ];
    const snapshot = JSON.stringify(words);
    const out = analyzeReel({ words, durationMs: 2000, sceneCutsMs: [] });
    expect(out.pacing.totalWords).toBe(2);
    expect(out.beats).toHaveLength(1);
    expect(out.beats[0]!.text).toBe("Hello world");
    expect(JSON.stringify(words)).toBe(snapshot);
  });
});
