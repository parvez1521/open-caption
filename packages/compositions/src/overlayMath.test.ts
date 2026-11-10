import { describe, expect, it } from "vitest";
import { DEFAULT_TRACK_STATE, ProjectSettingsSchema, type OverlayItem, type VideoSegment } from "@capseasy/shared";
import { CaptionedVideoProps } from "./props";
import { buildVideoFilter, overlayFrames, overlayTrackKind, overlayVisibleAt, resolveOverlays, resolveTrackState, resolveVideoAdjust, resolveVideoSegments, videoSegmentFrames } from "./overlayMath";

describe("buildVideoFilter", () => {
  it("is undefined when all three adjustments are neutral (filter omitted entirely)", () => {
    expect(buildVideoFilter({ brightness: 1, contrast: 1, saturation: 1 })).toBeUndefined();
  });

  it("is undefined for a missing adjustment", () => {
    expect(buildVideoFilter(undefined)).toBeUndefined();
    expect(buildVideoFilter(null)).toBeUndefined();
  });

  it("builds the exact CSS filter string", () => {
    expect(buildVideoFilter({ brightness: 1.2, contrast: 0.9, saturation: 1.1 })).toBe("brightness(1.2) contrast(0.9) saturate(1.1)");
    expect(buildVideoFilter({ brightness: 0.5, contrast: 1, saturation: 1 })).toBe("brightness(0.5) contrast(1) saturate(1)");
  });
});

describe("overlayFrames / overlayVisibleAt", () => {
  const item = { startMs: 1000, endMs: 4000 };

  it("converts ms to a frame window at 30fps", () => {
    expect(overlayFrames(item, 30)).toEqual({ from: 30, durationInFrames: 90 });
  });

  it("converts at other frame rates and clamps the start at 0", () => {
    expect(overlayFrames(item, 25)).toEqual({ from: 25, durationInFrames: 75 });
    expect(overlayFrames({ startMs: 0, endMs: 500 }, 30)).toEqual({ from: 0, durationInFrames: 15 });
  });

  it("always lasts at least one frame", () => {
    expect(overlayFrames({ startMs: 100, endMs: 101 }, 30).durationInFrames).toBe(1);
  });

  it("visibility is start-inclusive, end-exclusive", () => {
    expect(overlayVisibleAt(item, 999)).toBe(false);
    expect(overlayVisibleAt(item, 1000)).toBe(true);
    expect(overlayVisibleAt(item, 3999)).toBe(true);
    expect(overlayVisibleAt(item, 4000)).toBe(false);
  });
});

describe("CaptionedVideoProps editor elements", () => {
  it("parses with no editor elements at all (old callers stay compatible)", () => {
    const p = CaptionedVideoProps.parse({});
    expect(p.videoAdjust).toBeUndefined();
    expect(p.overlays).toBeUndefined();
    expect(p.settings.videoAdjust).toEqual({ brightness: 1, contrast: 1, saturation: 1 });
    expect(p.settings.overlays).toEqual([]);
  });

  it("accepts explicit videoAdjust and overlays props", () => {
    const p = CaptionedVideoProps.parse({
      videoAdjust: { brightness: 1.3, contrast: 1, saturation: 0.8 },
      overlays: [{ id: "o1", kind: "shape", shape: "star", startMs: 0, endMs: 2000, color: "#FFA946" }],
    });
    expect(p.videoAdjust).toEqual({ brightness: 1.3, contrast: 1, saturation: 0.8 });
    expect(p.overlays).toHaveLength(1);
    expect(p.overlays?.[0]).toMatchObject({ id: "o1", shape: "star", scale: 1 });
  });

  it("rejects an out-of-range top-level videoAdjust", () => {
    expect(() => CaptionedVideoProps.parse({ videoAdjust: { brightness: 3 } })).toThrow();
  });
});

describe("resolve helpers (props win, settings are the fallback)", () => {
  const settings = ProjectSettingsSchema.parse({
    videoAdjust: { brightness: 1.4 },
    overlays: [{ id: "s1", kind: "text", text: "From settings", startMs: 0, endMs: 1000 }],
  });
  const explicitOverlay: OverlayItem = { id: "p1", kind: "text", text: "From props", startMs: 0, endMs: 1000, x: 0.5, y: 0.5, scale: 1, rotation: 0, color: "#FFFFFF" };

  it("falls back to settings when no top-level props are given (server/companion payload shape)", () => {
    expect(resolveVideoAdjust({ settings })).toEqual({ brightness: 1.4, contrast: 1, saturation: 1 });
    expect(resolveOverlays({ settings }).map((o) => o.id)).toEqual(["s1"]);
  });

  it("prefers explicit props over settings", () => {
    expect(resolveVideoAdjust({ videoAdjust: { brightness: 0.7, contrast: 1, saturation: 1 }, settings }).brightness).toBe(0.7);
    expect(resolveOverlays({ overlays: [explicitOverlay], settings })).toEqual([explicitOverlay]);
    expect(resolveOverlays({ overlays: [], settings })).toEqual([]);
  });

  it("defaults to neutral / empty with neither source", () => {
    expect(resolveVideoAdjust({})).toEqual({ brightness: 1, contrast: 1, saturation: 1 });
    expect(resolveOverlays({})).toEqual([]);
  });
});

