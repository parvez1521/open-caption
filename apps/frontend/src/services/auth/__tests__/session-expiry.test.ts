import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * C-07: isAuthenticated() is expiry-aware — a persisted token whose exp
 * has passed is not a live session — and the 401 → /login redirect in
 * apiClient fires only for a real user's session token, never for a
 * guest (anonymous) session or an opaque token.
 */

const h = vi.hoisted(() => ({
  session: null as null | { access_token: string },
}));

vi.mock("../supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: h.session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  },
  isSupabaseConfigured: () => true,
}));

import { isExpiredSessionToken, isSignInAgainToken, supabaseAuthProvider } from "../supabaseAuthProvider";

const b64url = (obj: Record<string, unknown>): string =>
  Buffer.from(JSON.stringify(obj)).toString("base64url");

/** A decodable JWT with the given claims (signature is irrelevant here — nothing verifies it). */
const jwt = (claims: Record<string, unknown>): string =>
  `${b64url({ alg: "none", typ: "JWT" })}.${b64url(claims)}.sig`;

const nowSec = () => Math.floor(Date.now() / 1000);

describe("isExpiredSessionToken", () => {
  it("an expired exp is stale; a live exp is not", () => {
    expect(isExpiredSessionToken(jwt({ exp: nowSec() - 3600 }))).toBe(true);
    expect(isExpiredSessionToken(jwt({ exp: nowSec() + 3600 }))).toBe(false);
  });

  it("no exp claim and undecodable tokens are never stale here — the server decides", () => {
    expect(isExpiredSessionToken(jwt({ sub: "user-1" }))).toBe(false);
    expect(isExpiredSessionToken("test-token")).toBe(false);
    expect(isExpiredSessionToken("")).toBe(false);
  });
});

describe("isSignInAgainToken", () => {
  it("a real user's JWT means sign in again; an anonymous JWT does not", () => {
    expect(isSignInAgainToken(jwt({ sub: "user-1", exp: nowSec() - 10 }))).toBe(true);
    expect(isSignInAgainToken(jwt({ sub: "user-1", is_anonymous: true, exp: nowSec() - 10 }))).toBe(false);
  });

  it("opaque and missing tokens never redirect", () => {
    expect(isSignInAgainToken("test-token")).toBe(false);
    expect(isSignInAgainToken(null)).toBe(false);
  });
});

describe("isAuthenticated() with an expired persisted session", () => {
  beforeEach(() => {
    localStorage.clear();
    h.session = null;
  });

  // No NEXT_PUBLIC_SUPABASE_URL in the test env, so the provider falls
  // back to the bare storage key.
  const KEY = "sb-auth-token";
  const persist = (token: string) =>
    localStorage.setItem(KEY, JSON.stringify({ access_token: token }));

  it("an expired persisted token is NOT authenticated", () => {
    persist(jwt({ sub: "user-1", exp: nowSec() - 3600 }));
    expect(supabaseAuthProvider.isAuthenticated()).toBe(false);
  });

  it("a live persisted token still is", () => {
    persist(jwt({ sub: "user-1", exp: nowSec() + 3600 }));
    expect(supabaseAuthProvider.isAuthenticated()).toBe(true);
  });

  it("no token at all is not authenticated", () => {
    expect(supabaseAuthProvider.isAuthenticated()).toBe(false);
  });
});
