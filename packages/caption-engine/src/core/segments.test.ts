import { describe, expect, it } from "vitest";
import { CaptionDocSchema, type Word } from "@capseasy/shared";
import { SEGMENT_GAP_MS, clipDocForSegment, proposeSegments } from "./segments";

let n = 0;
const w = (startMs: number, endMs: number, text = `w${n++}`): Word => ({ id: `id-${startMs}-${n}`, text, startMs, endMs });

/** Words of `durMs` spoken every `stepMs` from `fromMs` to (not past) `toMs`. */
function speech(fromMs: number, toMs: number, stepMs = 1000, durMs = 800): Word[] {
  const out: Word[] = [];
  for (let t = fromMs; t + durMs <= toMs; t += stepMs) out.push(w(t, t + durMs));
  return out;
}

describe("proposeSegments", () => {
  it("returns nothing for empty or degenerate input", () => {
    expect(proposeSegments([])).toEqual([]);
    expect(proposeSegments([{ text: "  ", startMs: 0, endMs: 500 }])).toEqual([]);
    expect(proposeSegments([{ text: "zero", startMs: 1000, endMs: 1000 }])).toEqual([]);
    expect(proposeSegments([{ text: "backwards", startMs: 2000, endMs: 1000 }])).toEqual([]);
  });

  it("a single short speech run is one proposal, however short", () => {
    const p = proposeSegments(speech(0, 5000));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ startMs: 0, endMs: 4800, wordCount: 5 });
  });

  it("splits at a silence gap, keeping word-edge boundaries and a snippet", () => {
    const words = [...speech(0, 20_000), ...speech(22_000, 42_000)];
    const p = proposeSegments(words);
    expect(p).toHaveLength(2);
    expect(p[0]!.startMs).toBe(0);
    expect(p[0]!.endMs).toBe(19_800);
    expect(p[1]!.startMs).toBe(22_000);
    expect(p[0]!.wordCount).toBe(20);
    expect(p[0]!.text.split(" ")).toHaveLength(8);
  });

  it("sorts unsorted input before segmenting", () => {
    const words = [...speech(22_000, 42_000), ...speech(0, 20_000)];
    const p = proposeSegments(words);
    expect(p.map((s) => s.startMs)).toEqual([0, 22_000]);
  });

  it(`a gap of exactly ${SEGMENT_GAP_MS}ms splits, one ms less does not`, () => {
    const a = speech(0, 20_000); // last word ends 19_800
    const atBoundary = [...a, ...speech(19_800 + SEGMENT_GAP_MS, 19_800 + SEGMENT_GAP_MS + 20_000)];
    expect(proposeSegments(atBoundary)).toHaveLength(2);
    const justUnder = [...a, ...speech(19_800 + SEGMENT_GAP_MS - 1, 19_800 + SEGMENT_GAP_MS - 1 + 20_000)];
    expect(proposeSegments(justUnder)).toHaveLength(1);
  });

  it("merges a short run forward into the next run", () => {
    // 5s of speech, a 1.2s silence, then 20s: one proposal spanning the pause
    const words = [...speech(0, 5000), ...speech(6200, 26_200)];
    const p = proposeSegments(words);
    expect(p).toHaveLength(1);
    expect(p[0]!.startMs).toBe(0);
    expect(p[0]!.endMs).toBe(26_000);
  });

  it("merges a short trailing run back into the previous one", () => {
    const words = [...speech(0, 20_000), ...speech(22_000, 27_000)];
    const p = proposeSegments(words);
    expect(p).toHaveLength(1);
    expect(p[0]!.endMs).toBe(26_800);
  });

  it("splits a long run at its largest internal gap", () => {
    // 90s of speech every 500ms (100ms gaps), except one 800ms gap just after 45s
    const words: Word[] = [];
    for (let t = 0; t + 400 <= 45_000; t += 500) words.push(w(t, t + 400));
    for (let t = 46_200; t + 400 <= 90_000; t += 500) words.push(w(t, t + 400));
    const p = proposeSegments(words);
    expect(p).toHaveLength(2);
    expect(p[0]!.endMs).toBe(45_000 - 500 + 400);
    expect(p[1]!.startMs).toBe(46_200);
    expect(p.every((s) => s.durationMs <= 60_000)).toBe(true);
  });

  it("splits a very long run recursively until every piece fits", () => {
    const words = speech(0, 150_000, 500, 400);
    const p = proposeSegments(words);
    expect(p.length).toBeGreaterThanOrEqual(3);
    expect(p.every((s) => s.durationMs <= 60_000)).toBe(true);
    expect(p.reduce((sum, s) => sum + s.wordCount, 0)).toBe(words.length);
    // pieces stay in order and never overlap
    for (let i = 1; i < p.length; i++) expect(p[i]!.startMs).toBeGreaterThanOrEqual(p[i - 1]!.endMs);
  });

  it("honours custom thresholds", () => {
    const words = [...speech(0, 5000), ...speech(6200, 11_200)];
    expect(proposeSegments(words, { minMs: 4000 })).toHaveLength(2);
    expect(proposeSegments(words, { gapMs: 2000 })).toHaveLength(1);
  });
});

describe("clipDocForSegment", () => {
  const doc = () =>
    CaptionDocSchema.parse({
      version: 2,
      language: "en",
      words: [
        { id: "a", text: "before", startMs: 1000, endMs: 2000 },
        { id: "b", text: "inside", startMs: 5000, endMs: 6000 },
        { id: "c", text: "after", startMs: 9000, endMs: 10_000 },
      ],
      manualBreaks: ["b", "c"],
      noBreakAfter: ["a"],
      cards: { b: { emotion: "calm" }, c: { emotion: "hype" } },
    });

  it("keeps only overlapping words, shifted so the segment start is 0 and clamped to its length", () => {
    const out = clipDocForSegment(doc(), { startMs: 1500, endMs: 5500 });
    expect(out.words.map((x) => [x.id, x.startMs, x.endMs])).toEqual([
      ["a", 0, 500],
      ["b", 3500, 4000],
    ]);
  });

  it("prunes break and card bookkeeping that pointed outside the segment", () => {
    const out = clipDocForSegment(doc(), { startMs: 1500, endMs: 5500 });
    expect(out.manualBreaks).toEqual(["b"]);
    expect(out.noBreakAfter).toEqual(["a"]); // "a" survived (clamped), so its entry stays; "c" is gone
    expect(Object.keys(out.cards)).toEqual(["b"]);
  });

  it("does not mutate the source document", () => {
    const src = doc();
    clipDocForSegment(src, { startMs: 1500, endMs: 5500 });
    expect(src.words[0]).toMatchObject({ startMs: 1000, endMs: 2000 });
  });

  it("an out-of-range segment yields an empty document, not an error", () => {
    expect(clipDocForSegment(doc(), { startMs: 50_000, endMs: 60_000 }).words).toEqual([]);
  });
});
