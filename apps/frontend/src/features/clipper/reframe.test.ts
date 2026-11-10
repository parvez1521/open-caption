import { describe, expect, it } from "vitest";
import { ProjectSettingsSchema } from "@capseasy/shared";
import { segmentTransformStyle } from "@capseasy/compositions";
import {
  clampCropWindow,
  cropWindowFractions,
  cropWindowToTransform,
  DEFAULT_CROP_WINDOW,
  MAX_CROP_ZOOM,
  needsVerticalReframe,
  reframedClipSettings,
  reframeSegmentForClip,
  transformToCropWindow,
} from "./reframe";
import { toComposition } from "../studio/composition";
import { buildEditorComposition, projectComposition } from "../studio/compositionDoc";

/**
 * Slice 5.4 mapping tests. The reference source is 1920×1080 (16:9): a 9:16 window
 * over it is 607.5×1080, i.e. it keeps a 0.31640625 width fraction and crops
 * 0.68359375 away in total — 0.341796875 per side when centred.
 */
const W = 1920;
const H = 1080;
const FW = 0.31640625; // (9/16) / (16/9)
const CROP_TOTAL = 1 - FW; // 0.68359375

describe("needsVerticalReframe / cropWindowFractions", () => {
  it("a landscape source wider than 9:16 has a window to choose", () => {
    expect(needsVerticalReframe(W, H)).toBe(true);
    expect(needsVerticalReframe(1080, 1080)).toBe(true); // square is wider than 9:16 too
    const f = cropWindowFractions(DEFAULT_CROP_WINDOW, W, H)!;
    expect(f.fw).toBeCloseTo(FW, 12);
    expect(f.fh).toBe(1);
  });

  it("portrait, exactly-9:16 and unknown sources have no window (flow unchanged)", () => {
    expect(needsVerticalReframe(1080, 1920)).toBe(false);
    expect(needsVerticalReframe(720, 1280)).toBe(false); // exactly 9:16
    expect(needsVerticalReframe(null, null)).toBe(false);
    expect(needsVerticalReframe(0, H)).toBe(false);
    expect(needsVerticalReframe(undefined, H)).toBe(false);
  });

  it("zoom shrinks the window in both dimensions, keeping the 9:16 shape", () => {
    const f = cropWindowFractions({ x: 0.5, y: 0.5, zoom: 2 }, W, H)!;
    expect(f.fh).toBe(0.5);
    expect(f.fw).toBeCloseTo(FW / 2, 12);
    expect((f.fw * W) / (f.fh * H)).toBeCloseTo(9 / 16, 9);
  });
});

