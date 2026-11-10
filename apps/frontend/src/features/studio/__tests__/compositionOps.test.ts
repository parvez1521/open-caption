import { describe, expect, it } from "vitest";
import {
  CaptionDocSchema,
  ProjectSettingsSchema,
  type CaptionDoc,
  type Page,
  type ProjectSettings,
  type Word,
} from "@capseasy/shared";
import { toComposition, type CompositionInput } from "../composition";
import { buildEditorComposition, isPartition, projectComposition, type EditorComposition } from "../compositionDoc";
import {
  addMarker,
  applyContentShift,
  applyDocEffect,
  canRippleDeleteVideoSegment,
  deleteOverlayClip,
  duplicateOverlayClip,
  moveOverlayClip,
  overlayTrackOf,
  removeMarker,
  rippleDeleteOverlayClip,
  rippleDeleteVideoSegment,
  setTrackState,
  splitOverlayClipAt,
  splitVideoClipAt,
  trimOverlayClip,
  trimVideoClipEdge,
} from "../compositionOps";

/**
 * Stage-B clip-op tests (Phase 4, Worker C): every video op's result is run
 * through projectComposition (the partition tripwire) + isPartition; every op
 * is checked for input immutability (JSON snapshot, plus a deep-frozen
 * fixture that runs the whole op surface).
 */

const word = (id: string, text: string, startMs: number, endMs: number): Word => ({ id, text, startMs, endMs });
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
const pages = [page("p1", [word("w1", "hello", 0, 400), word("w2", "there", 450, 900)])];

function viewFor(settings: ProjectSettings, sourceDurationMs: number, viewDurationMs: number) {
  const input: CompositionInput = {
    media: { videoId: "vid-1", filename: "clip.mp4", size: 12345, width: 1080, height: 1920, fps: 30, durationMs: sourceDurationMs },
    doc: null,
    pages,
    settings,
    durationMs: viewDurationMs,
  };
  return toComposition(input);
}

const baseSettings = ProjectSettingsSchema.parse({});

/* segmented fixture: 3 × 15 s segments over source 10 s..55 s of a 120 s source */
const segmentedSettings = ProjectSettingsSchema.parse({
  clipRange: { startMs: 10_000, endMs: 55_000 },
  overlays: [
    { id: "ov-text", kind: "text", text: "Hi", startMs: 1000, endMs: 4000 },
    { id: "ov-shape", kind: "shape", shape: "star", startMs: 5000, endMs: 8000 },
  ],
  composition: {
    version: 1,
    videoSegments: [
      { id: "seg-1", sourceInMs: 10_000, sourceOutMs: 25_000 },
      { id: "seg-2", sourceInMs: 25_000, sourceOutMs: 40_000 },
      { id: "seg-3", sourceInMs: 40_000, sourceOutMs: 55_000 },
    ],
    markers: [
      { id: "mk-1", atMs: 5000, label: "Hook" },
      { id: "mk-2", atMs: 30_000, label: "" },
    ],
    tracks: {
      video: { locked: false, visible: true, muted: false },
      captions: { locked: false, visible: true, muted: false },
      text: { locked: false, visible: true, muted: false },
      graphics: { locked: false, visible: true, muted: false },
    },
  },
});
const segmentedComp = (): EditorComposition =>
  buildEditorComposition({ view: viewFor(segmentedSettings, 120_000, 45_000), settings: segmentedSettings, sourceDurationMs: 120_000 });

/* plain single-clip fixture: full 60 s source, one synthesised clip */
const plainSettings = ProjectSettingsSchema.parse({});
const plainComp = (): EditorComposition =>
  buildEditorComposition({ view: viewFor(plainSettings, 60_000, 60_000), settings: plainSettings, sourceDurationMs: 60_000 });

/* overlay fixture: text-group = text+image, graphics-group = shape+social */
const overlaySettings = ProjectSettingsSchema.parse({
  overlays: [
    { id: "ov-text", kind: "text", text: "Hello", startMs: 1000, endMs: 4000 },
    { id: "ov-shape", kind: "shape", shape: "star", startMs: 2000, endMs: 5000 },
    { id: "ov-img", kind: "image", assetId: "asset-1", assetName: "logo.png", startMs: 5000, endMs: 8000 },
    { id: "ov-social", kind: "social", variant: "subscribe-pill", text: "Subscribe\nSubscribed", startMs: 6000, endMs: 9000 },
  ],
});
const overlayComp = (): EditorComposition =>
  buildEditorComposition({ view: viewFor(overlaySettings, 60_000, 60_000), settings: overlaySettings, sourceDurationMs: 60_000 });

