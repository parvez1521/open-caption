import { describe, expect, it } from "vitest";
import {
  EMPTY_COMPOSITION_SETTINGS,
  ProjectSettingsSchema,
  type Page,
  type ProjectSettings,
  type Word,
} from "@capseasy/shared";
import { toComposition, type CompositionInput } from "../composition";
import {
  buildEditorComposition,
  isPartition,
  projectComposition,
  segmentsSpan,
  type EditorComposition,
} from "../compositionDoc";

/**
 * Stage-B invariant tests (Phase 4.1): the build/project round trips must be exact,
 * an untouched project must keep exactly today's stored shape, the projected
 * clipRange must always equal the video-segment span (the render-sync invariant),
 * and the partition guard must trip on hand-broken compositions.
 */

/** The Run-2 editor-clip defaults every pre-Run-2 segment builds with. */
const CLIP_DEFAULTS = {
  playbackRate: 1,
  transform: {
    cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0, rotateDeg: 0,
    flipH: false, flipV: false, scale: 1, offsetX: 0, offsetY: 0,
  },
  transitionIn: null,
  assetId: null,
  still: false,
} as const;
/** The same defaults in stored-segment shape (for projected-settings expectations). */
const SEG_DEFAULTS = CLIP_DEFAULTS;

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

// overlays are listed in timeline order (startMs, then id) in every fixture, matching
// the Stage-A ordering the projection writes back — so a lossless round trip is deep-equal.
const overlayInput = [
  { id: "ov-text", kind: "text", text: "Hi", startMs: 1000, endMs: 4000 },
  { id: "ov-shape", kind: "shape", shape: "star", startMs: 5000, endMs: 8000 },
] as const;

function viewFor(settings: ProjectSettings, sourceDurationMs: number, viewDurationMs: number, withMedia = true) {
  const input: CompositionInput = {
    media: withMedia
      ? { videoId: "vid-1", filename: "clip.mp4", size: 12345, width: 1080, height: 1920, fps: 30, durationMs: sourceDurationMs }
      : null,
    doc: null,
    pages,
    settings,
    durationMs: viewDurationMs,
  };
  return toComposition(input);
}

/* (i) plain project: no clipRange, overlays present, full source */
const plainSettings = ProjectSettingsSchema.parse({ overlays: [...overlayInput] });
const plainSourceMs = 60_000;
const plainComp = () =>
  buildEditorComposition({ view: viewFor(plainSettings, plainSourceMs, plainSourceMs), settings: plainSettings, sourceDurationMs: plainSourceMs });

/* (ii) Clipper project: clipRange {32000, 65000} of a 120000ms source */
const clipperSettings = ProjectSettingsSchema.parse({ clipRange: { startMs: 32_000, endMs: 65_000 }, overlays: [...overlayInput] });
const clipperSourceMs = 120_000;
const clipperComp = () =>
  buildEditorComposition({ view: viewFor(clipperSettings, clipperSourceMs, 33_000), settings: clipperSettings, sourceDurationMs: clipperSourceMs });

/* (iii) stored segments (3) + markers + hidden graphics track + muted video */
const segmentedSettings = ProjectSettingsSchema.parse({
  clipRange: { startMs: 10_000, endMs: 55_000 },
  overlays: [...overlayInput],
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
      video: { locked: false, visible: true, muted: true },
      captions: { locked: false, visible: true, muted: false },
      text: { locked: false, visible: true, muted: false },
      graphics: { locked: false, visible: false, muted: false },
    },
  },
});
const segmentedSourceMs = 120_000;
const segmentedComp = () =>
  buildEditorComposition({ view: viewFor(segmentedSettings, segmentedSourceMs, 45_000), settings: segmentedSettings, sourceDurationMs: segmentedSourceMs });

/** The span a projected settings object will actually render, per the renderer's own rule. */
const renderedSpan = (s: ProjectSettings, sourceDurationMs: number) =>
  s.clipRange ?? { startMs: 0, endMs: sourceDurationMs };

