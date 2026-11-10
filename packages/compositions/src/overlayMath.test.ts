import { describe, expect, it } from "vitest";
import { DEFAULT_TRACK_STATE, NEUTRAL_VIDEO_ADJUST, ProjectSettingsSchema, compositionDurationMs as sharedCompositionDurationMs, segmentTimelineDurationMs as sharedSegmentTimelineDurationMs, type OverlayItem, type VideoSegment } from "@capseasy/shared";
import { CaptionedVideoProps } from "./props";
import { framesForDurationMs } from "@capseasy/shared";
import { buildAdjustOverlays, buildSegmentEffects, buildVideoFilter, compositionDurationMs, grainBackground, isIdentitySegmentTransform, overlayFrames, overlayTrackKind, overlayVisibleAt, resolveCanvasSettings, resolveOverlays, resolveSegmentTransform, resolveTrackState, resolveVideoAdjust, resolveVideoSegments, segmentTimelineDurationMs, segmentTransformStyle, videoSegmentFrames, videoTransitionLayout, withRawSegmentExtensions } from "./overlayMath";

describe("buildVideoFilter", () => {
  it("is undefined when all adjustments are neutral (filter omitted entirely)", () => {
    expect(buildVideoFilter({ ...NEUTRAL_VIDEO_ADJUST })).toBeUndefined();
    expect(buildVideoFilter(NEUTRAL_VIDEO_ADJUST)).toBeUndefined();
  });

  it("is undefined for a missing adjustment", () => {
    expect(buildVideoFilter(undefined)).toBeUndefined();
    expect(buildVideoFilter(null)).toBeUndefined();
  });

  it("builds the exact CSS filter string (legacy 3-field behaviour preserved)", () => {
    expect(buildVideoFilter({ ...NEUTRAL_VIDEO_ADJUST, brightness: 1.2, contrast: 0.9, saturation: 1.1 })).toBe("brightness(1.2) contrast(0.9) saturate(1.1)");
    expect(buildVideoFilter({ ...NEUTRAL_VIDEO_ADJUST, brightness: 0.5 })).toBe("brightness(0.5) contrast(1) saturate(1)");
  });

  it("applies the pinned 4.9 mapping: exposure multiplier and highlights/shadows cross-terms", () => {
    // B = 1.1*1.5*(1 + 0.15*(-0.4) − 0.08*0.5) = 1.485; C = 0.95*(1 − 0.12*(-0.4) + 0.10*0.5) = 1.0431; S = 1.2*(1 + 0.10*0.6) = 1.272
    expect(
      buildVideoFilter({ brightness: 1.1, contrast: 0.95, saturation: 1.2, exposure: 1.5, highlights: 0.5, shadows: -0.4, temperature: 0.6, tint: 0 }),
    ).toBe("brightness(1.485) contrast(1.0431) saturate(1.272) sepia(0.21)");
    expect(buildVideoFilter({ ...NEUTRAL_VIDEO_ADJUST, shadows: 1, highlights: 1 })).toBe("brightness(1.07) contrast(0.98) saturate(1)");
    expect(buildVideoFilter({ ...NEUTRAL_VIDEO_ADJUST, exposure: 2 })).toBe("brightness(2) contrast(1) saturate(1)");
  });

  it("appends sepia only for warm temperature; cool temperature only cools saturation", () => {
    expect(buildVideoFilter({ ...NEUTRAL_VIDEO_ADJUST, temperature: 1 })).toBe("brightness(1) contrast(1) saturate(1.1) sepia(0.35)");
    expect(buildVideoFilter({ ...NEUTRAL_VIDEO_ADJUST, temperature: -0.5 })).toBe("brightness(1) contrast(1) saturate(0.95)");
  });

  it("rounds to 4 decimal places with trailing zeros trimmed", () => {
    expect(buildVideoFilter({ ...NEUTRAL_VIDEO_ADJUST, exposure: 1.23456 })).toBe("brightness(1.2346) contrast(1) saturate(1)");
  });
});

