// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

/**
 * Route-level tests for POST /projects/:id/exports/reserve with the
 * database faked at the module boundary. Pins the premium-look gate on
 * the browser-render path (Builder 4): a Free user may not reserve a
 * render for a project that uses a premium look — refused 402 before any
 * minutes are held — while a free look reserves and a paid plan reserves
 * a premium look.
 */

const state = vi.hoisted(() => ({
  userDb: null as unknown,
  adminDb: null as unknown,
  reserves: [] as Array<{ fn: string; args: Record<string, unknown> }>,
}));

vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", guest: false, db: state.userDb }),
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdmin: () => state.adminDb }));

import { POST } from "../route";

const ROWS: Record<string, unknown> = {
  projects: { id: "proj-1", look_id: "look-1", settings_json: {} },
  videos: { duration_ms: 60_000 },
  profiles: { plan: "free" },
};

/** Minimal chainable stand-in for the supabase query builder, as this route uses it. */
class FakeBuilder {
  constructor(private table: string) {}
  select() { return this; }
  eq() { return this; }
  is() { return this; }
  order() { return this; }
  limit() { return this; }
  async maybeSingle() {
    return { data: ROWS[this.table] ?? null, error: null };
  }
}

const fakeDb = () => ({
  from: (table: string) => new FakeBuilder(table),
  rpc: async (fn: string, args: Record<string, unknown>) => {
    if (fn === "reserve_minutes") {
      state.reserves.push({ fn, args });
      return { data: { ok: true, already_reserved: false, reservation_key: `reserve:${args.p_export_id}`, minutes: args.p_minutes, balance: 4 }, error: null };
    }
    if (fn === "get_minutes_balance") {
      return { data: { balance: 4, cycle_start: null, cycle_end: null, granted_in_cycle: 5, free_granted: true }, error: null };
    }
    return { data: null, error: { message: `fake rpc: unknown function ${fn}` } };
  },
});

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/v1/projects/proj-1/exports/reserve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "proj-1" }) },
  );

const BODY = { exportId: "00000000-0000-4000-8000-000000000001", kind: "mp4" };

beforeEach(() => {
  state.userDb = fakeDb();
  state.adminDb = fakeDb();
  state.reserves = [];
  (ROWS.projects as { look_id: string }).look_id = "look-1";
  ROWS.profiles = { plan: "free" };
});

describe("premium-look gate on the reserve endpoint", () => {
  it("a Free user reserving a premium look is refused 402 and holds no minutes", async () => {
    (ROWS.projects as { look_id: string }).look_id = "metal_script";
    const res = await post(BODY);
    expect(res.status).toBe(402);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("LIMIT_EXCEEDED");
    expect(json.error.message).toContain("Pick a free look");
    expect(json.error.message).toContain("upgrade");
    expect(state.reserves).toHaveLength(0);
  });

  it("a Free user reserving a free look gets the reservation", async () => {
    (ROWS.projects as { look_id: string }).look_id = "netflix_sub";
    const res = await post(BODY);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { reservationKey: string; minutes: number; watermark: { text: string } | null } };
    expect(json.data.reservationKey).toBe(`reserve:${BODY.exportId}`);
    expect(json.data.minutes).toBe(1);
    expect(json.data.watermark).toEqual({ text: "Captionit" }); // free without an entitlement
    expect(state.reserves).toHaveLength(1);
  });

  it("a paid plan reserving a premium look gets the reservation, watermark-free", async () => {
    (ROWS.projects as { look_id: string }).look_id = "metal_script";
    ROWS.profiles = { plan: "starter", plan_expires_at: "2026-12-14T00:00:00Z" };
    const res = await post(BODY);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { watermark: { text: string } | null } };
    expect(json.data.watermark).toBeNull();
    expect(state.reserves).toHaveLength(1);
  });

  it("an expired paid period reads as Free, so a premium look is refused", async () => {
    (ROWS.projects as { look_id: string }).look_id = "metal_script";
    ROWS.profiles = { plan: "starter", plan_expires_at: "2026-11-01T00:00:00Z" };
    const res = await post(BODY);
    expect(res.status).toBe(402);
    expect(state.reserves).toHaveLength(0);
  });

  it("a user-saved template look id is never refused", async () => {
    (ROWS.projects as { look_id: string }).look_id = "user:abc123";
    const res = await post(BODY);
    expect(res.status).toBe(201);
    expect(state.reserves).toHaveLength(1);
  });
});
