// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, makeState, type FakeState, type Row } from "./fake-db";

/**
 * Route tests for /growth/posts (+ [id] and /import): list + manual create,
 * CSV import stamping, patch/delete ownership, and the honest degradation
 * before APPLY-GROWTH-STUDIO.sql is run — lists answer ready:false instead
 * of 500ing, writes explain the pending update.
 */

const state = vi.hoisted(() => ({ current: null as unknown as FakeState }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", guest: false, db: fakeDb(state.current) }),
}));

import { GET, POST } from "../posts/route";
import { DELETE as DELETE_POST, PATCH } from "../posts/[id]/route";
import { POST as IMPORT } from "../posts/import/route";

const post = (over: Partial<Row> = {}): Row => ({
  id: "post-1",
  owner_id: "user-1",
  platform: "instagram",
  title: "Launch reel",
  post_url: "https://instagram.com/reel/abc",
  posted_at: "2026-02-13T10:30:00.000Z",
  views: 1200,
  reach: 900,
  likes: 80,
  comments: 12,
  shares: 5,
  saves: 20,
  source: "manual",
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
const get = () => GET(new Request("http://localhost/api/v1/growth/posts"));
const create = (body: unknown) => POST(jsonReq("http://localhost/api/v1/growth/posts", "POST", body));
const patch = (id: string, body: unknown) =>
  PATCH(jsonReq(`http://localhost/api/v1/growth/posts/${id}`, "PATCH", body), ctx(id));
const del = (id: string) => DELETE_POST(jsonReq(`http://localhost/api/v1/growth/posts/${id}`, "DELETE"), ctx(id));
const imp = (body: unknown) => IMPORT(jsonReq("http://localhost/api/v1/growth/posts/import", "POST", body));

beforeEach(() => {
  state.current = makeState({
    growth_posts: [
      post({ id: "post-old", posted_at: "2026-02-10T10:30:00.000Z", title: "Older" }),
      post({ id: "post-new", posted_at: "2026-02-13T10:30:00.000Z", title: "Newer" }),
      post({ id: "post-other", owner_id: "user-2", posted_at: "2026-02-14T10:30:00.000Z" }),
    ],
  });
});

describe("GET /growth/posts", () => {
  it("lists only the caller's posts, newest posted first, mapped, ready:true", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { ready: boolean; posts: Array<Record<string, unknown>> } };
    expect(json.data.ready).toBe(true);
    expect(json.data.posts.map((p) => p.id)).toEqual(["post-new", "post-old"]);
    expect(json.data.posts[0]).toMatchObject({
      platform: "instagram",
      title: "Newer",
      postUrl: "https://instagram.com/reel/abc",
      postedAt: "2026-02-13T10:30:00.000Z",
      views: 1200,
      saves: 20,
      source: "manual",
    });
    expect(json.data.posts[0]).not.toHaveProperty("owner_id");
  });

  it("answers ready:false with an empty list when the table is missing — no 500", async () => {
    state.current.missing = true;
    const res = await get();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { ready: boolean; posts: unknown[] } };
    expect(json.data).toEqual({ ready: false, posts: [] });
  });
});

describe("POST /growth/posts", () => {
  it("creates a post owned by the caller, stamps source 'manual', returns it mapped, 201", async () => {
    const res = await create({
      platform: "youtube",
      title: "Short",
      postedAt: "2026-02-13",
      views: "4200",
      likes: 10,
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toMatchObject({
      platform: "youtube",
      title: "Short",
      postedAt: "2026-02-13T00:00:00.000Z",
      views: 4200,
      likes: 10,
      reach: null,
      source: "manual",
    });
    const stored = state.current.tables.growth_posts.find((r) => r.platform === "youtube");
    expect(stored).toMatchObject({ owner_id: "user-1", source: "manual" });
  });

  it("forces source 'manual' even when the body claims 'csv'", async () => {
    const res = await create({ platform: "x", postedAt: "2026-02-13", source: "csv" });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { data: { source: string } }).data.source).toBe("manual");
    expect(state.current.tables.growth_posts.at(-1)).toMatchObject({ source: "manual" });
  });

  it("rejects invalid rows with VALIDATION and writes nothing", async () => {
    const before = state.current.inserts.length;
    for (const body of [
      { postedAt: "2026-02-13" },
      { platform: "x", postedAt: "junk" },
      { platform: "x", postedAt: "2026-02-13", views: -1 },
      { platform: "x", postedAt: "2026-02-13", postUrl: "notaurl" },
    ]) {
      const res = await create(body);
      expect(res.status).toBe(422);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("VALIDATION");
    }
    expect(state.current.inserts.length).toBe(before);
  });

  it("fails honestly (INTERNAL, pending-setup message) when the table is missing", async () => {
    state.current.missing = true;
    const res = await create({ platform: "x", postedAt: "2026-02-13" });
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("INTERNAL");
    expect(json.error.message).toContain("Growth Studio is not set up on the server yet");
    expect(json.error.message).not.toContain("PGRST");
  });
});

