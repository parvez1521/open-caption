// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level tests for POST /videos/:id/sync (step 1: signed upload URL)
 * and POST /videos/:id/sync/confirm (step 2: record the cloud copy).
 * The database and storage are faked at the module boundary. These pin:
 * - the 50 MB platform cap binds on every tier (a 60 MB Starter video is refused);
 * - a video that already plays from the server answers synced:true with no upload;
 * - confirm only records the copy when the object really exists in storage.
 */

const state = vi.hoisted(() => ({
  userDb: null as unknown,
  adminDb: null as unknown,
  video: null as Record<string, unknown> | null,
  profile: null as Record<string, unknown> | null,
  updates: [] as Array<{ table: string; row: Record<string, unknown> }>,
  signedPutCalls: [] as string[],
  objectSizeCalls: [] as string[],
  objectSizeValue: null as number | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", guest: false, db: state.userDb }),
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdmin: () => state.adminDb }));
vi.mock("@/lib/api/rateLimit", () => ({ rateLimit: async () => undefined }));
vi.mock("@/lib/api/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/storage")>();
  return {
    ...actual,
    signedPut: async (path: string) => {
      state.signedPutCalls.push(path);
      return { url: `https://storage.test/upload/${encodeURIComponent(path)}`, token: "tok-1" };
    },
    objectSize: async (path: string) => {
      state.objectSizeCalls.push(path);
      return state.objectSizeValue;
    },
  };
});

import { POST as requestSync } from "../route";
import { POST as confirmSync } from "../confirm/route";

/** Minimal chainable stand-in for the supabase query builder, as these routes use it. */
class FakeBuilder {
  constructor(private table: string) {}
  select() {
    return this;
  }
  eq() {
    return this;
  }
  update(row: Record<string, unknown>) {
    state.updates.push({ table: this.table, row });
    return this;
  }
  async maybeSingle() {
    if (this.table === "videos") return { data: state.video, error: null };
    if (this.table === "profiles") return { data: state.profile, error: null };
    return { data: null, error: null };
  }
  // the confirm route awaits the update chain directly
  then(resolve: (value: { error: null }) => void) {
    resolve({ error: null });
  }
}

const fakeDb = () => ({ from: (table: string) => new FakeBuilder(table) });

const MB = 1024 * 1024;
const localVideo = (over: Record<string, unknown> = {}) => ({
  id: "vid-1",
  project_id: "proj-1",
  storage_path: "local:vid-1",
  cloud_storage_path: null,
  status: "uploaded",
  file_size: 40 * MB,
  mime_type: "video/mp4",
  original_filename: "reel.mp4",
  ...over,
});

const call = (fn: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>) =>
  fn(new Request("http://localhost/api/v1/videos/vid-1/sync", { method: "POST" }), {
    params: Promise.resolve({ id: "vid-1" }),
  });

beforeEach(() => {
  state.userDb = fakeDb() as never;
  state.adminDb = fakeDb() as never;
  state.video = localVideo();
  state.profile = { plan: "free", plan_expires_at: null };
  state.updates = [];
  state.signedPutCalls = [];
  state.objectSizeCalls = [];
  state.objectSizeValue = null;
});

