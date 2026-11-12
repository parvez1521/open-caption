import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Display name override (owner order 2026-11-12): a Google display name
 * ("parrr vezzz") must not keep coming back after the owner sets their own
 * name in /settings. The app-level name lives under `display_name`, a key
 * Google never sends, so the next Google sign-in — which refreshes `name`
 * from the provider's profile — cannot overwrite it.
 *
 * mapSupabaseUser resolves: display_name → name → email prefix → "User"
 * (guests stay "Guest"). updateProfile writes BOTH keys. A profile save
 * fires USER_UPDATED, which subscribed shells/pages hear without a reload.
 */

type StubUser = {
  id: string;
  email?: string;
  created_at?: string;
  is_anonymous?: boolean;
  user_metadata?: Record<string, unknown>;
};

type StubSession = { access_token: string; user: StubUser } | null;

const h = vi.hoisted(() => ({
  session: null as StubSession,
  getUserResult: null as { user: StubUser | null; error: unknown } | null,
  updateUserArgs: null as unknown,
  updateUserUser: null as StubUser | null,
  updateUserError: null as Error | null,
  authCallback: null as ((event: string, session: StubSession) => void) | null,
}));

vi.mock("../supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: h.session } }),
      getUser: async () => ({ data: { user: h.getUserResult?.user ?? null }, error: h.getUserResult?.error ?? null }),
      updateUser: async (args: unknown) => {
        h.updateUserArgs = args;
        if (h.updateUserError) return { data: { user: null }, error: h.updateUserError };
        return { data: { user: h.updateUserUser }, error: null };
      },
      onAuthStateChange: (cb: (event: string, session: StubSession) => void) => {
        h.authCallback = cb;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
      signUp: async () => ({ data: {}, error: null }),
      signInWithPassword: async () => ({ data: {}, error: null }),
      signInWithOAuth: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
      resetPasswordForEmail: async () => ({ error: null }),
    },
  },
  isSupabaseConfigured: () => true,
}));

import { supabaseAuthProvider as authService } from "../supabaseAuthProvider";

const sbUser = (over: Partial<StubUser> = {}): StubUser => ({
  id: "u1",
  email: "vezzzparrr@gmail.com",
  created_at: "2026-01-01",
  is_anonymous: false,
  user_metadata: { name: "parrr vezzz" },
  ...over,
});

const signInAs = (user: StubUser) => {
  h.session = { access_token: "t", user };
};

beforeEach(() => {
  h.session = null;
  h.getUserResult = null;
  h.updateUserArgs = null;
  h.updateUserUser = null;
  h.updateUserError = null;
});

describe("display name resolution (getCurrentUser)", () => {
  it("display_name beats the Google name", async () => {
    signInAs(sbUser({ user_metadata: { display_name: "Parvez Siddiqui", name: "parrr vezzz" } }));
    const user = await authService.getCurrentUser();
    expect(user?.name).toBe("Parvez Siddiqui");
    // The avatar seed follows the resolved name (Google's avatar_url still wins when present).
    expect(user?.avatar_url).toContain("seed=Parvez%20Siddiqui");
  });

  it("trims display_name", async () => {
    signInAs(sbUser({ user_metadata: { display_name: "  Parvez Siddiqui  ", name: "parrr vezzz" } }));
    expect((await authService.getCurrentUser())?.name).toBe("Parvez Siddiqui");
  });

  it("whitespace-only display_name falls through to the Google name", async () => {
    signInAs(sbUser({ user_metadata: { display_name: "   ", name: "parrr vezzz" } }));
    expect((await authService.getCurrentUser())?.name).toBe("Parrr vezzz");
  });

  it("no display_name → the Google name", async () => {
    signInAs(sbUser());
    expect((await authService.getCurrentUser())?.name).toBe("Parrr vezzz");
  });

  it("whitespace-only name falls through to the email prefix", async () => {
    signInAs(sbUser({ user_metadata: { name: "   " } }));
    expect((await authService.getCurrentUser())?.name).toBe("Vezzzparrr");
  });

  it("no name and no email → 'User'", async () => {
    signInAs(sbUser({ email: undefined, user_metadata: {} }));
    expect((await authService.getCurrentUser())?.name).toBe("User");
  });

  it("guests stay 'Guest' even with a name in metadata", async () => {
    signInAs(sbUser({ is_anonymous: true, email: undefined, user_metadata: { display_name: "Parvez", name: "parrr vezzz" } }));
    expect((await authService.getCurrentUser())?.name).toBe("Guest");
  });

  it("keeps the existing capitalisation (first letter upper)", async () => {
    signInAs(sbUser({ user_metadata: { display_name: "parvez siddiqui" } }));
    expect((await authService.getCurrentUser())?.name).toBe("Parvez siddiqui");
  });
});

describe("updateProfile", () => {
  it("writes the name to BOTH display_name and name, and returns the mapped user", async () => {
    h.updateUserUser = sbUser({ user_metadata: { display_name: "Parvez Siddiqui", name: "Parvez Siddiqui" } });
    const user = await authService.updateProfile({ name: "Parvez Siddiqui" });
    expect(h.updateUserArgs).toEqual({ data: { display_name: "Parvez Siddiqui", name: "Parvez Siddiqui" } });
    expect(user.name).toBe("Parvez Siddiqui");
  });

  it("trims before writing", async () => {
    h.updateUserUser = sbUser({ user_metadata: { display_name: "Parvez", name: "Parvez" } });
    await authService.updateProfile({ name: "  Parvez  " });
    expect(h.updateUserArgs).toEqual({ data: { display_name: "Parvez", name: "Parvez" } });
  });

  it("rejects an empty / whitespace-only name without calling updateUser", async () => {
    await expect(authService.updateProfile({ name: "   " })).rejects.toThrow("Display name can't be empty.");
    await expect(authService.updateProfile({})).rejects.toThrow("Display name can't be empty.");
    expect(h.updateUserArgs).toBeNull();
  });
});

describe("subscribeToUserChanges (saved name shows without a reload)", () => {
  it("USER_UPDATED pushes the mapped user (display_name priority) to listeners", async () => {
    const seen: unknown[] = [];
    const unsub = authService.subscribeToUserChanges((u) => seen.push(u?.name ?? null));
    h.authCallback?.("USER_UPDATED", {
      access_token: "t",
      user: sbUser({ user_metadata: { display_name: "Parvez Siddiqui", name: "parrr vezzz" } }),
    });
    expect(seen).toEqual(["Parvez Siddiqui"]);
    unsub();
  });

  it("SIGNED_OUT pushes null", async () => {
    const seen: unknown[] = [];
    authService.subscribeToUserChanges((u) => seen.push(u));
    h.authCallback?.("SIGNED_OUT", null);
    expect(seen).toEqual([null]);
  });

  it("TOKEN_REFRESHED notifies nobody (no new name rides a token refresh)", async () => {
    const seen: unknown[] = [];
    authService.subscribeToUserChanges((u) => seen.push(u));
    h.authCallback?.("TOKEN_REFRESHED", { access_token: "t", user: sbUser() });
    expect(seen).toEqual([]);
  });

  it("unsubscribe stops delivery", async () => {
    const seen: unknown[] = [];
    const unsub = authService.subscribeToUserChanges((u) => seen.push(u?.name ?? null));
    unsub();
    h.authCallback?.("USER_UPDATED", { access_token: "t", user: sbUser() });
    expect(seen).toEqual([]);
  });
});
