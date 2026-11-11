import { describe, expect, it } from "vitest";
import { CaptionDocSchema, type CaptionDoc } from "@capseasy/shared";
import { clipDocForSegment } from "@motion-ai/caption-engine/core";
import { clampClipRange } from "../clipper";
import { runHighlightEngine } from "./engine";
import { buildSentences } from "./sentences";
import type { HighlightWord } from "./types";

/**
 * Integration: an engine clip flowing into the product's clip creation.
 * The caption doc a created clip project stores is `clipDocForSegment`'s
 * slice — these tests pin the end-to-end guarantee the brief asks for:
 * because the engine's edges are sentence-exact and its cut times sit in the
 * silence AROUND the speech, the sliced doc contains exactly the clip's
 * words, every one with its full original duration (no word is clipped in
 * time, and no word's text is ever partial). A manual trim afterwards keeps
 * the same atomicity: words are included whole or not at all.
 */

function makeDoc(): { doc: CaptionDoc; words: HighlightWord[] } {
  const sentences = [
    "Welcome back to the show everyone.",
    "What is the one mistake every new founder makes?",
    "They price too low because they fear nobody will pay.",
    "And the fix is simple once you see it clearly.",
    "Filler talk about ordinary things that happened today.",
    "More filler talk about nothing in particular at all.",
  ];
  const raw: { id: string; text: string; startMs: number; endMs: number }[] = [];
  let t = 0;
  for (const s of sentences) {
    for (const token of s.split(/\s+/)) {
      raw.push({ id: `w${raw.length}`, text: token, startMs: t, endMs: t + 320 });
      t += 400;
    }
    t += 500;
  }
  const doc = CaptionDocSchema.parse({ version: 2, language: "en", words: raw });
  return { doc, words: raw.map(({ text, startMs, endMs }) => ({ text, startMs, endMs })) };
}

describe("engine clip → caption doc integration", () => {
  it("the created clip's doc holds exactly the clip's words, each at full duration", async () => {
    const { doc, words } = makeDoc();
    const sentences = buildSentences(words);
    const runner = async () =>
      JSON.stringify({
        clips: [
          {
            start_word_index: sentences[1]!.firstWord,
            end_word_index: sentences[3]!.lastWord,
            title: "The pricing mistake",
            summary: "s",
            reason: "r",
            score: 88,
            score_breakdown: { hook: 90, value: 86, story_completeness: 92, engagement: 80 },
          },
        ],
      });
    const res = await runHighlightEngine({
      words,
      analysis: { silences: [] },
      peaks: null,
      hopMs: 20,
      request: { contentType: "podcast", clipCount: 3, minSec: 10, maxSec: 60, aspect: "9:16" },
      runner,
      runnerSource: "cloud",
    });
    expect(res.clips).toHaveLength(1);
    const clip = res.clips[0]!;

    const sliced = clipDocForSegment(doc, { startMs: clip.startMs, endMs: clip.endMs });
    // exactly the clip's words, in order, texts untouched
    expect(sliced.words.map((w) => w.text)).toEqual(words.slice(clip.startWord, clip.endWord + 1).map((w) => w.text));
    // and every word keeps its FULL original duration — the cut sits in the
    // silence around the speech, so not one word is time-clipped either
    sliced.words.forEach((w, i) => {
      const original = words[clip.startWord + i]!;
      expect(w.endMs - w.startMs).toBe(original.endMs - original.startMs);
    });
    // the doc starts at the question — the clip opens on a complete thought
    expect(sliced.words[0]!.text).toBe("What");
  });

  it("a manual trim after generation keeps words atomic (whole words or none)", async () => {
    const { doc, words } = makeDoc();
    const sentences = buildSentences(words);
    const runner = async () =>
      JSON.stringify({
        clips: [
          {
            start_word_index: sentences[1]!.firstWord,
            end_word_index: sentences[3]!.lastWord,
            title: "T",
            summary: "s",
            reason: "r",
            score: 80,
            score_breakdown: { hook: 80, value: 80, story_completeness: 80, engagement: 80 },
          },
        ],
      });
    const res = await runHighlightEngine({
      words,
      analysis: { silences: [] },
      peaks: null,
      hopMs: 20,
      request: { contentType: "podcast", clipCount: 3, minSec: 10, maxSec: 60, aspect: "9:16" },
      runner,
      runnerSource: "cloud",
    });
    const clip = res.clips[0]!;
    const mediaDuration = words[words.length - 1]!.endMs + 1000;
    // the user drags the start 2.3 s later in the card's range inputs
    const trimmed = clampClipRange({ startMs: clip.startMs + 2300, endMs: clip.endMs }, mediaDuration);
    const sliced = clipDocForSegment(doc, trimmed);
    expect(sliced.words.length).toBeGreaterThan(0);
    for (const w of sliced.words) {
      // every included word is a real transcript word, textually whole
      expect(words.some((o) => o.text === w.text && Math.abs(o.startMs - (w.startMs + trimmed.startMs)) <= 320)).toBe(true);
    }
    // no word that ENDS before the trim point survives
    const firstOriginal = words.find((o) => o.text === sliced.words[0]!.text && o.startMs >= trimmed.startMs - 320);
    expect(firstOriginal).toBeTruthy();
  });
});