describe("cropWindowToTransform — the window ↔ stored transform mapping", () => {
  it("the CENTRE default is exact: symmetric crops, no vertical crop, identity elsewhere", () => {
    const t = cropWindowToTransform(DEFAULT_CROP_WINDOW, W, H);
    expect(t.cropLeft).toBe(t.cropRight); // bit-exact symmetry is the centre guarantee
    expect(t.cropLeft).toBeCloseTo(CROP_TOTAL / 2, 12);
    expect(t.cropTop).toBe(0);
    expect(t.cropBottom).toBe(0);
    expect(t.scale).toBe(1);
    expect(t.offsetX).toBe(0);
    expect(t.offsetY).toBe(0);
    expect(t.rotateDeg).toBe(0);
    expect(t.flipH).toBe(false);
    expect(t.flipV).toBe(false);
    expect(t.opacity).toBe(1);
    // the kept fraction is exactly the 9:16 share of the width
    expect(1 - t.cropLeft - t.cropRight).toBeCloseTo(FW, 12);
  });

  it("x = 0 puts the whole crop on the right; x = 1 puts it all on the left", () => {
    const left = cropWindowToTransform({ x: 0, y: 0.5, zoom: 1 }, W, H);
    expect(left.cropLeft).toBe(0);
    expect(left.cropRight).toBeCloseTo(CROP_TOTAL, 12);
    const right = cropWindowToTransform({ x: 1, y: 0.5, zoom: 1 }, W, H);
    expect(right.cropRight).toBeCloseTo(0, 12);
    expect(right.cropLeft).toBeCloseTo(CROP_TOTAL, 12);
  });

  it("an intermediate x splits the crop in proportion (x is the share of travel)", () => {
    const t = cropWindowToTransform({ x: 0.25, y: 0.5, zoom: 1 }, W, H);
    expect(t.cropLeft).toBeCloseTo(0.25 * CROP_TOTAL, 12);
    expect(t.cropRight).toBeCloseTo(0.75 * CROP_TOTAL, 12);
  });

  it("zoom + y move the vertical crop; at zoom 1 y has no travel and no effect", () => {
    const zoomed = cropWindowToTransform({ x: 0.5, y: 1, zoom: 2 }, W, H);
    expect(zoomed.cropTop).toBeCloseTo(0.5, 12);
    expect(zoomed.cropBottom).toBeCloseTo(0, 12);
    const unzoomed = cropWindowToTransform({ x: 0.5, y: 1, zoom: 1 }, W, H);
    expect(unzoomed.cropTop).toBe(0);
    expect(unzoomed.cropBottom).toBe(0);
  });

  it("every produced transform parses inside the shared schema ranges, even ultrawide at max zoom", () => {
    const t = cropWindowToTransform({ x: 1, y: 1, zoom: MAX_CROP_ZOOM }, 3440, 1440);
    for (const v of [t.cropLeft, t.cropRight, t.cropTop, t.cropBottom]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0.9);
    }
  });

  it("a source with no window maps to the identity transform", () => {
    expect(cropWindowToTransform(DEFAULT_CROP_WINDOW, 1080, 1920)).toEqual(
      cropWindowToTransform(DEFAULT_CROP_WINDOW, null, null),
    );
    const t = cropWindowToTransform(DEFAULT_CROP_WINDOW, 1080, 1920);
    expect(t.cropLeft + t.cropRight + t.cropTop + t.cropBottom).toBe(0);
  });
});

describe("transformToCropWindow — the inverse mapping", () => {
  it("round-trips position and zoom", () => {
    for (const win of [
      { x: 0, y: 0.5, zoom: 1 },
      { x: 0.5, y: 0.5, zoom: 1 },
      { x: 1, y: 0.5, zoom: 1 },
      { x: 0.3, y: 0.7, zoom: 1.8 },
      { x: 0.85, y: 0.15, zoom: 2.5 },
    ]) {
      const back = transformToCropWindow(cropWindowToTransform(win, W, H), W, H);
      expect(back.x).toBeCloseTo(win.x, 9);
      expect(back.y).toBeCloseTo(win.y, 9);
      expect(back.zoom).toBeCloseTo(win.zoom, 9);
    }
  });

  it("an uncropped transform reads back as the default window", () => {
    expect(
      transformToCropWindow({ cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0 }, W, H),
    ).toEqual(DEFAULT_CROP_WINDOW);
  });
});

describe("clampCropWindow", () => {
  it("clamps positions into 0..1 and zoom into 1..MAX, defaults garbage to centre", () => {
    expect(clampCropWindow({ x: -1, y: 2, zoom: 99 })).toEqual({ x: 0, y: 1, zoom: MAX_CROP_ZOOM });
    expect(clampCropWindow({ x: Number.NaN, zoom: 0 })).toEqual({ x: 0.5, y: 0.5, zoom: 1 });
    expect(clampCropWindow(null)).toEqual(DEFAULT_CROP_WINDOW);
  });
});