describe("buildEditorComposition", () => {
  it("synthesises a single main-video clip from the view for a plain project", () => {
    const comp = plainComp();
    expect(comp.videoClips).toEqual([
      { id: "main-video", kind: "video", startMs: 0, durationMs: 60_000, sourceInMs: 0, sourceOutMs: 60_000, ...CLIP_DEFAULTS },
    ]);
    expect(comp.durationMs).toBe(60_000);
    expect(comp.rangeStartMs).toBe(0);
    expect(comp.sourceDurationMs).toBe(60_000);
    expect(comp.markers).toEqual([]);
    expect(comp.trackState).toEqual(EMPTY_COMPOSITION_SETTINGS.tracks);
    expect(isPartition(comp.videoClips)).toBe(true);
  });

  it("synthesises the clipper clip from clipRange + the view's effective duration", () => {
    const comp = clipperComp();
    expect(comp.videoClips).toEqual([
      { id: "main-video", kind: "video", startMs: 0, durationMs: 33_000, sourceInMs: 32_000, sourceOutMs: 65_000, ...CLIP_DEFAULTS },
    ]);
    expect(comp.durationMs).toBe(33_000);
    expect(comp.rangeStartMs).toBe(32_000);
  });

  it("builds the partition from stored segments, laying clips out from 0 in order", () => {
    const comp = segmentedComp();
    expect(comp.videoClips).toEqual([
      { id: "seg-1", kind: "video", startMs: 0, durationMs: 15_000, sourceInMs: 10_000, sourceOutMs: 25_000, ...CLIP_DEFAULTS },
      { id: "seg-2", kind: "video", startMs: 15_000, durationMs: 15_000, sourceInMs: 25_000, sourceOutMs: 40_000, ...CLIP_DEFAULTS },
      { id: "seg-3", kind: "video", startMs: 30_000, durationMs: 15_000, sourceInMs: 40_000, sourceOutMs: 55_000, ...CLIP_DEFAULTS },
    ]);
    expect(comp.durationMs).toBe(45_000);
    expect(comp.rangeStartMs).toBe(10_000);
    expect(comp.markers).toEqual(segmentedSettings.composition.markers);
    expect(comp.trackState.graphics.visible).toBe(false);
    expect(comp.trackState.video.muted).toBe(true);
    expect(isPartition(comp.videoClips)).toBe(true);
  });

  it("passes caption and overlay clips through from the view, overlays carrying their items", () => {
    const comp = plainComp();
    expect(comp.captionClips.map((c) => c.id)).toEqual(["p1"]);
    expect(comp.overlayClips.map((c) => c.id)).toEqual(["ov-text", "ov-shape"]);
    expect(comp.overlayClips[0]!.overlay).toBe(plainSettings.overlays[0]);
  });

  it("no media: no video clips, duration still from the view", () => {
    const comp = buildEditorComposition({
      view: viewFor(plainSettings, 0, 900, false),
      settings: plainSettings,
      sourceDurationMs: 0,
    });
    expect(comp.videoClips).toEqual([]);
    expect(comp.durationMs).toBe(900);
    expect(comp.sourceDurationMs).toBe(0);
  });
});

describe("round trip A: settings -> composition -> settings is exact", () => {
  it("(i) plain project", () => {
    const projected = projectComposition(plainComp(), plainSettings);
    expect(projected.composition).toEqual(plainSettings.composition);
    expect(projected.overlays).toEqual(plainSettings.overlays);
    expect(projected.clipRange).toEqual(plainSettings.clipRange);
  });

  it("(ii) Clipper project: the trim survives through clipRange alone, segments stay []", () => {
    const projected = projectComposition(clipperComp(), clipperSettings);
    expect(projected.composition).toEqual(clipperSettings.composition);
    expect(projected.composition.videoSegments).toEqual([]);
    expect(projected.overlays).toEqual(clipperSettings.overlays);
    expect(projected.clipRange).toEqual({ startMs: 32_000, endMs: 65_000 });
  });

  it("(iii) segmented project with markers and non-default track state", () => {
    const projected = projectComposition(segmentedComp(), segmentedSettings);
    expect(projected.composition).toEqual(segmentedSettings.composition);
    expect(projected.overlays).toEqual(segmentedSettings.overlays);
    expect(projected.clipRange).toEqual(segmentedSettings.clipRange);
  });

  it("does not mutate the base settings and returns a new object", () => {
    const before = structuredClone(segmentedSettings);
    const projected = projectComposition(segmentedComp(), segmentedSettings);
    expect(projected).not.toBe(segmentedSettings);
    expect(segmentedSettings).toEqual(before);
  });
});

describe("round trip B: composition -> settings -> composition is exact", () => {
  it("(iii) segmented project returns identical videoClips, markers and trackState", () => {
    const first = segmentedComp();
    const projected = projectComposition(first, segmentedSettings);
    const second = buildEditorComposition({
      view: viewFor(projected, segmentedSourceMs, 45_000),
      settings: projected,
      sourceDurationMs: segmentedSourceMs,
    });
    expect(second.videoClips).toEqual(first.videoClips);
    expect(second.markers).toEqual(first.markers);
    expect(second.trackState).toEqual(first.trackState);
    expect(second.durationMs).toBe(first.durationMs);
    expect(second.rangeStartMs).toBe(first.rangeStartMs);
  });
});

