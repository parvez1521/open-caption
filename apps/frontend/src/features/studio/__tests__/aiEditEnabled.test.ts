import { describe, expect, it } from "vitest";
import { AI_EDIT_ENABLED } from "../aiEditEnabled";

/**
 * Owner order 2026-11-25: AI Edit is hidden — the sidebar entry, the
 * /editor front door, the Dashboard AI Edit section and the Studio
 * "Generate Image/Video" rail section are all gated on this one flag.
 * The panel, the aiEdit*.ts modules and both API routes stay intact;
 * flipping this flag to true restores every entry point (plus the rows
 * the nav, rail and editor-page tests pin as hidden).
 */
describe("AI Edit kill switch", () => {
  it("is off: every AI Edit entry point stays hidden", () => {
    expect(AI_EDIT_ENABLED).toBe(false);
  });
});