describe("POST /videos/:id/sync — request a cloud copy", () => {
  it("404s for a video the user does not own", async () => {
    state.video = null;
    const res = await call(requestSync);
    expect(res.status).toBe(404);
  });

  it("refuses a video whose upload has not finished", async () => {
    state.video = localVideo({ status: "uploading" });
    const res = await call(requestSync);
    expect(res.status).toBe(409);
    expect(state.signedPutCalls).toHaveLength(0);
  });

  it("refuses a 60 MB video on the free plan (the 50 MB platform cap binds)", async () => {
    state.video = localVideo({ file_size: 60 * MB });
    const res = await call(requestSync);
    expect(res.status).toBe(402);
    const json = (await res.json()) as { error: { code: string; details: { syncCapBytes: number } } };
    expect(json.error.code).toBe("LIMIT_EXCEEDED");
    expect(json.error.details.syncCapBytes).toBe(50 * MB);
    expect(state.signedPutCalls).toHaveLength(0);
  });

  it("refuses a 60 MB video on Starter too — the plan's 200 MB cap does not lift the platform cap", async () => {
    state.profile = { plan: "starter", plan_expires_at: "2026-12-14T00:00:00Z" };
    state.video = localVideo({ file_size: 60 * MB });
    const res = await call(requestSync);
    expect(res.status).toBe(402);
    expect(state.signedPutCalls).toHaveLength(0);
  });

  it("hands back a signed upload URL for a 40 MB local video, at the deterministic cloud path", async () => {
    const res = await call(requestSync);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { synced: boolean; uploadUrl: string; token: string; path: string; syncCapBytes: number } };
    expect(json.data.synced).toBe(false);
    expect(json.data.path).toBe("user-1/proj-1/cloud/vid-1.mp4");
    expect(json.data.uploadUrl).toContain("storage.test");
    expect(json.data.token).toBe("tok-1");
    expect(json.data.syncCapBytes).toBe(50 * MB);
    expect(state.signedPutCalls).toEqual(["user-1/proj-1/cloud/vid-1.mp4"]);
  });

  it("answers synced:true with no upload for an already-synced video", async () => {
    state.video = localVideo({ cloud_storage_path: "user-1/proj-1/cloud/vid-1.mp4" });
    const res = await call(requestSync);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { synced: boolean; path: string } };
    expect(json.data.synced).toBe(true);
    expect(json.data.path).toBe("user-1/proj-1/cloud/vid-1.mp4");
    expect(state.signedPutCalls).toHaveLength(0);
  });

  it("answers synced:true with no upload for an old server upload (already playable cross-device)", async () => {
    state.video = localVideo({ storage_path: "user-1/proj-1/source/vid-1.mp4" });
    const res = await call(requestSync);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { synced: boolean } };
    expect(json.data.synced).toBe(true);
    expect(state.signedPutCalls).toHaveLength(0);
  });

  it("refuses a video with no recorded size (the cap cannot be checked)", async () => {
    state.video = localVideo({ file_size: null });
    const res = await call(requestSync);
    expect(res.status).toBe(409);
    expect(state.signedPutCalls).toHaveLength(0);
  });
});

describe("POST /videos/:id/sync/confirm — record the cloud copy", () => {
  it("404s for a video the user does not own", async () => {
    state.video = null;
    const res = await call(confirmSync);
    expect(res.status).toBe(404);
  });

  it("answers synced:true with no storage check for an already-synced video", async () => {
    state.video = localVideo({ cloud_storage_path: "user-1/proj-1/cloud/vid-1.mp4" });
    const res = await call(confirmSync);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { synced: boolean } };
    expect(json.data.synced).toBe(true);
    expect(state.objectSizeCalls).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it("refuses to record the copy when the object is not in storage", async () => {
    state.objectSizeValue = null;
    const res = await call(confirmSync);
    expect(res.status).toBe(409);
    expect(state.updates).toHaveLength(0);
  });

  it("records the cloud path and timestamp once the object exists", async () => {
    state.objectSizeValue = 40 * MB;
    const res = await call(confirmSync);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { synced: boolean; path: string } };
    expect(json.data.synced).toBe(true);
    expect(json.data.path).toBe("user-1/proj-1/cloud/vid-1.mp4");
    expect(state.objectSizeCalls).toEqual(["user-1/proj-1/cloud/vid-1.mp4"]);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]!.table).toBe("videos");
    expect(state.updates[0]!.row.cloud_storage_path).toBe("user-1/proj-1/cloud/vid-1.mp4");
    expect(state.updates[0]!.row.cloud_synced_at).toBeTruthy();
  });
});
