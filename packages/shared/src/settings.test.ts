import { describe, expect, it } from "vitest";
import {
  CanvasSettingsSchema, CompositionSettingsSchema, DEFAULT_COMPOSITION_TRACKS, DEFAULT_TRACK_STATE, EMPTY_COMPOSITION_SETTINGS,
  IDENTITY_SEGMENT_TRANSFORM, OverlayItemSchema, ProjectSettingsSchema, SegmentTransformSchema, VideoSegmentSchema, defaultSettings,
  compositionDurationMs, exportDimensions, exportDimensionsForAspect, exportMemoryErrorMessage, framesForDurationMs,
  segmentTimelineDurationMs, segmentsTimelineDurationMs,
  type ExportResolution,
} from "./settings";

/** The Run-2 segment defaults every pre-Run-2 stored segment parses with. */
const SEG_DEFAULTS = {
  playbackRate: 1,
  transform: IDENTITY_SEGMENT_TRANSFORM,
  transitionIn: null,
  assetId: null,
  still: false,
  keyframes: [],
  effects: [],
} as const;

describe("ProjectSettings editor elements (Slice 1d)", () => {
  it("defaults videoAdjust to neutral and overlays to empty on an empty object", () => {
    const s = ProjectSettingsSchema.parse({});
    expect(s.videoAdjust).toEqual({
      brightness: 1, contrast: 1, saturation: 1,
      exposure: 1, highlights: 0, shadows: 0, temperature: 0, tint: 0,
    });
    expect(s.overlays).toEqual([]);
  });

  it("loads an old project (no editor-element fields) unchanged in spirit", () => {
    const s = ProjectSettingsSchema.parse({ maxWordsPerCard: 5, language: "en" });
    expect(s.maxWordsPerCard).toBe(5);
    expect(s.videoAdjust).toEqual({ brightness: 1, contrast: 1, saturation: 1, exposure: 1, highlights: 0, shadows: 0, temperature: 0, tint: 0 });
    expect(s.overlays).toEqual([]);
    expect(defaultSettings().overlays).toEqual([]);
  });

  it("fills a partial videoAdjust with neutral defaults", () => {
    const s = ProjectSettingsSchema.parse({ videoAdjust: { brightness: 1.2 } });
    expect(s.videoAdjust).toEqual({ brightness: 1.2, contrast: 1, saturation: 1, exposure: 1, highlights: 0, shadows: 0, temperature: 0, tint: 0 });
  });

  it("rejects out-of-range videoAdjust values", () => {
    expect(() => ProjectSettingsSchema.parse({ videoAdjust: { brightness: 2 } })).toThrow();
    expect(() => ProjectSettingsSchema.parse({ videoAdjust: { contrast: 0.1 } })).toThrow();
    expect(() => ProjectSettingsSchema.parse({ videoAdjust: { saturation: 1.6 } })).toThrow();
  });

  it("accepts the range edges", () => {
    const s = ProjectSettingsSchema.parse({ videoAdjust: { brightness: 0.5, contrast: 1.5, saturation: 0.5 } });
    expect(s.videoAdjust).toEqual({ brightness: 0.5, contrast: 1.5, saturation: 0.5, exposure: 1, highlights: 0, shadows: 0, temperature: 0, tint: 0 });
  });
});

