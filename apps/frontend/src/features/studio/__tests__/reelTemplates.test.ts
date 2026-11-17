import { describe, expect, it } from "vitest";
import { MOTION_TEMPLATES } from "@capseasy/motion";
import { OVERLAY_SHAPES, OverlayItemSchema } from "@capseasy/shared";
import { getLook } from "@capseasy/templates";
import {
  REEL_TEMPLATES,
  applyReelTemplate,
  updateReelParam,
} from "../reelTemplates";
import { TITLE_STYLES } from "../titleStyles";

const SHORT_VIDEO_MS = 5000;

describe("REEL_TEMPLATES registry", () => {
  it("has exactly 50 templates with unique ids", () => {
    expect(REEL_TEMPLATES).toHaveLength(50);
    const ids = REEL_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("has 10 templates per category", () => {
    for (const category of ["Hook", "Promo", "Tutorial", "Announcement", "Product & UGC"] as const) {
      expect(REEL_TEMPLATES.filter((t) => t.category === category)).toHaveLength(10);
    }
  });

  it("references only real title styles, motion variants, shapes and looks", () => {
    const titleIds = new Set(TITLE_STYLES.map((s) => s.id));
    const motionIds = new Set(MOTION_TEMPLATES.map((t) => t.id));
    const shapeIds = new Set<string>(OVERLAY_SHAPES);
    for (const t of REEL_TEMPLATES) {
      expect(t.items.length).toBeGreaterThanOrEqual(2);
      expect(t.items.length).toBeLessThanOrEqual(4);
      expect(t.params.length).toBeGreaterThanOrEqual(2);
      expect(t.params.length).toBeLessThanOrEqual(4);
      expect(getLook(t.lookId), `${t.id} look ${t.lookId}`).toBeDefined();
      for (const item of t.items) {
        if (item.kind === "title") expect(titleIds.has(item.titleId), `${t.id} title ${item.titleId}`).toBe(true);
        if (item.kind === "motion") expect(motionIds.has(item.variant), `${t.id} motion ${item.variant}`).toBe(true);
        if (item.kind === "sticker") expect(shapeIds.has(item.shape), `${t.id} shape ${item.shape}`).toBe(true);
      }
      for (const p of t.params) {
        expect(p.target).toBeGreaterThanOrEqual(0);
        expect(p.target).toBeLessThan(t.items.length);
      }
    }
  });

  it("applyReelTemplate output parses under OverlayItemSchema for every template, with clamping", () => {
    for (const t of REEL_TEMPLATES) {
      const applied = applyReelTemplate(t, 1000, SHORT_VIDEO_MS);
      expect(applied.lookId).toBe(t.lookId);
      expect(applied.overlays).toHaveLength(t.items.length);
      expect(applied.paramMap).toHaveLength(t.params.length);
      for (const o of applied.overlays) {
        expect(OverlayItemSchema.safeParse(o).success, `${t.id} overlay ${o.id}`).toBe(true);
        expect(o.startMs).toBeGreaterThanOrEqual(1000);
        expect(o.endMs).toBeLessThanOrEqual(SHORT_VIDEO_MS);
        expect(o.endMs).toBeGreaterThan(o.startMs);
      }
    }
  });

  it("updateReelParam changes only the targeted item's text or colour", () => {
    const template = REEL_TEMPLATES.find((t) => t.id === "hook-stop-scroll")!;
    const applied = applyReelTemplate(template, 0, 30000);
    const before = applied.overlays.map((o) => ({ ...o }));
    const next = updateReelParam(applied.overlays, applied.paramMap, "headline", "NEW HEADLINE");
    expect(next).not.toBe(applied.overlays);
    const targetId = applied.paramMap.find((p) => p.key === "headline")!.overlayId;
    for (let i = 0; i < next.length; i++) {
      if (next[i].id === targetId) expect(next[i].text).toBe("NEW HEADLINE");
      else expect(next[i]).toEqual(before[i]);
    }
    const coloured = updateReelParam(applied.overlays, applied.paramMap, "accent", "#34D399");
    expect(coloured.find((o) => o.id === targetId)?.color).toBe("#34D399");
    expect(coloured.filter((o) => o.id !== targetId)).toEqual(before.filter((o) => o.id !== targetId));
    // unknown key leaves the overlays untouched
    expect(updateReelParam(applied.overlays, applied.paramMap, "nope", "x")).toBe(applied.overlays);
  });
});
