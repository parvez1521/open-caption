import { describe, expect, it } from "vitest";
import {
  CaptionDocSchema,
  ProjectSettingsSchema,
  type CaptionDoc,
  type Page,
  type Word,
} from "@capseasy/shared";
import { toComposition, type CompositionInput } from "../composition";
import { buildEditorComposition, isPartition, projectComposition } from "../compositionDoc";
import {
  BREATH_MARGIN_MS,
  DEFAULT_PAUSE_THRESHOLD_MS,
  applyTrimCuts,
  proposeTrimCuts,
} from "../trim";

const word = (id: string, text: string, startMs: number, endMs: number): Word => ({ id, text, startMs, endMs });
const docOf = (words: Word[]): CaptionDoc => CaptionDocSchema.parse({ version: 2, language: "en", words });

const HOP = 20; // PEAKS_PER_SECOND = 50

/** peaks: loud (0.8) everywhere except the given quiet spans (0.02) */
function peaksWithQuiet(totalMs: number, quiet: Array<[number, number]>): Float32Array {
  const n = Math.ceil(totalMs / HOP);
  const out = new Float32Array(n).fill(0.8);
  for (const [a, b] of quiet) {
    for (let i = Math.floor(a / HOP); i < Math.min(n, Math.ceil(b / HOP)); i++) out[i] = 0.02;
  }
  return out;
}

describe("proposeTrimCuts — fillers", () => {
  it("proposes the exact span of a filler word, with context", () => {
    const doc = docOf([word("w1", "hello", 0, 400), word("w2", "um", 500, 800), word("w3", "world", 900, 1400)]);
    const proposals = proposeTrimCuts({ words: doc.words, peaks: null });
    const fillers = proposals.filter((p) => p.kind === "filler");
    expect(fillers).toHaveLength(1);
    expect(fillers[0]).toMatchObject({ startMs: 500, endMs: 800, durationMs: 300, word: "um" });
    expect(fillers[0]!.contextText).toContain("[um]");
    expect(fillers[0]!.contextText).toContain("hello");
    expect(fillers[0]!.contextText).toContain("world");
  });

  it("matches case- and punctuation-insensitively, but never a longer word containing a filler", () => {
    const doc = docOf([
      word("w1", "Um,", 0, 300),
      word("w2", "umbrella", 400, 900),
      word("w3", "season", 1000, 1500),
    ]);
    const fillers = proposeTrimCuts({ words: doc.words, peaks: null }).filter((p) => p.kind === "filler");
    expect(fillers.map((p) => p.word)).toEqual(["Um,"]);
  });

  it("meaning-carrying discourse words are NOT fillers (matlab, like, yaar stay)", () => {
    const doc = docOf([
      word("w1", "matlab", 0, 500),
      word("w2", "like", 600, 900),
      word("w3", "yaar", 1000, 1400),
      word("w4", "dekho", 1500, 2000),
    ]);
    expect(proposeTrimCuts({ words: doc.words, peaks: null }).filter((p) => p.kind === "filler")).toEqual([]);
  });

  it("a repeated word right away is a false start — the FIRST copy is proposed", () => {
    const doc = docOf([word("w1", "I", 0, 200), word("w2", "I", 300, 500), word("w3", "think", 600, 1000)]);
    const fillers = proposeTrimCuts({ words: doc.words, peaks: null }).filter((p) => p.kind === "filler");
    expect(fillers).toHaveLength(1);
    expect(fillers[0]).toMatchObject({ startMs: 0, endMs: 200, label: expect.stringContaining("false start") });
  });

  it("emphatic repeats are not false starts", () => {
    const doc = docOf([word("w1", "ha", 0, 200), word("w2", "ha", 250, 450), word("w3", "no", 600, 800), word("w4", "no", 850, 1050)]);
    expect(proposeTrimCuts({ words: doc.words, peaks: null }).filter((p) => p.kind === "filler")).toEqual([]);
  });

  it("hidden words are never proposed", () => {
    const hidden: Word = { ...word("w2", "um", 500, 800), hidden: true };
    const doc = docOf([word("w1", "hello", 0, 400), hidden, word("w3", "world", 900, 1400)]);
    expect(proposeTrimCuts({ words: doc.words, peaks: null })).toEqual([]);
  });
});

