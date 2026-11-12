import { describe, expect, it, vi } from "vitest";
import type { ClipAnalysisInput } from "../clipper";
import { runHighlightEngine } from "./engine";
import type { HighlightRequest, HighlightWord, RawCandidate } from "./types";

/**
 * AI Clipper Slice 1 — durable runs + real Cancel, pinned at the engine:
 * seeded windows are never re-read by the model, and an abort stops the run
 * instead of leaving a half-run that looks finished.
 */

/** Build words from sentence strings: 320 ms per word, 80 ms between words, a pause after each sentence. */
function transcript(sentenceTexts: string[]): HighlightWord[] {
  const words: HighlightWord[] = [];
  let t = 0;
  for (const text of sentenceTexts) {
    for (const token of text.split(/\s+/).filter(Boolean)) {
      words.push({ text: token, startMs: t, endMs: t + 320 });
      t += 400;
    }
    t += 500;
  }
  return words;
}

function fillerSentences(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `Filler sentence number ${i} about ordinary things that happened today.`);
}

const NO_ANALYSIS: ClipAnalysisInput = { silences: [] };
const REQ: HighlightRequest = { contentType: "podcast", clipCount: 3, minSec: 15, maxSec: 90, aspect: "9:16" };

/** Scripted runner: one candidate per window, from the window range the prompt itself states. */
function windowRunner() {
  return vi.fn(async (prompt: { system: string; user: string }) => {
    const m = /between (\d+) and (\d+)/.exec(prompt.user);
    const first = m ? Number(m[1]) : 0;
    return JSON.stringify({
      clips: [
        {
          start_word_index: first,
          end_word_index: first + 40,
          title: `Moment from word ${first}`,
          summary: "A complete thought worth clipping.",
          reason: "Opens on a clear claim and lands a payoff.",
          score: 80,
          score_breakdown: { hook: 80, value: 80, story_completeness: 80, engagement: 80 },
        },
      ],
    });
  });
}

describe("highlight engine durable runs", () => {
  it("a resume with seeded windows never calls the model again and returns the same clips", async () => {
    const words = transcript(fillerSentences(220));
    const seeds: (RawCandidate[] | null)[] = [];
    const runner = windowRunner();
    const first = await runHighlightEngine({
      words,
      analysis: NO_ANALYSIS,
      peaks: null,
      hopMs: 100,
      request: REQ,
      runner,
      runnerSource: "cloud",
      concurrency: 1,
      onWindowCandidates: (wi, candidates) => {
        seeds[wi] = candidates;
      },
    });
    expect(first.windowsTotal).toBeGreaterThan(1);
    expect(first.clips.length).toBeGreaterThan(0);
    expect(runner).toHaveBeenCalledTimes(first.windowsTotal);
    expect(seeds.filter((s) => s !== null)).toHaveLength(first.windowsTotal);

    const neverCalled = vi.fn(async () => {
      throw new Error("seeded windows must not reach the model");
    });
    const resumed = await runHighlightEngine({
      words,
      analysis: NO_ANALYSIS,
      peaks: null,
      hopMs: 100,
      request: REQ,
      runner: neverCalled,
      runnerSource: "cloud",
      concurrency: 1,
      seedWindows: seeds,
    });
    expect(neverCalled).not.toHaveBeenCalled();
    expect(resumed.clips).toEqual(first.clips);
    expect(resumed.windowsTotal).toBe(first.windowsTotal);
  });

  it("reports each window's candidates to the checkpoint callback, including failed windows as empty", async () => {
    const words = transcript(fillerSentences(220));
    const seen: Record<number, RawCandidate[]> = {};
    const failing = vi.fn(async () => {
      throw new Error("window read failed");
    });
    const result = await runHighlightEngine({
      words,
      analysis: NO_ANALYSIS,
      peaks: null,
      hopMs: 100,
      request: REQ,
      runner: failing,
      runnerSource: "cloud",
      concurrency: 1,
      onWindowCandidates: (wi, candidates) => {
        seen[wi] = candidates;
      },
    });
    expect(result.windowsTotal).toBeGreaterThan(1);
    expect(result.windowsFailed).toBe(result.windowsTotal);
    for (let wi = 0; wi < result.windowsTotal; wi++) expect(seen[wi]).toEqual([]);
  });
});

describe("highlight engine cancel", () => {
  it("an already-aborted signal rejects before any window is read", async () => {
    const words = transcript(fillerSentences(220));
    const controller = new AbortController();
    controller.abort();
    const runner = windowRunner();
    await expect(
      runHighlightEngine({
        words,
        analysis: NO_ANALYSIS,
        peaks: null,
        hopMs: 100,
        request: REQ,
        runner,
        runnerSource: "cloud",
        concurrency: 1,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(runner).not.toHaveBeenCalled();
  });

  it("an abort mid-run stops after the in-flight window — no further window starts", async () => {
    const words = transcript(fillerSentences(220));
    const controller = new AbortController();
    const runner = vi.fn(async (prompt: { system: string; user: string }) => {
      controller.abort();
      const m = /between (\d+) and (\d+)/.exec(prompt.user);
      const first = m ? Number(m[1]) : 0;
      return JSON.stringify({
        clips: [
          {
            start_word_index: first,
            end_word_index: first + 40,
            title: `Moment from word ${first}`,
            summary: "A complete thought worth clipping.",
            reason: "Opens on a clear claim and lands a payoff.",
            score: 80,
            score_breakdown: { hook: 80, value: 80, story_completeness: 80, engagement: 80 },
          },
        ],
      });
    });
    await expect(
      runHighlightEngine({
        words,
        analysis: NO_ANALYSIS,
        peaks: null,
        hopMs: 100,
        request: REQ,
        runner,
        runnerSource: "cloud",
        concurrency: 1,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(runner).toHaveBeenCalledTimes(1);
  });
});
