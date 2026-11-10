import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PROJECT_COLUMNS, toApiProject } from "../projects";

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
