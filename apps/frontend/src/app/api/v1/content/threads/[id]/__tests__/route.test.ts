// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, makeState, type FakeState, type Row } from "../../../__tests__/fake-db";

/**
 * Route tests for /content/threads/:id — GET returns the thread plus its
 * messages oldest first; PATCH renames / re-anchors; DELETE removes.
 * Another user's thread is a 404 on every verb.
 */

const state = vi.hoisted(() => ({ current: null as unknown as FakeState }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", guest: false, db: fakeDb(state.current) }),
}));

import { DELETE, GET, PATCH } from "../route";

const ITEM_ID = "11111111-1111-4111-8111-111111111111";

const thread = (over: Partial<Row> = {}): Row => ({
  id: "thread-1",
  owner_id: "user-1",
  title: "Chat one",
  context_item_id: null,
  created_at: "2026-11-10T05:00:00.000Z",
  updated_at: "2026-11-10T05:00:00.000Z",
  ...over,
});

const message = (over: Partial<Row> = {}): Row => ({
  id: "msg-1",
  thread_id: "thread-1",
  owner_id: "user-1",
  role: "user",
  content: { text: "hi" },
  source: null,
  created_at: "2026-11-10T05:01:00.000Z",
  ...over,
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const get = (id: string) => GET(new Request(`http://localhost/api/v1/content/threads/${id}`), ctx(id));
const patch = (id: string, body: unknown) =>
  PATCH(
    new Request(`http://localhost/api/v1/content/threads/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx(id),
  );
const del = (id: string) =>
  DELETE(new Request(`http://localhost/api/v1/content/threads/${id}`, { method: "DELETE" }), ctx(id));

beforeEach(() => {
  state.current = makeState({
    chat_threads: [thread(), thread({ id: "thread-other", owner_id: "user-2", title: "Not yours" })],
    chat_messages: [
      message({ id: "msg-2", role: "assistant", content: { text: "second" }, source: "cloud", created_at: "2026-11-10T05:02:00.000Z" }),
      message({ id: "msg-1", created_at: "2026-11-10T05:01:00.000Z" }),
      message({ id: "msg-other-thread", thread_id: "thread-other" }),
    ],
    content_items: [
      { id: ITEM_ID, owner_id: "user-1", kind: "hook", title: "Mine", body: {}, source: "template", folder: null, project_id: null, created_at: "2026-11-10T05:00:00.000Z", updated_at: "2026-11-10T05:00:00.000Z" },
    ],
  });
});

describe("GET /content/threads/:id", () => {
  it("returns the thread and its messages oldest first, ready:true, mapped", async () => {
    const res = await get("thread-1");
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { ready: boolean; thread: Record<string, unknown>; messages: Array<Record<string, unknown>> };
    };
    expect(json.data.ready).toBe(true);
    expect(json.data.thread).toMatchObject({ id: "thread-1", title: "Chat one", contextItemId: null });
    expect(json.data.messages.map((m) => m.id)).toEqual(["msg-1", "msg-2"]);
    expect(json.data.messages[1]).toMatchObject({ role: "assistant", content: { text: "second" }, source: "cloud", threadId: "thread-1" });
  });

  it("404s for a missing thread and another user's thread alike", async () => {
    for (const id of ["nope", "thread-other"]) {
      const res = await get(id);
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: { message: string } }).error.message).toBe("Chat thread not found");
    }
  });

  it("answers ready:false (no thread, no messages) when the tables are missing", async () => {
    state.current.missing = true;
    const res = await get("thread-1");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: unknown }).data).toEqual({ ready: false, thread: null, messages: [] });
  });
});

describe("PATCH /content/threads/:id", () => {
  it("renames and re-anchors the thread", async () => {
    const res = await patch("thread-1", { title: "Renamed", contextItemId: ITEM_ID });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toMatchObject({ title: "Renamed", contextItemId: ITEM_ID });
  });

  it("can clear the anchor with an explicit null", async () => {
    state.current.tables.chat_threads[0]!.context_item_id = ITEM_ID;
    const res = await patch("thread-1", { contextItemId: null });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { contextItemId: unknown } }).data.contextItemId).toBeNull();
  });

  it("404s when the new anchor is not the caller's, and for another user's thread", async () => {
    const badAnchor = await patch("thread-1", { contextItemId: "22222222-2222-4222-8222-222222222222" });
    expect(badAnchor.status).toBe(404);
    const notMine = await patch("thread-other", { title: "x" });
    expect(notMine.status).toBe(404);
    expect(state.current.tables.chat_threads.find((r) => r.id === "thread-other")!.title).toBe("Not yours");
  });
});

describe("DELETE /content/threads/:id", () => {
  it("deletes the caller's thread", async () => {
    const res = await del("thread-1");
    expect(res.status).toBe(200);
    expect(state.current.tables.chat_threads.map((r) => r.id)).toEqual(["thread-other"]);
  });

  it("404s for another user's thread, deleting nothing", async () => {
    const res = await del("thread-other");
    expect(res.status).toBe(404);
    expect(state.current.tables.chat_threads).toHaveLength(2);
  });
});