describe("proposeTrimCuts — pauses (gap ∩ silence, conservative)", () => {
  // hello [0,1000] ... world [2500,3500]: a 1500 ms transcript gap
  const gapWords = [word("w1", "hello", 0, 1000), word("w2", "world", 2500, 3500)];

  it("proposes the silence inside the gap, keeping the breath margin at each edge", () => {
    expect(DEFAULT_PAUSE_THRESHOLD_MS).toBe(800);
    expect(BREATH_MARGIN_MS).toBe(150);
    const peaks = peaksWithQuiet(3500, [[1000, 2500]]);
    const pauses = proposeTrimCuts({ words: gapWords, peaks, durationMs: 3500 }).filter((p) => p.kind === "pause");
    expect(pauses).toHaveLength(1);
    expect(pauses[0]).toMatchObject({ startMs: 1150, endMs: 2350, durationMs: 1200, silenceConfirmed: true });
    // word-edge exact: the cut sits strictly inside the gap, never inside a word
    expect(pauses[0]!.startMs).toBeGreaterThanOrEqual(1000);
    expect(pauses[0]!.endMs).toBeLessThanOrEqual(2500);
  });

  it("respects the user threshold: a 700 ms gap is below the 800 ms default, proposed at 500 ms", () => {
    const words = [word("w1", "hello", 0, 1000), word("w2", "world", 1700, 2700)];
    const peaks = peaksWithQuiet(2700, [[1000, 1700]]);
    expect(proposeTrimCuts({ words, peaks, durationMs: 2700 }).filter((p) => p.kind === "pause")).toEqual([]);
    const lowered = proposeTrimCuts({ words, peaks, durationMs: 2700, thresholdMs: 500 }).filter((p) => p.kind === "pause");
    expect(lowered).toHaveLength(1);
    expect(lowered[0]).toMatchObject({ startMs: 1150, endMs: 1550 });
  });

  it("gap WITHOUT silence (loud audio over the gap) proposes nothing", () => {
    const peaks = peaksWithQuiet(3500, []); // loud throughout
    expect(proposeTrimCuts({ words: gapWords, peaks, durationMs: 3500 }).filter((p) => p.kind === "pause")).toEqual([]);
  });

  it("silence WITHOUT a transcript gap proposes nothing", () => {
    // words are back-to-back; the audio dips under the second word — no safe word-edge cut exists
    const words = [word("w1", "hello", 0, 1000), word("w2", "world", 1000, 2500)];
    const peaks = peaksWithQuiet(2500, [[1000, 2500]]);
    expect(proposeTrimCuts({ words, peaks, durationMs: 2500 })).toEqual([]);
  });

  it("silence covering only a sliver of the gap is not enough (half-the-gap rule)", () => {
    const peaks = peaksWithQuiet(3500, [[1000, 1400]]); // 400 ms of a 1500 ms gap
    expect(proposeTrimCuts({ words: gapWords, peaks, durationMs: 3500 }).filter((p) => p.kind === "pause")).toEqual([]);
  });

  it("without peaks, a gap-only proposal is made and flagged unconfirmed", () => {
    const pauses = proposeTrimCuts({ words: gapWords, peaks: null, durationMs: 3500 }).filter((p) => p.kind === "pause");
    expect(pauses).toHaveLength(1);
    expect(pauses[0]).toMatchObject({ startMs: 1150, endMs: 2350, silenceConfirmed: false });
  });

  it("a trailing pause at the end of the timeline is proposed", () => {
    const peaks = peaksWithQuiet(5000, [[1000, 5000]]);
    const pauses = proposeTrimCuts({ words: [word("w1", "hello", 0, 1000)], peaks, durationMs: 5000 }).filter(
      (p) => p.kind === "pause",
    );
    expect(pauses).toHaveLength(1);
    expect(pauses[0]!.startMs).toBe(1150);
  });
});

/* ------------------------------------------------------------------ */
/* apply                                                               */
/* ------------------------------------------------------------------ */

const page = (id: string, words: Word[]): Page => ({
  id,
  startMs: words[0]?.startMs ?? 0,
  endMs: words[words.length - 1]?.endMs ?? 0,
  words,
  lines: [words],
  heroIndex: -1,
  emotion: "neutral",
  position: null,
  styleOverride: null,
});

