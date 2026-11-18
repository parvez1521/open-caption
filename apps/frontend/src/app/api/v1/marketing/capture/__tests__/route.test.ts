// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/v1/marketing/capture — the /start hook that records the
 * signed-in account's email on the subscriber list (signup + every login).
 *
 * Contract, as implemented:
 * - guest → 403; account without an email → { captured: false }, 200;
 * - first capture inserts, opted OUT unless user_metadata carries
 *   marketing_opt_in=true (email signup form only — Google carries none);
 * - a re-login refreshes email + source only: an existing opt-in is NEVER
 *   overwritten with false, and marketing_opt_in_at is NEVER touched.
 */

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  caller: { id: "user-1", email: "user@example.com", guest: false } as { id: string; email: string | null; guest: boolean },
  authUserByToken: {} as Record<string, { app_metadata: { provider: string }; user_metadata: Record<string, unknown> } | null>,
  rows: [] as Row[],
  rateLimitCalls: [] as string[],
}));

class FakeQuery {
  private filters: Array<[string, unknown]> = [];
  constructor(
    private rows: Row[],
    private mode: "select" | "update" | "insert",
    private payload?: Row,
  ) {}

  eq(col: string, val: unknown) {
    this.filters.push([col, val]);
    return this;
  }
  order() {
    return this;
  }
  private matches = (row: Row) => this.filters.every(([c, v]) => row[c] === v);

  async maybeSingle() {
    const found = this.rows.filter(this.matches);
    return { data: found[0] ?? null, error: null };
  }

  then(onOk: (v: { data: unknown; error: unknown }) => unknown, onErr?: (e: unknown) => unknown) {
    let res: { data: unknown; error: unknown };
    if (this.mode === "update") {
      for (const r of this.rows.filter(this.matches)) Object.assign(r, this.payload);
      res = { data: null, error: null };
    } else if (this.mode === "insert") {
      const dupe = this.rows.some((r) => r.user_id === this.payload!.user_id || r.email === this.payload!.email);
      if (dupe) res = { data: null, error: { code: "23505", message: "duplicate key value" } };
      else {
        this.rows.push({ ...this.payload });
        res = { data: null, error: null };
      }
    } else {
      res = { data: this.rows.filter(this.matches), error: null };
    }
    return Promise.resolve(res).then(onOk, onErr);
  }
}

const fakeAdmin = {
  auth: {
    getUser: async (token: string) => ({ data: { user: state.authUserByToken[token] ?? null }, error: null }),
  },
  from: () => ({
    select: () => new FakeQuery(state.rows, "select"),
    update: (row: Row) => new FakeQuery(state.rows, "update", row),
    insert: (row: Row) => new FakeQuery(state.rows, "insert", row),
  }),
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({
    id: state.caller.id,
    email: state.caller.email,
    token: "tok",
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

import { POST } from "../route";

const post = () =>
  POST(
    new Request("http://localhost/api/v1/marketing/capture", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer tok" },
      body: JSON.stringify({}),
    }),
  );

const setAuthUser = (provider: string, marketingOptIn?: boolean) => {
  state.authUserByToken = {
    tok: { app_metadata: { provider }, user_metadata: marketingOptIn === undefined ? {} : { marketing_opt_in: marketingOptIn } },
  };
};

beforeEach(() => {
  state.caller = { id: "user-1", email: "user@example.com", guest: false };
  state.rows = [];
  state.rateLimitCalls = [];
  setAuthUser("google");
});

describe("POST /marketing/capture", () => {
  it("inserts a new Google user opted out, with source google", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { captured: boolean; marketingOptIn: boolean } };
    expect(json.data).toEqual({ captured: true, marketingOptIn: false });
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]).toMatchObject({
      user_id: "user-1",
      email: "user@example.com",
      source: "google",
      marketing_opt_in: false,
      marketing_opt_in_at: null,
    });
    expect(state.rateLimitCalls).toEqual(["marketing_capture:user-1"]);
  });

  it("honours a signup-time opt-in on first insert (email signup)", async () => {
    setAuthUser("email", true);
    const res = await post();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { captured: boolean; marketingOptIn: boolean } };
    expect(json.data.marketingOptIn).toBe(true);
    expect(state.rows[0]).toMatchObject({ marketing_opt_in: true, source: "email" });
    expect(state.rows[0]!.marketing_opt_in_at).not.toBeNull();
  });

  it("a re-login keeps an existing opt-in and refreshes only email + source", async () => {
    state.rows.push({
      user_id: "user-1",
      email: "old@example.com",
      source: "email",
      marketing_opt_in: true,
      marketing_opt_in_at: "2026-11-18T08:00:00Z",
      created_at: "2026-11-18T08:00:00Z",
      updated_at: "2026-11-18T08:00:00Z",
    });
    setAuthUser("google");
    const res = await post();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { captured: boolean; marketingOptIn: boolean } };
    expect(json.data.marketingOptIn).toBe(true);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]).toMatchObject({
      email: "user@example.com",
      source: "google",
      marketing_opt_in: true,
      marketing_opt_in_at: "2026-11-18T08:00:00Z",
    });
  });

  it("a re-login never flips an opted-out row back on, even with signup metadata true", async () => {
    state.rows.push({
      user_id: "user-1",
      email: "user@example.com",
      source: "email",
      marketing_opt_in: false,
      marketing_opt_in_at: null,
      created_at: "2026-11-18T08:00:00Z",
      updated_at: "2026-11-18T08:00:00Z",
    });
    setAuthUser("email", true);
    const res = await post();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { captured: boolean; marketingOptIn: boolean } };
    expect(json.data.marketingOptIn).toBe(false);
    expect(state.rows[0]).toMatchObject({ marketing_opt_in: false, marketing_opt_in_at: null });
  });

  it("a guest gets 403 and nothing is stored", async () => {
    state.caller = { id: "guest-1", email: null, guest: true };
    const res = await post();
    expect(res.status).toBe(403);
    expect(state.rows).toHaveLength(0);
  });

  it("an account without an email reports captured false, 200", async () => {
    state.caller = { id: "user-1", email: null, guest: false };
    const res = await post();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { captured: boolean } };
    expect(json.data.captured).toBe(false);
    expect(state.rows).toHaveLength(0);
  });
});
