// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Replace-footage route: the video row is updated in place, the cloud copy is
 * cleared so Sync re-uploads, and the caption document is never touched —
 * unlike registering a new video, which deletes the project's captions.
 */

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  db: null as unknown,
  tables: {} as Record<string, Row[]>,
  calls: [] as string[],
  lastUpdate: null as { table: string; row: Row } | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", guest: false, db: state.db }),
}));
vi.mock("@/lib/api/rateLimit", () => ({ rateLimit: async () => undefined }));
vi.mock("@/lib/billing/pricingDisplay", () => ({
  uploadLimitLabel: (n: number) => `${Math.round(n / 1024 / 1024)} MB`,
}));

import { POST } from "../route";

/** Table-aware chainable stand-in for the supabase query builder. */
class FakeBuilder {
  private op: "select" | "update" = "select";
  private payload: Row | null = null;
  private filters: Array<(r: Row) => boolean> = [];

  constructor(private table: string) {
    state.calls.push(table);
  }

  select() {
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  is(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  update(row: Row) {
    this.op = "update";
    this.payload = row;
    return this;
  }

  private rows() {
    return (state.tables[this.table] ?? []).filter((r) => this.filters.every((f) => f(r)));
  }

  async maybeSingle() {
    if (this.op === "update") {
      for (const row of this.rows()) Object.assign(row, this.payload);
      state.lastUpdate = { table: this.table, row: this.payload ?? {} };
      return { data: null, error: null };
    }
    return { data: this.rows()[0] ?? null, error: null };
  }

  then(onOk: (v: { data: unknown; error: unknown }) => unknown, onErr?: (e: unknown) => unknown) {
    return this.maybeSingle().then(onOk, onErr);
  }
}

const fakeDb = () => ({ from: (table: string) => new FakeBuilder(table) });

const seedVideo = (over: Row = {}): Row => {
  const row: Row = {
    id: "vid-1",
    project_id: "proj-1",
    owner_id: "user-1",
    storage_path: "local:vid-1",
    status: "ready",
    original_filename: "old.mp4",
    file_size: 1_000_000,
    duration_ms: 60_000,
    cloud_storage_path: "user-1/proj-1/cloud/vid-1.mp4",
    cloud_synced_at: "2026-11-16T00:00:00.000Z",
    ...over,
  };
  (state.tables.videos ??= []).push(row);
  return row;
};

const call = (videoId: string, body: Row = {}) =>
  POST(
    new Request(`http://localhost/api/v1/videos/${videoId}/replace-footage`, {
      method: "POST",
      headers: { Authorization: "Bearer <redacted>", "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "new-grade.mp4",
        size: 2_000_000,
        mime: "video/mp4",
        probe: { durationMs: 60_500, width: 1080, height: 1920, fps: 30, hasAudio: true },
        ...body,
      }),
    }),
    { params: Promise.resolve({ id: videoId }) } as never,
  );

beforeEach(() => {
  state.tables = {
    videos: [],
    projects: [{ id: "proj-1", deleted_at: null }],
    profiles: [{ id: "user-1", plan: "free", plan_expires_at: null }],
    caption_documents: [{ project_id: "proj-1", doc: { words: [{ text: "hello" }] } }],
  };
  state.calls = [];
  state.lastUpdate = null;
  state.db = fakeDb();
});

describe("POST /videos/:id/replace-footage", () => {
  it("updates the video row in place, clears the cloud copy, and never touches the captions", async () => {
    const video = seedVideo();
    const res = await call("vid-1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { videoId: "vid-1" } });
    expect(video.original_filename).toBe("new-grade.mp4");
    expect(video.file_size).toBe(2_000_000);
    expect(video.duration_ms).toBe(60_500);
    expect(video.cloud_storage_path).toBeNull();
    expect(video.cloud_synced_at).toBeNull();
    // the caption document is untouched — and the route never even queries it
    expect(state.tables.caption_documents).toHaveLength(1);
    expect(state.calls).not.toContain("caption_documents");
    expect(state.tables.videos).toHaveLength(1);
  });

  it("refuses a video uploaded to our servers", async () => {
    seedVideo({ storage_path: "user-1/proj-1/source/vid-1.mp4", cloud_storage_path: null, cloud_synced_at: null });
    const res = await call("vid-1");
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toMatch(/can't be swapped on this device/);
  });

  it("404s for a missing video or a video owned by someone else", async () => {
    const missing = await call("nope");
    expect(missing.status).toBe(404);
    seedVideo({ id: "vid-2", owner_id: "user-2" });
    const others = await call("vid-2");
    expect(others.status).toBe(404);
  });

  it("enforces the plan's size and duration caps", async () => {
    seedVideo();
    const big = await call("vid-1", { size: 5 * 1024 * 1024 * 1024 });
    expect(big.status).toBe(402);
    expect((await big.json()).error.code).toBe("LIMIT_EXCEEDED");
    const long = await call("vid-1", { probe: { durationMs: 301_000, width: 1080, height: 1920 } });
    expect(long.status).toBe(402);
    expect((await long.json()).error.code).toBe("LIMIT_EXCEEDED");
  });

  it("rejects an invalid body", async () => {
    seedVideo();
    const res = await call("vid-1", { size: -1 });
    expect(res.status).toBe(422);
  });
});
