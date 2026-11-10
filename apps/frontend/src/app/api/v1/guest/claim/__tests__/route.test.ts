// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Dedicated route tests for POST /api/v1/guest/claim (Phase 9 W1 — the
 * named Phase-8 gap: this endpoint previously had NO dedicated tests).
 *
 * The route's contract, as implemented:
 *  - caller must be a signed-in NON-guest (requireUser + guest check);
 *  - the body carries the guest session's tokens, stashed client-side by
 *    rememberGuestForClaim() before sign-in;
 *  - the tokens must resolve (access token, or refresh-token fallback) to
 *    an ANONYMOUS guest user (is_anonymous, no email, no pending email) —
 *    anything else is a silent no-op { moved: 0 }, never a move;
 *  - on proof, every guest-owned row in OWNED moves to the caller and
 *    favorite_looks are merged (union, de-duplicated), then the guest's
 *    favorite rows are removed;
 *  - a second claim is a no-op (idempotent): the guest owns nothing any more.
 */

type Row = Record<string, unknown>;
interface FakeUser {
  id: string;
  is_anonymous?: boolean;
  email?: string | null;
  new_email?: string | null;
}

const OWNED = [
  "projects",
  "videos",
  "transcripts",
  "caption_documents",
  "caption_document_versions",
  "caption_translations",
  "jobs",
  "exports",
  "user_looks",
  "brand_kits",
  "user_fonts",
  "usage_events",
] as const;

const GUEST: FakeUser = { id: "guest-1", is_anonymous: true, email: null, new_email: null };
const CALLER: FakeUser = { id: "user-1", is_anonymous: false, email: "real@example.com", new_email: null };
const OTHER_REAL: FakeUser = { id: "user-2", is_anonymous: false, email: "other@example.com", new_email: null };
/** Anonymous but with a pending signup email — NOT a guest by the shared definition. */
const PENDING: FakeUser = { id: "guest-pending", is_anonymous: true, email: null, new_email: "soon@example.com" };

const state = vi.hoisted(() => ({
  caller: null as unknown as FakeUser & { guest: boolean },
  byAccess: {} as Record<string, FakeUser | null>,
  byRefresh: {} as Record<string, FakeUser | null>,
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  failTables: {} as Record<string, string>,
  rateLimitCalls: [] as string[],
}));

class FakeBuilder {
  private mode: "select" | "update" | "delete" | "upsert" = "select";
  private filters: Array<[string, unknown]> = [];
  private updateRow: Row | null = null;
  private upsertRows: Row[] = [];
  private ignoreDupes = false;

  constructor(private table: string) {}

  select() {
    return this;
  }
  update(row: Row) {
    this.mode = "update";
    this.updateRow = row;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  upsert(rows: Row[], opts?: { ignoreDuplicates?: boolean }) {
    this.mode = "upsert";
    this.upsertRows = rows;
    this.ignoreDupes = !!opts?.ignoreDuplicates;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push([col, val]);
    return this;
  }

  private matches = (row: Row) => this.filters.every(([c, v]) => row[c] === v);
  private rows = () => (state.tables[this.table] ??= []);

  private exec(): { data: unknown; error: unknown } {
    const fail = state.failTables[this.table];
    if (this.mode === "select") {
      return { data: this.rows().filter(this.matches), error: null };
    }
    if (fail) return { data: null, error: { message: fail } };
    if (this.mode === "update") {
      for (const r of this.rows().filter(this.matches)) Object.assign(r, this.updateRow);
      return { data: null, error: null };
    }
    if (this.mode === "delete") {
      state.tables[this.table] = this.rows().filter((r) => !this.matches(r));
      return { data: null, error: null };
    }
    // upsert
    for (const row of this.upsertRows) {
      const dupe = this.rows().some((r) => r.owner_id === row.owner_id && r.look_id === row.look_id);
      if (dupe && this.ignoreDupes) continue;
      if (dupe) Object.assign(this.rows().find((r) => r.owner_id === row.owner_id && r.look_id === row.look_id)!, row);
      else this.rows().push({ ...row });
    }
    return { data: null, error: null };
  }

  then(onOk: (v: { data: unknown; error: unknown }) => unknown, onErr?: (e: unknown) => unknown) {
    return Promise.resolve(this.exec()).then(onOk, onErr);
  }
}

const fakeAdmin = {
  auth: {
    getUser: async (token: string) => ({ data: { user: state.byAccess[token] ?? null }, error: null }),
  },
  from: (table: string) => new FakeBuilder(table),
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({
    id: state.caller.id,
    email: state.caller.email ?? null,
    guest: state.caller.guest,
    db: fakeAdmin,
  }),
}));
vi.mock("@/lib/api/rateLimit", () => ({
  rateLimit: async (subject: string, bucket: string) => {
    state.rateLimitCalls.push(`${bucket}:${subject}`);
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdmin: () => fakeAdmin }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      refreshSession: async ({ refresh_token }: { refresh_token: string }) => ({
        data: { user: state.byRefresh[refresh_token] ?? null, session: null },
        error: null,
      }),
    },
  }),
}));