describe("OverlayItemSchema", () => {
  const base = { id: "abc123", kind: "text" as const, text: "Hello", startMs: 1000, endMs: 4000 };

  it("fills position/scale/rotation/colour defaults", () => {
    const o = OverlayItemSchema.parse(base);
    expect(o.x).toBe(0.5);
    expect(o.y).toBe(0.5);
    expect(o.scale).toBe(1);
    expect(o.rotation).toBe(0);
    expect(o.color).toBe("#FFFFFF");
  });

  it("keeps explicit values", () => {
    const o = OverlayItemSchema.parse({ ...base, x: 0.25, y: 0.75, scale: 2, rotation: -20, color: "#FFA946", fontSize: 96 });
    expect(o).toMatchObject({ x: 0.25, y: 0.75, scale: 2, rotation: -20, color: "#FFA946", fontSize: 96 });
  });

  it("rejects endMs at or before startMs", () => {
    expect(() => OverlayItemSchema.parse({ ...base, endMs: 1000 })).toThrow();
    expect(() => OverlayItemSchema.parse({ ...base, endMs: 500 })).toThrow();
  });

  it("rejects out-of-range geometry", () => {
    expect(() => OverlayItemSchema.parse({ ...base, x: 1.5 })).toThrow();
    expect(() => OverlayItemSchema.parse({ ...base, y: -0.1 })).toThrow();
    expect(() => OverlayItemSchema.parse({ ...base, scale: 0.1 })).toThrow();
    expect(() => OverlayItemSchema.parse({ ...base, scale: 5 })).toThrow();
    expect(() => OverlayItemSchema.parse({ ...base, rotation: 60 })).toThrow();
  });

  it("rejects a non-hex colour", () => {
    expect(() => OverlayItemSchema.parse({ ...base, color: "red" })).toThrow();
    expect(() => OverlayItemSchema.parse({ ...base, color: "#FFF" })).toThrow();
  });

  it("requires a shape for shape items and accepts every shape id", () => {
    expect(() => OverlayItemSchema.parse({ id: "s1", kind: "shape", startMs: 0, endMs: 1000 })).toThrow();
    for (const shape of ["ring", "circle", "arrow", "check", "star", "heart", "rectangle", "scribble-underline", "triangle"] as const) {
      const o = OverlayItemSchema.parse({ id: "s1", kind: "shape", shape, startMs: 0, endMs: 1000 });
      expect(o.shape).toBe(shape);
    }
    expect(() => OverlayItemSchema.parse({ id: "s1", kind: "shape", shape: "blob", startMs: 0, endMs: 1000 })).toThrow();
  });

  it("requires a media asset id for image items and keeps its display name", () => {
    expect(() => OverlayItemSchema.parse({ id: "i1", kind: "image", startMs: 0, endMs: 1000 })).toThrow();
    const o = OverlayItemSchema.parse({ id: "i1", kind: "image", assetId: "asset-9", assetName: "logo.png", startMs: 0, endMs: 1000 });
    expect(o).toMatchObject({ kind: "image", assetId: "asset-9", assetName: "logo.png" });
  });

  it("round-trips a full settings object with overlays", () => {
    const s = ProjectSettingsSchema.parse({ overlays: [{ id: "t1", kind: "text", text: "Hi", startMs: 0, endMs: 3000, color: "#34D399" }] });
    expect(s.overlays).toHaveLength(1);
    expect(s.overlays[0]).toMatchObject({ id: "t1", text: "Hi", color: "#34D399", scale: 1 });
  });
});

describe("ProjectSettings exportSettings", () => {
  it("defaults to 1080p / 30fps on an empty object and on old projects", () => {
    expect(ProjectSettingsSchema.parse({}).exportSettings).toEqual({ resolution: "1080p", fps: 30 });
    expect(ProjectSettingsSchema.parse({ maxWordsPerCard: 5 }).exportSettings).toEqual({ resolution: "1080p", fps: 30 });
    expect(defaultSettings().exportSettings).toEqual({ resolution: "1080p", fps: 30 });
  });

  it("fills a partial exportSettings with the defaults", () => {
    expect(ProjectSettingsSchema.parse({ exportSettings: { resolution: "4k" } }).exportSettings).toEqual({ resolution: "4k", fps: 30 });
    expect(ProjectSettingsSchema.parse({ exportSettings: { fps: 60 } }).exportSettings).toEqual({ resolution: "1080p", fps: 60 });
    expect(ProjectSettingsSchema.parse({ exportSettings: {} }).exportSettings).toEqual({ resolution: "1080p", fps: 30 });
  });

  it("round-trips an explicit choice", () => {
    const s = ProjectSettingsSchema.parse({ exportSettings: { resolution: "2k", fps: 60 } });
    expect(s.exportSettings).toEqual({ resolution: "2k", fps: 60 });
  });

  it("rejects resolutions and frame rates outside the offered set", () => {
    expect(() => ProjectSettingsSchema.parse({ exportSettings: { resolution: "480p" } })).toThrow();
    expect(() => ProjectSettingsSchema.parse({ exportSettings: { resolution: "8k" } })).toThrow();
    expect(() => ProjectSettingsSchema.parse({ exportSettings: { fps: 24 } })).toThrow();
    expect(() => ProjectSettingsSchema.parse({ exportSettings: { fps: 120 } })).toThrow();
  });
});

