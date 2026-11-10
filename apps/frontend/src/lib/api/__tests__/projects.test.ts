import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PROJECT_COLUMNS,
  PROJECT_COLUMNS_WITH_ORG,
  isMissingOrgColumnError,
  normalizeProjectFolder,
  normalizeProjectTags,
  toApiProject,
  withOrgDefaults,
} from "../projects";

/**
 * Stage-C activation plumbing (stageC.ts checklist step 3): the project
 * column list selects `composition_json` and toApiProject maps it onto the
 * API project untouched.
 */
describe("PROJECT_COLUMNS / toApiProject — composition_json (Stage C step 3)", () => {
  it("PROJECT_COLUMNS selects composition_json", () => {
    const cols = PROJECT_COLUMNS.split(",").map((c) => c.trim());
    expect(cols).toContain("composition_json");
  });

  it("toApiProject passes composition_json through untouched", () => {
    const composition = {
      version: 1,
      videoSegments: [{ id: "seg-1", sourceInMs: 0, sourceOutMs: 12_000 }],
      markers: [{ id: "mk-1", atMs: 4_250, label: "Hook lands" }],
      tracks: {
        video: { locked: true, visible: true, muted: false },
        captions: { locked: false, visible: true, muted: false },
        text: { locked: false, visible: true, muted: false },
        graphics: { locked: false, visible: true, muted: false },
      },
    };
    const out = toApiProject({ id: "p1", status: "ready", composition_json: composition });
    expect(out.composition_json).toBe(composition);
    expect(out.status).toBe("COMPLETED"); // status normalisation still applies
  });

  it("toApiProject keeps a null composition_json null (unpromoted project)", () => {
    const out = toApiProject({ id: "p1", status: "ready", composition_json: null });
    expect(out.composition_json).toBeNull();
  });
});

/**
 * A15 folders + tags (slice 8.3): the base column list must NOT name the org
 * columns (every other consumer keeps working before the APPLY file runs),
 * the org variant adds exactly folder + tags, missing-column detection
 * matches the PostgREST shapes, and canonicalisation is shared by create
 * and patch.
 */
describe("A15 project organisation helpers", () => {
  it("PROJECT_COLUMNS does not select folder/tags; the WITH_ORG variant adds exactly them", () => {
    const base = PROJECT_COLUMNS.split(",").map((c) => c.trim());
    expect(base).not.toContain("folder");
    expect(base).not.toContain("tags");
    const org = PROJECT_COLUMNS_WITH_ORG.split(",").map((c) => c.trim());
    expect(org).toEqual([...base, "folder", "tags"]);
  });

  it.each([
    [{ code: "42703", message: "column projects.folder does not exist" }, true],
    [{ code: "PGRST204", message: "Could not find the 'tags' column of 'projects' in the schema cache" }, true],
    [{ code: "42703", message: "column projects.composition_json does not exist" }, false],
    [{ code: "23505", message: "duplicate key value violates unique constraint" }, false],
    [{ code: "PGRST205", message: "Could not find the table 'public.projects' in the schema cache" }, false],
    [null, false],
    [undefined, false],
  ])("isMissingOrgColumnError(%j) === %s", (error, expected) => {
    expect(isMissingOrgColumnError(error)).toBe(expected);
  });

  it("normalizeProjectTags trims, dedupes case-insensitively, drops empties and non-strings, caps at 12", () => {
    expect(normalizeProjectTags([" Hook ", "hook", "", "client", 42, null])).toEqual(["Hook", "client"]);
    expect(normalizeProjectTags(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(12);
    expect(normalizeProjectTags("nope")).toEqual([]);
    expect(normalizeProjectTags(undefined)).toEqual([]);
  });

  it("normalizeProjectFolder trims and maps empty/non-string to null", () => {
    expect(normalizeProjectFolder("  Podcast ")).toBe("Podcast");
    expect(normalizeProjectFolder("   ")).toBeNull();
    expect(normalizeProjectFolder(null)).toBeNull();
    expect(normalizeProjectFolder(7)).toBeNull();
  });

  it("withOrgDefaults fills folder/tags when the columns were not selected, canonicalises when they were", () => {
    expect(withOrgDefaults({ id: "p1" })).toMatchObject({ folder: null, tags: [] });
    expect(withOrgDefaults({ id: "p1", folder: " Pod ", tags: [" A ", "a"] })).toMatchObject({ folder: "Pod", tags: ["A"] });
  });
});
