import { describe, expect, it } from "vitest";
import { OVERLAY_SOCIAL_VARIANTS } from "@capseasy/shared";
// Mirror-check against the real SOCIAL_META (direct file import keeps this
// package's runtime graph light — @capseasy/compositions index pulls Remotion).
import { SOCIAL_META } from "../../compositions/src/social";
import {
  MOTION_CATEGORIES, MOTION_TEMPLATES, MOTION_TEMPLATE_IDS, MotionConfigSchema,
  defaultMotionConfig, filterMotionTemplates, getMotionTemplate, listMotionCategories,
  parseMotionConfig, searchMotionTemplates, sortMotionTemplates,
} from "./index";

describe("motion registry integrity", () => {
  it("has exactly one entry per SOCIAL_META variant, and vice versa", () => {
    expect(MOTION_TEMPLATES).toHaveLength(SOCIAL_META.length);
    expect(new Set(MOTION_TEMPLATE_IDS).size).toBe(MOTION_TEMPLATES.length);
    expect([...MOTION_TEMPLATE_IDS].sort()).toEqual(SOCIAL_META.map((m) => m.id).sort());
    expect([...MOTION_TEMPLATE_IDS].sort()).toEqual([...OVERLAY_SOCIAL_VARIANTS].sort());
  });
  it("defaults mirror SOCIAL_META exactly (no drift)", () => {
    for (const meta of SOCIAL_META) {
      const t = getMotionTemplate(meta.id)!;
      expect(t, meta.id).toBeDefined();
      expect(t.title, meta.id).toBe(meta.label);
      expect(t.defaultText, meta.id).toBe(meta.defaultText);
      expect(t.defaultColor, meta.id).toBe(meta.defaultColor);
    }
  });
  it("categories are valid, descriptions non-empty, fields carry defaults", () => {
    for (const t of MOTION_TEMPLATES) {
      expect(MOTION_CATEGORIES).toContain(t.category);
      expect(t.description.length, t.id).toBeGreaterThan(10);
      expect(t.tags.length, t.id).toBeGreaterThan(0);
      expect(t.defaultDurationMs).toBeGreaterThanOrEqual(400);
      const text = t.fields.find((f) => f.key === "text")!;
      const color = t.fields.find((f) => f.key === "color")!;
      expect(text.defaultValue).toBe(t.defaultText);
      expect(text.maxLines).toBeGreaterThanOrEqual(1);
      expect(color.defaultValue).toBe(t.defaultColor);
      for (const f of t.fields) expect(f.label.length).toBeGreaterThan(0);
    }
    // avatar / image slots exist exactly where the drawing consumes them
    for (const id of ["profile-card", "subscribe-banner", "follow-banner", "dm-popup", "typing-post", "qr-frame", "story-ring"] as const) {
      expect(getMotionTemplate(id)!.fields.some((f) => f.kind === "image"), id).toBe(true);
    }
  });
  it("Wave 1.5 fills the facebook / x / discord parity categories with one entry each", () => {
    expect(MOTION_TEMPLATES).toHaveLength(30);
    const cats = listMotionCategories();
    expect(cats.find((c) => c.category === "facebook")).toEqual({ category: "facebook", count: 1 });
    expect(cats.find((c) => c.category === "x")).toEqual({ category: "x", count: 1 });
    expect(cats.find((c) => c.category === "discord")).toEqual({ category: "discord", count: 1 });
    expect(getMotionTemplate("post-card")).toMatchObject({ category: "facebook", featured: false });
    expect(getMotionTemplate("repost-card")).toMatchObject({ category: "x", featured: false });
    expect(getMotionTemplate("voice-card")).toMatchObject({ category: "discord", featured: false });
    expect(filterMotionTemplates({ category: "facebook" }).map((t) => t.id)).toEqual(["post-card"]);
    expect(filterMotionTemplates({ category: "x" }).map((t) => t.id)).toEqual(["repost-card"]);
    expect(filterMotionTemplates({ category: "discord" }).map((t) => t.id)).toEqual(["voice-card"]);
    // the two post cards wire an avatar image slot; the voice card's member dots are drawn, no slot
    expect(getMotionTemplate("post-card")!.fields.some((f) => f.kind === "image")).toBe(true);
    expect(getMotionTemplate("repost-card")!.fields.some((f) => f.kind === "image")).toBe(true);
    expect(getMotionTemplate("voice-card")!.fields.some((f) => f.kind === "image")).toBe(false);
  });
  it("category counts are derived and sum to the registry size", () => {
    const cats = listMotionCategories();
    expect(cats.reduce((a, c) => a + c.count, 0)).toBe(MOTION_TEMPLATES.length);
    for (const c of cats) expect(c.count).toBe(MOTION_TEMPLATES.filter((t) => t.category === c.category).length);
  });
});

describe("MotionConfig validation", () => {
  it("round-trips defaults for every variant", () => {
    for (const t of MOTION_TEMPLATES) {
      const cfg = defaultMotionConfig(t.id);
      expect(MotionConfigSchema.parse(cfg)).toEqual(cfg);
      expect(parseMotionConfig(JSON.parse(JSON.stringify(cfg))).success).toBe(true);
    }
  });
  it("rejects bad variant, colour and duration", () => {
    const good = defaultMotionConfig("profile-card");
    expect(parseMotionConfig({ ...good, variant: "made-up" }).success).toBe(false);
    expect(parseMotionConfig({ ...good, color: "red" }).success).toBe(false);
    expect(parseMotionConfig({ ...good, color: "#12345" }).success).toBe(false);
    expect(parseMotionConfig({ ...good, durationMs: 10 }).success).toBe(false);
    expect(parseMotionConfig({ ...good, durationMs: 999999 }).success).toBe(false);
    expect(parseMotionConfig({ ...good, text: "x".repeat(501) }).success).toBe(false);
    expect(parseMotionConfig(null).success).toBe(false);
  });
});

describe("search / filter / sort", () => {
  it("filters by query, category and featured deterministically", () => {
    expect(filterMotionTemplates({ category: "instagram" }).every((t) => t.category === "instagram")).toBe(true);
    expect(filterMotionTemplates({ featuredOnly: true }).every((t) => t.featured)).toBe(true);
    expect(filterMotionTemplates({ query: "qr" }).map((t) => t.id)).toContain("qr-frame");
    expect(filterMotionTemplates({ query: "  QR " }).map((t) => t.id)).toEqual(filterMotionTemplates({ query: "qr" }).map((t) => t.id));
    expect(filterMotionTemplates({ query: "zzzz-nope" })).toEqual([]);
    expect(searchMotionTemplates({ query: "title" })).toEqual(searchMotionTemplates({ query: "title" }));
  });
  it("sorts deterministically in every mode without mutating the input", () => {
    const input = filterMotionTemplates();
    const snapshot = [...input];
    for (const mode of ["title", "category", "featured", "recent"] as const) {
      const a = sortMotionTemplates(input, mode);
      expect(a).toEqual(sortMotionTemplates(input, mode));
      expect(a).toHaveLength(input.length);
      expect([...a.map((t) => t.id)].sort()).toEqual([...input.map((t) => t.id)].sort());
    }
    expect(input).toEqual(snapshot);
    const byTitle = sortMotionTemplates(input, "title");
    expect(byTitle.map((t) => t.title)).toEqual([...byTitle.map((t) => t.title)].sort((x, y) => x.localeCompare(y)));
    const recent = sortMotionTemplates(input, "recent");
    expect(recent[0]!.id).toBe(MOTION_TEMPLATES[MOTION_TEMPLATES.length - 1]!.id);
  });
});
