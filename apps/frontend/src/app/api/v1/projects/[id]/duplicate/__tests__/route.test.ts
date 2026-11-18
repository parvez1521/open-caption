// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PER-05-A: duplicating a project must duplicate its video in a way that
 * resolves. The old route copied storage_path verbatim (`local:<SOURCE id>`)
 * while the insert minted a NEW video id, and dropped cloud_storage_path —
 * so the copy opened videoGone on every device, and re-uploading the file
 * destroyed the copied captions. Now the cloud path carries over and a local
 * path is re-keyed to the copy's own id (the browser copies the on-device
 * bytes to that id, exactly like the clipper flow).
 */

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  db: null as unknown,
  tables: {} as Record<string, Row[]>,
  updates: [] as { table: string; row: Row }[],
  counters: {} as Record<string, number>,
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
  private op: "select" | "insert" | "update" = "select";
  private payload: Row | null = null;
  private inserted: Row | null = null;
  private filters: Array<(r: Row) => boolean> = [];

  constructor(private table: string) {}

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
  order() {
    return this;
  }
  limit() {
    return this;
  }
  insert(row: Row) {
    this.op = "insert";
    this.payload = row;
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

  async single() {
    if (this.op === "insert" && this.payload) {
      const n = (state.counters[this.table] ?? 0) + 1;
      state.counters[this.table] = n;
      const row = { ...this.payload, id: `${this.table}-copy-${n}` };
      (state.tables[this.table] ??= []).push(row);
      this.inserted = row;
      return { data: row, error: null };
    }
    return { data: this.rows()[0] ?? null, error: null };
  }

  async maybeSingle() {
    if (this.op === "update") {
      for (const row of this.rows()) Object.assign(row, this.payload);
      state.updates.push({ table: this.table, row: this.payload ?? {} });
      return { data: null, error: null };
    }
    if (this.op === "insert") return this.single();
    return { data: this.rows()[0] ?? null, error: null };
  }

  then(onOk: (v: { data: unknown; error: unknown }) => unknown, onErr?: (e: unknown) => unknown) {
    return this.maybeSingle().then(onOk, onErr);
  }
}

const fakeDb = () => ({ from: (table: string) => new FakeBuilder(table) });

const seed = (videoOver: Row = {}) => {
  state.tables = {
    projects: [{ id: "proj-1", title: "Client A", deleted_at: null, owner_id: "user-1" }],
    videos: [
      {
        id: "vid-1",
        project_id: "proj-1",
        owner_id: "user-1",
        storage_path: "local:vid-1",
        preview_path: null,
        cloud_storage_path: null,
        status: "ready",
        width: 1280,
        height: 720,
        fps: 30,
        duration_ms: 44_000,
        has_audio: true,
        original_filename: "sandra.mp4",
        mime_type: "video/mp4",
        file_size: 6_000_000,
        rotation: 0,
        ...videoOver,
      },
    ],
    caption_documents: [{ project_id: "proj-1", owner_id: "user-1", doc: { words: [{ text: "hello" }] } }],
  };
};

const call = () =>
  POST(
    new Request("http://localhost/api/v1/projects/proj-1/duplicate", {
      method: "POST",
      headers: { Authorization: "Bearer <redacted>", "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ id: "proj-1" }) } as never,
  );

beforeEach(() => {
  state.tables = {};
  state.updates = [];
  state.counters = {};
  state.db = fakeDb();
  seed();
});

describe("duplicate route — PER-05-A video copy", () => {
  it("re-keys a local: path to the copy's own video id instead of the source id", async () => {
    const res = await call();
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: Record<string, unknown> };
    const videoId = body.data.videoId as string;
    expect(videoId).toBeTruthy();
    expect(videoId).not.toBe("vid-1");
    expect(body.data.sourceVideoId).toBe("vid-1");
    const copies = (state.tables.videos ?? []).filter((v) => v.project_id === (body.data.id as string));
    expect(copies).toHaveLength(1);
    expect(copies[0]!.storage_path).toBe(`local:${videoId}`);
    expect(copies[0]!.id).toBe(videoId);
    // the copied captions travel with the copy
    expect((state.tables.caption_documents ?? []).some((d) => d.project_id === (body.data.id as string))).toBe(true);
  });

  it("carries the cloud path over so a synced copy plays on any device", async () => {
    seed({ cloud_storage_path: "user-1/proj-1/cloud/vid-1.mp4" });
    const res = await call();
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: Record<string, unknown> };
    const copies = (state.tables.videos ?? []).filter((v) => v.project_id === (body.data.id as string));
    expect(copies[0]!.cloud_storage_path).toBe("user-1/proj-1/cloud/vid-1.mp4");
    expect(copies[0]!.storage_path).toBe(`local:${copies[0]!.id}`);
  });

  it("leaves a server (non-local) storage path untouched", async () => {
    seed({ storage_path: "user-1/proj-1/source/vid-1.mp4" });
    const res = await call();
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: Record<string, unknown> };
    const copies = (state.tables.videos ?? []).filter((v) => v.project_id === (body.data.id as string));
    expect(copies[0]!.storage_path).toBe("user-1/proj-1/source/vid-1.mp4");
    expect(state.updates.filter((u) => u.table === "videos")).toHaveLength(0);
  });

  it("still duplicates with no video at all", async () => {
    state.tables.videos = [];
    const res = await call();
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data.videoId).toBeNull();
    expect(body.data.sourceVideoId).toBeNull();
  });
});