import { POST } from "../route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/v1/guest/claim", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer caller-token" },
      body: JSON.stringify(body),
    }),
  );

const ownedBy = (table: string, owner: string) => (state.tables[table] ?? []).filter((r) => r.owner_id === owner);

beforeEach(() => {
  state.caller = { ...CALLER, guest: false };
  state.byAccess = { "guest-access-token": GUEST, "real-access-token": OTHER_REAL, "pending-access-token": PENDING };
  state.byRefresh = { "guest-refresh-token": GUEST, "real-refresh-token": OTHER_REAL };
  state.failTables = {};
  state.rateLimitCalls = [];
  state.tables = {};
  for (const t of OWNED) {
    state.tables[t] = [
      { id: `${t}-g1`, owner_id: "guest-1" },
      { id: `${t}-g2`, owner_id: "guest-1" },
      { id: `${t}-mine`, owner_id: "user-1" },
      { id: `${t}-other`, owner_id: "user-2" },
    ];
  }
  state.tables.favorite_looks = [
    { owner_id: "guest-1", look_id: "look-a" },
    { owner_id: "guest-1", look_id: "look-b" },
    { owner_id: "user-1", look_id: "look-b" }, // caller already has this one
    { owner_id: "user-2", look_id: "look-c" },
  ];
});

describe("POST /guest/claim — happy path", () => {
  it("re-owns every guest-owned table to the caller and reports the moved project ids", async () => {
    const res = await post({ accessToken: "guest-access-token", refreshToken: "guest-refresh-token" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { moved: number; projectIds: string[] } };
    expect(json.data.moved).toBe(2);
    expect(json.data.projectIds.sort()).toEqual(["projects-g1", "projects-g2"]);
    for (const t of OWNED) {
      expect(ownedBy(t, "guest-1"), `${t}: guest should own nothing`).toHaveLength(0);
      expect(ownedBy(t, "user-1"), `${t}: caller gains the guest's 2 rows`).toHaveLength(3);
      expect(ownedBy(t, "user-2"), `${t}: third party untouched`).toHaveLength(1);
    }
    expect(state.rateLimitCalls).toEqual(["guest_claim:user-1"]);
  });

  it("merges favorite_looks as a de-duplicated union and clears the guest's rows", async () => {
    const res = await post({ accessToken: "guest-access-token" });
    expect(res.status).toBe(200);
    const mine = ownedBy("favorite_looks", "user-1").map((r) => r.look_id).sort();
    expect(mine).toEqual(["look-a", "look-b"]); // look-b NOT duplicated
    expect(ownedBy("favorite_looks", "guest-1")).toHaveLength(0);
    expect(ownedBy("favorite_looks", "user-2")).toHaveLength(1);
  });

  it("accepts the refresh token when the access token has expired (unknown access token)", async () => {
    const res = await post({ accessToken: "expired-access-token", refreshToken: "guest-refresh-token" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { moved: number } };
    expect(json.data.moved).toBe(2);
    expect(ownedBy("projects", "user-1")).toHaveLength(3);
  });

  it("falls back to the refresh token when the access token belongs to a non-guest", async () => {
    // Access token resolves to a real account (not claimable); the refresh
    // token is the guest's — the guest proof is what authorises the move.
    const res = await post({ accessToken: "real-access-token", refreshToken: "guest-refresh-token" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { moved: number } }).data.moved).toBe(2);
  });
});

describe("POST /guest/claim — rejection / no-op paths (nothing ever moves)", () => {
  it("no-ops when the access token belongs to a non-guest account", async () => {
    const res = await post({ accessToken: "real-access-token" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { moved: number } }).data).toEqual({ moved: 0, projectIds: [] });
    expect(ownedBy("projects", "user-2")).toHaveLength(1);
    expect(ownedBy("projects", "user-1")).toHaveLength(1);
  });

  it("no-ops when the token belongs to an anonymous user with a pending signup email", async () => {
    const res = await post({ accessToken: "pending-access-token" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { moved: number } }).data.moved).toBe(0);
    expect(ownedBy("projects", "guest-pending")).toHaveLength(0); // seeded none; and nothing moved to caller:
    expect(ownedBy("projects", "user-1")).toHaveLength(1);
  });

  it("no-ops for a completely unknown access token and no refresh token", async () => {
    const res = await post({ accessToken: "not-a-real-token" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { moved: number } }).data.moved).toBe(0);
    for (const t of OWNED) expect(ownedBy(t, "guest-1")).toHaveLength(2);
  });

  it("no-ops when the refresh token also belongs to a non-guest", async () => {
    const res = await post({ accessToken: "expired-access-token", refreshToken: "real-refresh-token" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { moved: number } }).data.moved).toBe(0);
    for (const t of OWNED) expect(ownedBy(t, "guest-1")).toHaveLength(2);
  });

  it("refuses a caller who is still a guest (FORBIDDEN) and moves nothing", async () => {
    state.caller = { ...GUEST, guest: true };
    const res = await post({ accessToken: "guest-access-token" });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("FORBIDDEN");
    for (const t of OWNED) expect(ownedBy(t, "guest-1")).toHaveLength(2);
  });

  it("rejects a malformed body with VALIDATION and moves nothing", async () => {
    const res = await post({ accessToken: "short" });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("VALIDATION");
    for (const t of OWNED) expect(ownedBy(t, "guest-1")).toHaveLength(2);
  });
});

