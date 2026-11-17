import { describe, expect, it } from "vitest";
import { MOTION_TEMPLATES, getMotionTemplate } from "@capseasy/motion";
import { MOTION_PACK_GROUPS, motionPackTemplateIds, motionPackTemplates } from "../motionPack";

/**
 * Motion Graphics Pack (2026-11-18): everyday-use curation of the motion registry,
 * grouped by WHAT the graphic is for, not by platform. Pins the six groups and
 * their exact template lists, and that every listed id really exists in the registry.
 */
describe("MOTION_PACK_GROUPS", () => {
  it("has exactly the six everyday-use groups, in order", () => {
    expect(MOTION_PACK_GROUPS.map((g) => g.id)).toEqual([
      "lower-thirds", "callouts", "subscribe-cta", "counters", "text-reveals", "progress",
    ]);
    expect(MOTION_PACK_GROUPS.map((g) => g.title)).toEqual([
      "Lower Thirds", "Callouts", "Subscribe & CTA", "Counters", "Text Reveals", "Progress",
    ]);
  });

  it("lists exactly these templates per group", () => {
    const byId = new Map(MOTION_PACK_GROUPS.map((g) => [g.id, g.ids]));
    expect(byId.get("lower-thirds")).toEqual(["lower-third", "lower-third-bar"]);
    expect(byId.get("callouts")).toEqual(["callout"]);
    expect(byId.get("subscribe-cta")).toEqual(["subscribe-pill", "subscribe-banner", "cursor-subscribe", "follow-banner"]);
    expect(byId.get("counters")).toEqual(["counter", "like-pop"]);
    expect(byId.get("text-reveals")).toEqual(["kinetic-title", "glitch-title", "type-title"]);
    expect(byId.get("progress")).toEqual(["progress-fill", "watch-next"]);
  });

  it("every pack id exists in MOTION_TEMPLATES", () => {
    for (const id of motionPackTemplateIds()) {
      expect(getMotionTemplate(id), id).toBeDefined();
    }
    expect(motionPackTemplateIds()).toHaveLength(14);
  });

  it("groups are non-empty and no id is listed twice", () => {
    for (const group of MOTION_PACK_GROUPS) {
      expect(group.ids.length, group.id).toBeGreaterThan(0);
      expect(new Set(group.ids).size, group.id).toBe(group.ids.length);
      expect(motionPackTemplates(group).map((t) => t.id)).toEqual(group.ids);
    }
    const all = motionPackTemplateIds();
    expect(new Set(all).size).toBe(all.length);
  });

  it("pack ids are a subset of the registry, resolved in group order", () => {
    const registryIds = new Set(MOTION_TEMPLATES.map((t) => t.id));
    for (const id of motionPackTemplateIds()) expect(registryIds.has(id)).toBe(true);
    expect(motionPackTemplates(MOTION_PACK_GROUPS[0]!)[0]!.title).toBe("Lower Third");
    expect(motionPackTemplates(MOTION_PACK_GROUPS[1]!)[0]!.title).toBe("Callout Bubble");
    expect(motionPackTemplates(MOTION_PACK_GROUPS[5]!)[0]!.title).toBe("Progress Fill");
  });
});
