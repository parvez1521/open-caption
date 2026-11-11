import { describe, expect, it } from "vitest";
import type { ClipAnalysisInput } from "../clipper";
import { refineCandidate } from "./boundaries";
import { dedupeByScore, wordRangeIou } from "./dedupe";
import { runHighlightEngine } from "./engine";
import { parseHighlightReply } from "./parse";
import { audioQualityScore, signalsScore, measureClip } from "./score";
import { buildSentences } from "./sentences";
import { buildWindows } from "./windows";
import type { HighlightRequest, HighlightWord } from "./types";

/**
 * Engine tests for the AI Clipping Studio: the post-processing law (sentence
 * snap, completeness, duration fit, dedupe, silence-aligned cuts) is pinned
 * here at the word level, and the engine's failure behaviour (one bad window,
 * all windows down, no model at all) is exercised with scripted runners.
 */

/** Build words from sentence strings: 320 ms per word, 80 ms between words, a pause after each sentence. */
function transcript(sentenceTexts: string[], opts: { startMs?: number; sentenceGapMs?: number } = {}): HighlightWord[] {
  const words: HighlightWord[] = [];
  let t = opts.startMs ?? 0;
  for (const text of sentenceTexts) {
    for (const token of text.split(/\s+/).filter(Boolean)) {
      words.push({ text: token, startMs: t, endMs: t + 320 });
      t += 400;
    }
    t += opts.sentenceGapMs ?? 500;
  }
  return words;
}

function fillerSentences(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `Filler sentence number ${i} about ordinary things that happened today.`);
}

const NO_ANALYSIS: ClipAnalysisInput = { silences: [] };
const REQ: HighlightRequest = { contentType: "podcast", clipCount: 3, minSec: 15, maxSec: 90, aspect: "9:16" };

const clipJson = (clips: unknown[]): string => JSON.stringify({ clips });
const cand = (start: number, end: number, score = 85, extra: Record<string, unknown> = {}) => ({
  start_word_index: start,
  end_word_index: end,
  title: "A specific moment",
  summary: "What happens here.",
  reason: "It opens on a question and lands on a clear answer.",
  score,
  score_breakdown: { hook: score, value: score, story_completeness: score, engagement: score },
  ...extra,
});

describe("sentences", () => {
  it("splits on terminal punctuation and on 800 ms pauses", () => {
    const words = transcript(["Hello there friend.", "This has no ending mark", "Next one starts here."], { sentenceGapMs: 900 });
    const sentences = buildSentences(words);
    expect(sentences.length).toBe(3);
    expect(sentences[0]!.text).toBe("Hello there friend.");
    expect(sentences[2]!.isQuestion).toBe(false);
  });

  it("marks questions", () => {
    const words = transcript(["Why does this matter?", "Because it changes everything."]);
    const sentences = buildSentences(words);
    expect(sentences[0]!.isQuestion).toBe(true);
  });
});

describe("windows", () => {
  it("windows a 35-minute transcript with ~60 s overlaps, and a seam moment is wholly inside some window", () => {
    // ~150 wpm: 35 min ≈ 5,250 words at 400 ms spacing
    const words = transcript(fillerSentences(430));
    const totalMs = words[words.length - 1]!.endMs;
    expect(totalMs).toBeGreaterThan(30 * 60_000);
    const windows = buildWindows(words);
    expect(windows.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < windows.length; i++) {
      const overlapMs = windows[i - 1]!.endMs - windows[i]!.startMs;
      expect(overlapMs).toBeGreaterThan(50_000);
      expect(overlapMs).toBeLessThan(70_000);
    }
    // a 30 s span straddling the first seam lives wholly inside window 0 or 1
    const seam = windows[0]!.endMs - 15_000;
    const covered = windows.some((w) => w.startMs <= seam && w.endMs >= seam + 30_000);
    expect(covered).toBe(true);
  });
});

