import { describe, expect, it } from "vitest";
import { proposeSegments } from "@motion-ai/caption-engine/core";
import {
  CLIP_MIN_MS,
  clampClipRange,
  clipProjectTitle,
  computeClipSignals,
  detectHook,
  fmtClipRange,
  fmtClipTime,
  rankClipProposals,
  suggestClipSegments,
  type TimedWordLike,
} from "./clipper";
import type { SceneChange, SilenceSpan } from "./analysis";

describe("fmtClipTime / fmtClipRange", () => {
  it("formats m:ss with a padded seconds part", () => {
    expect(fmtClipTime(0)).toBe("0:00");
    expect(fmtClipTime(32_000)).toBe("0:32");
    expect(fmtClipTime(65_000)).toBe("1:05");
    expect(fmtClipTime(760_000)).toBe("12:40");
    expect(fmtClipRange(32_000, 65_000)).toBe("0:32–1:05");
  });
});

describe("clampClipRange", () => {
  it("passes a valid range through (rounded)", () => {
    expect(clampClipRange({ startMs: 1000.4, endMs: 20_000.6 }, 120_000)).toEqual({ startMs: 1000, endMs: 20_001 });
  });

  it("clamps both edges to the media", () => {
    expect(clampClipRange({ startMs: -5000, endMs: 999_000 }, 120_000)).toEqual({ startMs: 0, endMs: 120_000 });
  });

  it("enforces the minimum duration by widening the end, then pulling the start back at the media end", () => {
    expect(clampClipRange({ startMs: 10_000, endMs: 11_000 }, 120_000)).toEqual({ startMs: 10_000, endMs: 10_000 + CLIP_MIN_MS });
    expect(clampClipRange({ startMs: 119_000, endMs: 119_500 }, 120_000)).toEqual({ startMs: 120_000 - CLIP_MIN_MS, endMs: 120_000 });
  });

  it("a reversed range becomes a minimum-length range at the start edge", () => {
    const out = clampClipRange({ startMs: 30_000, endMs: 20_000 }, 120_000);
    expect(out.endMs - out.startMs).toBe(CLIP_MIN_MS);
    expect(out.startMs).toBe(30_000);
  });
});

describe("clipProjectTitle", () => {
  it("appends the range as a Clip suffix", () => {
    expect(clipProjectTitle("My podcast", 32_000, 65_000)).toBe("My podcast · Clip 0:32–1:05");
  });

  it("falls back to Untitled and never exceeds the 120-char project limit", () => {
    expect(clipProjectTitle("", 0, 15_000)).toBe("Untitled project · Clip 0:00–0:15");
    const long = clipProjectTitle("x".repeat(300), 0, 15_000);
    expect(long.length).toBe(120);
    expect(long.endsWith("· Clip 0:00–0:15")).toBe(true);
  });
});

/* ---------------- slice 5.3: combined segmentation ---------------- */

let m = 0;
const tw = (startMs: number, endMs: number, text = `x${m++}`): TimedWordLike => ({ text, startMs, endMs });

function speechWords(fromMs: number, toMs: number, stepMs = 1000, durMs = 800, prefix = "w"): TimedWordLike[] {
  const out: TimedWordLike[] = [];
  let i = 0;
  for (let t = fromMs; t + durMs <= toMs; t += stepMs) out.push(tw(t, t + durMs, `${prefix}${i++}`));
  return out;
}

const sil = (startMs: number, endMs: number): SilenceSpan => ({ startMs, endMs, meanEnergy: 0.01 });
const cut = (atMs: number): SceneChange => ({ atMs, score: 0.9 });

describe("suggestClipSegments", () => {
  it("with no analysis it is exactly proposeSegments (existing behaviour untouched)", () => {
    const words = [...speechWords(0, 20_000), ...speechWords(22_000, 42_000), ...speechWords(44_000, 49_000)];
    expect(suggestClipSegments(words)).toEqual(proposeSegments(words));
    expect(suggestClipSegments(words, { silences: [], sceneCuts: [] })).toEqual(proposeSegments(words));
  });

  it("a coincident silence + scene cut breaks a run the transcript gap alone would not", () => {
    const words = speechWords(0, 40_000); // 200 ms word gaps throughout — one run for the transcript alone
    expect(suggestClipSegments(words)).toHaveLength(1);
    // silence covering the 19_900 boundary midpoint + a scene cut on it
    const analysis = { silences: [sil(19_600, 20_200)], sceneCuts: [cut(19_900)] };
    const p = suggestClipSegments(words, analysis);
    expect(p).toHaveLength(2);
    expect(p[0]!.endMs).toBe(19_800);
    expect(p[1]!.startMs).toBe(20_000);
  });

  it("silence alone, or a scene cut alone, does NOT break a run", () => {
    const words = speechWords(0, 40_000);
    expect(suggestClipSegments(words, { silences: [sil(19_600, 20_200)] })).toHaveLength(1);
    expect(suggestClipSegments(words, { sceneCuts: [cut(19_900)] })).toHaveLength(1);
  });

  it("a long run splits at an aligned boundary in preference to a larger unaligned gap", () => {
    const words: TimedWordLike[] = [];
    for (let t = 0; t + 400 <= 29_900; t += 500) words.push(tw(t, t + 400)); // ends 29_900
    for (let t = 30_300; t + 400 <= 59_700; t += 500) words.push(tw(t, t + 400)); // 400 ms gap, then ends 59_700
    for (let t = 60_500; t + 400 <= 89_900; t += 500) words.push(tw(t, t + 400)); // 800 ms gap (the largest)
    // transcript-only segmentation splits at the 800 ms gap
    expect(proposeSegments(words)[0]!.endMs).toBe(59_700);
    // with a silence over the 400 ms gap, the aligned boundary wins the split
    const p = suggestClipSegments(words, { silences: [sil(29_800, 30_400)] });
    expect(p).toHaveLength(2);
    expect(p[0]!.endMs).toBe(29_900);
    expect(p[1]!.startMs).toBe(30_300);
  });

  it("every suggested edge is a word edge, with or without analysis", () => {
    const words = [...speechWords(0, 40_000), ...speechWords(42_000, 70_000)];
    const starts = new Set(words.map((w) => w.startMs));
    const ends = new Set(words.map((w) => w.endMs));
    for (const analysis of [{}, { silences: [sil(19_600, 20_200), sil(50_000, 51_000)], sceneCuts: [cut(19_900), cut(55_000)] }]) {
      for (const p of suggestClipSegments(words, analysis)) {
        expect(starts.has(p.startMs)).toBe(true);
        expect(ends.has(p.endMs)).toBe(true);
      }
    }
  });
});

