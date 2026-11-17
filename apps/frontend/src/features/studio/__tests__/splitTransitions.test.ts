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
  addSegmentEffect,
  addSegmentKeyframe,
  applyContentEffect,
  applyDocEffect,
  splitVideoClipAt,
} from "../compositionOps";

/**
 * Split verification (2026-11-18): `splitVideoClipAt` already existed as an op
 * (compositionOps.ts) with basic tests in compositionOps.test.ts. This file pins
 * the properties the Split + Transitions work depends on:
 *
 * - a mid-segment split is a clean cut: the two halves' source spans are
 *   contiguous, their timeline durations sum to the original, and the total
 *   composition duration is unchanged;
 * - a split is DURATION-PRESERVING, so its docEffect is `none` — downstream
 *   captions, markers, overlays and audio do NOT move (nothing is inserted or
 *   removed; the cut only re-partitions one clip). Applying the returned
 *   docEffect must therefore leave a sample doc and sample content untouched;
 * - keyframes partition at the cut and effects are copied to both halves.
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

/* same partition, but seg-2 carries a transition in (fade 300 ms) */
const transitionSettings = ProjectSettingsSchema.parse({
  clipRange: { startMs: 10_000, endMs: 55_000 },
  composition: {
    version: 1,
    videoSegments: [
      { id: "seg-1", sourceInMs: 10_000, sourceOutMs: 25_000 },
      { id: "seg-2", sourceInMs: 25_000, sourceOutMs: 40_000, transitionIn: { type: "fade", durationMs: 300 } },
      { id: "seg-3", sourceInMs: 40_000, sourceOutMs: 55_000 },
    ],
    markers: [],
  },
});
const transitionComp = (): EditorComposition =>
  buildEditorComposition({ view: viewFor(transitionSettings, 120_000, 44_700), settings: transitionSettings, sourceDurationMs: 120_000 });

/* rated fixture: seg-1 at rate 2 (20 s source -> 10 s timeline) */
const ratedSettings = ProjectSettingsSchema.parse({
  clipRange: { startMs: 10_000, endMs: 60_000 },
  composition: {
    version: 1,
    videoSegments: [
      { id: "seg-1", sourceInMs: 10_000, sourceOutMs: 30_000, playbackRate: 2 },
      { id: "seg-2", sourceInMs: 30_000, sourceOutMs: 50_000 },
      { id: "seg-3", sourceInMs: 50_000, sourceOutMs: 60_000, playbackRate: 0.5 },
    ],
    markers: [],
  },
});
const ratedComp = (): EditorComposition =>
  buildEditorComposition({ view: viewFor(ratedSettings, 120_000, 50_000), settings: ratedSettings, sourceDurationMs: 120_000 });

const snapshot = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;

describe("splitVideoClipAt — clean-cut properties", () => {
  it("mid-segment split: source spans contiguous, durations sum to the original, total unchanged", () => {
    const comp = segmentedComp();
    const before = snapshot(comp);
    const original = comp.videoClips[1]!;
    const { comp: out, docEffect } = splitVideoClipAt(comp, 20_000);
    expect(docEffect).toEqual({ type: "none" });
    expect(out.videoClips).toHaveLength(4);
    const [first, second] = [out.videoClips[1]!, out.videoClips[2]!];
    expect(first.id).toBe("seg-2");
    expect(second.id).not.toBe("seg-2");
    expect(first.sourceInMs).toBe(original.sourceInMs);
    expect(first.sourceOutMs).toBe(second.sourceInMs);
    expect(second.sourceOutMs).toBe(original.sourceOutMs);
    expect(first.durationMs + second.durationMs).toBe(original.durationMs);
    expect(first.startMs).toBe(original.startMs);
    expect(second.startMs).toBe(20_000);
    expect(out.durationMs).toBe(comp.durationMs);
    expect(isPartition(out.videoClips)).toBe(true);
    expect(() => projectComposition(out, segmentedSettings)).not.toThrow();
    expect(comp).toEqual(before);
  });

  it("the first half keeps the clip's transitionIn; the second half starts with a plain cut", () => {
    const comp = transitionComp();
    const { comp: out } = splitVideoClipAt(comp, 20_000);
    expect(out.videoClips[1]!.transitionIn).toEqual({ type: "fade", durationMs: 300 });
    expect(out.videoClips[2]!.transitionIn).toBeNull();
    expect(out.durationMs).toBe(comp.durationMs);
    expect(isPartition(out.videoClips)).toBe(true);
    expect(() => projectComposition(out, transitionSettings)).not.toThrow();
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
    const out = splitVideoClipAt(comp, atMs);
    expect(out.comp).toBe(comp);
    expect(out.docEffect).toEqual({ type: "none" });
  });

  it("split at rate 2 cuts the source at Δt × 2 and keeps the rate on both halves", () => {
    const comp = ratedComp();
    const { comp: out } = splitVideoClipAt(comp, 5000);
    expect(out.videoClips[0]).toMatchObject({ id: "seg-1", sourceInMs: 10_000, sourceOutMs: 20_000, durationMs: 5000, playbackRate: 2 });
    expect(out.videoClips[1]).toMatchObject({ sourceInMs: 20_000, sourceOutMs: 30_000, durationMs: 5000, startMs: 5000, playbackRate: 2 });
    expect(out.durationMs).toBe(comp.durationMs);
    expect(isPartition(out.videoClips)).toBe(true);
  });
});

