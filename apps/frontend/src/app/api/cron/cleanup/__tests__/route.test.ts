// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /api/cron/cleanup — daily Vercel cron (CRON_SECRET bearer).
 *
 * MA-A7-006: rate_limits rows were never reaped. The cleanup now calls the
 * purge_old_rate_limits RPC (7-day windows) best-effort: the count lands in
 * `rateLimitsPurged`, a failure lands in `rateLimitsPurgeError`, and neither
 * fails the run — the function is PROPOSED (supabase/APPLY-A7-004-...sql),
 * not applied yet, so the call is expected to fail until the owner applies it.
 */

const state = vi.hoisted(() => ({
  purgeResult: { data: 42 as number | null, error: null as { message: string } | null },
  purgeCalls: [] as Array<{ name: string; args: unknown }>,
}));

const fakeAdmin = {
  auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } },
  rpc: async (name: string, args: unknown) => {
    state.purgeCalls.push({ name, args });
    if (name === "purge_old_rate_limits") return { data: state.purgeResult.data, error: state.purgeResult.error };
    if (name === "old_storage_objects") return { data: [], error: null };
    if (name === "user_storage_paths") return { data: [], error: null };
    throw new Error(`unexpected rpc ${name}`);
  },
  storage: { from: () => ({ remove: async () => ({ error: null }) }) },
  from: () => {
    throw new Error("from() should not be called with no stale guests and no old files");
  },
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getAdmin: () => fakeAdmin }));

import { GET } from "../route";

const get = () =>
  GET(
    new Request("http://localhost/api/cron/cleanup", {
      headers: { authorization: "Bearer s3cr3t" },
    }),
  );

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "s3cr3t");
  state.purgeResult = { data: 42, error: null };
  state.purgeCalls = [];
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/cron/cleanup — rate_limits purge (MA-A7-006)", () => {
  it("calls purge_old_rate_limits(7) and reports the purged count", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; rateLimitsPurged: number | null; rateLimitsPurgeError: string | null };
    expect(json.ok).toBe(true);
    expect(state.purgeCalls).toContainEqual({ name: "purge_old_rate_limits", args: { p_days: 7 } });
    expect(json.rateLimitsPurged).toBe(42);
    expect(json.rateLimitsPurgeError).toBeNull();
  });

  it("a failed purge (function not applied yet) is recorded, not fatal", async () => {
    state.purgeResult = { data: null, error: { message: 'function public.purge_old_rate_limits(integer) does not exist' } };
    const res = await get();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; failures: string[]; rateLimitsPurged: number | null; rateLimitsPurgeError: string | null };
    expect(json.ok).toBe(true);
    expect(json.failures).toEqual([]);
    expect(json.rateLimitsPurged).toBeNull();
    expect(json.rateLimitsPurgeError).toContain("does not exist");
  });

  it("rejects without the cron secret", async () => {
    const res = await GET(new Request("http://localhost/api/cron/cleanup"));
    expect(res.status).toBe(401);
  });
});
