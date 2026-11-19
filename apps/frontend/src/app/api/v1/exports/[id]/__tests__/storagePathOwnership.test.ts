// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MA-A7-002: storage paths live on the caller's own row and are
 * owner-writable via direct PostgREST, so the studio and download routes
 * must never sign a path outside the caller's own storage. A forged
 * storage_path naming another owner's object must yield no signed URL.
 */

const state = vi.hoisted(() => ({
  userId: "user-1",
  project: null as Record<string, unknown> | null,
  video: null as Record<string, unknown> | null,
  exp: null as Record<string, unknown> | null,
  signedGetPaths: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: state.userId, guest: false, db: fakeDb() }),
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdmin: () => fakeDb() }));
vi.mock("@/lib/api/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/storage")>();
  return {
    ...actual,
    signedGet: async (path: string) => {
      state.signedGetPaths.push(path);
      return `https://storage.test/signed/${encodeURIComponent(path)}`;
    },
  };
});

const { fakeDb } = vi.hoisted(() => {
  class FakeBuilder {
    constructor(private table: string) {}
    select() {
      return this;
    }
    eq() {
      return this;
    }
    is() {
      return this;
    }
    order() {
      return this;
    }
    limit() {
      return this;
    }
    not() {
      return this;
    }
    async maybeSingle() {
      if (this.table === "projects") return { data: state.project, error: null };
      if (this.table === "videos") return { data: state.video, error: null };
      if (this.table === "exports") return { data: state.exp, error: null };
      if (this.table === "profiles") return { data: { plan: "free", plan_expires_at: null }, error: null };
      return { data: null, error: null };
    }
    then(resolve: (value: { data: unknown[] }) => void) {
      resolve({ data: [] });
    }
  }
  return { fakeDb: () => ({ from: (table: string) => new FakeBuilder(table) }) };
});

import { GET as studioGet } from "@/app/api/v1/projects/[id]/studio/route";
import { GET as downloadGet } from "@/app/api/v1/exports/[id]/download/route";

const call = (
  fn: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>,
  id: string,
) => fn(new Request(`http://localhost/api/v1/x/${id}`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  state.project = { id: "proj-1", title: "Hook cut" };
  state.video = {
    id: "vid-1",
    storage_path: "user-1/proj-1/source/vid-1.mp4",
    preview_path: null,
    cloud_storage_path: null,
    status: "ready",
    file_size: 1000,
  };
  state.exp = {
    id: "exp-1",
    storage_path: "user-1/proj-1/exports/exp-1.mp4",
    status_v2: "ready",
    kind: "mp4",
    project_id: "proj-1",
  };
  state.signedGetPaths = [];
});

describe("MA-A7-002 — forged storage paths", () => {
  it("studio: serves a signed URL for the caller's own path", async () => {
    const res = await call(studioGet, "proj-1");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { video: { url: string | null } } };
    expect(json.data.video.url).toContain("storage.test");
    expect(state.signedGetPaths).toEqual(["user-1/proj-1/source/vid-1.mp4"]);
  });

  it("studio: a storage_path naming another owner's object yields no URL", async () => {
    state.video = { ...state.video, storage_path: "user-2/proj-9/source/vid-9.mp4" };
    const res = await call(studioGet, "proj-1");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { video: { url: string | null } } };
    expect(json.data.video.url).toBeNull();
    expect(state.signedGetPaths).toHaveLength(0);
  });

  it("studio: a legacy projects/ path for another project yields no URL", async () => {
    state.video = { ...state.video, storage_path: "projects/proj-9/video.mp4" };
    const res = await call(studioGet, "proj-1");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { video: { url: string | null } } };
    expect(json.data.video.url).toBeNull();
    expect(state.signedGetPaths).toHaveLength(0);
  });

  it("studio: a legacy projects/ path for this project still plays", async () => {
    state.video = { ...state.video, storage_path: "projects/proj-1/video.mp4" };
    const res = await call(studioGet, "proj-1");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { video: { url: string | null } } };
    expect(json.data.video.url).toContain("storage.test");
  });

  it("download: a storage_path naming another owner's object is a 404 with no signed URL", async () => {
    state.exp = { ...state.exp, storage_path: "user-2/proj-9/exports/exp-9.mp4" };
    const res = await call(downloadGet, "exp-1");
    expect(res.status).toBe(404);
    expect(state.signedGetPaths).toHaveLength(0);
  });

  it("download: the caller's own export still downloads", async () => {
    const res = await call(downloadGet, "exp-1");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { url: string } };
    expect(json.data.url).toContain("storage.test");
  });
});