describe("reframeSegmentForClip + reframedClipSettings", () => {
  const range = { startMs: 32_000, endMs: 65_000 };

  it("builds one segment over exactly the clip range, carrying the window transform", () => {
    const seg = reframeSegmentForClip({ window: DEFAULT_CROP_WINDOW, sourceWidth: W, sourceHeight: H, ...range })!;
    expect(seg.sourceInMs).toBe(32_000);
    expect(seg.sourceOutMs).toBe(65_000);
    expect(seg.playbackRate).toBe(1);
    expect(seg.transform.cropLeft).toBeCloseTo(CROP_TOTAL / 2, 12);
  });

  it("returns null (no segment, no reframing) for portrait / 9:16 / unknown sources", () => {
    expect(reframeSegmentForClip({ window: DEFAULT_CROP_WINDOW, sourceWidth: 1080, sourceHeight: 1920, ...range })).toBeNull();
    expect(reframeSegmentForClip({ window: DEFAULT_CROP_WINDOW, sourceWidth: null, sourceHeight: null, ...range })).toBeNull();
  });

  it("the settings patch sets a 9:16 canvas (keeping the background) and only the reframe segment", () => {
    const base = ProjectSettingsSchema.parse({
      clipRange: range,
      canvas: { aspect: "source", background: "#101418" },
      composition: { markers: [{ id: "m1", atMs: 5000, label: "source-timeline marker" }] },
    });
    const out = reframedClipSettings({ settings: base, window: { x: 1, y: 0.5, zoom: 1 }, sourceWidth: W, sourceHeight: H, ...range })!;
    expect(out.settings.canvas).toEqual({ aspect: "9:16", background: "#101418" });
    expect(out.settings.clipRange).toEqual(range);
    expect(out.composition.videoSegments).toHaveLength(1);
    expect(out.composition.videoSegments[0]!.transform.cropLeft).toBeCloseTo(CROP_TOTAL, 12);
    // source-timeline composition content does NOT leak into the clip (same rule as overlays)
    expect(out.composition.markers).toEqual([]);
    expect(out.settings.composition).toBe(out.composition);
  });

  it("returns null for a portrait source so the caller keeps its settings untouched", () => {
    const base = ProjectSettingsSchema.parse({ clipRange: range });
    expect(
      reframedClipSettings({ settings: base, window: DEFAULT_CROP_WINDOW, sourceWidth: 720, sourceHeight: 1280, ...range }),
    ).toBeNull();
  });
});

describe("the reframed composition, through the ONE shared composition model", () => {
  const range = { startMs: 32_000, endMs: 65_000 };
  const sourceDurationMs = 120_000;
  const settings = reframedClipSettings({
    settings: ProjectSettingsSchema.parse({ clipRange: range }),
    window: { x: 0.25, y: 0.5, zoom: 1 },
    sourceWidth: W,
    sourceHeight: H,
    ...range,
  })!.settings;

  it("builds an editor clip carrying the crop, and projects back losslessly", () => {
    const view = toComposition({
      media: { videoId: "vid-1", filename: "long.mp4", size: 1, width: W, height: H, fps: 30, durationMs: sourceDurationMs },
      doc: null,
      pages: [],
      settings,
      durationMs: range.endMs - range.startMs,
    });
    const comp = buildEditorComposition({ view, settings, sourceDurationMs });
    expect(comp.videoClips).toHaveLength(1);
    expect(comp.videoClips[0]!.transform.cropLeft).toBeCloseTo(0.25 * CROP_TOTAL, 12);
    expect(comp.videoClips[0]!.transform.cropRight).toBeCloseTo(0.75 * CROP_TOTAL, 12);
    // a lone NON-plain clip must stay stored (the untouched-shape rule must not drop the crop)
    const projected = projectComposition(comp, settings);
    expect(projected.composition.videoSegments).toHaveLength(1);
    expect(projected.composition.videoSegments[0]!.transform).toEqual(comp.videoClips[0]!.transform);
    expect(projected.clipRange).toEqual(range);
    expect(projected.canvas.aspect).toBe("9:16");
  });

  it("the renderer's transform style makes the surviving region fill the stage exactly", () => {
    const seg = settings.composition.videoSegments[0]!;
    const style = segmentTransformStyle(seg)!;
    expect(style).not.toBeNull();
    // inner box enlarged by the kept fraction: width = 100 / FW %, shifted by the left crop's share
    expect(parseFloat(String(style.inner.width))).toBeCloseTo(100 / FW, 9);
    expect(parseFloat(String(style.inner.left))).toBeCloseTo((-seg.transform.cropLeft / FW) * 100, 9);
    expect(style.inner.height).toBe("100%");
    expect(style.wrapper.overflow).toBe("hidden");
  });
});