describe("untouched shape", () => {
  it("a Stage-A-only project opens and projects back in exactly today's shape (whole settings deep-equal)", () => {
    const projected = projectComposition(plainComp(), plainSettings);
    expect(projected.composition).toEqual(EMPTY_COMPOSITION_SETTINGS);
    expect(projected).toEqual(plainSettings);
  });

  it("a single trimmed clip with a marker DOES write its segment explicitly (slice is non-empty anyway)", () => {
    const comp: EditorComposition = { ...clipperComp(), markers: [{ id: "mk-1", atMs: 1000, label: "Note" }] };
    const projected = projectComposition(comp, clipperSettings);
    expect(projected.composition.videoSegments).toEqual([{ id: "main-video", sourceInMs: 32_000, sourceOutMs: 65_000, ...SEG_DEFAULTS }]);
    expect(projected.composition.markers).toEqual([{ id: "mk-1", atMs: 1000, label: "Note" }]);
    expect(projected.clipRange).toEqual({ startMs: 32_000, endMs: 65_000 });
  });

  it("no video clips: base clipRange is kept unchanged", () => {
    const comp = buildEditorComposition({
      view: viewFor(clipperSettings, 0, 900, false),
      settings: clipperSettings,
      sourceDurationMs: clipperSourceMs,
    });
    expect(comp.videoClips).toEqual([]);
    const projected = projectComposition(comp, clipperSettings);
    expect(projected.clipRange).toEqual({ startMs: 32_000, endMs: 65_000 });
  });
});

describe("render-sync invariant: segment span == projected clipRange span, in every fixture", () => {
  const fixtures: Array<[string, EditorComposition, ProjectSettings, number]> = [
    ["plain", plainComp(), plainSettings, plainSourceMs],
    ["clipper", clipperComp(), clipperSettings, clipperSourceMs],
    ["segmented", segmentedComp(), segmentedSettings, segmentedSourceMs],
  ];
  it.each(fixtures)("%s", (_name, comp, base, sourceMs) => {
    const projected = projectComposition(comp, base);
    expect(segmentsSpan(comp.videoClips)).toEqual(renderedSpan(projected, sourceMs));
    // and the authored duration the renderer derives equals the composition duration
    expect(renderedSpan(projected, sourceMs).endMs - renderedSpan(projected, sourceMs).startMs).toBe(comp.durationMs);
  });

  it("a partition covering the whole source projects clipRange null even when stored in segments", () => {
    const wholeSettings = ProjectSettingsSchema.parse({
      composition: {
        videoSegments: [
          { id: "seg-1", sourceInMs: 0, sourceOutMs: 20_000 },
          { id: "seg-2", sourceInMs: 20_000, sourceOutMs: 60_000 },
        ],
        markers: [{ id: "mk-1", atMs: 100, label: "" }],
      },
    });
    const comp = buildEditorComposition({
      view: viewFor(wholeSettings, plainSourceMs, plainSourceMs),
      settings: wholeSettings,
      sourceDurationMs: plainSourceMs,
    });
    const projected = projectComposition(comp, wholeSettings);
    expect(projected.clipRange).toBeNull();
    expect(projected.composition.videoSegments).toHaveLength(2);
  });
});

describe("partition guard", () => {
  it("segmentsSpan: null for empty, first-in to last-out otherwise", () => {
    expect(segmentsSpan([])).toBeNull();
    expect(segmentsSpan(segmentedSettings.composition.videoSegments)).toEqual({ startMs: 10_000, endMs: 55_000 });
    expect(segmentsSpan(segmentedComp().videoClips)).toEqual({ startMs: 10_000, endMs: 55_000 });
  });

  it("isPartition accepts built compositions and the empty list, rejects broken ones", () => {
    expect(isPartition([])).toBe(true);
    expect(isPartition(segmentedComp().videoClips)).toBe(true);
    const comp = segmentedComp();
    const gapped = comp.videoClips.map((c, i) => (i === 1 ? { ...c, startMs: c.startMs + 1000 } : c));
    expect(isPartition(gapped)).toBe(false);
  });

  it("projectComposition throws on a timeline gap", () => {
    const comp = segmentedComp();
    const broken: EditorComposition = {
      ...comp,
      videoClips: comp.videoClips.map((c, i) => (i === 1 ? { ...c, startMs: c.startMs + 1000 } : c)),
    };
    expect(() => projectComposition(broken, segmentedSettings)).toThrow(/contiguous partition/);
    expect(() => projectComposition(broken, segmentedSettings)).toThrow(/gap or overlap/);
  });

  it("a source discontinuity (jump cut) is LEGAL at Stage C: partition holds and it projects", () => {
    const comp = segmentedComp();
    const jumped: EditorComposition = {
      ...comp,
      // shift clip 2's whole source window later: at Stage B this threw; now it is a jump cut
      videoClips: comp.videoClips.map((c, i) =>
        i === 1 ? { ...c, sourceInMs: c.sourceInMs + 5000, sourceOutMs: c.sourceOutMs + 5000 } : c,
      ),
    };
    expect(isPartition(jumped.videoClips)).toBe(true);
    expect(() => projectComposition(jumped, segmentedSettings)).not.toThrow();
    expect(projectComposition(jumped, segmentedSettings).composition.videoSegments[1])
      .toMatchObject({ id: "seg-2", sourceInMs: 30_000, sourceOutMs: 45_000 });
  });

  it("projectComposition throws when a clip's duration disagrees with its source span", () => {
    const comp = segmentedComp();
    const broken: EditorComposition = {
      ...comp,
      videoClips: comp.videoClips.map((c, i) => (i === 0 ? { ...c, durationMs: c.durationMs - 1000 } : c)),
    };
    expect(() => projectComposition(broken, segmentedSettings)).toThrow(/contiguous partition/);
  });
});