describe("exportDimensions: the short edge is the resolution's p, for every aspect", () => {
  const table: Array<[string, ExportResolution, { width: number; height: number }]> = [
    // 9:16 portrait — p is the width
    ["9:16", "720p", { width: 720, height: 1280 }],
    ["9:16", "1080p", { width: 1080, height: 1920 }],
    ["9:16", "2k", { width: 1440, height: 2560 }],
    ["9:16", "4k", { width: 2160, height: 3840 }],
    // 16:9 landscape — p is the height
    ["16:9", "720p", { width: 1280, height: 720 }],
    ["16:9", "1080p", { width: 1920, height: 1080 }],
    ["16:9", "2k", { width: 2560, height: 1440 }],
    ["16:9", "4k", { width: 3840, height: 2160 }],
    // 1:1 square — both edges are p
    ["1:1", "720p", { width: 720, height: 720 }],
    ["1:1", "1080p", { width: 1080, height: 1080 }],
    ["1:1", "2k", { width: 1440, height: 1440 }],
    ["1:1", "4k", { width: 2160, height: 2160 }],
    // 4:5 portrait — width is p, height is p x 5/4
    ["4:5", "720p", { width: 720, height: 900 }],
    ["4:5", "1080p", { width: 1080, height: 1350 }],
    ["4:5", "2k", { width: 1440, height: 1800 }],
    ["4:5", "4k", { width: 2160, height: 2700 }],
  ];
  it.each(table)("%s at %s -> %o", (aspect, res, want) => {
    expect(exportDimensionsForAspect(aspect, res)).toEqual(want);
  });

  it("derives the same table from real source sizes, not just aspect strings", () => {
    expect(exportDimensions(1080, 1920, "720p")).toEqual({ width: 720, height: 1280 });
    expect(exportDimensions(1080, 1920, "4k")).toEqual({ width: 2160, height: 3840 });
    expect(exportDimensions(1920, 1080, "2k")).toEqual({ width: 2560, height: 1440 });
    expect(exportDimensions(1080, 1080, "1080p")).toEqual({ width: 1080, height: 1080 });
    expect(exportDimensions(1080, 1350, "720p")).toEqual({ width: 720, height: 900 });
  });

  it("upscales past the source size when a bigger resolution is picked (no source cap)", () => {
    expect(exportDimensions(720, 1280, "1080p")).toEqual({ width: 1080, height: 1920 });
    expect(exportDimensions(1280, 720, "4k")).toEqual({ width: 3840, height: 2160 });
  });

  it("keeps dimensions even for H.264 on odd aspects", () => {
    const d = exportDimensions(1000, 1333, "720p");
    expect(d.width % 2).toBe(0);
    expect(d.height % 2).toBe(0);
    expect(d.width).toBe(720);
  });
});

describe("framesForDurationMs (fps behaviour: timing is ms-based)", () => {
  it("scales the frame count with fps for the same duration", () => {
    expect(framesForDurationMs(10_000, 30)).toBe(300);
    expect(framesForDurationMs(10_000, 60)).toBe(600);
    expect(framesForDurationMs(2_500, 30)).toBe(75);
    expect(framesForDurationMs(2_500, 60)).toBe(150);
  });

  it("keeps the same instant at both rates: a caption at 1500ms starts at frame 45 @30 and 90 @60", () => {
    expect(framesForDurationMs(1500, 30)).toBe(45);
    expect(framesForDurationMs(1500, 60)).toBe(90);
  });

  it("never returns zero frames", () => {
    expect(framesForDurationMs(0, 30)).toBe(1);
    expect(framesForDurationMs(1, 60)).toBe(1);
  });
});

describe("exportMemoryErrorMessage (OOM mapping)", () => {
  it("maps memory failures to plain words with a lower-resolution next step", () => {
    const msg = exportMemoryErrorMessage(new Error("Failed to allocate 3840x2160 frame buffer"), "4k");
    expect(msg).toContain("ran out of memory");
    expect(msg).toContain("4K");
    expect(msg).toContain("lower resolution");
    expect(exportMemoryErrorMessage(new Error("OOM killed"))).toContain("ran out of memory");
    expect(exportMemoryErrorMessage("JavaScript heap out of memory")).toContain("ran out of memory");
    expect(exportMemoryErrorMessage(new Error("Array buffer allocation failed"))).toContain("ran out of memory");
  });

  it("returns null for non-memory failures so callers keep their own message", () => {
    expect(exportMemoryErrorMessage(new Error("Encoder is not configured"))).toBeNull();
    expect(exportMemoryErrorMessage(new Error("network timeout"))).toBeNull();
    expect(exportMemoryErrorMessage(null)).toBeNull();
    expect(exportMemoryErrorMessage(undefined)).toBeNull();
  });
});

