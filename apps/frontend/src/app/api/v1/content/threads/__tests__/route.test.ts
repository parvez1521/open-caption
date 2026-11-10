// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, makeState, type FakeState, type Row } from "../../__tests__/fake-db";

/**
 * Route tests for /content/threads — list + create. Creating with a context
 * item pins the ownership check: an item id that is not the caller's (or
 * does not exist) is a 404 and no thread is written.
 */

const state = vi.hoisted(() => ({ current: null as unknown as FakeState }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", guest: false, db: fakeDb(state.current) }),
}));

import { GET, POST } from "../route";

const ITEM_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ITEM_ID = "22222222-2222-4222-8222-222222222222";

const thread = (over: Partial<Row> = {}): Row => ({
  id: "thread-1",
  owner_id: "user-1",
  title: "Chat one",
  context_item_id: null,
  created_at: "2026-11-10T05:00:00.000Z",
  updated_at: "2026-11-10T05:00:00.000Z",
  ...over,
});

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/v1/content/threads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  state.current = makeState({
    chat_threads: [
      thread({ id: "thread-old", created_at: "2026-11-09T05:00:00.000Z" }),
      thread({ id: "thread-new", created_at: "2026-11-10T05:00:00.000Z" }),
      thread({ id: "thread-other", owner_id: "user-2" }),
    ],
    content_items: [
      { id: ITEM_ID, owner_id: "user-1", kind: "hook", title: "Mine", body: {}, source: "template", folder: null, project_id: null, created_at: "2026-11-10T05:00:00.000Z", updated_at: "2026-11-10T05:00:00.000Z" },
      { id: OTHER_ITEM_ID, owner_id: "user-2", kind: "hook", title: "Theirs", body: {}, source: "template", folder: null, project_id: null, created_at: "2026-11-10T05:00:00.000Z", updated_at: "2026-11-10T05:00:00.000Z" },
    ],
  });
});

describe("GET /content/threads", () => {
  it("lists only the caller's threads, newest first, ready:true, mapped", async () => {
    const res = await GET(new Request("http://localhost/api/v1/content/threads"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { ready: boolean; threads: Array<Record<string, unknown>> } };
    expect(json.data.ready).toBe(true);
    expect(json.data.threads.map((t) => t.id)).toEqual(["thread-new", "thread-old"]);
    expect(json.data.threads[0]).toMatchObject({ title: "Chat one", contextItemId: null });
  });

  it("answers ready:false with an empty list when the table is missing", async () => {
    state.current.missing = true;
    const res = await GET(new Request("http://localhost/api/v1/content/threads"));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: unknown }).data).toEqual({ ready: false, threads: [] });
  });
});

describe("POST /content/threads", () => {
  it("creates a thread with the default title, 201", async () => {
    const res = await post({});
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toMatchObject({ title: "Untitled chat", contextItemId: null });
    expect(state.current.tables.chat_threads.some((r) => r.owner_id === "user-1" && r.title === "Untitled chat")).toBe(true);
  });

  it("creates a thread anchored to the caller's own item", async () => {
    const res = await post({ title: "About my hook", contextItemId: ITEM_ID });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toMatchObject({ title: "About my hook", contextItemId: ITEM_ID });
  });

  it("404s when the context item is another user's or missing, writing nothing", async () => {
    const before = state.current.tables.chat_threads.length;
    for (const contextItemId of [OTHER_ITEM_ID, "33333333-3333-4333-8333-333333333333"]) {
      const res = await post({ contextItemId });
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: { message: string } }).error.message).toBe("Content item not found");
    }
    expect(state.current.tables.chat_threads).toHaveLength(before);
  });

  it("fails honestly when the tables are missing", async () => {
    state.current.missing = true;
    const res = await post({ title: "x" });
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain("not set up on the server yet");
  });
});