describe("resolveVideoSegments (Stage-B segmentation)", () => {
  it("is null when there are no settings, no composition, or an empty segment array", () => {
    expect(resolveVideoSegments({})).toBeNull();
    expect(resolveVideoSegments({ settings: null })).toBeNull();
    expect(resolveVideoSegments({ settings: ProjectSettingsSchema.parse({}) })).toBeNull();
    expect(resolveVideoSegments({ settings: ProjectSettingsSchema.parse({ composition: { videoSegments: [] } }) })).toBeNull();
  });

  it("passes the stored segments through untouched", () => {
    const settings = ProjectSettingsSchema.parse({
      composition: {
        videoSegments: [
          { id: "seg-1", sourceInMs: 10_000, sourceOutMs: 25_000 },
          { id: "seg-2", sourceInMs: 25_000, sourceOutMs: 40_000 },
        ],
      },
    });
    const segments = resolveVideoSegments({ settings });
    expect(segments).toEqual([
      { id: "seg-1", sourceInMs: 10_000, sourceOutMs: 25_000 },
      { id: "seg-2", sourceInMs: 25_000, sourceOutMs: 40_000 },
    ]);
    expect(segments).toBe(settings.composition.videoSegments);
  });
});

describe("videoSegmentFrames (segment chain tiling)", () => {
  // Three source-continuous segments of 1040ms each, starting at 2000ms in the source. 1040ms is
  // deliberately NOT frame-aligned at either rate, so independent per-segment rounding would drift
  // (3 x round(31.2) = 93 frames at 30fps) while cumulative-boundary rounding tiles exactly (94).
  const segments: VideoSegment[] = [
    { id: "a", sourceInMs: 2000, sourceOutMs: 3040 },
    { id: "b", sourceInMs: 3040, sourceOutMs: 4080 },
    { id: "c", sourceInMs: 4080, sourceOutMs: 5120 },
  ];

  it("computes exact windows and per-segment source trims at 30fps", () => {
    expect(videoSegmentFrames(segments, 30)).toEqual([
      { from: 0, durationInFrames: 31, trimBefore: 60, trimAfter: 91 },
      { from: 31, durationInFrames: 31, trimBefore: 91, trimAfter: 122 },
      { from: 62, durationInFrames: 32, trimBefore: 122, trimAfter: 154 },
    ]);
  });

  it("computes exact windows and per-segment source trims at 60fps", () => {
    expect(videoSegmentFrames(segments, 60)).toEqual([
      { from: 0, durationInFrames: 62, trimBefore: 120, trimAfter: 182 },
      { from: 62, durationInFrames: 63, trimBefore: 182, trimAfter: 245 },
      { from: 125, durationInFrames: 62, trimBefore: 245, trimAfter: 307 },
    ]);
  });

  it("tiles exactly at both rates: no gaps, no overlaps, durations sum to the total frame count", () => {
    for (const [fps, totalFrames] of [
      [30, 94],
      [60, 187],
    ] as const) {
      const windows = videoSegmentFrames(segments, fps);
      expect(windows[0].from).toBe(0);
      for (let i = 1; i < windows.length; i++) {
        expect(windows[i].from).toBe(windows[i - 1].from + windows[i - 1].durationInFrames);
      }
      expect(windows.reduce((sum, w) => sum + w.durationInFrames, 0)).toBe(totalFrames);
      // and the total is the rounded span of the whole chain (3120ms), not a per-segment sum
      expect(totalFrames).toBe(Math.round((3120 / 1000) * fps));
    }
  });

  it("a single segment starts at frame 0 with its own source trim", () => {
    expect(videoSegmentFrames([segments[0]], 30)).toEqual([{ from: 0, durationInFrames: 31, trimBefore: 60, trimAfter: 91 }]);
  });
});

describe("resolveTrackState (Stage-B track state)", () => {
  it("defaults every track to unlocked / visible / unmuted for legacy or missing settings", () => {
    for (const kind of ["video", "captions", "text", "graphics"] as const) {
      expect(resolveTrackState({}, kind)).toEqual(DEFAULT_TRACK_STATE);
      expect(resolveTrackState({ settings: null }, kind)).toEqual(DEFAULT_TRACK_STATE);
      expect(resolveTrackState({ settings: ProjectSettingsSchema.parse({}) }, kind)).toEqual({ locked: false, visible: true, muted: false });
    }
  });

  it("returns the stored state for the requested track only", () => {
    const settings = ProjectSettingsSchema.parse({
      composition: {
        tracks: {
          video: { muted: true },
          captions: { visible: false },
          text: { locked: true },
        },
      },
    });
    expect(resolveTrackState({ settings }, "video")).toEqual({ locked: false, visible: true, muted: true });
    expect(resolveTrackState({ settings }, "captions")).toEqual({ locked: false, visible: false, muted: false });
    expect(resolveTrackState({ settings }, "text")).toEqual({ locked: true, visible: true, muted: false });
    expect(resolveTrackState({ settings }, "graphics")).toEqual({ locked: false, visible: true, muted: false });
  });
});

