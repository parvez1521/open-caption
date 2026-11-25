import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * B-09 (2026-11-15): AiEditPanel.tsx is DELETED — it was dead since the
 * AI Edit removal (no production import; only its own test imported it).
 *
 * Its test file (aiEditPanel.test.tsx) is deleted with it, EXCEPT the
 * "StudioPage" describe block below, which did not test the panel at all:
 * it pins live StudioPage behaviour (the AI Edit preview is gone and
 * exports stay committed-only). Dropping those pins silently would have
 * removed coverage of live behaviour, so they moved here verbatim.
 * aiEdit.ts and its aiEdit.test.ts stay: that file is separate logic,
 * still covered by its own tests (it has no live importer left either —
 * flagged as follow-up dead code, not deleted in this change).
 */

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "__tests__" && entry !== "node_modules") walkFiles(full, out);
    } else if (!full.endsWith(".test.ts") && !full.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("AiEditPanel is gone (B-09)", () => {
  it("the panel file no longer exists", () => {
    expect(existsSync(join(process.cwd(), "src/features/studio/panels/AiEditPanel.tsx"))).toBe(false);
  });

  it("no non-test source file imports or mentions AiEditPanel", () => {
    const offenders = walkFiles(join(process.cwd(), "src")).filter((file) =>
      readFileSync(file, "utf8").includes("AiEditPanel"),
    );
    expect(offenders).toEqual([]);
  });
});

describe("StudioPage — the AI Edit preview is gone and exports stay committed-only (source pins)", () => {
  const src = readFileSync(join(process.cwd(), "src/features/studio/StudioPage.tsx"), "utf8");
  it("the stage takes the committed input (no preview override); the ExportModal takes only the committed render input", () => {
    expect(src).toContain("input={playerInput ?? input}");
    expect(src).not.toContain("previewInput");
    expect(src).toContain("renderInput={exportRenderInput}");
    expect(src).not.toContain("Preview — not applied");
  });
  it("the export input derivation never reads the preview state", () => {
    const region = src.slice(src.indexOf("const exportInput"), src.indexOf("const previewSettings"));
    expect(region.length).toBeGreaterThan(0);
    expect(region).not.toContain("aiEditPreview");
    expect(region).not.toContain("previewInput");
  });
  it("AI Edit is unlinked from StudioPage — no panel, no preview callback, no mode-gated activation", () => {
    expect(src).not.toContain("ai-edit");
    expect(src).not.toContain("AiEditPanel");
    expect(src).not.toContain("onPreviewChange");
    expect(src).not.toContain("aiEditPreview");
    expect(src).not.toContain("aiEditIntroSeen");
    expect(src).not.toContain("markAiEditIntroSeen");
  });
  it("the Generate Image/Video panel branch and the auto-open are gated on AI_EDIT_ENABLED (owner order 2026-11-25)", () => {
    // Hidden, not deleted: the panel file, its branch and the auto-open for
    // blank / server-tagged projects all stay in the source, but none of
    // them can run while the flag is false. Flipping the flag restores them.
    expect(src).toContain("AI_EDIT_ENABLED");
    expect(src).toContain('t === "aiedit" && AI_EDIT_ENABLED');
    expect(src).toContain("AI_EDIT_ENABLED && isAiEditProject(projectId)");
    expect(src).toContain("AI_EDIT_ENABLED && (isAiEditProject(projectId)");
  });
});
