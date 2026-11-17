/**
 * The 50-title registry: exactly 50 entries across 6 categories, every preset inside
 * the overlay system's own bounds (box-applicable anims, system fonts, brand palette,
 * size/duration ranges), and every title builds into a valid OverlayItem whose window
 * never runs past the end of the video.
 */
import { describe, expect, it } from "vitest";
import { OVERLAY_ENTER_ANIMS, OVERLAY_EXIT_ANIMS } from "@capseasy/compositions";
import { OVERLAY_FONTS, OverlayItemSchema } from "@capseasy/shared";
import { TITLE_CATEGORIES, TITLE_FONT_STACKS, TITLE_STYLES, makeTitleOverlay } from "../titleStyles";

const ENTER_IDS = new Set(OVERLAY_ENTER_ANIMS.map((a) => a.id));
const EXIT_IDS = new Set(OVERLAY_EXIT_ANIMS.map((a) => a.id));
const FONT_IDS = new Set(OVERLAY_FONTS);
const BRAND_COLORS = new Set(["#FFFFFF", "#FFFFEB", "#34D399", "#FFA946"]);
const EXPECTED_COUNTS: Record<string, number> = {
  "Kinetic Big": 8,
  "Lower Third": 8,
  Minimal: 8,
  "Bold Punch": 8,
  Elegant: 9,
  "Fun Pop": 9,
};

describe("TITLE_STYLES registry", () => {
  it("has exactly 50 entries with unique kebab-case ids", () => {
    expect(TITLE_STYLES).toHaveLength(50);
    const ids = TITLE_STYLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("has non-empty names and categories, in the 6 registry categories", () => {
    expect(TITLE_CATEGORIES).toEqual(["Kinetic Big", "Lower Third", "Minimal", "Bold Punch", "Elegant", "Fun Pop"]);
    for (const s of TITLE_STYLES) {
      expect(s.name.trim().length).toBeGreaterThan(0);
      expect(s.category.trim().length).toBeGreaterThan(0);
      expect(TITLE_CATEGORIES).toContain(s.category);
      expect(s.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("has a font stack for every system font", () => {
    expect(Object.keys(TITLE_FONT_STACKS).sort()).toEqual([...OVERLAY_FONTS].sort());
    for (const stack of Object.values(TITLE_FONT_STACKS)) expect(stack.length).toBeGreaterThan(0);
  });

  it("matches the category counts 8/8/8/8/9/9", () => {
    for (const [category, count] of Object.entries(EXPECTED_COUNTS)) {
      expect(TITLE_STYLES.filter((s) => s.category === category)).toHaveLength(count);
    }
  });

  it("uses only box-applicable anims, system fonts and brand-palette colours", () => {
    for (const s of TITLE_STYLES) {
      expect(ENTER_IDS.has(s.enterAnim), `${s.id}: enterAnim ${s.enterAnim}`).toBe(true);
      expect(EXIT_IDS.has(s.exitAnim), `${s.id}: exitAnim ${s.exitAnim}`).toBe(true);
      expect(FONT_IDS.has(s.font), `${s.id}: font ${s.font}`).toBe(true);
      expect(BRAND_COLORS.has(s.color), `${s.id}: color ${s.color}`).toBe(true);
    }
  });

  it("keeps fontSize 28-120, speeds 0.5-2, durationMs 2000-6000, x 0.5 and y in 0.5/0.82/0.18", () => {
    for (const s of TITLE_STYLES) {
      expect(s.fontSize).toBeGreaterThanOrEqual(28);
      expect(s.fontSize).toBeLessThanOrEqual(120);
      expect(s.enterSpeed).toBeGreaterThanOrEqual(0.5);
      expect(s.enterSpeed).toBeLessThanOrEqual(2);
      expect(s.exitSpeed).toBeGreaterThanOrEqual(0.5);
      expect(s.exitSpeed).toBeLessThanOrEqual(2);
      expect(s.durationMs).toBeGreaterThanOrEqual(2000);
      expect(s.durationMs).toBeLessThanOrEqual(6000);
      expect(s.x).toBe(0.5);
      expect([0.5, 0.82, 0.18]).toContain(s.y);
      if (s.category === "Lower Third") expect(s.y).toBe(0.82);
    }
  });

  it("builds a valid OverlayItem for every style, carrying the preset fields", () => {
    for (const s of TITLE_STYLES) {
      const item = makeTitleOverlay(s, 1000, 30000);
      expect(() => OverlayItemSchema.parse(item)).not.toThrow();
      expect(item).toMatchObject({
        kind: "text",
        text: s.text,
        font: s.font,
        fontSize: s.fontSize,
        color: s.color,
        x: s.x,
        y: s.y,
        enterAnim: s.enterAnim,
        enterSpeed: s.enterSpeed,
        exitAnim: s.exitAnim,
        exitSpeed: s.exitSpeed,
        startMs: 1000,
      });
      expect(item.endMs - item.startMs).toBe(s.durationMs);
    }
  });

  it("clamps the window to the video length", () => {
    const style = TITLE_STYLES.find((s) => s.durationMs === 6000)!;
    const nearEnd = makeTitleOverlay(style, 9000, 10000);
    expect(nearEnd.startMs).toBe(9000);
    expect(nearEnd.endMs).toBe(10000);
    expect(nearEnd.endMs).toBeGreaterThan(nearEnd.startMs);
    // a short video still yields a valid window, never past the end
    const short = makeTitleOverlay(style, 0, 1500);
    expect(short.endMs).toBeLessThanOrEqual(1500);
    expect(short.endMs).toBeGreaterThan(short.startMs);
    expect(() => OverlayItemSchema.parse(nearEnd)).not.toThrow();
    expect(() => OverlayItemSchema.parse(short)).not.toThrow();
  });
});
