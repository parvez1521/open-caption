import { describe, expect, it } from "vitest";
import {
  OverlayItemSchema, ProjectSettingsSchema, defaultSettings,
  exportDimensions, exportDimensionsForAspect, exportMemoryErrorMessage, framesForDurationMs,
  type ExportResolution,
} from "./settings";

describe("ProjectSettings editor elements (Slice 1d)", () => {
  it("defaults videoAdjust to neutral and overlays to empty on an empty object", () => {
    const s = ProjectSettingsSchema.parse({});
    expect(s.videoAdjust).toEqual({ brightness: 1, contrast: 1, saturation: 1 });
    expect(s.overlays).toEqual([]);
  });

  it("loads an old project (no editor-element fields) unchanged in spirit", () => {
    const s = ProjectSettingsSchema.parse({ maxWordsPerCard: 5, language: "en" });
    expect(s.maxWordsPerCard).toBe(5);
    expect(s.videoAdjust).toEqual({ brightness: 1, contrast: 1, saturation: 1 });
    expect(s.overlays).toEqual([]);
    expect(defaultSettings().overlays).toEqual([]);
  });

  it("fills a partial videoAdjust with neutral defaults", () => {
    const s = ProjectSettingsSchema.parse({ videoAdjust: { brightness: 1.2 } });
    expect(s.videoAdjust).toEqual({ brightness: 1.2, contrast: 1, saturation: 1 });
  });

  it("rejects out-of-range videoAdjust values", () => {
    expect(() => ProjectSettingsSchema.parse({ videoAdjust: { brightness: 2 } })).toThrow();
    expect(() => ProjectSettingsSchema.parse({ videoAdjust: { contrast: 0.1 } })).toThrow();
    expect(() => ProjectSettingsSchema.parse({ videoAdjust: { saturation: 1.6 } })).toThrow();
  });

  it("accepts the range edges", () => {
    const s = ProjectSettingsSchema.parse({ videoAdjust: { brightness: 0.5, contrast: 1.5, saturation: 0.5 } });
    expect(s.videoAdjust).toEqual({ brightness: 0.5, contrast: 1.5, saturation: 0.5 });
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