describe("overlayTrackKind", () => {
  it("maps text/image to the text track and shape/social to the graphics track", () => {
    expect(overlayTrackKind("text")).toBe("text");
    expect(overlayTrackKind("image")).toBe("text");
    expect(overlayTrackKind("shape")).toBe("graphics");
    expect(overlayTrackKind("social")).toBe("graphics");
  });
});

describe("resolveOverlays track-visibility filtering (Stage B)", () => {
  const oneOfEachKind: OverlayItem[] = [
    { id: "txt", kind: "text", text: "Title", startMs: 0, endMs: 1000, x: 0.5, y: 0.5, scale: 1, rotation: 0, color: "#FFFFFF" },
    { id: "img", kind: "image", assetId: "asset-1", startMs: 0, endMs: 1000, x: 0.5, y: 0.5, scale: 1, rotation: 0, color: "#FFFFFF" },
    { id: "shp", kind: "shape", shape: "star", startMs: 0, endMs: 1000, x: 0.5, y: 0.5, scale: 1, rotation: 0, color: "#FFFFFF" },
    { id: "soc", kind: "social", variant: "like-pop", startMs: 0, endMs: 1000, x: 0.5, y: 0.5, scale: 1, rotation: 0, color: "#FFFFFF" },
  ];
  const settingsWith = (tracks: Record<string, unknown>, overlays?: OverlayItem[]) =>
    ProjectSettingsSchema.parse({ ...(overlays ? { overlays } : {}), composition: { tracks } });
  const ids = (items: OverlayItem[]) => items.map((o) => o.id);

  it("hiding graphics drops shape + social and keeps text + image (settings-sourced overlays)", () => {
    const settings = settingsWith({ graphics: { visible: false } }, oneOfEachKind);
    expect(ids(resolveOverlays({ settings }))).toEqual(["txt", "img"]);
  });

  it("hiding text drops text + image and keeps shape + social (settings-sourced overlays)", () => {
    const settings = settingsWith({ text: { visible: false } }, oneOfEachKind);
    expect(ids(resolveOverlays({ settings }))).toEqual(["shp", "soc"]);
  });

  it("filters explicit-prop overlays too — visibility lives in settings, not in the overlay source", () => {
    const graphicsHidden = settingsWith({ graphics: { visible: false } });
    expect(ids(resolveOverlays({ overlays: oneOfEachKind, settings: graphicsHidden }))).toEqual(["txt", "img"]);
    const textHidden = settingsWith({ text: { visible: false } });
    expect(ids(resolveOverlays({ overlays: oneOfEachKind, settings: textHidden }))).toEqual(["shp", "soc"]);
  });

  it("hiding both overlay tracks drops everything", () => {
    const settings = settingsWith({ text: { visible: false }, graphics: { visible: false } }, oneOfEachKind);
    expect(resolveOverlays({ settings })).toEqual([]);
  });

  it("legacy settings (no composition) and missing settings filter nothing", () => {
    const legacy = ProjectSettingsSchema.parse({ overlays: oneOfEachKind });
    expect(ids(resolveOverlays({ settings: legacy }))).toEqual(["txt", "img", "shp", "soc"]);
    expect(ids(resolveOverlays({ overlays: oneOfEachKind }))).toEqual(["txt", "img", "shp", "soc"]);
    expect(ids(resolveOverlays({ overlays: oneOfEachKind, settings: settingsWith({}) }))).toEqual(["txt", "img", "shp", "soc"]);
  });
});

describe("clip range trim (Clipper projects)", () => {
  it("no range means no trim props at all", async () => {
    const { resolveClipRange, videoTrimFrames } = await import("./overlayMath");
    expect(videoTrimFrames(null, 30)).toBeUndefined();
    expect(videoTrimFrames(undefined, 30)).toBeUndefined();
    expect(resolveClipRange({ settings: ProjectSettingsSchema.parse({}) })).toBeNull();
    expect(resolveClipRange({})).toBeNull();
  });

  it("converts a range to source frames at the composition fps", async () => {
    const { videoTrimFrames } = await import("./overlayMath");
    expect(videoTrimFrames({ startMs: 32_000, endMs: 65_000 }, 30)).toEqual({ trimBefore: 960, trimAfter: 1950 });
    expect(videoTrimFrames({ startMs: 32_000, endMs: 65_000 }, 60)).toEqual({ trimBefore: 1920, trimAfter: 3900 });
    expect(videoTrimFrames({ startMs: 0, endMs: 15_000 }, 30)).toEqual({ trimBefore: 0, trimAfter: 450 });
  });

  it("resolveClipRange reads the range out of parsed settings", async () => {
    const { resolveClipRange } = await import("./overlayMath");
    const settings = ProjectSettingsSchema.parse({ clipRange: { startMs: 1000, endMs: 9000 } });
    expect(resolveClipRange({ settings })).toEqual({ startMs: 1000, endMs: 9000 });
  });
});
