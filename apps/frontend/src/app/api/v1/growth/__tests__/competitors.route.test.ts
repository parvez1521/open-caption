// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, makeState, type FakeState, type Row } from "./fake-db";

/**
 * Route tests for /growth/competitors (+ [id]): list + create validation,
 * patch/delete ownership, and the honest ready:false degradation before
 * APPLY-GROWTH-STUDIO.sql is run.
 */

const state = vi.hoisted(() => ({ current: null as unknown as FakeState }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", guest: false, db: fakeDb(state.current) }),
}));

import { GET, POST } from "../competitors/route";
import { DELETE as DELETE_COMPETITOR, PATCH } from "../competitors/[id]/route";

const profile = (over: Partial<Row> = {}): Row => ({
  id: "comp-1",
  owner_id: "user-1",
  name: "Rival Creator",
  platform: "instagram",
  handle: "@rival",
  notes: "Posts daily at 7pm",
  created_at: "2026-02-13T11:00:00.000Z",
  updated_at: "2026-02-13T11:00:00.000Z",
  ...over,
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const jsonReq = (url: string, method: string, body?: unknown) =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const get = () => GET(new Request("http://localhost/api/v1/growth/competitors"));
const create = (body: unknown) => POST(jsonReq("http://localhost/api/v1/growth/competitors", "POST", body));
const patch = (id: string, body: unknown) =>
  PATCH(jsonReq(`http://localhost/api/v1/growth/competitors/${id}`, "PATCH", body), ctx(id));
const del = (id: string) =>
  DELETE_COMPETITOR(jsonReq(`http://localhost/api/v1/growth/competitors/${id}`, "DELETE"), ctx(id));

beforeEach(() => {
  state.current = makeState({
    competitor_profiles: [
      profile({ id: "comp-old", created_at: "2026-02-10T11:00:00.000Z", name: "Older" }),
      profile({ id: "comp-new", created_at: "2026-02-13T11:00:00.000Z", name: "Newer" }),
      profile({ id: "comp-other", owner_id: "user-2", created_at: "2026-02-14T11:00:00.000Z" }),
    ],
  });
});

describe("GET /growth/competitors", () => {
  it("lists only the caller's profiles, newest first, mapped, ready:true", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { ready: boolean; competitors: Array<Record<string, unknown>> } };
    expect(json.data.ready).toBe(true);
    expect(json.data.competitors.map((c) => c.id)).toEqual(["comp-new", "comp-old"]);
    expect(json.data.competitors[0]).toMatchObject({ name: "Newer", platform: "instagram", handle: "@rival" });
    expect(json.data.competitors[0]).not.toHaveProperty("owner_id");
  });

  it("answers ready:false with an empty list when the table is missing — no 500", async () => {
    state.current.missing = true;
    const res = await get();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { ready: boolean; competitors: unknown[] } };
    expect(json.data).toEqual({ ready: false, competitors: [] });
  });
});

describe("POST /growth/competitors", () => {
  it("creates a profile owned by the caller and returns it mapped, 201", async () => {
    const res = await create({ name: "New Rival", platform: "youtube", handle: "@newrival", notes: "Hooks worth studying" });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toMatchObject({ name: "New Rival", platform: "youtube", handle: "@newrival", notes: "Hooks worth studying" });
    const stored = state.current.tables.competitor_profiles.find((r) => r.name === "New Rival");
    expect(stored).toMatchObject({ owner_id: "user-1" });
  });

  it("defaults platform to '' and handle/notes to null", async () => {
    const res = await create({ name: "Bare" });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toMatchObject({ platform: "", handle: null, notes: null });
  });

  it("normalises an empty handle / notes to null", async () => {
    const res = await create({ name: "Blank fields", handle: "  ", notes: "" });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toMatchObject({ handle: null, notes: null });
  });

  const invalidBodies: Array<[unknown, string]> = [
    [{}, "name missing"],
    [{ name: "" }, "name empty"],
    [{ name: "x".repeat(81) }, "name over 80 chars"],
    [{ name: "Ok", platform: "x".repeat(41) }, "platform over 40 chars"],
    [{ name: "Ok", handle: "x".repeat(81) }, "handle over 80 chars"],
    [{ name: "Ok", notes: "x".repeat(501) }, "notes over 500 chars"],
  ];
  for (const [body, label] of invalidBodies) {
    it(`rejects ${label} with VALIDATION and writes nothing`, async () => {
      const before = state.current.inserts.length;
      const res = await create(body);
      expect(res.status).toBe(422);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("VALIDATION");
      expect(state.current.inserts.length).toBe(before);
    });
  }

  it("fails honestly (INTERNAL, pending-setup message) when the table is missing", async () => {
    state.current.missing = true;
    const res = await create({ name: "Rival" });
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("INTERNAL");
    expect(json.error.message).toContain("Growth Studio is not set up on the server yet");
    expect(json.error.message).not.toContain("PGRST");
  });
});

describe("PATCH /growth/competitors/[id]", () => {
  it("patches editable fields, owner-scoped", async () => {
    const res = await patch("comp-new", { notes: "Updated notes", handle: null });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toMatchObject({ id: "comp-new", notes: "Updated notes", handle: null });
  });

  it("rejects an empty patch and an over-long name with VALIDATION", async () => {
    expect((await patch("comp-new", {})).status).toBe(422);
    expect((await patch("comp-new", { name: "x".repeat(81) })).status).toBe(422);
    expect((await patch("comp-new", { owner_id: "user-2" })).status).toBe(422);
  });

  it("404s for another user's profile", async () => {
    expect((await patch("comp-other", { name: "Nope" })).status).toBe(404);
    expect((await patch("nope", { name: "Nope" })).status).toBe(404);
  });
});

describe("DELETE /growth/competitors/[id]", () => {
  it("deletes the caller's own profile; another user's is a 404 and survives", async () => {
    expect((await del("comp-other")).status).toBe(404);
    expect(state.current.tables.competitor_profiles.some((r) => r.id === "comp-other")).toBe(true);
    expect((await del("comp-new")).status).toBe(200);
    expect(state.current.tables.competitor_profiles.some((r) => r.id === "comp-new")).toBe(false);
  });

  it("fails honestly when the table is missing", async () => {
    state.current.missing = true;
    const res = await del("comp-new");
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain("not set up");
  });
});
