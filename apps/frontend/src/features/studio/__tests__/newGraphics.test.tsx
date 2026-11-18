import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OVERLAY_SOCIAL_VARIANTS, type OverlayItem } from "@capseasy/shared";
import { NEW_GRAPHICS_FAMILIES, NEW_GRAPHICS_REGISTRY, OverlayView, SOCIAL_META, getNewGraphic } from "@capseasy/compositions";
import { MOTION_TEMPLATES } from "@capseasy/motion";
import { NEW_GRAPHICS_GROUPS, newGraphicsTemplateIds, newGraphicsTemplates } from "../newGraphics";

/**
 * 300 NEW motion graphics (2026-11-18): the owner's correction — none of these
 * reuse a MOTION_TEMPLATES entry. Pins the exact count (15 families x 20), the
 * enum / SOCIAL_META parity the overlay path needs, and — mirroring the
 * compositions picker-preview guard — that EVERY entry renders non-blank AND
 * animating markup through OverlayView, and that every entry's poster frame is
 * visibly distinct from every other entry's (distinct parameterization =
 * distinct entry; no padding with filler).
 */

const POSTER_MS = 2600;

const itemFor = (id: string, text: string, color: string): OverlayItem => ({
  id: `ng-test-${id}`, kind: "social", variant: id as OverlayItem["variant"], text,
  startMs: 0, endMs: 4000, x: 0.5, y: 0.5, scale: 1, rotation: 0, color,
});
const renderAt = (id: string, text: string, color: string, localMs: number) =>
  renderToStaticMarkup(<OverlayView item={itemFor(id, text, color)} sc={1} localMs={localMs} />);

describe("NEW_GRAPHICS_REGISTRY", () => {
  it("has exactly 300 entries: 15 families x 20", () => {
    expect(NEW_GRAPHICS_REGISTRY).toHaveLength(300);
    expect(NEW_GRAPHICS_FAMILIES).toHaveLength(15);
    for (const f of NEW_GRAPHICS_FAMILIES) expect(f.ids, f.id).toHaveLength(20);
    expect(NEW_GRAPHICS_GROUPS).toHaveLength(15);
    for (const g of NEW_GRAPHICS_GROUPS) {
      expect(g.ids, g.id).toHaveLength(20);
      expect(newGraphicsTemplates(g).map((t) => t.id)).toEqual(g.ids);
    }
    expect(newGraphicsTemplateIds()).toHaveLength(300);
    expect(new Set(newGraphicsTemplateIds()).size).toBe(300);
  });

  it("ids are unique, ng-prefixed, and none reuses a MOTION_TEMPLATES entry", () => {
    const ids = NEW_GRAPHICS_REGISTRY.map((e) => e.id);
    expect(new Set(ids).size).toBe(300);
    for (const id of ids) expect(id.startsWith("ng-"), id).toBe(true);
    const motionIds = new Set(MOTION_TEMPLATES.map((t) => t.id));
    expect(motionIds.size).toBe(50);
    for (const id of ids) expect(motionIds.has(id), id).toBe(false);
    for (const id of ids) expect(getNewGraphic(id)?.id, id).toBe(id);
  });

  it("every entry is in the shared variant enum and SOCIAL_META with matching defaults", () => {
    const enumIds = new Set<string>(OVERLAY_SOCIAL_VARIANTS);
    expect(OVERLAY_SOCIAL_VARIANTS).toHaveLength(350);
    expect(SOCIAL_META).toHaveLength(350);
    for (const e of NEW_GRAPHICS_REGISTRY) {
      expect(enumIds.has(e.id), e.id).toBe(true);
      const meta = SOCIAL_META.find((m) => m.id === e.id);
      expect(meta, e.id).toBeDefined();
      expect(meta!.label).toBe(e.title);
      expect(meta!.defaultText).toBe(e.defaultText);
      expect(meta!.defaultColor).toBe(e.defaultColor);
      expect(meta!.hint.length, e.id).toBeGreaterThan(0);
    }
  });

  it("entries are well-formed: known base, hex colour, sane duration, text fits maxLines", () => {
    const bases = new Set(NEW_GRAPHICS_REGISTRY.map((e) => e.base));
    expect([...bases].sort()).toEqual([
      "arrow", "badge", "callout", "chatBubble", "countdown", "counter", "cta",
      "frame", "lowerThird", "poll", "progress", "quote", "rating", "textReveal", "wipe",
    ]);
    for (const e of NEW_GRAPHICS_REGISTRY) {
      expect(e.defaultColor, e.id).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(e.defaultDurationMs, e.id).toBeGreaterThanOrEqual(400);
      expect(e.defaultDurationMs, e.id).toBeLessThanOrEqual(30000);
      expect(e.maxLines, e.id).toBeGreaterThanOrEqual(1);
      expect(e.defaultText.split("\n").length, e.id).toBeLessThanOrEqual(e.maxLines);
      expect(e.title.length, e.id).toBeGreaterThan(0);
      expect(e.defaultText.length, e.id).toBeLessThanOrEqual(500);
      // within a family, no two entries share the same base + params shape
      const siblings = NEW_GRAPHICS_REGISTRY.filter((o) => o.family === e.family && o.id !== e.id);
      for (const s of siblings) {
        expect(JSON.stringify(s.params) === JSON.stringify(e.params) && s.defaultText === e.defaultText, `${e.id} duplicates ${s.id}`).toBe(false);
      }
    }
  });

  it("every entry renders non-blank AND animating markup through OverlayView", () => {
    for (const e of NEW_GRAPHICS_REGISTRY) {
      const render = (t: number) => renderAt(e.id, e.defaultText, e.defaultColor, t);
      for (const t of [150, 1200, 2650, 3900]) {
        const html = render(t);
        expect(html.length, `${e.id} blank at ${t}ms`).toBeGreaterThan(50);
        expect(html, `${e.id} blend mode at ${t}ms`).not.toContain("mix-blend-mode");
      }
      const early = render(350);
      const late = render(2650);
      expect(late, `${e.id} does not animate between 350ms and 2650ms`).not.toBe(early);
    }
  });

  it("every entry's poster frame is visibly distinct from every other entry's", () => {
    const posters = new Map<string, string>();
    for (const e of NEW_GRAPHICS_REGISTRY) {
      posters.set(e.id, renderAt(e.id, e.defaultText, e.defaultColor, POSTER_MS));
    }
    expect(new Set(posters.values()).size).toBe(300);
    const seen = new Map<string, string>();
    for (const [id, html] of posters) {
      const clash = seen.get(html);
      expect(clash, `${id} renders the same poster as ${clash}`).toBeUndefined();
      seen.set(html, id);
    }
  });
});