describe("POST /guest/claim — double claim / idempotency (pinned true behaviour)", () => {
  it("a second identical claim is a harmless no-op: moved 0, state unchanged", async () => {
    const first = await post({ accessToken: "guest-access-token", refreshToken: "guest-refresh-token" });
    expect(((await first.json()) as { data: { moved: number } }).data.moved).toBe(2);
    const second = await post({ accessToken: "guest-access-token", refreshToken: "guest-refresh-token" });
    expect(second.status).toBe(200);
    expect(((await second.json()) as { data: unknown }).data).toEqual({ moved: 0, projectIds: [] });
    for (const t of OWNED) expect(ownedBy(t, "user-1")).toHaveLength(3);
    expect(ownedBy("favorite_looks", "user-1")).toHaveLength(2);
  });

  it("claiming a guest who owns nothing answers moved 0 (not an error)", async () => {
    for (const t of OWNED) state.tables[t] = state.tables[t]!.filter((r) => r.owner_id !== "guest-1");
    state.tables.favorite_looks = state.tables.favorite_looks!.filter((r) => r.owner_id !== "guest-1");
    const res = await post({ accessToken: "guest-access-token" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: unknown }).data).toEqual({ moved: 0, projectIds: [] });
  });
});

describe("POST /guest/claim — failure handling (pinned true behaviour)", () => {
  it("a failing table update surfaces INTERNAL and names the table; earlier tables stay moved (no rollback — retry completes the rest)", async () => {
    state.failTables = { jobs: "jobs write failed" };
    const res = await post({ accessToken: "guest-access-token" });
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: { code: string; message: string; details?: string } };
    expect(json.error.code).toBe("INTERNAL");
    expect(json.error.details).toContain("jobs");
    // OWNED order: projects…caption_translations moved before jobs failed.
    expect(ownedBy("projects", "user-1")).toHaveLength(3);
    expect(ownedBy("jobs", "guest-1")).toHaveLength(2);
    expect(ownedBy("exports", "guest-1")).toHaveLength(2); // after jobs: untouched
    // Retry after the failure clears: the remainder moves; already-moved rows are untouched.
    state.failTables = {};
    const retry = await post({ accessToken: "guest-access-token" });
    expect(retry.status).toBe(200);
    for (const t of OWNED) expect(ownedBy(t, "guest-1"), `${t} after retry`).toHaveLength(0);
  });
});
