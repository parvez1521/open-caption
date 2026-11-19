// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

/**
 * MA-A7-005: the app-side half of the DB owner CHECK
 * (supabase/APPLY-A7-002-STORAGE-PATH-PREFIX.sql). The predicates below
 * must match the CHECKs exactly — a path the app writes must always pass
 * them, so applying the migration can never break a legitimate write.
 * The read-gates (studio, download) and the write sites (video register,
 * duplicate, text export, worker complete) all share these helpers.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getAdmin: () => ({}) }));

import { ApiFailure } from "@/lib/api/http";
import {
  assertOwnExportStoragePath,
  assertOwnVideoStoragePath,
  isOwnExportStoragePath,
  isOwnVideoStoragePath,
} from "@/lib/api/storage";

const OWNER = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";

describe("MA-A7-005 — isOwnVideoStoragePath", () => {
  it("accepts a path under the owner's id", () => {
    expect(isOwnVideoStoragePath(`${OWNER}/proj-1/source/vid-1.mp4`, OWNER)).toBe(true);
    expect(isOwnVideoStoragePath(`${OWNER}/proj-1/cloud/vid-1.mp4`, OWNER)).toBe(true);
  });

  it("accepts the local: marker and legacy projects/ paths", () => {
    expect(isOwnVideoStoragePath("local:vid-1", OWNER)).toBe(true);
    expect(isOwnVideoStoragePath("projects/proj-1/video.mp4", OWNER)).toBe(true);
  });

  it("rejects another owner's path", () => {
    expect(isOwnVideoStoragePath(`${OTHER}/proj-9/source/vid-9.mp4`, OWNER)).toBe(false);
  });

  it("rejects a lookalike prefix without the slash (user-1 vs user-12)", () => {
    expect(isOwnVideoStoragePath(`${OWNER}x/proj-1/source/vid-1.mp4`, OWNER)).toBe(false);
  });

  it("rejects an empty path and a bare 'projects' without a slash", () => {
    expect(isOwnVideoStoragePath("", OWNER)).toBe(false);
    expect(isOwnVideoStoragePath("projects", OWNER)).toBe(false);
  });
});

describe("MA-A7-005 — isOwnExportStoragePath", () => {
  it("accepts a path under the owner's id and null (not rendered yet)", () => {
    expect(isOwnExportStoragePath(`${OWNER}/proj-1/exports/exp-1.mp4`, OWNER)).toBe(true);
    expect(isOwnExportStoragePath(null, OWNER)).toBe(true);
  });

  it("rejects another owner's path", () => {
    expect(isOwnExportStoragePath(`${OTHER}/proj-9/exports/exp-9.mp4`, OWNER)).toBe(false);
  });

  it("rejects legacy projects/ paths — exports never used them", () => {
    expect(isOwnExportStoragePath("projects/proj-1/exports/exp-1.mp4", OWNER)).toBe(false);
  });
});

describe("MA-A7-005 — assert wrappers", () => {
  it("assertOwnVideoStoragePath throws INTERNAL on a foreign path, passes on an own one", () => {
    expect(() => assertOwnVideoStoragePath(`${OTHER}/proj-9/source/vid-9.mp4`, OWNER)).toThrowError(ApiFailure);
    try {
      assertOwnVideoStoragePath(`${OTHER}/proj-9/source/vid-9.mp4`, OWNER);
      expect.unreachable();
    } catch (e) {
      expect((e as ApiFailure).code).toBe("INTERNAL");
    }
    expect(() => assertOwnVideoStoragePath(`local:vid-1`, OWNER)).not.toThrow();
  });

  it("assertOwnExportStoragePath throws INTERNAL on a foreign path, passes on null", () => {
    expect(() => assertOwnExportStoragePath(`${OTHER}/proj-9/exports/exp-9.mp4`, OWNER)).toThrowError(ApiFailure);
    expect(() => assertOwnExportStoragePath(null, OWNER)).not.toThrow();
  });
});
