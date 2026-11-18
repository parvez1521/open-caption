import { describe, expect, it, vi } from "vitest";
import {
  buildPlannerPrompt,
  extractPlanJson,
  parsePlannerResponse,
  planImageDurationMs,
  requestAiEditPlan,
  segmentsOfTranscript,
  type AiEditPlanClient,
  type TranscriptSegment,
} from "../aiEditPlanner";

const words = [
  { text: "hello", startMs: 0, endMs: 400 },
  { text: "world", startMs: 500, endMs: 900 },
  { text: "now", startMs: 5000, endMs: 5400 },
  { text: "a", startMs: 5500, endMs: 5700 },
  { text: "new", startMs: 5800, endMs: 6200 },
  { text: "idea", startMs: 6300, endMs: 6800 },
];

describe("segmentsOfTranscript", () => {
  it("groups words split by a silence gap into timestamped segments", () => {
    const segments = segmentsOfTranscript(words);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual({ startMs: 0, endMs: 900, text: "hello world" });
    expect(segments[1]).toEqual({ startMs: 5000, endMs: 6800, text: "now a new idea" });
  });

  it("drops empty words and sorts out-of-order words", () => {
    const segments = segmentsOfTranscript([
      { text: "b", startMs: 800, endMs: 1000 },
      { text: " ", startMs: 0, endMs: 100 },
      { text: "a", startMs: 0, endMs: 500 },
    ]);
    expect(segments).toEqual([{ startMs: 0, endMs: 1000, text: "a b" }]);
  });

  it("caps a segment at the max length instead of one endless segment", () => {
    const long = Array.from({ length: 30 }, (_, i) => ({ text: "w", startMs: i * 1000, endMs: i * 1000 + 500 }));
    const segments = segmentsOfTranscript(long);
    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every((s) => s.endMs - s.startMs <= 20_000)).toBe(true);
  });
});

describe("buildPlannerPrompt", () => {
  it("carries the transcript with timestamps and the style, and never names a model or provider", () => {
    const segments: TranscriptSegment[] = [{ startMs: 0, endMs: 900, text: "hello world" }];
    const prompt = buildPlannerPrompt(segments, "cinematic", 10_000);
    expect(prompt.user).toContain("hello world");
    expect(prompt.user).toContain("0.0s - 0.9s");
    expect(prompt.system).toContain("JSON array");
    for (const banned of ["groq", "gpt", "openai", "Muse", "Gemini", "llama"]) {
      expect(prompt.system.toLowerCase()).not.toContain(banned);
      expect(prompt.user.toLowerCase()).not.toContain(banned);
    }
  });
});

describe("extractPlanJson", () => {
  it("reads a bare array, a fenced block, and a wrapped object", () => {
    expect(extractPlanJson('[{"startMs":0}]')).toEqual([{ startMs: 0 }]);
    expect(extractPlanJson('```json\n[{"startMs":0}]\n```')).toEqual([{ startMs: 0 }]);
    expect(extractPlanJson('{"plan":[{"startMs":0}]}')).toEqual({ plan: [{ startMs: 0 }] });
    expect(extractPlanJson("not json at all")).toBeNull();
  });
});

describe("parsePlannerResponse", () => {
  const durationMs = 20_000;
  it("produces sorted placements with timestamps from a valid plan", () => {
    const { plan, dropped } = parsePlannerResponse(
      JSON.stringify([
        { startMs: 5000, endMs: 9000, kind: "video", prompt: "a forest", sourceText: "now a new idea" },
        { startMs: 0, endMs: 2000, kind: "image", prompt: "a sunrise", sourceText: "hello world" },
      ]),
      { durationMs },
    );
    expect(dropped).toBe(0);
    expect(plan).toEqual([
      { startMs: 0, endMs: 2000, kind: "image", prompt: "a sunrise", sourceText: "hello world" },
      { startMs: 5000, endMs: 9000, kind: "video", prompt: "a forest", sourceText: "now a new idea" },
    ]);
  });

  it("drops invalid, too-short, overlapping and out-of-range items, and clamps to the video", () => {
    const { plan, dropped } = parsePlannerResponse(
      [
        { startMs: 0, endMs: 2000, kind: "image", prompt: "good", sourceText: "a" },
        { startMs: 1000, endMs: 3000, kind: "image", prompt: "overlaps the first", sourceText: "b" },
        { startMs: 5000, endMs: 5200, kind: "image", prompt: "too short", sourceText: "c" },
        { startMs: 6000, endMs: 9000, kind: "photo", prompt: "bad kind", sourceText: "d" },
        { startMs: 8000, endMs: 9000, kind: "image", prompt: "", sourceText: "e" },
        { startMs: 19_000, endMs: 99_000, kind: "video", prompt: "runs past the end", sourceText: "f" },
      ],
      { durationMs },
    );
    expect(plan).toEqual([
      { startMs: 0, endMs: 2000, kind: "image", prompt: "good", sourceText: "a" },
      { startMs: 19_000, endMs: 20_000, kind: "video", prompt: "runs past the end", sourceText: "f" },
    ]);
    expect(dropped).toBe(4);
  });

  it("caps the plan at 12 items and returns an empty plan for a non-array reply", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ startMs: i * 2000, endMs: i * 2000 + 1500, kind: "image", prompt: `v${i}`, sourceText: "" }));
    const { plan, dropped } = parsePlannerResponse(many, { durationMs: 60_000 });
    expect(plan).toHaveLength(12);
    expect(dropped).toBe(8);
    expect(parsePlannerResponse({ nope: true }, { durationMs })).toEqual({ plan: [], dropped: 0 });
  });
});

describe("requestAiEditPlan", () => {
  const req = { segments: [{ startMs: 0, endMs: 900, text: "hello world" }], styleId: "clean", durationMs: 10_000 };

  it("posts the transcript to the app API (never raw fetch) and parses the plan", async () => {
    const post = vi.fn(async () => ({
      configured: true,
      plan: [{ startMs: 0, endMs: 2000, kind: "image", prompt: "a sunrise", sourceText: "hello world" }],
    })) as unknown as AiEditPlanClient["post"];
    const { plan } = await requestAiEditPlan(req, { post });
    expect(post).toHaveBeenCalledWith("/ai-edit/plan", expect.objectContaining({ json: expect.objectContaining({ styleId: "clean" }) }));
    expect(plan).toHaveLength(1);
    expect(plan[0]?.startMs).toBe(0);
  });

  it("throws a plain message when the free AI service is not switched on", async () => {
    const post = vi.fn(async () => ({ configured: false })) as unknown as AiEditPlanClient["post"];
    await expect(requestAiEditPlan(req, { post })).rejects.toThrow("not switched on");
  });
});

describe("planImageDurationMs", () => {
  it("uses the planned span, capped at 10s", () => {
    expect(planImageDurationMs({ startMs: 0, endMs: 3000, kind: "image", prompt: "x", sourceText: "" })).toBe(3000);
    expect(planImageDurationMs({ startMs: 0, endMs: 30_000, kind: "image", prompt: "x", sourceText: "" })).toBe(10_000);
  });
});