describe("Run 2 model: rates, transitions, transforms, jump cuts", () => {
  const run2Settings = ProjectSettingsSchema.parse({
    overlays: [...overlayInput],
    composition: {
      version: 1,
      videoSegments: [
        { id: "seg-1", sourceInMs: 10_000, sourceOutMs: 30_000, playbackRate: 2 },
        {
          id: "seg-2", sourceInMs: 50_000, sourceOutMs: 60_000, playbackRate: 0.5,
          transform: { cropLeft: 0.1, flipH: true, scale: 1.5 },
          transitionIn: { type: "fade", durationMs: 1000 },
        },
        { id: "seg-3", sourceInMs: 5000, sourceOutMs: 9000, assetId: "rev-1", still: false },
        { id: "seg-4", sourceInMs: 0, sourceOutMs: 3000, assetId: "still-1", still: true },
      ],
      markers: [{ id: "mk-1", atMs: 1000, label: "x" }],
    },
  });
  const run2Comp = () =>
    buildEditorComposition({ view: viewFor(run2Settings, 120_000, 45_000), settings: run2Settings, sourceDurationMs: 120_000 });

  it("builds timeline durations from rates and overlaps the transition join", () => {
    const comp = run2Comp();
    // seg-1: 20000/2 = 10000 at 0; seg-2: 10000/0.5 = 20000, starts 10000 − 1000 (fade) = 9000;
    // seg-3: 4000 at 29000; seg-4 (still): 3000 at 33000; total 36000
    expect(comp.videoClips.map((c) => [c.id, c.startMs, c.durationMs])).toEqual([
      ["seg-1", 0, 10_000],
      ["seg-2", 9000, 20_000],
      ["seg-3", 29_000, 4000],
      ["seg-4", 33_000, 3000],
    ]);
    expect(comp.durationMs).toBe(36_000);
    expect(isPartition(comp.videoClips)).toBe(true);
    expect(comp.videoClips[1]).toMatchObject({
      playbackRate: 0.5, transitionIn: { type: "fade", durationMs: 1000 },
      transform: { cropLeft: 0.1, flipH: true, scale: 1.5, cropTop: 0 },
    });
    expect(comp.videoClips[2]).toMatchObject({ assetId: "rev-1", still: false });
    expect(comp.videoClips[3]).toMatchObject({ assetId: "still-1", still: true });
  });

  it("jump-cut round trip (build → project → build) is exact, source gaps preserved", () => {
    const first = run2Comp();
    const projected = projectComposition(first, run2Settings);
    expect(projected.composition).toEqual(run2Settings.composition);
    const second = buildEditorComposition({
      view: viewFor(projected, 120_000, 36_000),
      settings: projected,
      sourceDurationMs: 120_000,
    });
    expect(second.videoClips).toEqual(first.videoClips);
    expect(second.durationMs).toBe(first.durationMs);
  });

  it("a single NON-plain clip (rate 2) writes its segment explicitly instead of the untouched shape", () => {
    const settings = ProjectSettingsSchema.parse({
      composition: { videoSegments: [{ id: "only", sourceInMs: 0, sourceOutMs: 20_000, playbackRate: 2 }] },
    });
    const comp = buildEditorComposition({
      view: viewFor(settings, 60_000, 10_000), settings, sourceDurationMs: 60_000,
    });
    expect(comp.videoClips).toHaveLength(1);
    expect(comp.durationMs).toBe(10_000);
    const projected = projectComposition(comp, settings);
    expect(projected.composition.videoSegments).toEqual([
      { id: "only", sourceInMs: 0, sourceOutMs: 20_000, ...SEG_DEFAULTS, playbackRate: 2 },
    ]);
  });

  it("projectComposition throws when durationMs disagrees with the rate-derived timeline duration", () => {
    const comp = run2Comp();
    const broken: EditorComposition = {
      ...comp,
      videoClips: comp.videoClips.map((c, i) => (i === 0 ? { ...c, durationMs: 9999 } : c)),
    };
    expect(isPartition(broken.videoClips)).toBe(false);
    expect(() => projectComposition(broken, run2Settings)).toThrow(/timeline duration/);
  });
});