/* ---------------- A7: measured signals + explanations ---------------- */

describe("detectHook", () => {
  it("detects question, number and claim in the opening words, with the matched token", () => {
    const hook = detectHook([tw(0, 400, "How"), tw(500, 900, "many"), tw(1000, 1400, "3"), tw(1500, 1900, "secrets")]);
    expect(hook.detected).toBe(true);
    expect(hook.kinds).toEqual(["question", "number", "claim"]);
    expect(hook.matched).toBe("how");
  });

  it("a question mark in the transcript counts as a question", () => {
    expect(detectHook([tw(0, 400, "ready?")]).kinds).toEqual(["question"]);
  });

  it("plain opening words detect nothing", () => {
    const hook = detectHook([tw(0, 400, "hello"), tw(500, 900, "there"), tw(1000, 1400, "friend")]);
    expect(hook).toMatchObject({ detected: false, kinds: [], matched: null });
  });
});

describe("computeClipSignals (pinned fixture)", () => {
  const words: TimedWordLike[] = [
    tw(0, 800, "How"), tw(1000, 1800, "many"), tw(2000, 2800, "3"), tw(4000, 4800, "steps"),
    tw(5000, 5800, "take"), tw(6000, 6800, "this"), tw(7000, 7800, "one"), tw(8000, 8800, "secret"), tw(9000, 9800, "end"),
  ];
  const analysis = {
    silences: [sil(3000, 4000), sil(9000, 11_000)],
    sceneCuts: [cut(2000), cut(5000), cut(9700)],
  };
  const signals = computeClipSignals(words, { startMs: 0, endMs: 9800 }, analysis);

  it("measures hook, pauses, word rate, scene changes, density and silence with values", () => {
    expect(signals.hook.kinds).toEqual(["question", "number"]);
    expect(signals.wordCount).toBe(9);
    expect(signals.pauseCount).toBe(1); // only the 1200 ms gap before "steps" reaches 400 ms
    expect(signals.wordRateWpm).toBeCloseTo(9 / (9800 / 60_000), 6);
    expect(signals.pausesPerMinute).toBeCloseTo(1 / (9800 / 60_000), 6);
    expect(signals.wordsPerSecond).toBeCloseTo(9 / 9.8, 6);
    expect(signals.sceneChangeCount).toBe(3); // 2000, 5000 and 9700 are all strictly inside (0, 9800)
    expect(signals.silenceMsInside).toBe(1800); // 3000–4000 fully + 9000–9800 of the second span
  });

  it("boundary alignment reports distances and which edges align", () => {
    expect(signals.startBoundary.aligned).toBe(false); // nearest silence edge 3000 ms, nearest cut 2000 ms
    expect(signals.endBoundary.aligned).toBe(true); // scene cut 100 ms from the end edge
    expect(signals.endBoundary.sceneDistanceMs).toBe(100);
    expect(signals.alignedBoundaryCount).toBe(1);
  });
});

describe("rankClipProposals", () => {
  it("orders by the measured signals (hook first), explains every clip, and carries no score", () => {
    // NOTE: fixture texts must carry no digits — a digit is itself a hook signal
    const plain = speechWords(0, 20_000, 1000, 800, "plain").map((w) => ({ ...w, text: "plain" }));
    const hooked = speechWords(22_000, 42_000, 1000, 800, "talk").map((w) => ({ ...w, text: "talk" }));
    hooked[0] = tw(22_000, 22_800, "Why");
    hooked[1] = tw(23_000, 23_800, "does");
    const ranked = rankClipProposals([...plain, ...hooked]);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]).toMatchObject({ rank: 1, startMs: 22_000 });
    expect(ranked[1]).toMatchObject({ rank: 2, startMs: 0 });
    for (const p of ranked) {
      expect(Object.keys(p)).not.toContain("score");
      expect(p.explanation).toContain(`Ranked ${p.rank} of 2.`);
      expect(p.explanation.toLowerCase()).not.toContain("viral");
    }
    expect(ranked[0]!.explanation).toContain("question");
    expect(ranked[0]!.explanation).toContain("words per minute");
    expect(ranked[1]!.explanation).toContain("No question, number or strong claim");
  });

  it("ranked proposals keep word-edge boundaries", () => {
    const words = speechWords(0, 30_000);
    const starts = new Set(words.map((w) => w.startMs));
    const ends = new Set(words.map((w) => w.endMs));
    for (const p of rankClipProposals(words, { silences: [sil(10_000, 11_000)], sceneCuts: [cut(15_000)] })) {
      expect(starts.has(p.startMs)).toBe(true);
      expect(ends.has(p.endMs)).toBe(true);
    }
  });
});