describe("composition (Stage-B composition slice in settings)", () => {
  const allDefaultTracks = {
    video: { locked: false, visible: true, muted: false },
    captions: { locked: false, visible: true, muted: false },
    text: { locked: false, visible: true, muted: false },
    graphics: { locked: false, visible: true, muted: false },
  };

  it("parse({}) yields the empty composition: no segments, no markers, all tracks neutral", () => {
    const s = ProjectSettingsSchema.parse({});
    expect(s.composition).toEqual({
      version: 1, videoSegments: [], markers: [], tracks: allDefaultTracks,
      audio: { tracks: [], clips: [], master: { volume: 1, videoVolume: 1, compressor: { enabled: false, thresholdDb: -18, ratio: 3, kneeDb: 12, attackMs: 10, releaseMs: 200 } }, bleeps: [], noiseSuppressionAssetId: null },
    });
    expect(s.composition).toEqual(EMPTY_COMPOSITION_SETTINGS);
    expect(defaultSettings().composition).toEqual(EMPTY_COMPOSITION_SETTINGS);
    expect(CompositionSettingsSchema.parse({})).toEqual(EMPTY_COMPOSITION_SETTINGS);
    expect(DEFAULT_TRACK_STATE).toEqual({ locked: false, visible: true, muted: false });
    expect(DEFAULT_COMPOSITION_TRACKS).toEqual(allDefaultTracks);
  });

  it("legacy settings JSON without a composition key parses with the empty composition", () => {
    const legacy = { maxWordsPerCard: 5, language: "en", clipRange: { startMs: 32_000, endMs: 65_000 }, overlays: [] };
    const s = ProjectSettingsSchema.parse(legacy);
    expect(s.composition).toEqual(EMPTY_COMPOSITION_SETTINGS);
    expect(s.maxWordsPerCard).toBe(5);
    expect(s.clipRange).toEqual({ startMs: 32_000, endMs: 65_000 });
  });

  it("fills partial composition input with defaults (marker label, per-track state)", () => {
    const s = ProjectSettingsSchema.parse({
      composition: { markers: [{ id: "m1", atMs: 1500 }], tracks: { video: { locked: true } } },
    });
    expect(s.composition.version).toBe(1);
    expect(s.composition.videoSegments).toEqual([]);
    expect(s.composition.markers).toEqual([{ id: "m1", atMs: 1500, label: "" }]);
    expect(s.composition.tracks.video).toEqual({ locked: true, visible: true, muted: false });
    expect(s.composition.tracks.captions).toEqual({ locked: false, visible: true, muted: false });
    expect(s.composition.tracks.graphics).toEqual({ locked: false, visible: true, muted: false });
  });

  it("round-trips stored segments, markers and non-default track state", () => {
    const composition = {
      version: 1 as const,
      videoSegments: [
        { id: "seg-1", sourceInMs: 10_000, sourceOutMs: 25_000 },
        { id: "seg-2", sourceInMs: 25_000, sourceOutMs: 40_000 },
      ],
      markers: [{ id: "mk-1", atMs: 5000, label: "Hook" }],
      tracks: {
        video: { locked: false, visible: true, muted: true },
        captions: { locked: false, visible: true, muted: false },
        text: { locked: true, visible: true, muted: false },
        graphics: { locked: false, visible: false, muted: false },
      },
    };
    // pre-Run-2 segment literals parse with every Run-2 field defaulted (identically, in spirit);
    // the Run-3 audio slice likewise defaults to empty
    const parsed = ProjectSettingsSchema.parse({ composition }).composition;
    expect(parsed).toEqual({
      ...composition,
      videoSegments: composition.videoSegments.map((s) => ({ ...s, ...SEG_DEFAULTS })),
      audio: EMPTY_COMPOSITION_SETTINGS.audio,
    });
    expect(parsed.markers).toEqual(composition.markers);
    expect(parsed.tracks).toEqual(composition.tracks);
  });

  it("rejects a segment whose out point is at or before its in point", () => {
    expect(() => ProjectSettingsSchema.parse({ composition: { videoSegments: [{ id: "s1", sourceInMs: 5000, sourceOutMs: 5000 }] } })).toThrow();
    expect(() => ProjectSettingsSchema.parse({ composition: { videoSegments: [{ id: "s1", sourceInMs: 6000, sourceOutMs: 5000 }] } })).toThrow();
    expect(() => CompositionSettingsSchema.parse({ videoSegments: [{ id: "s1", sourceInMs: -1, sourceOutMs: 5000 }] })).toThrow();
  });

  it("rejects an invalid marker (negative time, over-long label) and a wrong version", () => {
    expect(() => ProjectSettingsSchema.parse({ composition: { markers: [{ id: "m1", atMs: -1 }] } })).toThrow();
    expect(() => ProjectSettingsSchema.parse({ composition: { markers: [{ id: "m1", atMs: 0, label: "x".repeat(81) }] } })).toThrow();
    expect(() => ProjectSettingsSchema.parse({ composition: { version: 2 } })).toThrow();
  });
});

