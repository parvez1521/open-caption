import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Email signup's marketing opt-in (owner order 2026-11-18): register()
 * stores the signup-time consent on user_metadata.marketing_opt_in so the
 * capture route can honour it on first insert. No email signup form exists
 * in the UI today (Google is the only signup path) — this is the plumbing
 * a form would pass the checkbox through, unchecked by default.
 */

const h = vi.hoisted(() => ({
  signUpArgs: null as unknown,
}));

vi.mock("../supabaseClient", () => ({
  supabase: {
    auth: {
      signUp: async (args: unknown) => {
        h.signUpArgs = args;
        return {
          data: {
            user: { id: "u1", email: "new@example.com", created_at: "2026-11-18T00:00:00Z", user_metadata: {} },
            session: { access_token: "tok" },
          },
          error: null,
        };
      },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: null } }),
    },
  },
  isGoogleAuthEnabled: () => false,
  isSupabaseConfigured: () => true,
}));

import { supabaseAuthProvider } from "../supabaseAuthProvider";

const metadata = () =>
  (h.signUpArgs as { options: { data: Record<string, unknown> } }).options.data;

beforeEach(() => {
  h.signUpArgs = null;
});

describe("register marketing opt-in", () => {
  it("stores marketing_opt_in=false when no opt-in is passed (unchecked by default)", async () => {
    const { user } = await supabaseAuthProvider.register("New User", "new@example.com", "password123");
    expect(user.email).toBe("new@example.com");
    expect(metadata().marketing_opt_in).toBe(false);
  });

  it("stores marketing_opt_in=true when the signup form passes it", async () => {
    await supabaseAuthProvider.register("New User", "new@example.com", "password123", { marketingOptIn: true });
    expect(metadata().marketing_opt_in).toBe(true);
  });
});
