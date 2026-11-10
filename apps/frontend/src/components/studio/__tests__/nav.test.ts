import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NAV_GROUPS, NAV_ITEMS, isNavActive } from "../nav";

const here = path.dirname(fileURLToPath(import.meta.url));
// src/components/studio/__tests__ -> src/app/(dashboard)/<href>/page.tsx
const dashboardDir = path.resolve(here, "../../../app/(dashboard)");

describe("shell nav config", () => {
  it("has unique ids and hrefs", () => {
    expect(new Set(NAV_ITEMS.map((i) => i.id)).size).toBe(NAV_ITEMS.length);
    expect(new Set(NAV_ITEMS.map((i) => i.href)).size).toBe(NAV_ITEMS.length);
  });

  it("is exactly the approved IA: primary + supporting, in order", () => {
    expect(NAV_ITEMS.map((i) => [i.group, i.label, i.href])).toEqual([
      ["primary", "Dashboard", "/dashboard"],
      ["primary", "Creator Studio", "/create"],
      ["primary", "Caption Studio", "/captions"],
      ["primary", "Video Editor", "/editor"],
      ["primary", "Motion Studio", "/motion"],
      ["primary", "Growth Studio", "/growth"],
      ["primary", "Content Planner", "/planner"],
      ["primary", "Creator Analytics", "/analytics"],
      ["supporting", "Media Library", "/library"],
      ["supporting", "Brand Kit", "/brand"],
      ["supporting", "Clipper", "/clipper"],
      ["supporting", "Reel Analyzer", "/analyzer"],
      ["supporting", "Teleprompter", "/prompter"],
      ["supporting", "Export History", "/exports"],
      ["supporting", "Settings", "/settings"],
    ]);
    // groups partition the flat list without dropping or duplicating an entry
    expect(NAV_GROUPS.flatMap((g) => g.items)).toEqual(NAV_ITEMS);
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(["primary", "supporting"]);
  });

  it("every href maps to a real page directory under src/app", () => {
    for (const item of NAV_ITEMS) {
      const page = path.join(dashboardDir, item.href, "page.tsx");
      expect(existsSync(page), `${item.href} should have a page at ${page}`).toBe(true);
    }
  });

  it("mentions only sections that exist (the Phase-8 pin: Creator Analytics resolved)", () => {
    // Every phase-gated section has now shipped: Content Planner + Teleprompter
    // entered in Phase 7; Creator Analytics — the last honestly-absent entry —
    // entered in Phase 8 when slice 8.1 shipped. The absence list is empty by
    // design; this test now pins the positive half: Analytics is present, in
    // the primary group, and (per the page-existence test above) backed by a
    // real page. If a future section is ever planned-but-unbuilt, it belongs
    // on a new absence list here, NOT in the nav.
    const analytics = NAV_ITEMS.find((i) => i.id === "analytics");
    expect(analytics).toMatchObject({ label: "Creator Analytics", href: "/analytics", group: "primary" });
    const forbidden: string[] = [];
    for (const item of NAV_ITEMS) {
      for (const label of forbidden) {
        expect(item.label).not.toBe(label);
      }
    }
  });

  it("every activeMatch prefix is the href itself or an extra real prefix", () => {
    for (const item of NAV_ITEMS) {
      expect(item.activeMatch.length).toBeGreaterThan(0);
      expect(item.activeMatch).toContain(item.href);
    }
  });
});

describe("isNavActive", () => {
  const byId = (id: string) => NAV_ITEMS.find((i) => i.id === id)!;

  it("matches the exact href", () => {
    expect(isNavActive("/dashboard", byId("dashboard"))).toBe(true);
    expect(isNavActive("/library", byId("library"))).toBe(true);
    expect(isNavActive("/dashboard", byId("library"))).toBe(false);
  });

  it("keeps Video Editor active on per-project editor routes", () => {
    expect(isNavActive("/projects/abc-123", byId("editor"))).toBe(true);
    expect(isNavActive("/projects/abc-123", byId("captions"))).toBe(false);
  });

  it("is segment-aware, not a raw string prefix", () => {
    expect(isNavActive("/dashboard-old", byId("dashboard"))).toBe(false);
    expect(isNavActive("/createx", byId("create"))).toBe(false);
  });
});