describe("buildAdjustOverlays (4.9 colour washes)", () => {
  it("is empty for neutral / missing adjustments and for warm temperature", () => {
    expect(buildAdjustOverlays(NEUTRAL_VIDEO_ADJUST)).toEqual([]);
    expect(buildAdjustOverlays(undefined)).toEqual([]);
    expect(buildAdjustOverlays(null)).toEqual([]);
    expect(buildAdjustOverlays({ ...NEUTRAL_VIDEO_ADJUST, temperature: 0.8 })).toEqual([]);
  });

  it("cool temperature is a blue wash at 0.16 alpha per unit", () => {
    expect(buildAdjustOverlays({ ...NEUTRAL_VIDEO_ADJUST, temperature: -1 })).toEqual(["rgba(96, 150, 255, 0.16)"]);
    expect(buildAdjustOverlays({ ...NEUTRAL_VIDEO_ADJUST, temperature: -0.5 })).toEqual(["rgba(96, 150, 255, 0.08)"]);
  });

  it("tint is a green wash when positive and a magenta wash when negative, at 0.10 per unit", () => {
    expect(buildAdjustOverlays({ ...NEUTRAL_VIDEO_ADJUST, tint: 0.5 })).toEqual(["rgba(80, 255, 150, 0.05)"]);
    expect(buildAdjustOverlays({ ...NEUTRAL_VIDEO_ADJUST, tint: -0.25 })).toEqual(["rgba(255, 80, 190, 0.025)"]);
  });

  it("stacks the temperature wash before the tint wash and skips zero-alpha entries", () => {
    expect(buildAdjustOverlays({ ...NEUTRAL_VIDEO_ADJUST, temperature: -1, tint: 1 })).toEqual([
      "rgba(96, 150, 255, 0.16)",
      "rgba(80, 255, 150, 0.1)",
    ]);
    // alpha rounds to 0 at 4dp -> the entry is skipped entirely
    expect(buildAdjustOverlays({ ...NEUTRAL_VIDEO_ADJUST, temperature: -0.0001 })).toEqual([]);
  });
});