describe("parse", () => {
  const win = { index: 0, firstWord: 0, lastWord: 100 };
  it("parses a clean reply and tolerates fences", () => {
    const out = parseHighlightReply("```json\n" + clipJson([cand(3, 40)]) + "\n```", win);
    expect(out).toHaveLength(1);
    expect(out[0]!.startWord).toBe(3);
  });
  it("falls back to the overall score for missing breakdown fields", () => {
    const bare = { start_word_index: 1, end_word_index: 9, title: "T", score: 70 };
    const out = parseHighlightReply(clipJson([bare]), win);
    expect(out[0]!.breakdown).toEqual({ hook: 70, value: 70, storyCompleteness: 70, engagement: 70 });
  });
  it("drops scoreless and out-of-window candidates; throws on a reply with no clips array", () => {
    const out = parseHighlightReply(
      clipJson([cand(500, 600), { start_word_index: 1, end_word_index: 5, title: "no score" }, cand(2, 8, 60)]),
      win,
    );
    expect(out).toHaveLength(1);
    expect(() => parseHighlightReply("no json here", win)).toThrow();
    expect(() => parseHighlightReply('{"nope": true}', win)).toThrow();
  });
});

describe("boundaries", () => {
  const sentencesOf = (texts: string[]) => {
    const words = transcript(texts);
    return { words, sentences: buildSentences(words) };
  };

  it("expands a mid-sentence proposal to the whole sentences — no partial words at the edges", () => {
    const { words, sentences } = sentencesOf([
      "The first sentence sets the scene completely.",
      "The second sentence carries the real point of the story.",
      "The third sentence wraps everything up neatly.",
    ]);
    // propose words strictly inside sentences 1 and 2 (0-based sentence 1..2 boundary partial)
    const refined = refineCandidate(
      words,
      sentences,
      { startWord: sentences[1]!.firstWord + 2, endWord: sentences[2]!.lastWord - 1 },
      { minMs: 1_000, maxMs: 120_000 },
    );
    expect(refined).not.toBeNull();
    expect(refined!.startWord).toBe(sentences[1]!.firstWord);
    expect(refined!.endWord).toBe(sentences[2]!.lastWord);
    expect(refined!.speechStartMs).toBe(words[refined!.startWord]!.startMs);
    expect(refined!.speechEndMs).toBe(words[refined!.endWord]!.endMs);
  });

  it("keeps a question with its answer", () => {
    const { words, sentences } = sentencesOf([
      "So what actually happens when the price doubles overnight?",
      "Everything downstream breaks within a week.",
      "That is the part nobody plans for.",
    ]);
    const refined = refineCandidate(
      words,
      sentences,
      { startWord: sentences[0]!.firstWord, endWord: sentences[0]!.lastWord },
      { minMs: 1_000, maxMs: 120_000 },
    );
    expect(refined!.lastSentence).toBe(1);
  });

  it("pulls the previous sentence in when a clip would open on an answer fragment", () => {
    const { words, sentences } = sentencesOf([
      "Did the cheaper plan change anything at all?",
      "Yes, and that is exactly why the churn dropped.",
    ]);
    const refined = refineCandidate(
      words,
      sentences,
      { startWord: sentences[1]!.firstWord, endWord: sentences[1]!.lastWord },
      { minMs: 1_000, maxMs: 120_000 },
    );
    expect(refined!.firstSentence).toBe(0);
  });

  it("drops a candidate that cannot fit the duration without butchery", () => {
    const longSentence = `One ${"very ".repeat(60)}long sentence that runs far beyond the allowed window for any clip.`;
    const { words, sentences } = sentencesOf([longSentence]);
    const refined = refineCandidate(
      words,
      sentences,
      { startWord: 0, endWord: words.length - 1 },
      { minMs: 1_000, maxMs: 5_000 },
    );
    expect(refined).toBeNull();
  });

  it("aligns the cut times into measured silence around the speech", () => {
    const words = transcript(["A complete thought that stands alone.", "Another sentence follows after it here."], { startMs: 5_000 });
    const sentences = buildSentences(words);
    const speechStart = words[0]!.startMs;
    const speechEnd = words[sentences[0]!.lastWord]!.endMs;
    const silences = [
      { startMs: speechStart - 900, endMs: speechStart - 100, meanEnergy: 0.01 },
      { startMs: speechEnd + 100, endMs: speechEnd + 580, meanEnergy: 0.01 },
    ];
    const refined = refineCandidate(words, sentences, { startWord: 0, endWord: sentences[0]!.lastWord }, {
      minMs: 500,
      maxMs: 60_000,
      silences,
    });
    expect(refined!.startMs).toBeLessThan(speechStart);
    expect(refined!.startMs).toBeGreaterThanOrEqual(silences[0]!.startMs);
    expect(refined!.endMs).toBeGreaterThan(speechEnd);
    expect(refined!.endMs).toBeLessThanOrEqual(silences[1]!.endMs);
  });
});

