import { describe, expect, it } from "vitest";
import type { HighlightClip } from "@/features/clipper/highlights/types";
import {
  applyRerankCalibration,
  buildRerankPrompt,
  measuredMeanOf,
  parseRerankReply,
  runRerankCalibration,
  type CalibratedEntry,
} from "./rerank";

/**
 * AI Clipper Slice 1 — cross-window rerank calibration: the comparison
 * prompt is our own rubric wording (no "virality" claim anywhere), the
 * parser only trusts known ids and numeric scores, and the final score keeps
 * the 0.85 model + 0.15 measured composition.
 */

function clip(overrides: Partial<HighlightClip> & { id: string }): HighlightClip {
  return {
    startWord: 0,
    endWord: 40,
    startMs: 0,
    endMs: 30000,
    speechStartMs: 0,
    speechEndMs: 30000,
    durationMs: 30000,
    title: "A moment",
    hook: "The first sentence of the clip.",
    summary: "What the clip is about.",
    reason: "Strong hook, clear payoff.",
    score: 80,
    breakdown: [
      { key: "hook", label: "Hook", value: 80, kind: "model" },
      { key: "value", label: "Value", value: 80, kind: "model" },
      { key: "completeness", label: "Story completeness", value: 80, kind: "model" },
      { key: "engagement", label: "Engagement", value: 80, kind: "model" },
      { key: "audio", label: "Audio quality", value: 100, kind: "measured" },
      { key: "pace", label: "Pace", value: 100, kind: "measured" },
      { key: "boundaries", label: "Clean boundaries", value: 100, kind: "measured" },
    ],
    rank: 1,
    text: "The first sentence of the clip.",
    ...overrides,
  };
}

const entry = (id: string, score: number): CalibratedEntry => ({
  id,
  score,
  breakdown: { hook: score, value: score, storyCompleteness: score, engagement: score },
});

describe("buildRerankPrompt", () => {
  it("uses our own rubric wording and names the candidates, with no virality claim", () => {
    const { system, user } = buildRerankPrompt({
      contentType: "podcast",
      clips: [clip({ id: "ai-0-30000", title: "The turning point" })],
    });
    expect(system).toMatch(/compare/i);
    expect(user).toContain("Podcast: favour self-contained exchanges");
    expect(user).toContain("ai-0-30000");
    expect(user).toContain("The turning point");
    expect(`${system}\n${user}`).not.toMatch(/viral/i);
  });
});

describe("parseRerankReply", () => {
  it("keeps known ids, clamps scores, and falls back to the overall score for a missing breakdown", () => {
    const out = parseRerankReply(
      JSON.stringify({
        calibrated: [
          { id: "a", score: 120, score_breakdown: { hook: 90, value: 90, story_completeness: 90, engagement: 90 } },
          { id: "b", score: 60 },
          { id: "unknown", score: 99 },
          { id: "c", score: "not a number" },
        ],
      }),
      new Set(["a", "b", "c"]),
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ id: "a", score: 100, breakdown: { hook: 90, value: 90, storyCompleteness: 90, engagement: 90 } });
    expect(out[1]).toEqual({ id: "b", score: 60, breakdown: { hook: 60, value: 60, storyCompleteness: 60, engagement: 60 } });
  });

  it("throws when there is no JSON object or no calibrated array", () => {
    expect(() => parseRerankReply("no json here", new Set(["a"]))).toThrow();
    expect(() => parseRerankReply(JSON.stringify({ clips: [] }), new Set(["a"]))).toThrow();
    expect(() => parseRerankReply("{not json", new Set(["a"]))).toThrow();
  });
});

describe("measuredMeanOf / applyRerankCalibration", () => {
  it("averages only the measured rows", () => {
    expect(measuredMeanOf(clip({ id: "a" }))).toBe(100);
    expect(measuredMeanOf(clip({ id: "a", breakdown: [{ key: "audio", label: "Audio quality", value: null, kind: "measured" }] }))).toBeNull();
  });

  it("re-scores 0.85 model + 0.15 measured and re-orders by the calibrated scores", () => {
    const clips = [clip({ id: "a", score: 90, rank: 1 }), clip({ id: "b", score: 70, rank: 2 })];
    // podcast weights sum to 1; all-80 breakdown -> model 80; measured mean 100 -> 0.85*80 + 0.15*100 = 83
    const out = applyRerankCalibration(clips, [entry("a", 80), entry("b", 95)], "podcast");
    expect(out[0]!.id).toBe("b");
    expect(out[0]!.rank).toBe(1);
    expect(out[0]!.score).toBe(96); // 0.85 x 95 + 0.15 x 100 = 95.75, rounded
    expect(out[0]!.calibrated).toBe(true);
    expect(out[1]!.id).toBe("a");
    expect(out[1]!.rank).toBe(2);
    expect(out[1]!.score).toBe(83);
  });

  it("leaves clips the rerank did not cover at their original score", () => {
    const clips = [clip({ id: "a", score: 90, rank: 1 }), clip({ id: "b", score: 70, rank: 2 })];
    const out = applyRerankCalibration(clips, [entry("b", 95)], "podcast");
    expect(out.find((c) => c.id === "a")!.score).toBe(90);
    expect(out.find((c) => c.id === "a")!.calibrated).toBe(false);
    expect(out[0]!.id).toBe("b");
  });
});

describe("runRerankCalibration", () => {
  const one = [clip({ id: "a", score: 80, rank: 1 })];
  const two = [clip({ id: "a", score: 90, rank: 1 }), clip({ id: "b", score: 70, rank: 2 })];

  it("skips a single clip — nothing to compare", async () => {
    const out = await runRerankCalibration({
      clips: one,
      contentType: "general",
      runner: () => {
        throw new Error("must not be called");
      },
    });
    expect(out.calibrated).toBe(false);
    expect(out.clips).toEqual(one);
    expect(out.note).toMatch(/nothing to compare/i);
  });

  it("keeps the engine order when the reply cannot be used", async () => {
    const out = await runRerankCalibration({
      clips: two,
      contentType: "general",
      runner: async () => "not json at all",
    });
    expect(out.calibrated).toBe(false);
    expect(out.clips.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("keeps the engine order when the call itself fails", async () => {
    const out = await runRerankCalibration({
      clips: two,
      contentType: "general",
      runner: async () => {
        throw new Error("free AI service down");
      },
    });
    expect(out.calibrated).toBe(false);
    expect(out.clips.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("re-orders on a usable reply", async () => {
    const out = await runRerankCalibration({
      clips: two,
      contentType: "general",
      runner: async () =>
        JSON.stringify({ calibrated: [entry("a", 50), entry("b", 95)] }),
    });
    expect(out.calibrated).toBe(true);
    expect(out.clips[0]!.id).toBe("b");
    expect(out.note).toMatch(/Re-ranked 2 of 2/);
  });

  it("an abort throws instead of returning a stale order", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runRerankCalibration({ clips: two, contentType: "general", runner: async () => "{}", signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