describe("buildSegmentEffects / grainBackground (4.7 effects mapping)", () => {
  const eff = (type: string, amount: number, extra: Record<string, unknown> = {}) =>
    ({ id: `e-${type}-${amount}`, type, enabled: true, amount, color: "#FFA946", ...extra }) as never;
  const seg = (effects: unknown[]) => ({ effects }) as never;

  it("no effects (or none enabled) maps to no filter, no vignette, no grain", () => {
    expect(buildSegmentEffects(seg([]), 0)).toEqual({ filter: undefined, vignetteAlpha: 0, grain: null });
    expect(buildSegmentEffects(seg([eff("blur", 0.5, { enabled: false })]), 0)).toEqual({ filter: undefined, vignetteAlpha: 0, grain: null });
    expect(buildSegmentEffects({} as never, 3)).toEqual({ filter: undefined, vignetteAlpha: 0, grain: null });
  });

  it("blur and glow fragments use the pinned round2 scalings", () => {
    expect(buildSegmentEffects(seg([eff("blur", 0.5)]), 0).filter).toBe("blur(10px)");
    expect(buildSegmentEffects(seg([eff("blur", 0.333)]), 0).filter).toBe("blur(6.66px)");
    expect(buildSegmentEffects(seg([eff("glow", 0.5, { color: "#00FF00" })]), 0).filter).toBe("drop-shadow(0 0 15px #00FF00)");
  });

  it("filter fragments keep the stored stack order; disabled effects are skipped", () => {
    const effects = [eff("glow", 0.5, { color: "#00FF00" }), eff("blur", 1, { enabled: false }), eff("blur", 0.25)];
    expect(buildSegmentEffects(seg(effects), 0).filter).toBe("drop-shadow(0 0 15px #00FF00) blur(5px)");
  });

  it("vignette and grain are last-enabled-wins layers, not filters", () => {
    const effects = [eff("vignette", 1), eff("grain", 0.4), eff("vignette", 0.5), eff("grain", 0.8)];
    const out = buildSegmentEffects(seg(effects), 13);
    expect(out.filter).toBeUndefined();
    expect(out.vignetteAlpha).toBe(0.425); // last vignette: 0.5 * 0.85
    expect(out.grain).toEqual({ opacity: 0.4, seedIndex: 5 }); // last grain: 0.8 * 0.5, 13 % 8
  });

  it("grainBackground is a data-URI SVG feTurbulence image for the seed", () => {
    const uri = grainBackground(3);
    expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
    const svg = decodeURIComponent(uri.slice("data:image/svg+xml,".length));
    expect(svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" stitchTiles="stitch"/></filter><rect width="180" height="180" filter="url(#n)"/></svg>',
    );
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
    expect(p.settings.videoAdjust).toEqual(NEUTRAL_VIDEO_ADJUST);
    expect(p.settings.overlays).toEqual([]);
  });

  it("accepts explicit videoAdjust and overlays props", () => {
    const p = CaptionedVideoProps.parse({
      videoAdjust: { brightness: 1.3, contrast: 1, saturation: 0.8 },
      overlays: [{ id: "o1", kind: "shape", shape: "star", startMs: 0, endMs: 2000, color: "#FFA946" }],
    });
    expect(p.videoAdjust).toEqual({ ...NEUTRAL_VIDEO_ADJUST, brightness: 1.3, saturation: 0.8 });
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
    expect(resolveVideoAdjust({ settings })).toEqual({ ...NEUTRAL_VIDEO_ADJUST, brightness: 1.4 });
    expect(resolveOverlays({ settings }).map((o) => o.id)).toEqual(["s1"]);
  });

  it("prefers explicit props over settings", () => {
    expect(resolveVideoAdjust({ videoAdjust: { ...NEUTRAL_VIDEO_ADJUST, brightness: 0.7 }, settings }).brightness).toBe(0.7);
    expect(resolveOverlays({ overlays: [explicitOverlay], settings })).toEqual([explicitOverlay]);
    expect(resolveOverlays({ overlays: [], settings })).toEqual([]);
  });

  it("defaults to neutral / empty with neither source", () => {
    expect(resolveVideoAdjust({})).toEqual(NEUTRAL_VIDEO_ADJUST);
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
    // "Untouched" = the resolver returns the stored array as-is (identity, asserted
    // below); since Phase 4 Run 2 the schema parse itself fills the Run-2 segment
    // defaults (rate 1, identity transform, no transition/asset, not a still).
    const run2Defaults = {
      playbackRate: 1,
      transform: { cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0, rotateDeg: 0, flipH: false, flipV: false, scale: 1, offsetX: 0, offsetY: 0, opacity: 1 },
      transitionIn: null,
      assetId: null,
      still: false,
      keyframes: [],
      effects: [],
    };
    expect(segments).toEqual([
      { id: "seg-1", sourceInMs: 10_000, sourceOutMs: 25_000, ...run2Defaults },
      { id: "seg-2", sourceInMs: 25_000, sourceOutMs: 40_000, ...run2Defaults },
    ]);
    expect(segments).toBe(settings.composition.videoSegments);
  });
});

describe("videoSegmentFrames (segment chain tiling)", () => {
  // Three source-continuous segments of 1040ms each, starting at 2000ms in the source. 1040ms is
  // deliberately NOT frame-aligned at either rate, so independent per-segment rounding would drift
  // (3 x round(31.2) = 93 frames at 30fps) while cumulative-boundary rounding tiles exactly (94).
  // Built through the schema so the fixtures carry the canonical (default-filled)
  // segment shape, exactly as stored segments arrive at the renderer.
  const segments: VideoSegment[] = ProjectSettingsSchema.parse({
    composition: {
      videoSegments: [
        { id: "a", sourceInMs: 2000, sourceOutMs: 3040 },
        { id: "b", sourceInMs: 3040, sourceOutMs: 4080 },
        { id: "c", sourceInMs: 4080, sourceOutMs: 5120 },
      ],
    },
  }).composition.videoSegments;

  it("computes exact windows and per-segment source trims at 30fps", () => {
    expect(videoSegmentFrames(segments, 30)).toEqual([
      { from: 0, durationInFrames: 31, trimBefore: 60, trimAfter: 91, playbackRate: 1 },
      { from: 31, durationInFrames: 31, trimBefore: 91, trimAfter: 122, playbackRate: 1 },
      { from: 62, durationInFrames: 32, trimBefore: 122, trimAfter: 154, playbackRate: 1 },
    ]);
  });

  it("computes exact windows and per-segment source trims at 60fps", () => {
    expect(videoSegmentFrames(segments, 60)).toEqual([
      { from: 0, durationInFrames: 62, trimBefore: 120, trimAfter: 182, playbackRate: 1 },
      { from: 62, durationInFrames: 63, trimBefore: 182, trimAfter: 245, playbackRate: 1 },
      { from: 125, durationInFrames: 62, trimBefore: 245, trimAfter: 307, playbackRate: 1 },
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
    expect(videoSegmentFrames([segments[0]], 30)).toEqual([{ from: 0, durationInFrames: 31, trimBefore: 60, trimAfter: 91, playbackRate: 1 }]);
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

describe("segmentTimelineDurationMs / compositionDurationMs (pinned shared formulas)", () => {
  const seg = (id: string, a: number, b: number, extra: Record<string, unknown> = {}) => ({ id, sourceInMs: a, sourceOutMs: b, ...extra }) as never;

  it("divides the source span by the playback rate, rounded", () => {
    expect(segmentTimelineDurationMs(seg("a", 0, 2000, { playbackRate: 2 }))).toBe(1000);
    expect(segmentTimelineDurationMs(seg("a", 0, 2000, { playbackRate: 0.5 }))).toBe(4000);
    expect(segmentTimelineDurationMs(seg("a", 1000, 2001, { playbackRate: 2 }))).toBe(501); // round(1001/2)
    expect(segmentTimelineDurationMs(seg("a", 0, 2000))).toBe(2000); // default rate 1
    expect(segmentTimelineDurationMs(seg("a", 0, 2000, { playbackRate: 0 }))).toBe(2000); // invalid rate -> 1
  });

  it("composition duration sums timeline durations and subtracts boundary transitions only", () => {
    const segs = [
      seg("a", 0, 2000, { transitionIn: { type: "fade", durationMs: 900 } }), // on seg 0: ignored
      seg("b", 2000, 4000, { playbackRate: 2, transitionIn: { type: "fade", durationMs: 300 } }),
      seg("c", 4000, 5000, { transitionIn: { type: "wipe", durationMs: 200 } }),
    ];
    // timeline: 2000 + 1000 + 1000 = 4000; transitions: 300 + 200 = 500
    expect(compositionDurationMs(segs)).toBe(3500);
    expect(compositionDurationMs([])).toBe(0);
  });

  it("Phase 9 adapter pin: equals the shared helpers exactly on parsed-shape inputs", () => {
    // The local helpers delegate to @capseasy/shared; on inputs that already satisfy the
    // shared shape (valid rate present, schema-valid transitions) there is no adapter
    // behaviour left, so the values must be the shared values, bit for bit.
    const parsed = [
      { sourceInMs: 0, sourceOutMs: 2001, playbackRate: 2, transitionIn: { type: "fade" as const, durationMs: 900 } },
      { sourceInMs: 2001, sourceOutMs: 4001, playbackRate: 0.5, transitionIn: { type: "wipe" as const, durationMs: 300 } },
      { sourceInMs: 4001, sourceOutMs: 5001, playbackRate: 1, transitionIn: null },
    ];
    for (const s of parsed) expect(segmentTimelineDurationMs(s as never)).toBe(sharedSegmentTimelineDurationMs(s));
    expect(compositionDurationMs(parsed as never)).toBe(sharedCompositionDurationMs(parsed));
    expect(compositionDurationMs([parsed[0]] as never)).toBe(sharedCompositionDurationMs([parsed[0]]));
    expect(compositionDurationMs([])).toBe(sharedCompositionDurationMs([]));
  });

  it("Phase 9 adapter pin: raw transition durations are clamped to >= 0 before delegating", () => {
    // Raw (unparsed) segments can carry a negative transition duration; the previous local
    // implementation clamped it, the shared helper (parsed inputs only) does not — the
    // adapter must keep the clamp: 2000 + 2000 − max(0, −500) = 4000, not 4500.
    const segs = [
      seg("a", 0, 2000),
      seg("b", 2000, 4000, { transitionIn: { type: "fade", durationMs: -500 } }),
    ];
    expect(compositionDurationMs(segs)).toBe(4000);
  });
});

describe("videoSegmentFrames with playback rates (rate-aware tiling)", () => {
  const seg = (id: string, a: number, b: number, playbackRate?: number) =>
    ({ id, sourceInMs: a, sourceOutMs: b, ...(playbackRate ? { playbackRate } : {}) }) as never;

  it("rate 2 halves the window, rate 0.5 doubles it, and windows still tile exactly", () => {
    const windows = videoSegmentFrames([seg("a", 0, 2080, 2), seg("b", 2080, 4160, 0.5)], 30);
    // timeline durations: 1040ms and 4160ms -> boundaries 0 / 1040 / 5200ms
    expect(windows).toEqual([
      { from: 0, durationInFrames: 31, trimBefore: 0, trimAfter: 62, playbackRate: 2 },
      { from: 31, durationInFrames: 125, trimBefore: 62, trimAfter: 125, playbackRate: 0.5 },
    ]);
    expect(windows[1].from).toBe(windows[0].from + windows[0].durationInFrames);
    expect(windows.reduce((s, w) => s + w.durationInFrames, 0)).toBe(Math.round((5200 / 1000) * 30));
  });

  it("mixed rates tile exactly at 60fps too (cumulative boundaries, not per-segment rounding)", () => {
    const windows = videoSegmentFrames([seg("a", 0, 1000, 3), seg("b", 1000, 2000), seg("c", 2000, 3000, 0.75)], 60);
    for (let i = 1; i < windows.length; i++) expect(windows[i].from).toBe(windows[i - 1].from + windows[i - 1].durationInFrames);
    const totalMs = Math.round(1000 / 3) + 1000 + Math.round(1000 / 0.75);
    expect(windows.reduce((s, w) => s + w.durationInFrames, 0)).toBe(Math.round((totalMs / 1000) * 60));
  });

  it("trimBefore/trimAfter stay SOURCE-frame trims regardless of rate", () => {
    const [w] = videoSegmentFrames([seg("a", 2000, 4080, 2)], 30);
    expect(w.trimBefore).toBe(60);
    expect(w.trimAfter).toBe(122);
  });
});

describe("videoTransitionLayout (TransitionSeries parity identity)", () => {
  const seg = (id: string, a: number, b: number, extra: Record<string, unknown> = {}) => ({ id, sourceInMs: a, sourceOutMs: b, ...extra }) as never;
  const identity = (segs: never[], fps: number) => {
    const layout = videoTransitionLayout(segs, fps);
    const seqSum = layout.sequences.reduce((s, x) => s + x.durationInFrames, 0);
    const transSum = layout.transitions.reduce((s, x) => s + x.durationInFrames, 0);
    expect(seqSum - transSum).toBe(framesForDurationMs(compositionDurationMs(segs), fps));
    return layout;
  };

  it("no transitions: sequences alone equal the composition frames (ceil boundaries)", () => {
    const layout = identity([seg("a", 0, 1040), seg("b", 1040, 2080)], 30);
    expect(layout.sequences.map((s) => s.durationInFrames)).toEqual([32, 31]); // ceil boundaries: 0, 32, 63
    expect(layout.transitions).toEqual([{ durationInFrames: 0 }]);
  });

  it("a single fade boundary: identity holds and the transition gets its frames", () => {
    const layout = identity(
      [seg("a", 0, 2000), seg("b", 2000, 4000, { transitionIn: { type: "fade", durationMs: 300 } })],
      30,
    );
    expect(layout.sequences.map((s) => s.durationInFrames)).toEqual([60, 60]);
    expect(layout.transitions).toEqual([{ durationInFrames: 9 }]); // 300ms at 30fps
  });

  it("multiple boundaries with mixed rates: identity holds at 30 and 60fps", () => {
    const segs = [
      seg("a", 0, 2080, { playbackRate: 2 }),
      seg("b", 2080, 4160, { transitionIn: { type: "slide", durationMs: 250 } }),
      seg("c", 4160, 6240, { playbackRate: 0.5, transitionIn: { type: "zoom", durationMs: 500 } }),
    ];
    for (const fps of [30, 60]) {
      const layout = identity(segs, fps);
      for (const t of layout.transitions) expect(t.durationInFrames).toBeGreaterThanOrEqual(1);
    }
  });

  it("clamps a transition to min(adjacent sequences) - 1 and STILL holds the identity", () => {
    // seg b is only 400ms (12 frames) but asks for a 1000ms transition
    const segs = [seg("a", 0, 3000), seg("b", 3000, 3400, { transitionIn: { type: "wipe", durationMs: 1000 } }), seg("c", 3400, 6400)];
    const layout = identity(segs as never[], 30);
    expect(layout.transitions[0].durationInFrames).toBeLessThanOrEqual(Math.min(layout.sequences[0].durationInFrames, layout.sequences[1].durationInFrames) - 1);
  });

  it("a sub-frame transition allocates 0 frames (renders as a cut) without breaking the identity", () => {
    const layout = identity([seg("a", 0, 2000), seg("b", 2000, 4000, { transitionIn: { type: "fade", durationMs: 10 } })], 30);
    expect(layout.transitions[0].durationInFrames).toBe(0);
  });
});

describe("segmentTransformStyle", () => {
  const seg = (transform?: Record<string, unknown>) => ({ transform }) as never;

  it("is null for a missing or identity transform (no wrapper rendered)", () => {
    expect(segmentTransformStyle(seg())).toBeNull();
    expect(segmentTransformStyle(seg({}))).toBeNull();
    expect(segmentTransformStyle(seg({ scale: 1, rotateDeg: 0, cropLeft: 0 }))).toBeNull();
  });

  it("crop enlarges and shifts the inner box so the surviving region fills the stage", () => {
    const style = segmentTransformStyle(seg({ cropLeft: 0.25, cropRight: 0.25, cropTop: 0.5 }));
    expect(style?.wrapper).toEqual({ position: "absolute", inset: 0, overflow: "hidden" });
    expect(style?.inner.width).toBe("200%"); // 100 / (1 - .25 - .25)
    expect(style?.inner.left).toBe("-50%"); // -.25 / .5 * 100
    expect(style?.inner.height).toBe("200%"); // 100 / (1 - .5)
    expect(style?.inner.top).toBe("-100%");
    expect(style?.inner.transform).toBeUndefined();
  });

  it("rotate / flip / scale / offset compose into one transform string", () => {
    const style = segmentTransformStyle(seg({ rotateDeg: 15, flipH: true, scale: 2, offsetX: 0.1, offsetY: -0.05 }));
    expect(style?.inner.transform).toBe("translate(10%, -5%) rotate(15deg) scale(-2, 2)");
  });

  it("flipV alone flips the Y scale sign", () => {
    expect(segmentTransformStyle(seg({ flipV: true }))?.inner.transform).toBe("scale(1, -1)");
  });

  it("opacity defaults to 1, is clamped to 0..1, and counts toward identity (Run 3)", () => {
    expect(resolveSegmentTransform(seg()).opacity).toBe(1);
    expect(resolveSegmentTransform(seg({ opacity: 0.5 })).opacity).toBe(0.5);
    expect(resolveSegmentTransform(seg({ opacity: 2 })).opacity).toBe(1);
    expect(isIdentitySegmentTransform(resolveSegmentTransform(seg()))).toBe(true);
    expect(isIdentitySegmentTransform(resolveSegmentTransform(seg({ opacity: 0.5 })))).toBe(false);
    // an opacity-only transform still needs the wrapper box (SegmentFx paints the opacity)
    const style = segmentTransformStyle(seg({ opacity: 0.5 }));
    expect(style).not.toBeNull();
    expect(style?.inner.width).toBe("100%");
    expect(style?.inner).not.toHaveProperty("opacity");
  });
});

describe("withRawSegmentExtensions / resolveCanvasSettings (raw settings win)", () => {
  it("merges extension fields from raw settings by position; parsed values survive elsewhere", () => {
    const parsed = [
      { id: "a", sourceInMs: 0, sourceOutMs: 1000 },
      { id: "b", sourceInMs: 1000, sourceOutMs: 2000 },
    ] as never[];
    const raw = { composition: { videoSegments: [{ playbackRate: 2 }, { assetId: "asset-9", still: true }] } };
    const merged = withRawSegmentExtensions(parsed, raw);
    expect(merged[0]).toMatchObject({ id: "a", playbackRate: 2 });
    expect(merged[1]).toMatchObject({ id: "b", assetId: "asset-9", still: true });
  });

  it("merges Run-3 keyframes / effects from raw settings too", () => {
    const parsed = [{ id: "a", sourceInMs: 0, sourceOutMs: 1000 }] as never[];
    const keyframes = [{ id: "k1", atMs: 0, property: "scale", value: 2, easing: "linear" }];
    const effects = [{ id: "e1", type: "blur", enabled: true, amount: 0.5, color: "#FFA946" }];
    const raw = { composition: { videoSegments: [{ keyframes, effects }] } };
    const merged = withRawSegmentExtensions(parsed, raw);
    expect(merged[0].keyframes).toEqual(keyframes);
    expect(merged[0].effects).toEqual(effects);
  });

  it("returns the parsed segments untouched when raw is absent or length-mismatched", () => {
    const parsed = [{ id: "a", sourceInMs: 0, sourceOutMs: 1000 }] as never[];
    expect(withRawSegmentExtensions(parsed, undefined)).toBe(parsed);
    expect(withRawSegmentExtensions(parsed, { composition: { videoSegments: [] } })).toBe(parsed);
  });

  it("canvas defaults to source/blur; raw canvas wins over parsed", () => {
    expect(resolveCanvasSettings({})).toEqual({ aspect: "source", background: "blur" });
    expect(resolveCanvasSettings({ rawSettings: { canvas: { aspect: "9:16", background: "#101418" } } })).toEqual({ aspect: "9:16", background: "#101418" });
    expect(resolveCanvasSettings({ rawSettings: { canvas: { aspect: "bogus" } } }).aspect).toBe("source");
  });
});
