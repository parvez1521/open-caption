import { describe, expect, it } from "vitest";
import { RAIL_SECTIONS } from "../StudioPage";

/**
 * Owner order 2026-11-15: Clipper is hidden from every user-visible surface,
 * including the editor's left rail. The /clipper and /ai-clipper routes, the
 * Clipper engine and the ClipperLaunchCard component stay live but unlinked;
 * to restore the tab, re-add its entry in RAIL_SECTIONS and its branch in
 * StudioPage's panel registry — nothing else needs to change.
 */
describe("editor left rail", () => {
  it("lists no Clipper section", () => {
    expect(RAIL_SECTIONS.map((s) => s.id)).not.toContain("clipper");
    for (const section of RAIL_SECTIONS) {
      expect(section.label).not.toMatch(/clipper/i);
    }
  });
});
