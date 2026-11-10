// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level tests for GET/POST /projects — A15 folders + tags (slice 8.3):
 * folder/tag filters, create carrying org fields, and the honest
 * degradation before APPLY-PROJECT-FOLDERS-TAGS.sql is run (the list keeps
 * working with org_ready:false; org writes answer the pending message).
 */

const state = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", guest: false, db: (state.current as { db: unknown }).db }),
}));
vi.mock("@/lib/api/rateLimit", () => ({ rateLimit: async () => undefined }));

import { GET, POST } from "../route";
import { fakeDb, makeState, type FakeState, type Row } from "./fake-db";

const projectRow = (over: Row = {}): Row => ({
  id: "proj-x",
  owner_id: "user-1",
  title: "Untitled",
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
const install = (tables: Record<string, Row[]>, missingOrg = false) => {
  fake = makeState(tables);
  fake.missingOrg = missingOrg;
  state.current = { db: fakeDb(fake) };
};

const get = (qs = "") => GET(new Request(`http://localhost/api/v1/projects${qs}`));
const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  install({
    projects: [
      projectRow({ id: "p1", title: "Podcast ep 1", folder: "Podcast", tags: ["hook", "client"] }),
      projectRow({ id: "p2", title: "Podcast ep 2", folder: "Podcast", tags: ["client"] }),
      projectRow({ id: "p3", title: "Loose reel", folder: null, tags: ["hook"] }),
    ],
  });
});

describe("GET /projects — folder/tag filters", () => {
  it("lists everything with folder/tags and org_ready:true when the columns exist", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Row[]; meta: { org_ready: boolean; total: number } };
    expect(json.meta.org_ready).toBe(true);
    expect(json.data).toHaveLength(3);
    expect(json.data[0]).toMatchObject({ folder: "Podcast", tags: ["hook", "client"] });
  });

  it("filters by folder label", async () => {
    const json = (await (await get("?folder=Podcast")).json()) as { data: Row[] };
    expect(json.data.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("filters by the unfiled sentinel", async () => {
    const json = (await (await get("?folder=__unfiled__")).json()) as { data: Row[] };
    expect(json.data.map((p) => p.id)).toEqual(["p3"]);
  });

  it("filters by a single tag (array containment)", async () => {
    const json = (await (await get("?tag=hook")).json()) as { data: Row[] };
    expect(json.data.map((p) => p.id)).toEqual(["p1", "p3"]);
  });

  it("combines folder + tag filters", async () => {
    const json = (await (await get("?folder=Podcast&tag=hook")).json()) as { data: Row[] };
    expect(json.data.map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("GET /projects — missing org columns (APPLY not yet run)", () => {
  beforeEach(() => {
    // The columns do not exist in this scenario, so the stored rows carry
    // no folder/tags keys at all — the base-column select cannot return them.
    const noOrg = (r: Row): Row => {
      const { folder: _f, tags: _t, ...rest } = r;
      return rest;
    };
    install(
      {
        projects: [
          noOrg(projectRow({ id: "p1", title: "Podcast ep 1" })),
          noOrg(projectRow({ id: "p3", title: "Loose reel" })),
        ],
      },
      true,
    );
  });

  it("the list still works: 200, every project, org_ready:false, folder/tags defaulted", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Row[]; meta: { org_ready: boolean } };
    expect(json.meta.org_ready).toBe(false);
    expect(json.data).toHaveLength(2);
    expect(json.data[0]).toMatchObject({ folder: null, tags: [] });
  });

  it("a folder filter before the APPLY does not 500 — the unfiltered list answers with org_ready:false", async () => {
    const res = await get("?folder=Podcast");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Row[]; meta: { org_ready: boolean } };
    expect(json.meta.org_ready).toBe(false);
    expect(json.data).toHaveLength(2);
  });
});

describe("POST /projects — create with org fields", () => {
  it("persists canonicalised folder + tags", async () => {
    const res = await post({ title: "New one", folder: "  Podcast ", tags: [" Hook ", "hook", ""] });
    expect(res.status).toBe(201);
    expect(fake.inserts).toHaveLength(1);
    expect(fake.inserts[0]!.row).toMatchObject({ folder: "Podcast", tags: ["Hook"] });
    const json = (await res.json()) as { data: Row };
    expect(json.data).toMatchObject({ folder: "Podcast", tags: ["Hook"] });
  });

  it("a create without org fields does not touch the org columns", async () => {
    const res = await post({ title: "Plain" });
    expect(res.status).toBe(201);
    expect(fake.inserts[0]!.row).not.toHaveProperty("folder");
    expect(fake.inserts[0]!.row).not.toHaveProperty("tags");
  });

  it("a create naming folder/tags before the APPLY answers the pending message, not a raw error", async () => {
    install({ projects: [] }, true);
    const res = await post({ title: "New one", folder: "Podcast" });
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toContain("database update is pending");
    expect(fake.inserts).toHaveLength(0);
  });

  it("a plain create before the APPLY still works", async () => {
    install({ projects: [] }, true);
    const res = await post({ title: "Plain" });
    expect(res.status).toBe(201);
  });
});
