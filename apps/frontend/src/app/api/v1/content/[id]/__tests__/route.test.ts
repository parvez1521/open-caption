// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, makeState, type FakeState, type Row } from "../../__tests__/fake-db";

/**
 * Route tests for /content/:id — PATCH + DELETE, with the ownership rule
 * pinned: another user's item behaves exactly like a missing one (404).
 */

const state = vi.hoisted(() => ({ current: null as unknown as FakeState }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", guest: false, db: fakeDb(state.current) }),
}));

import { DELETE, PATCH } from "../route";

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

const patch = (id: string, body: unknown) =>
  PATCH(
    new Request(`http://localhost/api/v1/content/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

const del = (id: string) =>
  DELETE(new Request(`http://localhost/api/v1/content/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  state.current = makeState({
    content_items: [item(), item({ id: "item-other", owner_id: "user-2", title: "Not yours" })],
  });
});

describe("PATCH /content/:id", () => {
  it("updates the allow-listed fields and returns the mapped item", async () => {
    const res = await patch("item-1", { title: "Renamed", folder: "Fitness", body: { text: "New" }, projectId: null });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toMatchObject({ id: "item-1", title: "Renamed", folder: "Fitness", body: { text: "New" } });
    expect(state.current.tables.content_items.find((r) => r.id === "item-1")!.title).toBe("Renamed");
  });

  it("strips unknown keys — kind and owner_id cannot be rewritten", async () => {
    const res = await patch("item-1", { title: "Still a hook", kind: "script", owner_id: "user-2" });
    expect(res.status).toBe(200);
    const stored = state.current.tables.content_items.find((r) => r.id === "item-1")!;
    expect(stored.kind).toBe("hook");
    expect(stored.owner_id).toBe("user-1");
  });

  it("rejects an empty patch with VALIDATION", async () => {
    const res = await patch("item-1", {});
    expect(res.status).toBe(422);
  });

  it("404s for a missing item and for another user's item alike", async () => {
    for (const id of ["nope", "item-other"]) {
      const res = await patch(id, { title: "x" });
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: { message: string } }).error.message).toBe("Content item not found");
    }
    expect(state.current.tables.content_items.find((r) => r.id === "item-other")!.title).toBe("Not yours");
  });

  it("fails honestly when the table is missing", async () => {
    state.current.missing = true;
    const res = await patch("item-1", { title: "x" });
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain("not set up on the server yet");
  });
});

describe("DELETE /content/:id", () => {
  it("deletes the caller's item", async () => {
    const res = await del("item-1");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { deleted: boolean } }).data.deleted).toBe(true);
    expect(state.current.tables.content_items.map((r) => r.id)).toEqual(["item-other"]);
  });

  it("404s for a missing item and for another user's item alike, deleting nothing", async () => {
    for (const id of ["nope", "item-other"]) {
      const res = await del(id);
      expect(res.status).toBe(404);
    }
    expect(state.current.tables.content_items).toHaveLength(2);
  });
});