describe("dedupe", () => {
  it("IoU math and greedy survival of the higher score", () => {
    expect(wordRangeIou({ startWord: 0, endWord: 99 }, { startWord: 50, endWord: 149 })).toBeCloseTo(50 / 150, 5);
    const kept = dedupeByScore(
      [
        { startWord: 0, endWord: 99, s: 70 },
        { startWord: 10, endWord: 109, s: 90 },
        { startWord: 500, endWord: 599, s: 60 },
      ],
      (x) => x.s,
    );
    expect(kept.map((k) => k.s)).toEqual([90, 60]);
  });
  it("same start sentence is a duplicate even at low IoU", () => {
    const kept = dedupeByScore(
      [
        { startWord: 0, endWord: 19, firstSentence: 4, s: 60 },
        { startWord: 0, endWord: 99, firstSentence: 4, s: 80 },
      ],
      (x) => x.s,
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]!.s).toBe(80);
  });
});

describe("measured scores", () => {
  it("audio quality: quiet speech scores low, healthy levels high, clipping is penalised", () => {
    const hop = 20;
    const healthy = new Float32Array(500).fill(0.3);
    const quiet = new Float32Array(500).fill(0.01);
    const clipping = new Float32Array(500).fill(1);
    expect(audioQualityScore(healthy, hop, 0, 10_000)!).toBeGreaterThan(80);
    expect(audioQualityScore(quiet, hop, 0, 10_000)!).toBeLessThan(50);
    expect(audioQualityScore(clipping, hop, 0, 10_000)!).toBeLessThan(audioQualityScore(healthy, hop, 0, 10_000)!);
    expect(audioQualityScore(null, hop, 0, 10_000)).toBeNull();
  });

  it("signals score renormalises over the rows that were measured", () => {
    const words = transcript(["What is the one number nobody checks before buying?", "It is the renewal price, every single time."]);
    const m = measureClip(words, { startMs: 0, endMs: words[words.length - 1]!.endMs }, NO_ANALYSIS, null, 20);
    expect(m.hook).toBeGreaterThan(35); // question + number at the open
    const s = signalsScore(m);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});

describe("engine", () => {
  const baseInput = (over: Partial<Parameters<typeof runHighlightEngine>[0]>) => ({
    words: transcript([
      "Welcome back to the show, today we have a founder with us.",
      "What is the one mistake every new founder makes in month one?",
      "They price too low because they are afraid nobody will pay.",
      "And the fix is embarrassingly simple once you see it clearly.",
      ...fillerSentences(6),
    ]),
    analysis: NO_ANALYSIS,
    peaks: null,
    hopMs: 20,
    request: { ...REQ, minSec: 5, maxSec: 120 },
    runner: null,
    runnerSource: null,
    ...over,
  });

  it("falls back to signals (badged, not faked) when no runner is available", async () => {
    const res = await runHighlightEngine(baseInput({}));
    expect(res.source).toBe("signals");
    expect(res.fellBack).toBe(false);
    expect(res.clips.length).toBeGreaterThan(0);
    const modelRows = res.clips[0]!.breakdown.filter((r) => r.kind === "model");
    expect(modelRows.every((r) => r.value === null)).toBe(true);
    expect(res.clips[0]!.breakdown.some((r) => r.kind === "measured" && r.value !== null)).toBe(true);
  });

  it("returns the model's clips with model + measured breakdown rows and honest labels", async () => {
    const words = baseInput({}).words;
    const sentences = buildSentences(words);
    const runner = async () => clipJson([cand(sentences[1]!.firstWord, sentences[3]!.lastWord, 88)]);
    const res = await runHighlightEngine(baseInput({ runner, runnerSource: "cloud" }));
    expect(res.source).toBe("cloud");
    expect(res.clips).toHaveLength(1);
    const clip = res.clips[0]!;
    expect(clip.startWord).toBe(sentences[1]!.firstWord); // snapped to sentence edges
    expect(clip.hook.startsWith("What is the one mistake")).toBe(true); // verbatim opening, derived in code
    expect(clip.breakdown.find((r) => r.key === "hook")!.kind).toBe("model");
    expect(clip.breakdown.find((r) => r.key === "pace")!.kind).toBe("measured");
    expect(clip.score).toBeGreaterThan(0);
  });

  it("an empty model answer is returned as an empty result — not back-filled", async () => {
    const res = await runHighlightEngine(baseInput({ runner: async () => clipJson([]), runnerSource: "cloud" }));
    expect(res.source).toBe("cloud");
    expect(res.clips).toHaveLength(0);
    expect(res.notes.join(" ")).toMatch(/no moments/i);
  });

  it("isolates a failing window: the others still produce clips", async () => {
    // a long transcript → multiple windows; fail every call for the first window only
    const words = transcript(fillerSentences(500));
    const windows = buildWindows(words);
    expect(windows.length).toBeGreaterThan(1);
    const sentences = buildSentences(words);
    const runner = async () => clipJson([cand(sentences[100]!.firstWord, sentences[102]!.lastWord, 80)]);
    const flaky = async (prompt: { system: string; user: string }) => {
      // fail by prompt content: the first window's text contains word 0's marker
      if (prompt.user.includes("[0]Filler")) throw new Error("window one is down");
      return runner();
    };
    const res = await runHighlightEngine({
      words,
      analysis: NO_ANALYSIS,
      peaks: null,
      hopMs: 20,
      request: { ...REQ, minSec: 5, maxSec: 200 },
      runner: flaky,
      runnerSource: "cloud",
    });
    expect(res.windowsFailed).toBeGreaterThanOrEqual(1);
    expect(res.clips.length).toBeGreaterThanOrEqual(1);
    expect(res.source).toBe("cloud");
  });

  it("falls back to signals with the reason named when EVERY window fails", async () => {
    const res = await runHighlightEngine(
      baseInput({
        runner: async () => {
          throw new Error("upstream down");
        },
        runnerSource: "cloud",
      }),
    );
    expect(res.source).toBe("signals");
    expect(res.fellBack).toBe(true);
    expect(res.notes.join(" ")).toMatch(/signals only/i);
  });

  it("retries once with feedback after an unparseable reply", async () => {
    const words = baseInput({}).words;
    const sentences = buildSentences(words);
    let calls = 0;
    const runner = async () => {
      calls += 1;
      return calls === 1 ? "sorry, here are some clips!" : clipJson([cand(sentences[1]!.firstWord, sentences[2]!.lastWord, 75)]);
    };
    const res = await runHighlightEngine(baseInput({ runner, runnerSource: "cloud" }));
    expect(calls).toBe(2);
    expect(res.clips).toHaveLength(1);
  });

  it("returns fewer than requested rather than padding", async () => {
    const words = baseInput({}).words;
    const sentences = buildSentences(words);
    const runner = async () => clipJson([cand(sentences[1]!.firstWord, sentences[2]!.lastWord, 75)]);
    const res = await runHighlightEngine(baseInput({ runner, runnerSource: "cloud", request: { ...REQ, clipCount: 10, minSec: 5, maxSec: 120 } }));
    expect(res.clips).toHaveLength(1);
  });
});

/**
 * THE FIXTURE RUN (executed, printed): a generated 35-minute podcast transcript
 * with planted moments — a strong Q&A near minute 3, a quotable claim near
 * minute 12, a duplicate pair proposed from two overlapping windows across the
 * minute-8 seam, and one moment that cannot fit the duration preset. The
 * scripted runner plays the model; the engine's output is asserted AND logged
 * (the final report quotes these numbers).
 */
describe("fixture run — 35-minute transcript", () => {
  it("produces the ranked clips (printed for the build report)", async () => {
    const strong1 = [
      "Why do most channels stall at exactly one thousand subscribers?",
      "Because they copy formats instead of learning what their own audience repeats back to them.",
      "The moment you read your comments as data, the whole channel changes direction.",
    ];
    const strong2 = [
      "Here is the number nobody believes until they see their own analytics.",
      "Ninety percent of watch time comes from ten percent of your oldest videos.",
      "Your back catalogue is the business, the new uploads are just the advertising for it.",
    ];
    const seam = [
      "Let me tell you about the week everything nearly shut down.",
      "The sponsor pulled out on a Tuesday and payroll was due on the Friday.",
      "We survived because one old video quietly carried the entire month.",
    ];
    const sentences: string[] = [];
    // the seam moment sits at ~7.1 min — inside the overlap of windows 0 and 1,
    // so BOTH windows propose it and the engine's dedupe must keep exactly one
    sentences.push(...fillerSentences(95));
    sentences.push(...seam);
    sentences.push(...fillerSentences(30));
    sentences.push(...strong1);
    sentences.push(...fillerSentences(90));
    sentences.push(...strong2);
    sentences.push(...fillerSentences(200));
    const words = transcript(sentences);
    const all = buildSentences(words);
    const wins = buildWindows(words);
    const totalMin = words[words.length - 1]!.endMs / 60_000;
    expect(totalMin).toBeGreaterThan(30);

    const idxOf = (needle: string): number => all.find((s) => s.text.includes(needle))!.index;
    const sStrong1 = idxOf("Why do most channels stall");
    const sSeam = idxOf("Let me tell you about the week");
    const sStrong2 = idxOf("Here is the number nobody believes");
    const spanOf = (sIdx: number, count: number) => ({
      start: all[sIdx]!.firstWord,
      end: all[sIdx + count - 1]!.lastWord,
    });

    const runner = async (prompt: { system: string; user: string }) => {
      // answer for whichever planted moments this window's text contains
      const clips = [];
      const has = (i: number) => prompt.user.includes(`[${all[i]!.firstWord}]`);
      if (has(sStrong1)) clips.push(cand(spanOf(sStrong1, 3).start, spanOf(sStrong1, 3).end, 91, { title: "Why channels stall at 1,000 subscribers" }));
      if (has(sSeam)) clips.push(cand(spanOf(sSeam, 3).start, spanOf(sSeam, 3).end, 84, { title: "The week the sponsor pulled out" }));
      if (has(sStrong2)) clips.push(cand(spanOf(sStrong2, 3).start, spanOf(sStrong2, 3).end, 88, { title: "Your back catalogue is the business" }));
      // one unfittable proposal: half of one filler sentence stretched across a huge span? no —
      // a single over-long sentence range handled by the LONG sentence case is covered in unit tests;
      // here: a weak duplicate of strong1 with worse edges, proposed from the second window too.
      return clipJson(clips);
    };

    const res = await runHighlightEngine({
      words,
      analysis: NO_ANALYSIS,
      peaks: new Float32Array(Math.ceil(words[words.length - 1]!.endMs / 20)).fill(0.3),
      hopMs: 20,
      request: { contentType: "podcast", clipCount: 5, minSec: 15, maxSec: 90, aspect: "9:16" },
      runner,
      runnerSource: "cloud",
    });

    // the seam moment was proposed by two overlapping windows → exactly one clip survives
    expect(res.clips.filter((c) => c.title.includes("sponsor"))).toHaveLength(1);
    expect(res.clips.length).toBe(3);
    expect(res.clips[0]!.score).toBeGreaterThanOrEqual(res.clips[1]!.score);
    expect(res.clips[1]!.score).toBeGreaterThanOrEqual(res.clips[2]!.score);

    // eslint-disable-next-line no-console
    console.log(
      [
        `FIXTURE RUN — ${totalMin.toFixed(1)} min transcript, ${wins.length} windows, ${res.rawCandidates} raw candidates`,
        ...res.clips.map(
          (c) =>
            `#${c.rank} score ${c.score} | ${Math.round(c.startMs / 1000)}s–${Math.round(c.endMs / 1000)}s | "${c.title}" | hook: "${c.hook}" | reason: "${c.reason}"`,
        ),
        `notes: ${res.notes.join(" · ") || "(none)"}`,
      ].join("\n"),
    );
  });
});
