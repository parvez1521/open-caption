// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level tests for PATCH /projects/:id — A15 folder + tags (slice 8.3):
 * the allow-list accepts folder/tags, canonicalises them server-side, and
 * before APPLY-PROJECT-FOLDERS-TAGS.sql runs an org write answers the plain
 * pending message while non-org patches keep working untouched.
 */

const state = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", guest: false, db: (state.current as { db: unknown }).db }),
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdmin: () => (state.current as { db: unknown }).db }));

import { PATCH } from "../route";
import { fakeDb, makeState, type FakeState, type Row } from "../../__tests__/fake-db";

const projectRow = (over: Row = {}): Row => ({
  id: "proj-1",
  owner_id: "user-1",
  title: "My Video",
  description: null,
  status: "CREATED",
  style: null,
  look_id: null,
  template_id: null,
  thumbnail_url: null,
  language: null,
  aspect_ratio: null,
  platform: null,
  archived_at: null,
  deleted_at: null,
  composition_json: null,
  folder: null,
  tags: [],
  created_at: "2026-11-10T06:00:00.000Z",
  updated_at: "2026-11-10T06:00:00.000Z",
  ...over,
});

let fake: FakeState;
const install = (missingOrg = false) => {
  fake = makeState({ projects: [projectRow()] });
  fake.missingOrg = missingOrg;
  state.current = { db: fakeDb(fake) };
};

const patch = (body: unknown) =>
  PATCH(
    new Request("http://localhost/api/v1/projects/proj-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "proj-1" }) },
  );

beforeEach(() => install());

describe("PATCH /projects/:id — folder + tags", () => {
  it("persists folder + tags, canonicalised (trim, dedupe, empty folder → null stays a string here)", async () => {
    const res = await patch({ folder: "  Podcast ", tags: [" Hook ", "hook", "", "client"] });
    expect(res.status).toBe(200);
    expect(fake.updates).toHaveLength(1);
    expect(fake.updates[0]!.row).toMatchObject({ folder: "Podcast", tags: ["Hook", "client"] });
    const json = (await res.json()) as { data: Row };
    expect(json.data).toMatchObject({ folder: "Podcast", tags: ["Hook", "client"] });
  });

  it("clearing the folder stores null and clearing tags stores []", async () => {
    const res = await patch({ folder: null, tags: [] });
    expect(res.status).toBe(200);
    expect(fake.updates[0]!.row).toMatchObject({ folder: null, tags: [] });
  });

  it("an org patch selects the org columns back", async () => {
    await patch({ tags: ["x"] });
    const lastSelect = fake.selects[fake.selects.length - 1]!;
    expect(lastSelect.columns).toContain("folder");
    expect(lastSelect.columns).toContain("tags");
  });

  it("a non-org patch does not select or write the org columns", async () => {
    const res = await patch({ title: "Renamed" });
    expect(res.status).toBe(200);
    expect(fake.updates[0]!.row).not.toHaveProperty("folder");
    const lastSelect = fake.selects[fake.selects.length - 1]!;
    expect(lastSelect.columns).not.toContain("folder");
  });
});

describe("PATCH /projects/:id — missing org columns (APPLY not yet run)", () => {
  beforeEach(() => install(true));

  it("an org write answers the pending message and writes nothing", async () => {
    const res = await patch({ folder: "Podcast", tags: ["hook"] });
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toContain("database update is pending");
    expect(fake.updates).toHaveLength(0);
  });

  it("a non-org patch still works exactly as before", async () => {
    const res = await patch({ title: "Renamed" });
    expect(res.status).toBe(200);
    expect(fake.updates[0]!.row).toMatchObject({ title: "Renamed" });
  });
});
