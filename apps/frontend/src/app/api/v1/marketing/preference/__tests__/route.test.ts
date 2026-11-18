// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET + PATCH /api/v1/marketing/preference — the Settings toggle.
 *
 * Contract, as implemented:
 * - GET with no row → opted out (false, null timestamp); with a row → the row;
 * - PATCH is the ONLY writer of the flag after first capture: it sets the
 *   flag to the body's value and stamps marketing_opt_in_at only on the
 *   FIRST opt-in (opting out keeps the timestamp; opting back in keeps
 *   the first one — never cleared, never overwritten);
 * - PATCH on a missing row inserts it (the toggle works before any capture);
 * - guest → 403; a non-boolean body → 422.
 */

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  caller: { id: "user-1", email: "user@example.com", guest: false } as { id: string; email: string | null; guest: boolean },
  authUserByToken: {} as Record<string, { app_metadata: { provider: string }; user_metadata: Record<string, unknown> } | null>,
  rows: [] as Row[],
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
      this.rows.push({ ...this.payload });
      res = { data: null, error: null };
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
vi.mock("@/lib/api/rateLimit", () => ({ rateLimit: async () => {} }));
vi.mock("@/lib/supabase/admin", () => ({ getAdmin: () => fakeAdmin }));

import { GET, PATCH } from "../route";

const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api/v1/marketing/preference", {
    method,
    headers: { "content-type": "application/json", authorization: "Bearer tok" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  state.caller = { id: "user-1", email: "user@example.com", guest: false };
  state.rows = [];
  state.authUserByToken = { tok: { app_metadata: { provider: "google" }, user_metadata: {} } };
});

describe("GET /marketing/preference", () => {
  it("returns opted out when no row exists yet", async () => {
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown };
    expect(json.data).toEqual({ email: "user@example.com", marketingOptIn: false, marketingOptInAt: null });
  });

  it("returns the stored flag and timestamp", async () => {
    state.rows.push({
      user_id: "user-1",
      email: "user@example.com",
      marketing_opt_in: true,
      marketing_opt_in_at: "2026-11-18T08:00:00Z",
    });
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown };
    expect(json.data).toEqual({ email: "user@example.com", marketingOptIn: true, marketingOptInAt: "2026-11-18T08:00:00Z" });
  });

  it("a guest gets 403", async () => {
    state.caller = { id: "guest-1", email: null, guest: true };
    const res = await GET(req("GET"));
    expect(res.status).toBe(403);
  });
});

describe("PATCH /marketing/preference", () => {
  it("opting in on a missing row inserts it, opted in with a timestamp", async () => {
    const res = await PATCH(req("PATCH", { marketingOptIn: true }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { marketingOptIn: boolean; marketingOptInAt: string | null } };
    expect(json.data.marketingOptIn).toBe(true);
    expect(json.data.marketingOptInAt).not.toBeNull();
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]).toMatchObject({ marketing_opt_in: true, source: "google" });
  });

  it("opting in stamps the first consent time when none exists", async () => {
    state.rows.push({ user_id: "user-1", email: "user@example.com", marketing_opt_in: false, marketing_opt_in_at: null });
    const res = await PATCH(req("PATCH", { marketingOptIn: true }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { marketingOptInAt: string | null } };
    expect(json.data.marketingOptInAt).not.toBeNull();
    expect(state.rows[0]!.marketing_opt_in).toBe(true);
    expect(state.rows[0]!.marketing_opt_in_at).toBe(json.data.marketingOptInAt);
  });

  it("opting out keeps the consent timestamp (never cleared)", async () => {
    state.rows.push({ user_id: "user-1", email: "user@example.com", marketing_opt_in: true, marketing_opt_in_at: "2026-11-18T08:00:00Z" });
    const res = await PATCH(req("PATCH", { marketingOptIn: false }));
    expect(res.status).toBe(200);
    expect(state.rows[0]).toMatchObject({ marketing_opt_in: false, marketing_opt_in_at: "2026-11-18T08:00:00Z" });
  });

  it("opting back in keeps the FIRST consent time (never overwritten)", async () => {
    state.rows.push({ user_id: "user-1", email: "user@example.com", marketing_opt_in: false, marketing_opt_in_at: "2026-11-18T08:00:00Z" });
    const res = await PATCH(req("PATCH", { marketingOptIn: true }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { marketingOptInAt: string | null } };
    expect(json.data.marketingOptInAt).toBe("2026-11-18T08:00:00Z");
    expect(state.rows[0]).toMatchObject({ marketing_opt_in: true, marketing_opt_in_at: "2026-11-18T08:00:00Z" });
  });

  it("a non-boolean body is 422", async () => {
    const res = await PATCH(req("PATCH", { marketingOptIn: "yes" }));
    expect(res.status).toBe(422);
  });

  it("a guest gets 403", async () => {
    state.caller = { id: "guest-1", email: null, guest: true };
    const res = await PATCH(req("PATCH", { marketingOptIn: true }));
    expect(res.status).toBe(403);
  });
});
