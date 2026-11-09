import { describe, expect, it } from "vitest";
import { ProjectSettingsSchema, type OverlayItem } from "@capseasy/shared";
import { CaptionedVideoProps } from "./props";
import { buildVideoFilter, overlayFrames, overlayVisibleAt, resolveOverlays, resolveVideoAdjust } from "./overlayMath";

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
