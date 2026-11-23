import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Session-expired notice (production-pages audit): an expired session
 * redirects to /login?redirect=…&session=expired, and the login page
 * must say the session ended instead of showing a bare sign-in form.
 * A plain visit to /login shows no such notice.
 */

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => nav }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/services/auth", () => ({
  authService: {
    login: vi.fn(),
    loginWithGoogle: vi.fn(),
    getCurrentUser: async () => null,
    isAuthenticated: () => false,
  },
}));

vi.mock("@/services/auth/supabaseClient", () => ({
  isSupabaseConfigured: () => true,
  isGoogleAuthEnabled: () => false,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));

vi.mock("@/services/auth/googleIdToken", () => ({
  renderGoogleSignInButton: async () => "oauth" as const,
}));

vi.mock("@/services/auth/guest", () => ({
  setAfterSignIn: vi.fn(),
}));

import LoginPage from "../page";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  window.history.pushState(null, "", "/");
});

describe("login page session-expired notice", () => {
  it("shows the expired-session notice on ?session=expired", async () => {
    window.history.pushState(null, "", "/login?session=expired");
    render(<LoginPage />);
    expect(await screen.findByText(/Your session expired — sign in again to continue/)).toBeTruthy();
  });

  it("shows no expired-session notice on a plain visit", async () => {
    window.history.pushState(null, "", "/login");
    render(<LoginPage />);
    await screen.findByRole("heading", { name: "Sign in with email" });
    expect(screen.queryByText(/Your session expired/)).toBeNull();
  });
});