describe("Run 3: keyframes, effects, audio slice, extended adjust (Phase 4 Run 3)", () => {
  it("extended videoAdjust parses legacy 3-field objects with the new fields neutral", () => {
    const s = ProjectSettingsSchema.parse({ videoAdjust: { brightness: 1.2 } });
    expect(s.videoAdjust).toEqual({
      brightness: 1.2, contrast: 1, saturation: 1,
      exposure: 1, highlights: 0, shadows: 0, temperature: 0, tint: 0,
    });
    expect(() => ProjectSettingsSchema.parse({ videoAdjust: { highlights: 2 } })).toThrow();
    expect(() => ProjectSettingsSchema.parse({ videoAdjust: { exposure: 8 } })).toThrow();
  });

  it("segment keyframes + effects round-trip; transform gains opacity (default 1)", () => {
    const s = ProjectSettingsSchema.parse({
      composition: {
        videoSegments: [{
          id: "s1", sourceInMs: 0, sourceOutMs: 5000,
          keyframes: [
            { id: "k1", atMs: 0, property: "scale", value: 1 },
            { id: "k2", atMs: 2000, property: "scale", value: 1.5, easing: "ease-out" },
            { id: "k3", atMs: 2000, property: "opacity", value: 0.4, easing: "hold" },
          ],
          effects: [
            { id: "e1", type: "blur", amount: 0.4 },
            { id: "e2", type: "vignette", enabled: false },
          ],
        }],
      },
    });
    const seg = s.composition.videoSegments[0]!;
    expect(seg.transform.opacity).toBe(1);
    expect(seg.keyframes).toHaveLength(3);
    expect(seg.keyframes[0]).toEqual({ id: "k1", atMs: 0, property: "scale", value: 1, easing: "linear" });
    expect(seg.effects[0]).toEqual({ id: "e1", type: "blur", enabled: true, amount: 0.4, color: "#FFA946" });
    expect(seg.effects[1]!.enabled).toBe(false);
  });

  it("rejects out-of-range keyframe values per property and unknown effect types", () => {
    const seg = (keyframes: unknown) => ({ composition: { videoSegments: [{ id: "s1", sourceInMs: 0, sourceOutMs: 5000, keyframes }] } });
    expect(() => ProjectSettingsSchema.parse(seg([{ id: "k", atMs: 0, property: "opacity", value: 1.5 }]))).toThrow();
    expect(() => ProjectSettingsSchema.parse(seg([{ id: "k", atMs: 0, property: "scale", value: 9 }]))).toThrow();
    expect(() => ProjectSettingsSchema.parse(seg([{ id: "k", atMs: -5, property: "scale", value: 1 }]))).toThrow();
    expect(() => ProjectSettingsSchema.parse({ composition: { videoSegments: [{ id: "s1", sourceInMs: 0, sourceOutMs: 5000, effects: [{ id: "e", type: "sharpen" }] }] } })).toThrow();
  });

  it("audio slice defaults to empty and round-trips tracks/clips/master", () => {
    expect(ProjectSettingsSchema.parse({}).composition.audio).toEqual(EMPTY_COMPOSITION_SETTINGS.audio);
    const s = ProjectSettingsSchema.parse({
      composition: {
        audio: {
          tracks: [{ id: "t1", name: "Music", role: "music", ducking: { enabled: true } }],
          clips: [{ id: "c1", assetId: "a1", trackId: "t1", startMs: 1000, sourceInMs: 0, sourceOutMs: 9000, fadeInMs: 500 }],
          master: { videoVolume: 0.8 },
        },
      },
    });
    const audio = s.composition.audio;
    expect(audio.tracks[0]).toEqual({
      id: "t1", name: "Music", role: "music", volume: 1, muted: false, locked: false,
      ducking: { enabled: true, amountDb: 12, thresholdDb: -42 },
    });
    expect(audio.clips[0]).toEqual({
      id: "c1", assetId: "a1", assetName: "", trackId: "t1", startMs: 1000, sourceInMs: 0, sourceOutMs: 9000,
      volume: 1, fadeInMs: 500, fadeOutMs: 0,
      processors: { eq: { lowDb: 0, midDb: 0, highDb: 0 }, cleanup: { enabled: false, highPassHz: 80, gateDb: -50 }, reverb: 0 },
    });
    expect(audio.master.videoVolume).toBe(0.8);
    expect(audio.master.compressor.enabled).toBe(false);
    expect(() => ProjectSettingsSchema.parse({ composition: { audio: { clips: [{ id: "c", assetId: "a", trackId: "t", startMs: 0, sourceInMs: 5000, sourceOutMs: 5000 }] } } })).toThrow();
  });
});

