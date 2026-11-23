import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * C-07: a 401 from the API sends a signed-in (real-user) session back to
 * /login with the current page as the redirect — but never a guest
 * session, and never when the token is opaque. The ApiError still
 * propagates, so callers that handle 401s themselves keep working.
 */

const h = vi.hoisted(() => ({
  session: null as null | { access_token: string },
  fetchImpl: null as unknown as (url: string, init?: RequestInit) => Promise<Response>,
}));

vi.mock("../auth/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: h.session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  },
  isSupabaseConfigured: () => true,
}));

import { apiClient, ApiError } from "../api-client";

const b64url = (obj: Record<string, unknown>): string =>
  Buffer.from(JSON.stringify(obj)).toString("base64url");

const jwt = (claims: Record<string, unknown>): string =>
  `${b64url({ alg: "none", typ: "JWT" })}.${b64url(claims)}.sig`;

const nowSec = () => Math.floor(Date.now() / 1000);

const unauthorized = () =>
  new Response(JSON.stringify({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });

const okEnvelope = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("apiClient 401 → /login (C-07)", () => {
  let assign: ReturnType<typeof vi.fn>;
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, assign, pathname: "/growth", search: "" },
      writable: true,
      configurable: true,
    });
    h.session = null;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => h.fetchImpl(url, init)));
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { value: originalLocation, writable: true, configurable: true });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("a 401 with a real user's token redirects to /login with the page as redirect — and still throws", async () => {
    h.session = { access_token: jwt({ sub: "user-1", exp: nowSec() - 10 }) };
    h.fetchImpl = async () => unauthorized();
    await expect(apiClient.get("/growth/posts")).rejects.toBeInstanceOf(ApiError);
    expect(assign).toHaveBeenCalledWith("/login?redirect=%2Fgrowth&session=expired");
  });

  it("a 401 with a guest (anonymous) token does NOT redirect", async () => {
    h.session = { access_token: jwt({ sub: "guest-1", is_anonymous: true, exp: nowSec() - 10 }) };
    h.fetchImpl = async () => unauthorized();
    await expect(apiClient.get("/growth/posts")).rejects.toBeInstanceOf(ApiError);
    expect(assign).not.toHaveBeenCalled();
  });

  it("a 401 with an opaque token does NOT redirect", async () => {
    h.session = { access_token: "test-token" };
    h.fetchImpl = async () => unauthorized();
    await expect(apiClient.get("/growth/posts")).rejects.toBeInstanceOf(ApiError);
    expect(assign).not.toHaveBeenCalled();
  });

  it("a 200 never redirects", async () => {
    h.session = { access_token: jwt({ sub: "user-1", exp: nowSec() + 3600 }) };
    h.fetchImpl = async () => okEnvelope({ ready: true, posts: [] });
    await expect(apiClient.get("/growth/posts")).resolves.toEqual({ ready: true, posts: [] });
    expect(assign).not.toHaveBeenCalled();
  });
});
