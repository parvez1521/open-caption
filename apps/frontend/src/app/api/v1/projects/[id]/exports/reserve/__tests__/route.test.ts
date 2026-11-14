// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

/**
 * Route-level tests for POST /projects/:id/exports/reserve with the
 * database faked at the module boundary. Pins the premium-look gate on
 * the browser-render path (Builder 4): a Free user may not reserve a
 * render for a project that uses a premium look — refused 402 before any
 * minutes are held — while a free look reserves and a paid plan reserves
 * a premium look. Plus the free-trial gate (Builder 5): guests get no
 * trial minutes, and a second account on an IP that already used the
 * trial is challenged.
 */

const state = vi.hoisted(() => ({
  guest: false,
  email: "user@example.com" as string | null,
  emailVerified: true as boolean | undefined,
  userDb: null as unknown,
  adminDb: null as unknown,
  reserves: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  ipHashes: new Set<string>(),
}));

vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", guest: state.guest, email: state.email, emailVerified: state.emailVerified, db: state.userDb }),
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
    if (fn === "trial_ip_status") {
      const hash = args.p_ip_hash as string;
      const claimed = state.ipHashes.has(hash);
      return { data: { claimed, account_count: claimed ? 1 : 0, trial_granted_at: claimed ? new Date().toISOString() : null }, error: null };
    }
    if (fn === "trial_ip_claim") {
      const hash = args.p_ip_hash as string;
      const already = state.ipHashes.has(hash);
      state.ipHashes.add(hash);
      return { data: { claimed: true, already_claimed: already, account_count: already ? 2 : 1 }, error: null };
    }
    return { data: null, error: { message: `fake rpc: unknown function ${fn}` } };
  },
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost/api/v1/projects/proj-1/exports/reserve", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "proj-1" }) },
  );

const BODY = { exportId: "00000000-0000-4000-8000-000000000001", kind: "mp4" };

beforeEach(() => {
  state.guest = false;
  state.email = "user@example.com";
  state.emailVerified = true;
  state.userDb = fakeDb();
  state.adminDb = fakeDb();
  state.reserves = [];
  state.ipHashes = new Set<string>();
  (ROWS.projects as { look_id: string }).look_id = "look-1";
  ROWS.profiles = { plan: "free" };
  vi.stubEnv("TRIAL_IP_HASH_SECRET", "test-trial-secret-that-is-long-enough");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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

describe("MOV export — a paid plan feature on the reserve endpoint", () => {
  const movBody = { ...BODY, kind: "mov_alpha" as const };

  it("a Free user reserving mov_alpha is refused 402 and holds no minutes", async () => {
    const res = await post(movBody);
    expect(res.status).toBe(402);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("LIMIT_EXCEEDED");
    expect(json.error.message).toBe("MOV export is a paid plan feature.");
    expect(state.reserves).toHaveLength(0);
  });

  it.each(["starter", "creator", "pro"])("a paid plan (%s) reserving mov_alpha gets the reservation", async (plan) => {
    ROWS.profiles = { plan, plan_expires_at: "2026-12-14T00:00:00Z" };
    const res = await post(movBody);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { reservationKey: string; minutes: number } };
    expect(json.data.reservationKey).toBe(`reserve:${BODY.exportId}`);
    expect(json.data.minutes).toBe(1);
    expect(state.reserves).toHaveLength(1);
  });

  it("an expired paid period reads as Free, so mov_alpha is refused", async () => {
    ROWS.profiles = { plan: "starter", plan_expires_at: "2026-11-01T00:00:00Z" };
    const res = await post(movBody);
    expect(res.status).toBe(402);
    expect(state.reserves).toHaveLength(0);
  });

  it("a Free user reserving mp4 or webm_alpha is unaffected by this gate", async () => {
    expect((await post({ ...BODY, kind: "mp4" })).status).toBe(201);
    expect((await post({ ...BODY, kind: "webm_alpha" })).status).toBe(201);
    expect(state.reserves).toHaveLength(2);
  });
});

describe("free-trial protection — the gate in front of the lazy Free grant (Builder 5)", () => {
  const IP_HEADERS = { "x-forwarded-for": "203.0.113.7" };

  it("a guest gets no trial minutes: the reserve is refused with the signup response", async () => {
    state.guest = true;
    const res = await post(BODY, IP_HEADERS);
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string; message: string; details?: { signupRequired?: boolean } } };
    expect(json.error.code).toBe("FORBIDDEN");
    expect(json.error.message).toContain("free account");
    expect(json.error.details?.signupRequired).toBe(true);
    expect(state.reserves).toHaveLength(0);
  });

  it("a Free user from a fresh IP reserves, and the trial hash is claimed", async () => {
    (ROWS.projects as { look_id: string }).look_id = "netflix_sub";
    const res = await post(BODY, IP_HEADERS);
    expect(res.status).toBe(201);
    expect(state.ipHashes.size).toBe(1);
    expect(state.reserves).toHaveLength(1);
  });

  it("a second account on the same IP is refused 402 with the trial challenge, and holds no minutes", async () => {
    (ROWS.projects as { look_id: string }).look_id = "netflix_sub";
    expect((await post(BODY, IP_HEADERS)).status).toBe(201);
    const res = await post(BODY, IP_HEADERS);
    expect(res.status).toBe(402);
    const json = (await res.json()) as { error: { code: string; message: string; details?: { trialChallenge?: boolean } } };
    expect(json.error.code).toBe("LIMIT_EXCEEDED");
    expect(json.error.message).toContain("already used the free trial");
    expect(json.error.details?.trialChallenge).toBe(true);
    expect(state.reserves).toHaveLength(1);
  });

  it("the second account earns the trial with a verified Turnstile token", async () => {
    (ROWS.projects as { look_id: string }).look_id = "netflix_sub";
    expect((await post(BODY, IP_HEADERS)).status).toBe(201);
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ success: true }) })));
    const res = await post(BODY, { ...IP_HEADERS, "x-turnstile-token": "token-1" });
    expect(res.status).toBe(201);
    expect(state.reserves).toHaveLength(2);
  });

  it("an unverified email gets no trial: 403 before any reserve", async () => {
    (ROWS.projects as { look_id: string }).look_id = "netflix_sub";
    state.emailVerified = false;
    const res = await post(BODY, IP_HEADERS);
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("FORBIDDEN");
    expect(json.error.message).toContain("Verify your email");
    expect(state.reserves).toHaveLength(0);
  });

  it("a paid plan on a claimed IP is unaffected", async () => {
    (ROWS.projects as { look_id: string }).look_id = "netflix_sub";
    expect((await post(BODY, IP_HEADERS)).status).toBe(201);
    ROWS.profiles = { plan: "starter", plan_expires_at: "2026-12-14T00:00:00Z" };
    const res = await post(BODY, IP_HEADERS);
    expect(res.status).toBe(201);
    expect(state.reserves).toHaveLength(2);
  });
});
