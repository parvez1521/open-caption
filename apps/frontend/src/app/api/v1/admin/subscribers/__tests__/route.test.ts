// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /api/v1/admin/subscribers — the owner's subscriber list.
 *
 * Contract, as implemented:
 * - the caller's email must be in OWNER_EMAILS (comma-separated env);
 *   anyone else — ordinary user, guest, or an unset allowlist — gets 403
 *   (fail closed: with OWNER_EMAILS unset, nobody can export);
 * - no ?format → JSON { total, subscribers }; ?format=csv → a CSV
 *   download (text/csv, attachment, dated filename) with the opt-in flag
 *   on every row.
 */

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  caller: { id: "user-1", email: "owner@example.com", guest: false } as { id: string; email: string | null; guest: boolean },
  rows: [] as Row[],
  rateLimitCalls: [] as string[],
}));

class FakeQuery {
  private sort: { col: string; ascending: boolean } | null = null;
  constructor(private rows: Row[]) {}

  order(col: string, opts?: { ascending?: boolean }) {
    this.sort = { col, ascending: opts?.ascending ?? true };
    return this;
  }

  then(onOk: (v: { data: unknown; error: unknown }) => unknown, onErr?: (e: unknown) => unknown) {
    let out = [...this.rows];
    if (this.sort) {
      const { col, ascending } = this.sort;
      out.sort((a, b) => {
        const av = String(a[col] ?? "");
        const bv = String(b[col] ?? "");
        return ascending ? (av < bv ? -1 : av > bv ? 1 : 0) : av < bv ? 1 : av > bv ? -1 : 0;
      });
    }
    return Promise.resolve({ data: out, error: null }).then(onOk, onErr);
  }
}

const fakeAdmin = {
  from: () => ({ select: () => new FakeQuery(state.rows) }),
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

import { GET } from "../route";

const get = (format?: string) =>
  GET(
    new Request(`http://localhost/api/v1/admin/subscribers${format ? `?format=${format}` : ""}`, {
      headers: { authorization: "Bearer tok" },
    }),
  );

beforeEach(() => {
  vi.stubEnv("OWNER_EMAILS", "owner@example.com, second@example.com");
  state.caller = { id: "user-1", email: "owner@example.com", guest: false };
  state.rows = [
    { email: "a@example.com", marketing_opt_in: true, marketing_opt_in_at: "2026-11-18T10:00:00Z", source: "google", created_at: "2026-11-18T10:00:00Z" },
    { email: "b@example.com", marketing_opt_in: false, marketing_opt_in_at: null, source: "email", created_at: "2026-11-18T09:00:00Z" },
  ];
  state.rateLimitCalls = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /admin/subscribers", () => {
  it("the owner gets the full list as JSON, newest first", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { total: number; subscribers: Array<{ email: string }> } };
    expect(json.data.total).toBe(2);
    expect(json.data.subscribers.map((s) => s.email)).toEqual(["a@example.com", "b@example.com"]);
    expect(state.rateLimitCalls).toEqual(["admin_subscribers:user-1"]);
  });

  it("the owner gets a CSV download with the header and the opt-in flag", async () => {
    const res = await get("csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const day = new Date().toISOString().slice(0, 10);
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="captionit-subscribers-${day}.csv"`);
    const text = await res.text();
    expect(text).toBe(
      "email,marketing_opt_in,marketing_opt_in_at,source,created_at\n" +
        "a@example.com,true,2026-11-18T10:00:00Z,google,2026-11-18T10:00:00Z\n" +
        "b@example.com,false,,email,2026-11-18T09:00:00Z\n",
    );
  });

  it("an ordinary user gets 403", async () => {
    state.caller = { id: "user-2", email: "someone@example.com", guest: false };
    const res = await get();
    expect(res.status).toBe(403);
    expect(state.rows).toHaveLength(2);
  });

  it("a second allowlisted owner address also works", async () => {
    state.caller = { id: "user-3", email: "Second@Example.com", guest: false };
    const res = await get();
    expect(res.status).toBe(200);
  });

  it("with OWNER_EMAILS unset, even the owner gets 403 (fail closed)", async () => {
    vi.stubEnv("OWNER_EMAILS", "");
    const res = await get();
    expect(res.status).toBe(403);
  });
});
