// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

/**
 * Free-trial protection tests (Builder 5). The pure decision matrix
 * (decideTrialEligibility) is tested without any I/O; the orchestrator
 * (enforceFreeTrialGrant) runs against an in-memory fake of the
 * trial_ip_hashes RPCs that mirrors the SQL semantics in
 * supabase/APPLY-TRIAL-IP-HASHES.sql: status is a read, claim is one
 * atomic insert-or-bump. The ledger itself is untouched — the free
 * grant still mints lazily inside reserve_minutes; this gate only
 * permits or refuses it.
 */

const state = vi.hoisted(() => ({
  rateLimited: false,
  fetchImpl: null as ((...args: unknown[]) => Promise<unknown>) | null,
}));

vi.mock("@/lib/api/rateLimit", () => ({
  rateLimit: async () => {
    if (state.rateLimited) {
      const { ApiFailure } = await import("@/lib/api/http");
      throw new ApiFailure("RATE_LIMITED", "slow down");
    }
  },
}));

import { ApiFailure } from "@/lib/api/http";
import { NextResponse } from "next/server";
import { isEmailVerifiedForTrial } from "@/lib/api/auth";
import {
  TRIAL_IP_USED_MESSAGE,
  TRIAL_NOT_SET_UP,
  TRIAL_SUPPORT_EMAIL,
  attachDeviceCookie,
  clientIp,
  decideTrialEligibility,
  enforceFreeTrialGrant,
  hasFreeGrant,
  hashTrialIp,
  isDisposableEmail,
  newDeviceId,
  readDeviceId,
  verifyTurnstileToken,
  type TrialSignals,
} from "../trial";

const SECRET = "test-trial-secret-that-is-long-enough";
const IP = "203.0.113.7";
const OTHER_IP = "198.51.100.42";

const reqWithIp = (ip: string | null, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/v1/projects/proj-1/exports", {
    method: "POST",
    headers: { ...(ip ? { "x-forwarded-for": ip } : {}), ...headers },
  });

interface IpRow {
  count: number;
}

class FakeTrialAdmin {
  /** ip_hash -> row. Keys are hashes only; no raw IP is ever stored. */
  ipRows = new Map<string, IpRow>();
  statusCalls: string[] = [];
  claimCalls: string[] = [];
  rpcMissing = false;

  async rpc(fn: string, args: Record<string, unknown>) {
    if (this.rpcMissing) return { data: null, error: { code: "PGRST202", message: `Could not find the function public.${fn}` } };
    if (fn === "trial_ip_status") {
      const hash = args.p_ip_hash as string;
      this.statusCalls.push(hash);
      const row = this.ipRows.get(hash);
      return { data: row ? { claimed: true, account_count: row.count, trial_granted_at: new Date().toISOString() } : { claimed: false, account_count: 0, trial_granted_at: null }, error: null };
    }
    if (fn === "trial_ip_claim") {
      const hash = args.p_ip_hash as string;
      this.claimCalls.push(hash);
      const row = this.ipRows.get(hash);
      if (row) {
        row.count += 1;
        return { data: { claimed: true, already_claimed: true, account_count: row.count }, error: null };
      }
      this.ipRows.set(hash, { count: 1 });
      return { data: { claimed: true, already_claimed: false, account_count: 1 }, error: null };
    }
    return { data: null, error: { message: `fake rpc: unknown function ${fn}` } };
  }
}

const fakeAdminWithGrant = (granted: boolean) => {
  const admin = new FakeTrialAdmin();
  // hasFreeGrant reads minute_ledger by idempotency key; mirror it here.
  (admin as unknown as { from: (table: string) => unknown }).from = () => ({
    select: () => ({
      eq: () => ({
        async maybeSingle() {
          return { data: granted ? { id: "row-1" } : null, error: null };
        },
      }),
    }),
  });
  return admin;
};

async function expectFailure(promise: Promise<unknown>, code: string, messagePart: string) {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiFailure);
    expect((e as ApiFailure).code).toBe(code);
    expect((e as ApiFailure).message).toContain(messagePart);
    return e as ApiFailure;
  }
  throw new Error(`expected ApiFailure ${code}, but the call succeeded`);
}

