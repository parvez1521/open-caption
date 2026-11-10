// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, makeState, type FakeState, type Row } from "./fake-db";

/**
 * Route tests for /content (the Phase 3 library): list + create, including
 * the honest degradation before APPLY-CONTENT-LIBRARY.sql is run — lists
 * answer ready:false instead of 500ing, writes explain the pending update.
 */

const state = vi.hoisted(() => ({ current: null as unknown as FakeState }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", guest: false, db: fakeDb(state.current) }),
}));

import { GET, POST } from "../route";

const item = (over: Partial<Row> = {}): Row => ({
  id: "item-1",
  owner_id: "user-1",
  kind: "hook",
  title: "A hook",
  body: { text: "Stop scrolling" },
  source: "template",
  folder: null,
  project_id: null,
  created_at: "2026-11-10T05:00:00.000Z",
  updated_at: "2026-11-10T05:00:00.000Z",
  ...over,
});

const get = (qs = "") => GET(new Request(`http://localhost/api/v1/content${qs}`));
const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/v1/content", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  state.current = makeState({
    content_items: [
      item({ id: "item-old", created_at: "2026-11-09T05:00:00.000Z", title: "Older" }),
      item({ id: "item-new", created_at: "2026-11-10T05:00:00.000Z", title: "Newer" }),
      item({ id: "item-idea", kind: "idea", folder: "Fitness", created_at: "2026-11-10T04:00:00.000Z" }),
      item({ id: "item-other", owner_id: "user-2", created_at: "2026-11-10T06:00:00.000Z" }),
    ],
  });
});

describe("GET /content", () => {
  it("lists only the caller's items, newest first, mapped to the API shape, ready:true", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { ready: boolean; items: Array<Record<string, unknown>> } };
    expect(json.data.ready).toBe(true);
    expect(json.data.items.map((i) => i.id)).toEqual(["item-new", "item-idea", "item-old"]);
    expect(json.data.items[0]).toMatchObject({
      kind: "hook",
      title: "Newer",
      body: { text: "Stop scrolling" },
      folder: null,
      projectId: null,
      createdAt: "2026-11-10T05:00:00.000Z",
    });
    expect(json.data.items[0]).not.toHaveProperty("owner_id");
  });

  it("filters by kind and by folder", async () => {
    const byKind = (await (await get("?kind=idea")).json()) as { data: { items: Array<{ id: string }> } };
    expect(byKind.data.items.map((i) => i.id)).toEqual(["item-idea"]);
    const byFolder = (await (await get("?folder=Fitness")).json()) as { data: { items: Array<{ id: string }> } };
    expect(byFolder.data.items.map((i) => i.id)).toEqual(["item-idea"]);
  });

  it("rejects an unknown kind filter with VALIDATION", async () => {
    const res = await get("?kind=bogus");
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("VALIDATION");
  });

  it("answers ready:false with an empty list when the table is missing — no 500", async () => {
    state.current.missing = true;
    const res = await get();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { ready: boolean; items: unknown[] } };
    expect(json.data).toEqual({ ready: false, items: [] });
  });
});

describe("POST /content", () => {
  it("creates an item owned by the caller and returns it mapped, 201", async () => {
    const res = await post({ kind: "script", title: "My script", body: { text: "Hello" }, source: "cloud", folder: "Launch" });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toMatchObject({ kind: "script", title: "My script", source: "cloud", folder: "Launch", projectId: null });
    const stored = state.current.tables.content_items.find((r) => r.kind === "script");
    expect(stored).toMatchObject({ owner_id: "user-1", title: "My script" });
  });

  it("defaults title/body/source when omitted", async () => {
    const res = await post({ kind: "idea" });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toMatchObject({ title: "", body: {}, source: "template" });
  });

  const invalidBodies: Array<[unknown, string]> = [
    [{ kind: "bogus" }, "unknown kind"],
    [{ kind: "hook", title: "x".repeat(201) }, "title over 200 chars"],
    [{ kind: "hook", source: "x".repeat(21) }, "source over 20 chars"],
    [{ kind: "hook", folder: "x".repeat(81) }, "folder over 80 chars"],
    [{ kind: "hook", body: "not-an-object" }, "body not an object"],
    [{ kind: "hook", body: [1, 2] }, "body as an array"],
    [{ kind: "hook", projectId: "not-a-uuid" }, "projectId not a uuid"],
  ];
  for (const [body, label] of invalidBodies) {
    it(`rejects ${label} with VALIDATION and writes nothing`, async () => {
      const before = state.current.inserts.length;
      const res = await post(body);
      expect(res.status).toBe(422);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("VALIDATION");
      expect(state.current.inserts.length).toBe(before);
    });
  }

  it("fails honestly (INTERNAL, pending-setup message) when the table is missing — no raw PostgREST leak", async () => {
    state.current.missing = true;
    const res = await post({ kind: "hook", title: "x" });
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("INTERNAL");
    expect(json.error.message).toContain("not set up on the server yet");
    expect(json.error.message).not.toContain("PGRST");
  });
});
