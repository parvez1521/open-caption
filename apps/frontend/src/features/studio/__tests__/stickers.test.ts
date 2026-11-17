/**
 * Stickers registry (2026-11-18): one set, House Stickers — all 50 house-drawn
 * shapes that live in the shared schema + renderer (the 21 original shapes, the
 * 12 studio stickers batch and the 17-shape expansion). Pins: exactly 50 shapes,
 * every id is a real OVERLAY_SHAPES id with a label in OVERLAY_SHAPE_META, the
 * set carries a licence, and makeShapeOverlay output for every sticker shape
 * passes OverlayItemSchema.
 */
import { describe, expect, it } from "vitest";
import { OVERLAY_SHAPES, OverlayItemSchema } from "@capseasy/shared";
import { OVERLAY_SHAPE_META } from "@capseasy/compositions";
import { STICKER_SETS, stickerShapes } from "../stickers";
import { makeShapeOverlay } from "../panels/overlayItems";

const EXPECTED_IDS = [
  "ring",
  "circle",
  "arrow",
  "check",
  "star",
  "heart",
  "rectangle",
  "scribble-underline",
  "triangle",
  "rounded-rectangle",
  "ellipse",
  "diamond",
  "chevron",
  "double-arrow",
  "speech-bubble",
  "underline-bar",
  "corner-brackets",
  "progress-bar",
  "plus",
  "cross",
  "badge",
  "burst",
  "bolt",
  "crown",
  "flame",
  "thumbs-up",
  "curved-arrow",
  "sun",
  "explosion",
  "ribbon",
  "tag",
  "pin",
  "target",
  "megaphone",
  "music-note",
  "mic",
  "camera",
  "play",
  "rocket",
  "trophy",
  "gift",
  "bell",
  "clock",
  "gem",
  "puzzle",
  "coffee",
  "umbrella",
  "key",
  "lock",
  "thumbs-down",
] as const;

describe("STICKER_SETS", () => {
  it("has one set, House Stickers, with the 50 sticker shapes", () => {
    expect(STICKER_SETS).toHaveLength(1);
    const set = STICKER_SETS[0]!;
    expect(set.id).toBe("house-stickers");
    expect(set.name).toBe("House Stickers");
    expect([...set.shapes]).toEqual([...EXPECTED_IDS]);
    expect(set.shapes).toHaveLength(50);
  });

  it("carries a licence string and names the in-house source", () => {
    const set = STICKER_SETS[0]!;
    expect(set.licence).toContain("CC0");
    expect(set.licence).toContain("drawn in-house");
    expect(set.source).toContain("packages/compositions/src/overlays.tsx");
    expect(set.source).toContain("OverlayShapeSvg");
  });

  it("every sticker id is in OVERLAY_SHAPES and has a label in OVERLAY_SHAPE_META", () => {
    for (const id of STICKER_SETS[0]!.shapes) {
      expect(OVERLAY_SHAPES, id).toContain(id);
      const meta = OVERLAY_SHAPE_META.find((s) => s.id === id);
      expect(meta, id).toBeTruthy();
      expect(meta!.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("all 50 sticker ids are unique and match OVERLAY_SHAPES exactly", () => {
    const ids = [...STICKER_SETS[0]!.shapes];
    expect(new Set(ids).size).toBe(50);
    expect([...OVERLAY_SHAPES].sort()).toEqual([...ids].sort());
    expect(new Set(OVERLAY_SHAPE_META.map((s) => s.id)).size).toBe(50);
  });
});

describe("stickerShapes()", () => {
  it("returns the 50 shapes with their labels from OVERLAY_SHAPE_META, in registry order", () => {
    const shapes = stickerShapes();
    expect(shapes).toHaveLength(50);
    expect(shapes.map((s) => s.id)).toEqual([...EXPECTED_IDS]);
    for (const s of shapes) {
      expect(s.label).toBe(OVERLAY_SHAPE_META.find((m) => m.id === s.id)!.label);
    }
  });
});

describe("makeShapeOverlay for sticker shapes", () => {
  it("passes OverlayItemSchema.parse for every sticker shape", () => {
    for (const shape of STICKER_SETS[0]!.shapes) {
      const item = makeShapeOverlay(shape, 1000, 30000);
      expect(item.kind).toBe("shape");
      expect(item.shape).toBe(shape);
      expect(() => OverlayItemSchema.parse(item)).not.toThrow();
      const parsed = OverlayItemSchema.parse(item);
      expect(parsed).toMatchObject({ kind: "shape", shape, startMs: 1000, endMs: 4000 });
    }
  });
});