describe("splitVideoClipAt — downstream content does NOT move (docEffect none)", () => {
  it("applying the returned docEffect leaves captions, markers, overlays and audio untouched", () => {
    const comp = segmentedComp();
    const doc: CaptionDoc = CaptionDocSchema.parse({
      version: 2,
      words: [
        word("w1", "before", 1000, 1500),
        word("w2", "spanning", 19_500, 20_500),
        word("w3", "after", 25_000, 25_400),
      ],
    });
    const withAudio: EditorComposition = {
      ...comp,
      audioClips: [
        {
          id: "au-1", assetId: "asset-au", assetName: "music.mp3", trackId: "track-1",
          startMs: 25_000, sourceInMs: 0, sourceOutMs: 5000, volume: 1, fadeInMs: 0, fadeOutMs: 0,
          processors: { eq: { lowDb: 0, midDb: 0, highDb: 0 }, cleanup: { enabled: false, highPassHz: 80, gateDb: -50 }, reverb: 0 },
        },
      ],
      audioBleeps: [{ id: "bl-1", startMs: 26_000, endMs: 27_000, toneHz: 1000, level: 0.5, wordText: "" }],
    };
    const { comp: out, docEffect } = splitVideoClipAt(comp, 20_000);
    expect(docEffect).toEqual({ type: "none" });

    // captions: same reference back — no word moved, none deleted
    expect(applyDocEffect(doc, docEffect)).toBe(doc);
    // markers / overlays / audio / bleeps: same reference back, times unchanged
    expect(applyContentEffect(withAudio, docEffect)).toBe(withAudio);
    expect(out.markers.map((m) => [m.id, m.atMs])).toEqual([["mk-1", 5000], ["mk-2", 30_000]]);
    expect(out.overlayClips.map((c) => [c.overlay.id, c.startMs, c.endMs])).toEqual([
      ["ov-text", 1000, 4000],
      ["ov-shape", 5000, 8000],
    ]);
  });
});

describe("splitVideoClipAt — keyframes and effects follow the cut", () => {
  it("keyframes partition at the cut (first keeps ids, second shifts with fresh ids); effects copy to both", () => {
    let comp = segmentedComp();
    comp = addSegmentKeyframe(comp, "seg-2", "scale", 1000, 1.3).comp;
    comp = addSegmentKeyframe(comp, "seg-2", "scale", 6000, 1.6).comp;
    comp = addSegmentEffect(comp, "seg-2", "blur").comp;
    const beforeEffectId = comp.videoClips[1]!.effects![0]!.id;
    const { comp: out } = splitVideoClipAt(comp, 20_000);
    const [first, second] = [out.videoClips[1]!, out.videoClips[2]!];
    expect(first.keyframes).toHaveLength(1);
    expect(first.keyframes![0]).toMatchObject({ atMs: 1000, property: "scale", value: 1.3 });
    expect(second.keyframes).toHaveLength(1);
    expect(second.keyframes![0]).toMatchObject({ atMs: 1000, property: "scale", value: 1.6 });
    expect(second.keyframes![0]!.id).not.toBe(first.keyframes![0]!.id);
    expect(first.effects).toHaveLength(1);
    expect(first.effects![0]!.id).toBe(beforeEffectId);
    expect(second.effects).toHaveLength(1);
    expect(second.effects![0]!.type).toBe("blur");
    expect(second.effects![0]!.id).not.toBe(beforeEffectId);
    expect(isPartition(out.videoClips)).toBe(true);
  });
});
