import { describe, expect, it } from "vitest";
import { RAIL_SECTIONS } from "../StudioPage";

/**
 * Owner order 2026-11-15: Clipper is hidden from every user-visible surface,
 * including the editor's left rail. The /clipper and /ai-clipper routes, the
 * Clipper engine and the ClipperLaunchCard component stay live but unlinked;
 * to restore the tab, re-add its entry in RAIL_SECTIONS and its branch in
 * StudioPage's panel registry — nothing else needs to change.
 *
 * Owner order 2026-11-25: AI Edit is hidden the same way — the
 * "Generate Image/Video" rail section is filtered out of RAIL_SECTIONS
 * while AI_EDIT_ENABLED is false. The AiGeneratePanel file, its panel
 * branch in StudioPage and the AI Edit API routes stay intact; to restore
 * the tab, flip the flag in features/studio/aiEditEnabled.ts and re-add
 * the label pin below.
 */
describe("editor left rail", () => {
  it("lists no Clipper section", () => {
    expect(RAIL_SECTIONS.map((s) => s.id)).not.toContain("clipper");
    for (const section of RAIL_SECTIONS) {
      expect(section.label).not.toMatch(/clipper/i);
    }
  });

  it("lists no Text, Trim, Polish or Assistant section (owner order 2026-11-18)", () => {
    const ids = RAIL_SECTIONS.map((s) => s.id);
    for (const removed of ["text", "trim", "polish", "assistant"] as const) {
      expect(ids).not.toContain(removed);
    }
    for (const section of RAIL_SECTIONS) {
      expect(section.label).not.toMatch(/^(text|trim|polish|assistant)$/i);
    }
  });

  it("lists no AI Edit section (owner order 2026-11-25)", () => {
    expect(RAIL_SECTIONS.map((s) => s.id)).not.toContain("aiedit");
    for (const section of RAIL_SECTIONS) {
      expect(section.label).not.toMatch(/generate image\/video/i);
    }
  });
});