describe("clipRange (Clipper projects)", () => {
  it("defaults to null on an empty object and on old projects, so they are untouched", () => {
    expect(ProjectSettingsSchema.parse({}).clipRange).toBeNull();
    expect(ProjectSettingsSchema.parse({ maxWordsPerCard: 5 }).clipRange).toBeNull();
    expect(defaultSettings().clipRange).toBeNull();
  });

  it("keeps a valid range", () => {
    const s = ProjectSettingsSchema.parse({ clipRange: { startMs: 32_000, endMs: 65_000 } });
    expect(s.clipRange).toEqual({ startMs: 32_000, endMs: 65_000 });
  });

  it("rejects an empty or backwards range and a negative start", () => {
    expect(() => ProjectSettingsSchema.parse({ clipRange: { startMs: 5000, endMs: 5000 } })).toThrow();
    expect(() => ProjectSettingsSchema.parse({ clipRange: { startMs: 6000, endMs: 5000 } })).toThrow();
    expect(() => ProjectSettingsSchema.parse({ clipRange: { startMs: -1, endMs: 5000 } })).toThrow();
  });

  it("clipRangeDurationMs and effectiveDurationMs do the renderer math", async () => {
    const { clipRangeDurationMs, effectiveDurationMs } = await import("./settings");
    const range = { startMs: 32_000, endMs: 65_000 };
    expect(clipRangeDurationMs(range)).toBe(33_000);
    // no range: the source duration passes through
    expect(effectiveDurationMs(120_000, null)).toBe(120_000);
    expect(effectiveDurationMs(120_000, undefined)).toBe(120_000);
    // with a range: only the segment
    expect(effectiveDurationMs(120_000, range)).toBe(33_000);
    // a range running past the (known) source end clamps to the source
    expect(effectiveDurationMs(50_000, range)).toBe(18_000);
    // unknown source duration: the range itself is the bound
    expect(effectiveDurationMs(0, range)).toBe(33_000);
  });
});