const applySettings = ProjectSettingsSchema.parse({
  overlays: [
    { id: "ov-after", kind: "text", text: "After", startMs: 5500, endMs: 6500 },
    { id: "ov-inside", kind: "text", text: "Gone", startMs: 3200, endMs: 3800 },
  ],
  composition: {
    version: 1,
    videoSegments: [],
    markers: [
      { id: "mk-after", atMs: 5000, label: "After" },
      { id: "mk-inside", atMs: 3500, label: "Inside" },
    ],
  },
});

const applyWords = [
  word("w1", "hello", 0, 500),
  word("w2", "um", 1000, 1300),
  word("w3", "world", 2000, 2500),
  word("w4", "later", 6000, 6500),
];
const applyDoc = docOf(applyWords);

function applyComp() {
  const input: CompositionInput = {
    media: { videoId: "vid-1", filename: "clip.mp4", size: 12345, width: 1080, height: 1920, fps: 30, durationMs: 10_000 },
    doc: null,
    pages: [page("p1", applyWords)],
    settings: applySettings,
    durationMs: 10_000,
  };
  return buildEditorComposition({ view: toComposition(input), settings: applySettings, sourceDurationMs: 10_000 });
}

describe("applyTrimCuts — one step, everything consistent", () => {
  const FILLER = { startMs: 1000, endMs: 1300 }; // the "um" word span (300 ms)
  const PAUSE = { startMs: 3000, endMs: 4000 }; // 1000 ms of the gap before "later"

  it("selected cuts remove + shift words, markers, overlays and video together", () => {
    const comp = applyComp();
    const { comp: nextComp, doc: nextDoc } = applyTrimCuts(comp, applyDoc, [FILLER, PAUSE]);

    // words: "um" deleted; "world" shifted by the filler cut only; "later" by both
    expect(nextDoc.words.map((w) => [w.text, w.startMs, w.endMs])).toEqual([
      ["hello", 0, 500],
      ["world", 1700, 2200],
      ["later", 4700, 5200],
    ]);

    // video: 10 s - 0.3 s - 1 s = 8.7 s, a valid partition of the kept source ranges
    expect(nextComp.durationMs).toBe(8700);
    expect(isPartition(nextComp.videoClips)).toBe(true);
    expect(nextComp.videoClips.map((c) => [c.sourceInMs, c.sourceOutMs])).toEqual([
      [0, 1000],
      [1300, 3000],
      [4000, 10_000],
    ]);
    expect(() => projectComposition(nextComp, applySettings)).not.toThrow();

    // markers: inside the pause cut dropped; after both cuts shifted by 1300 ms
    expect(nextComp.markers.map((m) => [m.id, m.atMs])).toEqual([["mk-after", 3700]]);
    // overlays: fully inside dropped; after shifted wholly
    expect(nextComp.overlayClips.map((c) => [c.id, c.startMs, c.endMs])).toEqual([["ov-after", 4200, 5200]]);

    // inputs untouched (immutability)
    expect(comp.durationMs).toBe(10_000);
    expect(applyDoc.words).toHaveLength(4);
  });

  it("unselected proposals change nothing: applying only the filler leaves the pause region intact", () => {
    const comp = applyComp();
    const { comp: nextComp, doc: nextDoc } = applyTrimCuts(comp, applyDoc, [FILLER]);
    expect(nextComp.durationMs).toBe(9700);
    // "later" moved only by the filler cut; the marker inside the (unapplied) pause survives
    expect(nextDoc.words.find((w) => w.text === "later")).toMatchObject({ startMs: 5700, endMs: 6200 });
    expect(nextComp.markers.map((m) => m.id)).toContain("mk-inside");
    expect(nextComp.overlayClips.map((c) => c.id)).toContain("ov-inside");
  });

  it("no ranges = same references (no undo step earned)", () => {
    const comp = applyComp();
    const out = applyTrimCuts(comp, applyDoc, []);
    expect(out.comp).toBe(comp);
    expect(out.doc).toBe(applyDoc);
  });

  it("range order does not matter — proposals are applied by time range, not index", () => {
    const comp = applyComp();
    const a = applyTrimCuts(comp, applyDoc, [FILLER, PAUSE]);
    const b = applyTrimCuts(comp, applyDoc, [PAUSE, FILLER]);
    expect(b.comp.durationMs).toBe(a.comp.durationMs);
    expect(b.doc.words.map((w) => [w.startMs, w.endMs])).toEqual(a.doc.words.map((w) => [w.startMs, w.endMs]));
  });
});
