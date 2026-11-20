// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level tests for GET /projects/:id/studio (AI Edit workflow):
 * the Studio response carries the project's tags so a project flagged
 * "ai-edit" on another device still opens in the AI Edit flow — and when
 * the folders/tags columns do not exist yet, the route falls back to the
 * base columns instead of failing (the A15 pattern from the list route).
 * Database faked at the module boundary, as in the projects PATCH test.
 */

const state = vi.hoisted(() => ({
  userDb: null as unknown,
  projectTags: ["ai-edit"] as string[],
  /** When true, a select naming "tags" fails with the PostgREST missing-column error. */
  tagsColumnMissing: false,
  projectSelects: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", guest: false, db: state.userDb }),
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdmin: () => state.userDb }));
vi.mock("@/lib/api/rateLimit", () => ({ rateLimit: async () => undefined }));
vi.mock("@/lib/api/storage", () => ({ HOUR: 3600, signedGet: async () => null }));
vi.mock("@motion-ai/caption-engine/core", () => ({
  legacyTranscriptToDoc: () => ({ words: [] }),
}));

import { GET } from "../route";

/** Minimal chainable stand-in for the supabase query builder. */
class FakeBuilder {
  private columns = "";
  constructor(private table: string) {}
  select(columns: string) {
    this.columns = columns;
    return this;
  }
  eq() { return this; }
  is() { return this; }
  order() { return this; }
  limit() { return this; }
  not() { return this; }
  async maybeSingle() {
    if (this.table === "projects") {
      state.projectSelects += 1;
      if (this.columns.includes("tags") && state.tagsColumnMissing) {
        return { data: null, error: { code: "PGRST204", message: "Could not find the 'tags' column in the schema cache" } };
      }
      const row: Record<string, unknown> = {
        id: "proj-1", title: "Untitled AI Edit", status: "ready", language: null,
        aspect_ratio: null, look_id: null, template_id: null, style_json: null,
        settings_json: null, composition_json: null, platform: null, updated_at: "2026-11-20T00:00:00.000Z",
      };
      if (this.columns.includes("tags")) row.tags = state.projectTags;
      return { data: row, error: null };
    }
    if (this.table === "videos") return { data: null, error: null };
    if (this.table === "caption_documents") return { data: null, error: null };
    if (this.table === "jobs") return { data: [], error: null };
    if (this.table === "profiles") return { data: { plan: "free", plan_expires_at: null }, error: null };
    if (this.table === "transcripts") return { data: null, error: null };
    return { data: null, error: null };
  }
}

const fakeDb = () => ({ from: (table: string) => new FakeBuilder(table) });

const getStudio = () =>
  GET(
    new Request("http://localhost/api/v1/projects/proj-1/studio", { method: "GET" }),
    { params: Promise.resolve({ id: "proj-1" }) },
  );

beforeEach(() => {
  state.userDb = fakeDb();
  state.projectTags = ["ai-edit"];
  state.tagsColumnMissing = false;
  state.projectSelects = 0;
});

describe("GET /projects/:id/studio — project tags", () => {
  it("returns the project's tags so the Studio can recognise an AI-Edit project", async () => {
    const res = await getStudio();
    const body = (await res.json()) as { success: boolean; data: { project: { tags: string[] } } };
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.project.tags).toEqual(["ai-edit"]);
  });

  it("falls back to the base columns — tags [] — when the folders/tags migration is absent", async () => {
    state.tagsColumnMissing = true;
    const res = await getStudio();
    const body = (await res.json()) as { success: boolean; data: { project: { tags: string[] } } };
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.project.tags).toEqual([]);
    expect(state.projectSelects).toBe(2);
  });
});