describe("POST /growth/posts/import", () => {
  it("imports valid rows stamped 'csv', rejects invalid ones by index, never inserts a partial row", async () => {
    const res = await imp({
      rows: [
        { platform: "instagram", title: "Good", postedAt: "2026-02-13", views: 100, source: "manual" },
        { platform: "", postedAt: "2026-02-13" },
        { platform: "youtube", title: "Also good", postedAt: "2026-02-14", likes: "7" },
        { platform: "x", postedAt: "2026-02-13", views: -3 },
      ],
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { ready: boolean; imported: number; rejected: Array<{ index: number; errors: string[] }> };
    };
    expect(json.data.ready).toBe(true);
    expect(json.data.imported).toBe(2);
    expect(json.data.rejected.map((r) => r.index)).toEqual([1, 3]);
    expect(json.data.rejected[0]!.errors.join(" ")).toContain("platform");
    expect(json.data.rejected[1]!.errors.join(" ")).toContain("views");
    const stored = state.current.tables.growth_posts.filter((r) => r.title === "Good" || r.title === "Also good");
    expect(stored).toHaveLength(2);
    expect(stored.every((r) => r.source === "csv" && r.owner_id === "user-1")).toBe(true);
    expect(stored.find((r) => r.title === "Also good")).toMatchObject({ likes: 7 });
  });

  it("rejects a body with more than 500 rows at the envelope", async () => {
    const res = await imp({ rows: Array.from({ length: 501 }, () => ({ platform: "x", postedAt: "2026-02-13" })) });
    expect(res.status).toBe(422);
  });

  it("fails with the pending-setup message when the table is missing", async () => {
    state.current.missing = true;
    const res = await imp({ rows: [{ platform: "x", postedAt: "2026-02-13" }] });
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toContain("not set up on the server yet");
  });
});

describe("PATCH /growth/posts/[id]", () => {
  it("patches editable fields, owner-scoped, and returns the updated post", async () => {
    const res = await patch("post-new", { title: "Renamed", views: 9999, saves: null });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toMatchObject({ id: "post-new", title: "Renamed", views: 9999, saves: null });
  });

  it("cannot change source — a source in the patch is stripped, the stored source stands", async () => {
    const res = await patch("post-new", { source: "csv", title: "Still manual" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data.source).toBe("manual");
    expect(state.current.tables.growth_posts.find((r) => r.id === "post-new")).toMatchObject({
      source: "manual",
      title: "Still manual",
    });
    expect(state.current.updates.at(-1)!.row).not.toHaveProperty("source");
  });

  it("rejects an invalid metric patch and an empty patch with VALIDATION", async () => {
    expect((await patch("post-new", { views: -1 })).status).toBe(422);
    expect((await patch("post-new", { source: "csv" })).status).toBe(422);
    expect((await patch("post-new", {})).status).toBe(422);
  });

  it("404s for another user's post and for an unknown id", async () => {
    expect((await patch("post-other", { title: "Nope" })).status).toBe(404);
    expect((await patch("nope", { title: "Nope" })).status).toBe(404);
  });

  it("fails honestly when the table is missing", async () => {
    state.current.missing = true;
    const res = await patch("post-new", { title: "x" });
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain("not set up");
  });
});

describe("DELETE /growth/posts/[id]", () => {
  it("deletes the caller's own post", async () => {
    const res = await del("post-new");
    expect(res.status).toBe(200);
    expect(state.current.tables.growth_posts.some((r) => r.id === "post-new")).toBe(false);
  });

  it("404s for another user's post and leaves it stored", async () => {
    const res = await del("post-other");
    expect(res.status).toBe(404);
    expect(state.current.tables.growth_posts.some((r) => r.id === "post-other")).toBe(true);
  });
});
