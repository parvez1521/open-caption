import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Client half of the guest → account claim flow (Phase 9 W1):
 * rememberGuestForClaim() stashes the guest's tokens before sign-in;
 * claimPendingGuest() hands them to POST /guest/claim after sign-in.
 * Nothing here may ever throw into /start's routing.
 */

const h = vi.hoisted(() => ({
  session: null as null | {
    access_token: string;
    refresh_token: string;
    user: { id: string; is_anonymous?: boolean; email?: string | null; new_email?: string | null };
  },
  post: vi.fn(async (_path: string, _opts?: unknown) => ({ moved: 2 })),
  postError: null as Error | null,
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
vi.mock("@/services/api-client", () => ({
  apiClient: {
    post: async (path: string, opts?: unknown) => {
      if (h.postError) throw h.postError;
      return h.post(path, opts);
    },
  },
}));

import { claimPendingGuest, clearPendingGuestClaim, rememberGuestForClaim } from "../guest";

const CLAIM_KEY = "ce:guest-claim";
const guestSession = () => ({
  access_token: "guest-access-token",
  refresh_token: "guest-refresh-token",
  user: { id: "guest-1", is_anonymous: true, email: null, new_email: null },
});

beforeEach(() => {
  localStorage.clear();
  h.session = null;
  h.postError = null;
  h.post.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("rememberGuestForClaim", () => {
  it("stashes the guest's tokens + return path when the session is a guest", async () => {
    h.session = guestSession();
    await rememberGuestForClaim("/projects/p1?export=1");
    const raw = localStorage.getItem(CLAIM_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { accessToken: string; refreshToken: string; at: number };
    expect(parsed.accessToken).toBe("guest-access-token");
    expect(parsed.refreshToken).toBe("guest-refresh-token");
    expect(typeof parsed.at).toBe("number");
    expect(localStorage.getItem("ce:after-signin")).toBe("/projects/p1?export=1");
  });

  it("stashes nothing for a signed-in (non-guest) session or no session", async () => {
    h.session = { ...guestSession(), user: { id: "u1", is_anonymous: false, email: "a@b.c", new_email: null } };
    await rememberGuestForClaim("/projects/p1");
    expect(localStorage.getItem(CLAIM_KEY)).toBeNull();
    h.session = null;
    await rememberGuestForClaim("/projects/p1");
    expect(localStorage.getItem(CLAIM_KEY)).toBeNull();
  });
});

describe("claimPendingGuest", () => {
  const stash = (at = Date.now()) =>
    localStorage.setItem(CLAIM_KEY, JSON.stringify({ accessToken: "guest-access-token", refreshToken: "guest-refresh-token", at }));

  it("no stash → no API call, no throw (nothing-to-claim is a no-op)", async () => {
    await expect(claimPendingGuest()).resolves.toBeUndefined();
    expect(h.post).not.toHaveBeenCalled();
  });

  it("posts the stashed tokens to /guest/claim and clears the stash on success", async () => {
    stash();
    await claimPendingGuest();
    expect(h.post).toHaveBeenCalledTimes(1);
    expect(h.post).toHaveBeenCalledWith("/guest/claim", {
      json: { accessToken: "guest-access-token", refreshToken: "guest-refresh-token" },
    });
    expect(localStorage.getItem(CLAIM_KEY)).toBeNull();
  });

  it("ignores (and clears) a stash older than 7 days without calling the API", async () => {
    stash(Date.now() - 8 * 86_400_000);
    await claimPendingGuest();
    expect(h.post).not.toHaveBeenCalled();
    expect(localStorage.getItem(CLAIM_KEY)).toBeNull();
  });

  it("ignores (and clears) a corrupt stash without calling the API or throwing", async () => {
    localStorage.setItem(CLAIM_KEY, "{not json");
    await expect(claimPendingGuest()).resolves.toBeUndefined();
    expect(h.post).not.toHaveBeenCalled();
    expect(localStorage.getItem(CLAIM_KEY)).toBeNull();
  });

  it("KEEPS the stash when the claim request fails, so a later /start visit can retry (the guest's only copy of the tokens must not be destroyed by a transient failure)", async () => {
    stash();
    h.postError = new Error("network down");
    await expect(claimPendingGuest()).resolves.toBeUndefined(); // still never throws
    expect(localStorage.getItem(CLAIM_KEY)).toBeTruthy();
    // …and the retry succeeds:
    h.postError = null;
    await claimPendingGuest();
    expect(h.post).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(CLAIM_KEY)).toBeNull();
  });
});

describe("clearPendingGuestClaim", () => {
  it("drops a pending stash (cancelled sign-in path)", () => {
    localStorage.setItem(CLAIM_KEY, "{}");
    clearPendingGuestClaim();
    expect(localStorage.getItem(CLAIM_KEY)).toBeNull();
  });
});