beforeEach(() => {
  vi.stubEnv("TRIAL_IP_HASH_SECRET", SECRET);
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
  state.rateLimited = false;
  state.fetchImpl = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("hashTrialIp — keyed hashing, never plain, never the raw IP", () => {
  it("the same IP and secret always give the same hash", () => {
    expect(hashTrialIp(IP, SECRET)).toBe(hashTrialIp(IP, SECRET));
  });

  it("a different secret gives a different hash for the same IP", () => {
    expect(hashTrialIp(IP, SECRET)).not.toBe(hashTrialIp(IP, "a-different-secret"));
  });

  it("a different IP gives a different hash", () => {
    expect(hashTrialIp(IP, SECRET)).not.toBe(hashTrialIp(OTHER_IP, SECRET));
  });

  it("the hash is not a plain SHA-256 of the IP (which brute force could reverse)", () => {
    const plain = createHash("sha256").update(IP).digest("hex");
    expect(hashTrialIp(IP, SECRET)).not.toBe(plain);
    expect(hashTrialIp(IP, SECRET)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the raw IP appears nowhere in the hash output", () => {
    expect(hashTrialIp(IP, SECRET)).not.toContain(IP);
    expect(hashTrialIp(IP, SECRET)).not.toContain("203");
  });
});

describe("clientIp — first x-forwarded-for entry, like the device routes", () => {
  it("takes the first entry of a forwarded chain", () => {
    expect(clientIp(reqWithIp("203.0.113.7, 10.0.0.1, 10.0.0.2"))).toBe("203.0.113.7");
  });

  it("trims whitespace and answers null with no header", () => {
    expect(clientIp(reqWithIp("  203.0.113.7  "))).toBe("203.0.113.7");
    expect(clientIp(reqWithIp(null))).toBeNull();
  });
});

describe("isDisposableEmail — disposable-email-domains list (MIT), server-side", () => {
  it("rejects a listed disposable domain", () => {
    expect(isDisposableEmail("user@mailinator.com")).toBe(true);
    expect(isDisposableEmail("user@guerrillamail.com")).toBe(true);
  });

  it("accepts a permanent domain", () => {
    expect(isDisposableEmail("user@gmail.com")).toBe(false);
    expect(isDisposableEmail("user@outlook.com")).toBe(false);
    expect(isDisposableEmail("user@company.co.in")).toBe(false);
  });

  it("is case-insensitive and catches subdomains of a listed domain", () => {
    expect(isDisposableEmail("USER@Mailinator.COM")).toBe(true);
    expect(isDisposableEmail("user@mail.mailinator.com")).toBe(true);
  });

  it("catches wildcard-list subdomains and leaves lookalike TLDs alone", () => {
    expect(isDisposableEmail("user@x.33mail.com")).toBe(true);
    expect(isDisposableEmail("user@mailinator.co")).toBe(false);
  });

  it("a malformed address is not disposable (shape validation lives elsewhere)", () => {
    expect(isDisposableEmail("not-an-email")).toBe(false);
    expect(isDisposableEmail("user@")).toBe(false);
  });
});

describe("isEmailVerifiedForTrial — Supabase Auth state, server-side", () => {
  it("a confirmed email passes", () => {
    expect(isEmailVerifiedForTrial({ email_confirmed_at: "2026-11-14T00:00:00Z", app_metadata: { provider: "email" } })).toBe(true);
  });

  it("a Google account passes — Google verified the address itself", () => {
    expect(isEmailVerifiedForTrial({ email_confirmed_at: null, app_metadata: { provider: "google" } })).toBe(true);
    expect(isEmailVerifiedForTrial({ email_confirmed_at: null, app_metadata: {}, identities: [{ provider: "google" }] })).toBe(true);
  });

  it("an unconfirmed email account fails, and an anonymous guest fails", () => {
    expect(isEmailVerifiedForTrial({ email_confirmed_at: null, app_metadata: { provider: "email" } })).toBe(false);
    expect(isEmailVerifiedForTrial({ email_confirmed_at: null, app_metadata: {} })).toBe(false);
  });
});

describe("decideTrialEligibility — the policy matrix, pure", () => {
  const base: TrialSignals = {
    isGuest: false,
    email: "user@example.com",
    emailVerified: true,
    ipClaimed: false,
    velocitySuspicious: false,
    turnstile: null,
    isPaid: false,
  };

  it("a fresh IP with a verified email is allowed", () => {
    expect(decideTrialEligibility(base).allowed).toBe(true);
  });

  it("a paid plan bypasses every signal, even a claimed IP", () => {
    const d = decideTrialEligibility({ ...base, isPaid: true, ipClaimed: true, velocitySuspicious: true, emailVerified: false });
    expect(d.allowed).toBe(true);
  });

  it("a guest is refused, never challenged — guests get no trial minutes", () => {
    const d = decideTrialEligibility({ ...base, isGuest: true, email: null, emailVerified: null });
    expect(d.allowed).toBe(false);
    expect(d.requiresTurnstile).toBe(false);
    expect(d.message).toContain("free account");
    expect(d.details).toMatchObject({ signupRequired: true });
  });

  it("a disposable address is refused with a plain message", () => {
    const d = decideTrialEligibility({ ...base, email: "user@mailinator.com" });
    expect(d.allowed).toBe(false);
    expect(d.message).toContain("permanent email");
  });

  it("an unverified email is refused, not silently granted", () => {
    const d = decideTrialEligibility({ ...base, emailVerified: false });
    expect(d.allowed).toBe(false);
    expect(d.message).toContain("Verify your email");
    expect(d.details).toMatchObject({ emailVerificationRequired: true });
  });

  it("a second account on a claimed IP is challenged, not blocked from signup", () => {
    const d = decideTrialEligibility({ ...base, ipClaimed: true });
    expect(d.allowed).toBe(false);
    expect(d.requiresTurnstile).toBe(true);
    expect(d.message).toContain("already used the free trial");
  });

  it("the same second account passes with a verified Turnstile token", () => {
    const d = decideTrialEligibility({ ...base, ipClaimed: true, turnstile: { enabled: true, ok: true } });
    expect(d.allowed).toBe(true);
  });

  it("suspicious velocity challenges even a fresh IP", () => {
    const d = decideTrialEligibility({ ...base, velocitySuspicious: true });
    expect(d.allowed).toBe(false);
    expect(d.requiresTurnstile).toBe(true);
    expect(d.message).toContain("Too many signups");
  });

  it("when Turnstile is OFF (no keys) a challenged grant is refused with the review path, and signup is not blocked", () => {
    const d = decideTrialEligibility({ ...base, ipClaimed: true, turnstile: { enabled: false, ok: false, reason: "turnstile_off" } });
    expect(d.allowed).toBe(false);
    expect(d.requiresTurnstile).toBe(false);
    expect(d.message).toContain("Email us");
    expect(d.details).toMatchObject({ turnstileOff: true, supportEmail: TRIAL_SUPPORT_EMAIL });
  });

  it("no IP signal at all (no proxy header) still allows the grant on the email signals", () => {
    expect(decideTrialEligibility({ ...base, ipClaimed: null }).allowed).toBe(true);
  });
});

describe("verifyTurnstileToken — server-side siteverify", () => {
  it("with no secret key Turnstile is OFF and the check says so, never blocking", async () => {
    const check = await verifyTurnstileToken("some-token");
    expect(check).toEqual({ enabled: false, ok: false, reason: "turnstile_off" });
  });

  it("with a key, a successful siteverify passes", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => ({ json: async () => ({ success: true }) }));
    const check = await verifyTurnstileToken("token-1", fetchFn as unknown as typeof fetch);
    expect(check.ok).toBe(true);
    expect(check.enabled).toBe(true);
    const init = fetchFn.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = init?.body as URLSearchParams;
    expect(body.get("secret")).toBe("test-secret");
    expect(body.get("response")).toBe("token-1");
  });

  it("a failed siteverify does not pass, and an unreachable Cloudflare fails closed", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    const failFn = vi.fn(async () => ({ json: async () => ({ success: false }) }));
    expect((await verifyTurnstileToken("token-1", failFn as unknown as typeof fetch)).ok).toBe(false);
    const downFn = vi.fn(async () => {
      throw new Error("network down");
    });
    const check = await verifyTurnstileToken("token-1", downFn as unknown as typeof fetch);
    expect(check).toMatchObject({ enabled: true, ok: false, reason: "unreachable" });
  });
});

