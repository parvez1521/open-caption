// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, makeState, type FakeState, type Row } from "../../../../__tests__/fake-db";

/**
 * Route tests for POST /content/threads/:id/messages — appending pins the
 * thread-ownership check (another user's thread → 404, nothing written)
 * and the updated_at touch on the parent thread.
 */

const state = vi.hoisted(() => ({ current: null as unknown as FakeState }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", guest: false, db: fakeDb(state.current) }),
}));

import { POST } from "../route";

const thread = (over: Partial<Row> = {}): Row => ({
  id: "thread-1",
  owner_id: "user-1",
  title: "Chat one",
  context_item_id: null,
  created_at: "2026-11-10T05:00:00.000Z",
  updated_at: "2026-11-10T05:00:00.000Z",
  ...over,
});

const post = (id: string, body: unknown) =>
  POST(
    new Request(`http://localhost/api/v1/content/threads/${id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  state.current = makeState({
    chat_threads: [thread(), thread({ id: "thread-other", owner_id: "user-2" })],
  });
});

describe("POST /content/threads/:id/messages", () => {
  it("appends a message owned by the caller and returns it mapped, 201", async () => {
    const res = await post("thread-1", { role: "assistant", content: { text: "Here is a hook" }, source: "cloud" });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toMatchObject({ threadId: "thread-1", role: "assistant", content: { text: "Here is a hook" }, source: "cloud" });
    const stored = state.current.tables.chat_messages;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ thread_id: "thread-1", owner_id: "user-1", role: "assistant" });
  });

  it("touches the thread's updated_at on append", async () => {
    await post("thread-1", { role: "user", content: { text: "hi" } });
    const touch = state.current.updates.find((u) => u.table === "chat_threads");
    expect(touch).toBeDefined();
    expect(typeof touch!.row.updated_at).toBe("string");
    // The stored row carries exactly the timestamp the touch wrote.
    expect(state.current.tables.chat_threads.find((r) => r.id === "thread-1")!.updated_at).toBe(touch!.row.updated_at);
  });

  it("404s for a missing thread and another user's thread alike, writing nothing", async () => {
    for (const id of ["nope", "thread-other"]) {
      const res = await post(id, { role: "user", content: { text: "hi" } });
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: { message: string } }).error.message).toBe("Chat thread not found");
    }
    expect(state.current.tables.chat_messages).toHaveLength(0);
  });

  const invalidBodies: Array<[unknown, string]> = [
    [{ role: "system", content: { text: "x" } }, "role outside user|assistant"],
    [{ role: "user", content: "plain string" }, "content not an object"],
    [{ role: "user" }, "content missing"],
  ];
  for (const [body, label] of invalidBodies) {
    it(`rejects ${label} with VALIDATION`, async () => {
      const res = await post("thread-1", body);
      expect(res.status).toBe(422);
      expect(state.current.tables.chat_messages).toHaveLength(0);
    });
  }

  it("fails honestly when the tables are missing", async () => {
    state.current.missing = true;
    const res = await post("thread-1", { role: "user", content: { text: "hi" } });
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain("not set up on the server yet");
  });
});