const snapshot = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;
function expectUnmutated<T>(input: T, before: unknown) {
  expect(input).toEqual(before);
}
function expectValidPartition(comp: EditorComposition, base: ProjectSettings = baseSettings) {
  expect(isPartition(comp.videoClips)).toBe(true);
  expect(() => projectComposition(comp, base)).not.toThrow();
}
const deepFreeze = <T>(v: T): T => {
  if (v && typeof v === "object") {
    for (const child of Object.values(v as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(v);
  }
  return v;
};

/* ------------------------------------------------------------------ */

describe("splitVideoClipAt", () => {
  it("splits a middle segment at exact timeline + source values", () => {
    const comp = segmentedComp();
    const before = snapshot(comp);
    const { comp: out, docEffect } = splitVideoClipAt(comp, 20_000);
    expect(docEffect).toEqual({ type: "none" });
    expect(out).not.toBe(comp);
    expect(out.videoClips).toHaveLength(4);
    expect(out.videoClips[0]).toEqual(comp.videoClips[0]);
    expect(out.videoClips[1]).toEqual({ id: "seg-2", kind: "video", startMs: 15_000, durationMs: 5000, sourceInMs: 25_000, sourceOutMs: 30_000 });
    const second = out.videoClips[2]!;
    expect(second.id).not.toBe("seg-2");
    expect(second.id.length).toBeGreaterThan(0);
    expect(second).toMatchObject({ kind: "video", startMs: 20_000, durationMs: 10_000, sourceInMs: 30_000, sourceOutMs: 40_000 });
    expect(out.videoClips[3]).toEqual({ ...comp.videoClips[2]!, startMs: 30_000 });
    expect(out.durationMs).toBe(45_000);
    expectValidPartition(out, segmentedSettings);
    expectUnmutated(comp, before);
  });

  it("splits the first segment, keeping its id on the first half", () => {
    const comp = segmentedComp();
    const { comp: out } = splitVideoClipAt(comp, 5000);
    expect(out.videoClips[0]).toEqual({ id: "seg-1", kind: "video", startMs: 0, durationMs: 5000, sourceInMs: 10_000, sourceOutMs: 15_000 });
    expect(out.videoClips[1]).toMatchObject({ startMs: 5000, durationMs: 10_000, sourceInMs: 15_000, sourceOutMs: 25_000 });
    expectValidPartition(out, segmentedSettings);
  });

  it("allows a split leaving exactly 40 ms on a side", () => {
    const comp = segmentedComp();
    const { comp: out } = splitVideoClipAt(comp, 15_040);
    expect(out).not.toBe(comp);
    expect(out.videoClips[1]!.durationMs).toBe(40);
    expectValidPartition(out, segmentedSettings);
  });

  it.each([
    ["on a segment boundary", 15_000],
    ["at project start", 0],
    ["at project end", 45_000],
    ["outside any segment", 99_999],
    ["<40 ms from the segment start", 15_020],
    ["<40 ms from the segment end", 29_980],
  ])("refuses (%s) with the same reference", (_name, atMs) => {
    const comp = segmentedComp();
    const before = snapshot(comp);
    const out = splitVideoClipAt(comp, atMs);
    expect(out.comp).toBe(comp);
    expect(out.docEffect).toEqual({ type: "none" });
    expectUnmutated(comp, before);
  });
});

describe("trimVideoClipEdge — boundary roll", () => {
  it("rolls a start edge forward: both neighbours adjust, source stays continuous", () => {
    const comp = segmentedComp();
    const before = snapshot(comp);
    const { comp: out, docEffect } = trimVideoClipEdge(comp, "seg-2", "start", 18_000);
    expect(docEffect).toEqual({ type: "none" });
    expect(out.videoClips[0]).toEqual({ id: "seg-1", kind: "video", startMs: 0, durationMs: 18_000, sourceInMs: 10_000, sourceOutMs: 28_000 });
    expect(out.videoClips[1]).toEqual({ id: "seg-2", kind: "video", startMs: 18_000, durationMs: 12_000, sourceInMs: 28_000, sourceOutMs: 40_000 });
    expect(out.videoClips[1]!.sourceInMs).toBe(out.videoClips[0]!.sourceOutMs);
    expect(out.videoClips[2]).toEqual(comp.videoClips[2]);
    expect(out.durationMs).toBe(45_000);
    expectValidPartition(out, segmentedSettings);
    expectUnmutated(comp, before);
  });

  it("rolls a start edge backward", () => {
    const comp = segmentedComp();
    const { comp: out } = trimVideoClipEdge(comp, "seg-2", "start", 12_000);
    expect(out.videoClips[0]).toMatchObject({ durationMs: 12_000, sourceOutMs: 22_000 });
    expect(out.videoClips[1]).toMatchObject({ startMs: 12_000, durationMs: 18_000, sourceInMs: 22_000 });
    expectValidPartition(out, segmentedSettings);
  });

  it("rolls an end edge (same boundary from the other side)", () => {
    const comp = segmentedComp();
    const { comp: out } = trimVideoClipEdge(comp, "seg-1", "end", 18_000);
    expect(out.videoClips[0]).toMatchObject({ durationMs: 18_000, sourceOutMs: 28_000 });
    expect(out.videoClips[1]).toMatchObject({ startMs: 18_000, durationMs: 12_000, sourceInMs: 28_000 });
    expect(out.videoClips[1]!.sourceInMs).toBe(out.videoClips[0]!.sourceOutMs);
    expectValidPartition(out, segmentedSettings);
  });

  it("clamps the roll at the neighbours' 40 ms minimums in both directions", () => {
    const comp = segmentedComp();
    const fwd = trimVideoClipEdge(comp, "seg-2", "start", 999_999).comp;
    expect(fwd.videoClips[1]!.durationMs).toBe(40);
    expect(fwd.videoClips[0]!.durationMs).toBe(29_960);
    expectValidPartition(fwd, segmentedSettings);
    const back = trimVideoClipEdge(comp, "seg-2", "start", -999_999).comp;
    expect(back.videoClips[0]!.durationMs).toBe(40);
    expect(back.videoClips[1]!.durationMs).toBe(29_960);
    expectValidPartition(back, segmentedSettings);
    const endFwd = trimVideoClipEdge(comp, "seg-2", "end", 999_999).comp;
    expect(endFwd.videoClips[2]!.durationMs).toBe(40);
    expect(endFwd.videoClips[1]!.durationMs).toBe(29_960);
    expectValidPartition(endFwd, segmentedSettings);
  });

  it("no-ops on a zero move and on an unknown clip id", () => {
    const comp = segmentedComp();
    expect(trimVideoClipEdge(comp, "seg-2", "start", 15_000).comp).toBe(comp);
    expect(trimVideoClipEdge(comp, "seg-2", "end", 30_000).comp).toBe(comp);
    expect(trimVideoClipEdge(comp, "nope", "start", 1000).comp).toBe(comp);
  });
});

describe("trimVideoClipEdge — head trim", () => {
  it("cuts the head: source advances, everything re-accumulates, docEffect carries the delta", () => {
    const comp = segmentedComp();
    const before = snapshot(comp);
    const { comp: out, docEffect } = trimVideoClipEdge(comp, "seg-1", "start", 5000);
    expect(docEffect).toEqual({ type: "headShift", deltaMs: 5000 });
    expect(out.videoClips[0]).toEqual({ id: "seg-1", kind: "video", startMs: 0, durationMs: 10_000, sourceInMs: 15_000, sourceOutMs: 25_000 });
    expect(out.videoClips[1]).toMatchObject({ startMs: 10_000, durationMs: 15_000, sourceInMs: 25_000 });
    expect(out.videoClips[2]).toMatchObject({ startMs: 25_000, durationMs: 15_000, sourceInMs: 40_000 });
    expect(out.durationMs).toBe(40_000);
    expect(out.rangeStartMs).toBe(15_000);
    // markers / overlays are NOT moved by the video op — the commit layer shifts them
    expect(out.markers).toEqual(comp.markers);
    expect(out.overlayClips).toEqual(comp.overlayClips);
    expectValidPartition(out, segmentedSettings);
    expectUnmutated(comp, before);
  });

  it("refuses when the first clip would drop below 40 ms, and no-ops at/below 0", () => {
    const comp = segmentedComp();
    expect(trimVideoClipEdge(comp, "seg-1", "start", 14_980).comp).toBe(comp); // 20 ms would remain
    expect(trimVideoClipEdge(comp, "seg-1", "start", 0).comp).toBe(comp);
    expect(trimVideoClipEdge(comp, "seg-1", "start", -500).comp).toBe(comp);
    const ok = trimVideoClipEdge(comp, "seg-1", "start", 14_960); // exactly 40 ms remains
    expect(ok.comp).not.toBe(comp);
    expect(ok.comp.videoClips[0]!.durationMs).toBe(40);
    expect(ok.docEffect).toEqual({ type: "headShift", deltaMs: 14_960 });
    expectValidPartition(ok.comp, segmentedSettings);
  });
});

describe("trimVideoClipEdge — tail trim / extend", () => {
  it("trims the tail inward", () => {
    const comp = segmentedComp();
    const before = snapshot(comp);
    const { comp: out, docEffect } = trimVideoClipEdge(comp, "seg-3", "end", 40_000);
    expect(docEffect).toEqual({ type: "none" });
    expect(out.videoClips[2]).toEqual({ id: "seg-3", kind: "video", startMs: 30_000, durationMs: 10_000, sourceInMs: 40_000, sourceOutMs: 50_000 });
    expect(out.durationMs).toBe(40_000);
    expectValidPartition(out, segmentedSettings);
    expectUnmutated(comp, before);
  });

  it("clamps an inward tail trim so 40 ms remains", () => {
    const comp = segmentedComp();
    const { comp: out } = trimVideoClipEdge(comp, "seg-3", "end", 30_010);
    expect(out.videoClips[2]!.durationMs).toBe(40);
    expect(out.videoClips[2]!.sourceOutMs).toBe(40_040);
    expectValidPartition(out, segmentedSettings);
  });

  it("extends the tail, bounded by sourceDurationMs", () => {
    const comp = segmentedComp();
    const ext = trimVideoClipEdge(comp, "seg-3", "end", 50_000).comp;
    expect(ext.videoClips[2]).toMatchObject({ durationMs: 20_000, sourceOutMs: 60_000 });
    expect(ext.durationMs).toBe(50_000);
    expectValidPartition(ext, segmentedSettings);
    const capped = trimVideoClipEdge(comp, "seg-3", "end", 999_999).comp;
    expect(capped.videoClips[2]!.sourceOutMs).toBe(120_000); // the source end
    expect(capped.videoClips[2]!.durationMs).toBe(80_000);
    expectValidPartition(capped, segmentedSettings);
  });

  it("extends without bound when sourceDurationMs is 0 (unknown source length)", () => {
    const comp: EditorComposition = {
      version: 1,
      durationMs: 10_000,
      sourceDurationMs: 0,
      rangeStartMs: 0,
      videoClips: [{ id: "only", kind: "video", startMs: 0, durationMs: 10_000, sourceInMs: 0, sourceOutMs: 10_000 }],
      captionClips: [],
      overlayClips: [],
      markers: [],
      trackState: plainComp().trackState,
    };
    const before = snapshot(comp);
    const { comp: out } = trimVideoClipEdge(comp, "only", "end", 25_000);
    expect(out.videoClips[0]).toMatchObject({ durationMs: 25_000, sourceOutMs: 25_000 });
    expect(out.durationMs).toBe(25_000);
    expectValidPartition(out);
    expectUnmutated(comp, before);
  });

  it("no-ops when the end edge does not move", () => {
    const comp = segmentedComp();
    expect(trimVideoClipEdge(comp, "seg-3", "end", 45_000).comp).toBe(comp);
  });
});

describe("rippleDeleteVideoSegment + canRippleDeleteVideoSegment", () => {
  it("truth table: first/last true, middle/single/unknown false", () => {
    const comp = segmentedComp();
    expect(canRippleDeleteVideoSegment(comp, "seg-1")).toBe(true);
    expect(canRippleDeleteVideoSegment(comp, "seg-2")).toBe(false);
    expect(canRippleDeleteVideoSegment(comp, "seg-3")).toBe(true);
    expect(canRippleDeleteVideoSegment(comp, "nope")).toBe(false);
    expect(canRippleDeleteVideoSegment(plainComp(), "main-video")).toBe(false);
  });

  it("deleting the first segment is a head shift by its duration", () => {
    const comp = segmentedComp();
    const before = snapshot(comp);
    const { comp: out, docEffect } = rippleDeleteVideoSegment(comp, "seg-1");
    expect(docEffect).toEqual({ type: "headShift", deltaMs: 15_000 });
    expect(out.videoClips.map((c) => c.id)).toEqual(["seg-2", "seg-3"]);
    expect(out.videoClips[0]).toMatchObject({ startMs: 0, sourceInMs: 25_000 });
    expect(out.videoClips[1]).toMatchObject({ startMs: 15_000, sourceInMs: 40_000 });
    expect(out.durationMs).toBe(30_000);
    expect(out.rangeStartMs).toBe(25_000);
    expectValidPartition(out, segmentedSettings);
    expectUnmutated(comp, before);
  });

  it("deleting the last segment just shortens the composition", () => {
    const comp = segmentedComp();
    const { comp: out, docEffect } = rippleDeleteVideoSegment(comp, "seg-3");
    expect(docEffect).toEqual({ type: "none" });
    expect(out.videoClips.map((c) => c.id)).toEqual(["seg-1", "seg-2"]);
    expect(out.durationMs).toBe(30_000);
    expectValidPartition(out, segmentedSettings);
  });

  it("refuses a middle segment and the only segment (same reference)", () => {
    const comp = segmentedComp();
    const mid = rippleDeleteVideoSegment(comp, "seg-2");
    expect(mid.comp).toBe(comp);
    expect(mid.docEffect).toEqual({ type: "none" });
    const single = plainComp();
    expect(rippleDeleteVideoSegment(single, "main-video").comp).toBe(single);
    expect(rippleDeleteVideoSegment(comp, "nope").comp).toBe(comp);
  });
});

describe("applyContentShift", () => {
  const shiftSettings = ProjectSettingsSchema.parse({
    overlays: [
      { id: "ov-drop", kind: "text", text: "Drop", startMs: 0, endMs: 1000 },
      { id: "ov-span", kind: "text", text: "Span", startMs: 500, endMs: 3000 },
      { id: "ov-later", kind: "shape", shape: "star", startMs: 4000, endMs: 7000 },
    ],
    composition: {
      version: 1,
      videoSegments: [],
      markers: [
        { id: "mk-before", atMs: 500, label: "before" },
        { id: "mk-at", atMs: 1000, label: "at" },
        { id: "mk-after", atMs: 5000, label: "after" },
      ],
      tracks: {
        video: { locked: false, visible: true, muted: false },
        captions: { locked: false, visible: true, muted: false },
        text: { locked: false, visible: true, muted: false },
        graphics: { locked: false, visible: true, muted: false },
      },
    },
  });
  const shiftComp = (): EditorComposition =>
    buildEditorComposition({ view: viewFor(shiftSettings, 60_000, 60_000), settings: shiftSettings, sourceDurationMs: 60_000 });

  it("drops/shifts/clamps markers and overlays by −delta, leaving video untouched", () => {
    const comp = shiftComp();
    const before = snapshot(comp);
    const out = applyContentShift(comp, 1000);
    expect(out).not.toBe(comp);
    // marker at 500 drops, at 1000 lands on 0, at 5000 shifts to 4000
    expect(out.markers).toEqual([
      { id: "mk-at", atMs: 0, label: "at" },
      { id: "mk-after", atMs: 4000, label: "after" },
    ]);
    // overlay ending exactly at the cut drops; spanning clamps to 0; later shifts wholly
    expect(out.overlayClips.map((c) => [c.id, c.startMs, c.endMs, c.durationMs])).toEqual([
      ["ov-span", 0, 2000, 2000],
      ["ov-later", 3000, 6000, 3000],
    ]);
    // the overlay items are synced copies, never the mutated originals
    expect(out.overlayClips[0]!.overlay).toMatchObject({ id: "ov-span", startMs: 0, endMs: 2000 });
    expect(out.overlayClips[0]!.overlay).not.toBe(comp.overlayClips[1]!.overlay);
    expect(out.overlayClips[1]!.overlay).toMatchObject({ id: "ov-later", startMs: 3000, endMs: 6000 });
    // video side untouched — the video op already handled it
    expect(out.videoClips).toBe(comp.videoClips);
    expect(out.durationMs).toBe(comp.durationMs);
    expectUnmutated(comp, before);
  });

  it("returns the same reference for a zero delta and when nothing would change", () => {
    const comp = shiftComp();
    expect(applyContentShift(comp, 0)).toBe(comp);
    const empty = plainComp();
    expect(empty.markers).toEqual([]);
    expect(empty.overlayClips).toEqual([]);
    expect(applyContentShift(empty, 1000)).toBe(empty);
  });
});

describe("applyDocEffect", () => {
  const docFixture = (): CaptionDoc =>
    CaptionDocSchema.parse({
      version: 2,
      words: [
        word("w1", "gone", 0, 500),
        word("w2", "also-gone", 600, 1200),
        word("w3", "spanning", 1200, 2600),
        word("w4", "later", 3000, 3600),
      ],
    });

  it("headShift deletes words ending at/before the cut and shifts the rest exactly", () => {
    const doc = docFixture();
    const before = snapshot(doc);
    const out = applyDocEffect(doc, { type: "headShift", deltaMs: 1500 });
    expect(out).not.toBe(doc);
    expect(out.words.map((w) => [w.id, w.startMs, w.endMs])).toEqual([
      ["w3", 0, 1100], // spanning word: starts clamped to 0, tail intact (2600 − 1500)
      ["w4", 1500, 2100], // later word: shifted exactly
    ]);
    expectUnmutated(doc, before);
  });

  it("deleting every word yields an empty doc", () => {
    const doc = docFixture();
    const out = applyDocEffect(doc, { type: "headShift", deltaMs: 99_999 });
    expect(out.words).toEqual([]);
  });

  it("returns the same reference for none, a zero shift, and an empty doc", () => {
    const doc = docFixture();
    expect(applyDocEffect(doc, { type: "none" })).toBe(doc);
    expect(applyDocEffect(doc, { type: "headShift", deltaMs: 0 })).toBe(doc);
    const empty = CaptionDocSchema.parse({ version: 2, words: [] });
    expect(applyDocEffect(empty, { type: "headShift", deltaMs: 1000 })).toBe(empty);
  });
});

describe("headShift flow: video op → docEffect → applyDocEffect + applyContentShift", () => {
  it("a head trim's delta drives both content shifts consistently", () => {
    const comp = segmentedComp();
    const { comp: trimmed, docEffect } = trimVideoClipEdge(comp, "seg-1", "start", 5000);
    expect(docEffect).toEqual({ type: "headShift", deltaMs: 5000 });
    const shifted = applyContentShift(trimmed, 5000);
    // mk-1 sits exactly at the cut (5000) and lands on 0; mk-2 shifts to 25000
    expect(shifted.markers).toEqual([
      { id: "mk-1", atMs: 0, label: "Hook" },
      { id: "mk-2", atMs: 25_000, label: "" },
    ]);
    const doc = CaptionDocSchema.parse({
      version: 2,
      words: [word("a", "old", 0, 4000), word("b", "kept", 6000, 7000)],
    });
    const shiftedDoc = applyDocEffect(doc, docEffect);
    expect(shiftedDoc.words.map((w) => [w.id, w.startMs, w.endMs])).toEqual([["b", 1000, 2000]]);
  });
});

/* ------------------------------------------------------------------ */

describe("overlayTrackOf", () => {
  it("maps text|image → text and shape|social → graphics", () => {
    expect(overlayTrackOf("text")).toBe("text");
    expect(overlayTrackOf("image")).toBe("text");
    expect(overlayTrackOf("shape")).toBe("graphics");
    expect(overlayTrackOf("social")).toBe("graphics");
  });
});

describe("overlay ops", () => {
  it("moveOverlayClip moves with duration kept and item in sync; start clamps at 0", () => {
    const comp = overlayComp();
    const before = snapshot(comp);
    const out = moveOverlayClip(comp, "ov-text", 2000);
    const clip = out.overlayClips.find((c) => c.id === "ov-text")!;
    expect([clip.startMs, clip.endMs, clip.durationMs]).toEqual([3000, 6000, 3000]);
    expect(clip.overlay).toMatchObject({ startMs: 3000, endMs: 6000 });
    expect(clip.overlay).not.toBe(comp.overlayClips.find((c) => c.id === "ov-text")!.overlay);
    const clamped = moveOverlayClip(comp, "ov-text", -5000);
    const c2 = clamped.overlayClips.find((c) => c.id === "ov-text")!;
    expect([c2.startMs, c2.endMs]).toEqual([0, 3000]);
    expect(moveOverlayClip(comp, "ov-text", 0)).toBe(comp);
    expect(moveOverlayClip(comp, "nope", 100)).toBe(comp);
    expectUnmutated(comp, before);
  });

  it("trimOverlayClip clamps the start to [0, end−100] and the end to ≥ start+100, unbounded above", () => {
    const comp = overlayComp();
    const before = snapshot(comp);
    const start = trimOverlayClip(comp, "ov-text", "start", 2000).overlayClips.find((c) => c.id === "ov-text")!;
    expect([start.startMs, start.endMs, start.durationMs]).toEqual([2000, 4000, 2000]);
    expect(start.overlay).toMatchObject({ startMs: 2000, endMs: 4000 });
    const startLow = trimOverlayClip(comp, "ov-text", "start", -500).overlayClips.find((c) => c.id === "ov-text")!;
    expect(startLow.startMs).toBe(0);
    const startHigh = trimOverlayClip(comp, "ov-text", "start", 99_999).overlayClips.find((c) => c.id === "ov-text")!;
    expect([startHigh.startMs, startHigh.endMs]).toEqual([3900, 4000]);
    const end = trimOverlayClip(comp, "ov-text", "end", 6000).overlayClips.find((c) => c.id === "ov-text")!;
    expect([end.startMs, end.endMs]).toEqual([1000, 6000]);
    const endLow = trimOverlayClip(comp, "ov-text", "end", 500).overlayClips.find((c) => c.id === "ov-text")!;
    expect(endLow.endMs).toBe(1100);
    const endHigh = trimOverlayClip(comp, "ov-text", "end", 99_999).overlayClips.find((c) => c.id === "ov-text")!;
    expect(endHigh.endMs).toBe(99_999);
    expect(trimOverlayClip(comp, "ov-text", "start", 1000)).toBe(comp);
    expect(trimOverlayClip(comp, "nope", "end", 5000)).toBe(comp);
    expectUnmutated(comp, before);
  });

  it("splitOverlayClipAt splits with a new id on the second half, both items in sync", () => {
    const comp = overlayComp();
    const before = snapshot(comp);
    const out = splitOverlayClipAt(comp, "ov-text", 2500);
    expect(out).not.toBe(comp);
    const idx = out.overlayClips.findIndex((c) => c.id === "ov-text");
    const first = out.overlayClips[idx]!;
    const second = out.overlayClips[idx + 1]!;
    expect([first.startMs, first.endMs, first.durationMs]).toEqual([1000, 2500, 1500]);
    expect(first.overlay).toMatchObject({ id: "ov-text", startMs: 1000, endMs: 2500 });
    expect(second.id).not.toBe("ov-text");
    expect(second.overlay.id).toBe(second.id); // clip id == item id, as Stage A builds them
    expect([second.startMs, second.endMs, second.durationMs]).toEqual([2500, 4000, 1500]);
    expect(second.overlay).toMatchObject({ startMs: 2500, endMs: 4000, text: "Hello" });
    expect(out.overlayClips).toHaveLength(comp.overlayClips.length + 1);
    expectUnmutated(comp, before);
  });

  it("splitOverlayClipAt refuses edges, <40 ms sides and unknown ids", () => {
    const comp = overlayComp();
    expect(splitOverlayClipAt(comp, "ov-text", 1000)).toBe(comp);
    expect(splitOverlayClipAt(comp, "ov-text", 4000)).toBe(comp);
    expect(splitOverlayClipAt(comp, "ov-text", 1020)).toBe(comp);
    expect(splitOverlayClipAt(comp, "ov-text", 3980)).toBe(comp);
    expect(splitOverlayClipAt(comp, "ov-text", 9000)).toBe(comp);
    expect(splitOverlayClipAt(comp, "nope", 2500)).toBe(comp);
  });

  it("duplicateOverlayClip copies at the same window with a new id, right after the original", () => {
    const comp = overlayComp();
    const before = snapshot(comp);
    const out = duplicateOverlayClip(comp, "ov-shape");
    const idx = out.overlayClips.findIndex((c) => c.id === "ov-shape");
    const copy = out.overlayClips[idx + 1]!;
    expect(copy.id).not.toBe("ov-shape");
    expect(copy.overlay.id).toBe(copy.id);
    expect([copy.startMs, copy.endMs, copy.durationMs]).toEqual([2000, 5000, 3000]);
    expect(copy.overlay).toMatchObject({ shape: "star", startMs: 2000, endMs: 5000 });
    expect(out.overlayClips).toHaveLength(comp.overlayClips.length + 1);
    expect(duplicateOverlayClip(comp, "nope")).toBe(comp);
    expectUnmutated(comp, before);
  });

  it("deleteOverlayClip removes exactly that clip", () => {
    const comp = overlayComp();
    const before = snapshot(comp);
    const out = deleteOverlayClip(comp, "ov-img");
    expect(out.overlayClips.map((c) => c.id)).toEqual(["ov-text", "ov-shape", "ov-social"]);
    expect(deleteOverlayClip(comp, "nope")).toBe(comp);
    expectUnmutated(comp, before);
  });

  it("rippleDeleteOverlayClip shifts later same-group clips by the exact duration; other group untouched", () => {
    const comp = overlayComp();
    const before = snapshot(comp);
    // ov-text (text group, 3000 ms): the later text-group clip ov-img shifts 5000→2000
    const out = rippleDeleteOverlayClip(comp, "ov-text");
    expect(out.overlayClips.map((c) => c.id)).toEqual(["ov-shape", "ov-img", "ov-social"]);
    const img = out.overlayClips.find((c) => c.id === "ov-img")!;
    expect([img.startMs, img.endMs, img.durationMs]).toEqual([2000, 5000, 3000]);
    expect(img.overlay).toMatchObject({ startMs: 2000, endMs: 5000 });
    // graphics group untouched, by reference
    expect(out.overlayClips.find((c) => c.id === "ov-shape")).toBe(comp.overlayClips.find((c) => c.id === "ov-shape"));
    expect(out.overlayClips.find((c) => c.id === "ov-social")).toBe(comp.overlayClips.find((c) => c.id === "ov-social"));
    // and from the graphics side: deleting ov-shape shifts ov-social 6000→3000 only
    const out2 = rippleDeleteOverlayClip(comp, "ov-shape");
    const social = out2.overlayClips.find((c) => c.id === "ov-social")!;
    expect([social.startMs, social.endMs]).toEqual([3000, 6000]);
    expect(out2.overlayClips.find((c) => c.id === "ov-img")).toBe(comp.overlayClips.find((c) => c.id === "ov-img"));
    expect(rippleDeleteOverlayClip(comp, "nope")).toBe(comp);
    expectUnmutated(comp, before);
  });
});

/* ------------------------------------------------------------------ */

describe("markers", () => {
  it("addMarker inserts sorted by atMs, stable for ties, clamped and rounded", () => {
    const comp = segmentedComp(); // markers at 5000 and 30000
    const before = snapshot(comp);
    const mid = addMarker(comp, 10_000, "Mid");
    expect(mid.markers.map((m) => m.atMs)).toEqual([5000, 10_000, 30_000]);
    expect(mid.markers[1]).toMatchObject({ label: "Mid" });
    expect(mid.markers[1]!.id.length).toBeGreaterThan(0);
    const tie = addMarker(comp, 5000, "Tie");
    expect(tie.markers.map((m) => m.label)).toEqual(["Hook", "Tie", ""]); // new marker AFTER the existing tie
    const clamped = addMarker(comp, -250);
    expect(clamped.markers[0]).toMatchObject({ atMs: 0, label: "" });
    const rounded = addMarker(comp, 1234.6);
    expect(rounded.markers.some((m) => m.atMs === 1235)).toBe(true);
    expectUnmutated(comp, before);
  });

  it("removeMarker removes by id; unknown id is a no-op", () => {
    const comp = segmentedComp();
    const before = snapshot(comp);
    expect(removeMarker(comp, "mk-1").markers.map((m) => m.id)).toEqual(["mk-2"]);
    expect(removeMarker(comp, "nope")).toBe(comp);
    expectUnmutated(comp, before);
  });
});

describe("setTrackState", () => {
  it("patches one track, leaving the others by reference", () => {
    const comp = segmentedComp();
    const before = snapshot(comp);
    const out = setTrackState(comp, "graphics", { visible: false, locked: true });
    expect(out).not.toBe(comp);
    expect(out.trackState.graphics).toEqual({ locked: true, visible: false, muted: false });
    expect(out.trackState.video).toBe(comp.trackState.video);
    expectUnmutated(comp, before);
  });

  it("returns the same reference when the patch changes nothing", () => {
    const comp = segmentedComp();
    expect(setTrackState(comp, "video", { visible: true })).toBe(comp);
    expect(setTrackState(comp, "video", {})).toBe(comp);
    expect(setTrackState(comp, "video", { locked: false, visible: true, muted: false })).toBe(comp);
  });
});

/* ------------------------------------------------------------------ */

describe("purity: the whole op surface on a deep-frozen composition", () => {
  it("no op mutates (or throws on) frozen input", () => {
    const comp = deepFreeze(segmentedComp());
    const before = snapshot(comp);
    splitVideoClipAt(comp, 20_000);
    trimVideoClipEdge(comp, "seg-1", "start", 5000);
    trimVideoClipEdge(comp, "seg-2", "start", 18_000);
    trimVideoClipEdge(comp, "seg-3", "end", 40_000);
    rippleDeleteVideoSegment(comp, "seg-1");
    applyContentShift(comp, 1000);
    moveOverlayClip(comp, "ov-text", 500);
    trimOverlayClip(comp, "ov-text", "end", 6000);
    splitOverlayClipAt(comp, "ov-text", 2500);
    duplicateOverlayClip(comp, "ov-text");
    deleteOverlayClip(comp, "ov-text");
    rippleDeleteOverlayClip(comp, "ov-text");
    addMarker(comp, 7000, "x");
    removeMarker(comp, "mk-1");
    setTrackState(comp, "video", { muted: true });
    expect(comp).toEqual(before);

    const doc = deepFreeze(
      CaptionDocSchema.parse({ version: 2, words: [word("a", "x", 0, 500), word("b", "y", 1000, 2000)] }),
    );
    const docBefore = snapshot(doc);
    applyDocEffect(doc, { type: "headShift", deltaMs: 750 });
    expect(doc).toEqual(docBefore);
  });
});