describe("device id — a random cookie, not a fingerprint", () => {
  it("reads the cookie when present and mints a fresh uuid when absent", () => {
    expect(readDeviceId(reqWithIp(IP, { cookie: "ct_device=device-123; other=x" }))).toBe("device-123");
    expect(readDeviceId(reqWithIp(IP))).toBeNull();
    const id = newDeviceId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(newDeviceId()).not.toBe(id);
  });

  it("sets the cookie only when the browser had none, httpOnly", () => {
    const next = NextResponse.json({ ok: true });
    attachDeviceCookie(next, "device-1", true);
    expect(next.headers.get("set-cookie")).toContain("ct_device=device-1");
    expect(next.headers.get("set-cookie")).toContain("HttpOnly");
    const res2 = NextResponse.json({ ok: true });
    attachDeviceCookie(res2, "device-1", false);
    expect(res2.headers.get("set-cookie")).toBeNull();
  });
});

describe("enforceFreeTrialGrant — the gate in front of the lazy Free grant", () => {
  const verifiedUser = (over: Record<string, unknown> = {}) => ({
    id: "user-1",
    email: "user@example.com",
    guest: false,
    emailVerified: true,
    ...over,
  });

  it("a fresh IP grants: the hash is claimed, account_count is 1, no raw IP is stored", async () => {
    const admin = fakeAdminWithGrant(false);
    const result = await enforceFreeTrialGrant({
      admin: admin as never,
      user: verifiedUser(),
      plan: "free",
      req: reqWithIp(IP),
    });
    expect(result.skipped).toBe(false);
    expect(result.reason).toBe("granted");
    expect(result.ipHash).toBe(hashTrialIp(IP, SECRET));
    expect(admin.claimCalls).toHaveLength(1);
    // The stored table holds hashes only: no key or value contains the address.
    for (const key of admin.ipRows.keys()) {
      expect(key).not.toContain(IP);
      expect(key).toBe(hashTrialIp(IP, SECRET));
    }
    expect(JSON.stringify([...admin.ipRows.values()])).not.toContain(IP);
  });

  it("a second account on the same IP is refused without Turnstile, and claims nothing new", async () => {
    const admin = fakeAdminWithGrant(false);
    await enforceFreeTrialGrant({ admin: admin as never, user: verifiedUser({ id: "user-1" }), plan: "free", req: reqWithIp(IP) });
    const claimsBefore = admin.claimCalls.length;
    const err = await expectFailure(
      enforceFreeTrialGrant({ admin: admin as never, user: verifiedUser({ id: "user-2" }), plan: "free", req: reqWithIp(IP) }),
      "LIMIT_EXCEEDED",
      "already used the free trial",
    );
    expect((err.details as Record<string, unknown>).trialChallenge).toBe(true);
    expect(admin.claimCalls.length).toBe(claimsBefore);
  });

  it("the second account earns the trial with a verified Turnstile token", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ success: true }) })));
    const admin = fakeAdminWithGrant(false);
    await enforceFreeTrialGrant({ admin: admin as never, user: verifiedUser({ id: "user-1" }), plan: "free", req: reqWithIp(IP) });
    const result = await enforceFreeTrialGrant({
      admin: admin as never,
      user: verifiedUser({ id: "user-2" }),
      plan: "free",
      req: reqWithIp(IP),
      turnstileToken: "token-1",
    });
    expect(result.skipped).toBe(false);
    expect(admin.ipRows.get(hashTrialIp(IP, SECRET))?.count).toBe(2);
  });

  it("the trial survives account deletion and recreation: same IP hash, no re-grant", async () => {
    const admin = fakeAdminWithGrant(false);
    await enforceFreeTrialGrant({ admin: admin as never, user: verifiedUser({ id: "user-1" }), plan: "free", req: reqWithIp(IP) });
    // The account is deleted (its user row goes; the IP-hash row stays —
    // the fake models that by simply never touching ipRows on delete).
    await expectFailure(
      enforceFreeTrialGrant({ admin: admin as never, user: verifiedUser({ id: "user-2" }), plan: "free", req: reqWithIp(IP) }),
      "LIMIT_EXCEEDED",
      "already used the free trial",
    );
  });

  it("a paid customer on a shared IP is unaffected — no IP check runs at all", async () => {
    const admin = fakeAdminWithGrant(false);
    await enforceFreeTrialGrant({ admin: admin as never, user: verifiedUser({ id: "user-1" }), plan: "free", req: reqWithIp(IP) });
    const result = await enforceFreeTrialGrant({
      admin: admin as never,
      user: verifiedUser({ id: "user-9" }),
      plan: "starter",
      req: reqWithIp(IP),
    });
    expect(result).toMatchObject({ skipped: true, reason: "paid" });
    expect(admin.statusCalls).toHaveLength(1); // only the first, free grant's read
    expect(admin.claimCalls).toHaveLength(1);
  });

  it("a user who already holds the Free grant skips the gate entirely", async () => {
    const admin = fakeAdminWithGrant(true);
    const result = await enforceFreeTrialGrant({
      admin: admin as never,
      user: verifiedUser(),
      plan: "free",
      req: reqWithIp(IP),
    });
    expect(result).toMatchObject({ skipped: true, reason: "already_granted" });
    expect(admin.statusCalls).toHaveLength(0);
    expect(admin.claimCalls).toHaveLength(0);
  });

  it("a guest gets no trial minutes", async () => {
    const admin = fakeAdminWithGrant(false);
    const err = await expectFailure(
      enforceFreeTrialGrant({ admin: admin as never, user: { id: "guest-1", email: null, guest: true, emailVerified: false }, plan: "free", req: reqWithIp(IP) }),
      "FORBIDDEN",
      "free account",
    );
    expect((err.details as Record<string, unknown>).signupRequired).toBe(true);
    expect(admin.claimCalls).toHaveLength(0);
  });

  it("an unverified email gets no trial minutes", async () => {
    const admin = fakeAdminWithGrant(false);
    await expectFailure(
      enforceFreeTrialGrant({ admin: admin as never, user: verifiedUser({ emailVerified: false }), plan: "free", req: reqWithIp(IP) }),
      "FORBIDDEN",
      "Verify your email",
    );
    expect(admin.claimCalls).toHaveLength(0);
  });

  it("a disposable email gets no trial minutes", async () => {
    const admin = fakeAdminWithGrant(false);
    await expectFailure(
      enforceFreeTrialGrant({ admin: admin as never, user: verifiedUser({ email: "user@mailinator.com" }), plan: "free", req: reqWithIp(IP) }),
      "VALIDATION",
      "permanent email",
    );
    expect(admin.claimCalls).toHaveLength(0);
  });

  it("suspicious velocity challenges a fresh IP, and a passed Turnstile earns it", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ success: true }) })));
    state.rateLimited = true;
    const admin = fakeAdminWithGrant(false);
    const err = await expectFailure(
      enforceFreeTrialGrant({ admin: admin as never, user: verifiedUser(), plan: "free", req: reqWithIp(IP) }),
      "LIMIT_EXCEEDED",
      "Too many signups",
    );
    expect((err.details as Record<string, unknown>).trialChallenge).toBe(true);
    const result = await enforceFreeTrialGrant({
      admin: admin as never,
      user: verifiedUser(),
      plan: "free",
      req: reqWithIp(IP),
      turnstileToken: "token-1",
    });
    expect(result.skipped).toBe(false);
  });

  it("Turnstile OFF degrades to a refusal with the review path, never a block on signup", async () => {
    const admin = fakeAdminWithGrant(false);
    await enforceFreeTrialGrant({ admin: admin as never, user: verifiedUser({ id: "user-1" }), plan: "free", req: reqWithIp(IP) });
    const err = await expectFailure(
      enforceFreeTrialGrant({ admin: admin as never, user: verifiedUser({ id: "user-2" }), plan: "free", req: reqWithIp(IP), turnstileToken: "token-1" }),
      "LIMIT_EXCEEDED",
      "Email us",
    );
    expect((err.details as Record<string, unknown>).turnstileOff).toBe(true);
  });

  it("no IP header means no IP signal: the grant proceeds on the email signals, and nothing is claimed", async () => {
    const admin = fakeAdminWithGrant(false);
    const result = await enforceFreeTrialGrant({
      admin: admin as never,
      user: verifiedUser(),
      plan: "free",
      req: reqWithIp(null),
    });
    expect(result.skipped).toBe(false);
    expect(result.ipHash).toBeNull();
    expect(admin.statusCalls).toHaveLength(0);
    expect(admin.claimCalls).toHaveLength(0);
  });

  it("a missing hash secret fails closed for a Free grant", async () => {
    vi.stubEnv("TRIAL_IP_HASH_SECRET", "");
    const admin = fakeAdminWithGrant(false);
    await expectFailure(
      enforceFreeTrialGrant({ admin: admin as never, user: verifiedUser(), plan: "free", req: reqWithIp(IP) }),
      "INTERNAL",
      TRIAL_NOT_SET_UP,
    );
  });

  it("a missing trial table fails closed for a Free grant", async () => {
    const admin = fakeAdminWithGrant(false);
    admin.rpcMissing = true;
    await expectFailure(
      enforceFreeTrialGrant({ admin: admin as never, user: verifiedUser(), plan: "free", req: reqWithIp(IP) }),
      "INTERNAL",
      TRIAL_NOT_SET_UP,
    );
  });

  it("hasFreeGrant reads the free-grant:<user_id> ledger key", async () => {
    expect(await hasFreeGrant(fakeAdminWithGrant(true) as never, "user-1")).toBe(true);
    expect(await hasFreeGrant(fakeAdminWithGrant(false) as never, "user-1")).toBe(false);
  });
});
