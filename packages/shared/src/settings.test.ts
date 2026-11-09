import { describe, expect, it } from "vitest";
import { OverlayItemSchema, ProjectSettingsSchema, defaultSettings } from "./settings";

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

  it("round-trips a full settings object with overlays", () => {
    const s = ProjectSettingsSchema.parse({ overlays: [{ id: "t1", kind: "text", text: "Hi", startMs: 0, endMs: 3000, color: "#34D399" }] });
    expect(s.overlays).toHaveLength(1);
    expect(s.overlays[0]).toMatchObject({ id: "t1", text: "Hi", color: "#34D399", scale: 1 });
  });
});