describe("VideoSegment Run-2 fields (Stage C model evolution)", () => {
  it("an old stored segment (id + in/out only) parses with all Run-2 defaults", () => {
    const seg = VideoSegmentSchema.parse({ id: "s1", sourceInMs: 1000, sourceOutMs: 5000 });
    expect(seg).toEqual({ id: "s1", sourceInMs: 1000, sourceOutMs: 5000, ...SEG_DEFAULTS });
    expect(seg.transform).toEqual(IDENTITY_SEGMENT_TRANSFORM);
  });

  it("SegmentTransformSchema.parse({}) is the identity transform", () => {
    expect(SegmentTransformSchema.parse({})).toEqual(IDENTITY_SEGMENT_TRANSFORM);
    expect(IDENTITY_SEGMENT_TRANSFORM).toEqual({
      cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0, rotateDeg: 0,
      flipH: false, flipV: false, scale: 1, offsetX: 0, offsetY: 0, opacity: 1,
    });
  });

  it("keeps explicit Run-2 values and rejects out-of-range ones", () => {
    const seg = VideoSegmentSchema.parse({
      id: "s1", sourceInMs: 0, sourceOutMs: 8000, playbackRate: 2,
      transform: { cropLeft: 0.1, rotateDeg: -90, flipH: true, scale: 1.5, offsetX: 0.25 },
      transitionIn: { type: "fade", durationMs: 500 }, assetId: "asset-9", still: true,
    });
    expect(seg.playbackRate).toBe(2);
    expect(seg.transform).toMatchObject({ cropLeft: 0.1, rotateDeg: -90, flipH: true, scale: 1.5, offsetX: 0.25, cropTop: 0 });
    expect(seg.transitionIn).toEqual({ type: "fade", durationMs: 500 });
    expect(seg.assetId).toBe("asset-9");
    expect(seg.still).toBe(true);
    expect(() => VideoSegmentSchema.parse({ id: "s", sourceInMs: 0, sourceOutMs: 10, playbackRate: 0.1 })).toThrow();
    expect(() => VideoSegmentSchema.parse({ id: "s", sourceInMs: 0, sourceOutMs: 10, playbackRate: 5 })).toThrow();
    expect(() => VideoSegmentSchema.parse({ id: "s", sourceInMs: 0, sourceOutMs: 10, transform: { cropLeft: 0.95 } })).toThrow();
    expect(() => VideoSegmentSchema.parse({ id: "s", sourceInMs: 0, sourceOutMs: 10, transitionIn: { type: "fade", durationMs: 50 } })).toThrow();
    expect(() => VideoSegmentSchema.parse({ id: "s", sourceInMs: 0, sourceOutMs: 10, transitionIn: { type: "spin", durationMs: 500 } })).toThrow();
  });

  it("segmentTimelineDurationMs divides the source span by the rate (rounded)", () => {
    expect(segmentTimelineDurationMs({ sourceInMs: 0, sourceOutMs: 10_000, playbackRate: 1 })).toBe(10_000);
    expect(segmentTimelineDurationMs({ sourceInMs: 0, sourceOutMs: 10_000, playbackRate: 2 })).toBe(5000);
    expect(segmentTimelineDurationMs({ sourceInMs: 2000, sourceOutMs: 12_000, playbackRate: 0.5 })).toBe(20_000);
    expect(segmentTimelineDurationMs({ sourceInMs: 0, sourceOutMs: 1000, playbackRate: 3 })).toBe(333);
    expect(segmentsTimelineDurationMs([
      { sourceInMs: 0, sourceOutMs: 10_000, playbackRate: 2 },
      { sourceInMs: 0, sourceOutMs: 4000, playbackRate: 0.5 },
    ])).toBe(13_000);
    expect(segmentsTimelineDurationMs([])).toBe(0);
  });

  it("compositionDurationMs subtracts only transitions on segments[1..]", () => {
    const a = { sourceInMs: 0, sourceOutMs: 10_000, playbackRate: 1, transitionIn: { type: "fade" as const, durationMs: 900 } };
    const b = { sourceInMs: 20_000, sourceOutMs: 30_000, playbackRate: 1, transitionIn: { type: "wipe" as const, durationMs: 500 } };
    const c = { sourceInMs: 40_000, sourceOutMs: 50_000, playbackRate: 2, transitionIn: null };
    // a's own transitionIn is ignored (index 0); totals: 10000+10000+5000 − 500
    expect(compositionDurationMs([a, b, c])).toBe(24_500);
    expect(compositionDurationMs([a])).toBe(10_000);
    expect(compositionDurationMs([])).toBe(0);
    expect(compositionDurationMs([b, c])).toBe(15_000);
  });
});

describe("canvas settings (Run 2)", () => {
  it("defaults to source aspect + blur background on old projects", () => {
    expect(ProjectSettingsSchema.parse({}).canvas).toEqual({ aspect: "source", background: "blur" });
    expect(defaultSettings().canvas).toEqual({ aspect: "source", background: "blur" });
    expect(CanvasSettingsSchema.parse({})).toEqual({ aspect: "source", background: "blur" });
  });

  it("keeps an explicit aspect and a CSS-colour background", () => {
    expect(ProjectSettingsSchema.parse({ canvas: { aspect: "9:16", background: "#101010" } }).canvas)
      .toEqual({ aspect: "9:16", background: "#101010" });
    expect(() => ProjectSettingsSchema.parse({ canvas: { aspect: "3:4" } })).toThrow();
    expect(() => ProjectSettingsSchema.parse({ canvas: { background: "" } })).toThrow();
  });
});
