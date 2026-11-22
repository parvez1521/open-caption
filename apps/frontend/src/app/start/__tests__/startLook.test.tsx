import React from "react";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /start ?look= forwarding (the /looks gallery click): a look id in the URL
 * opens a FRESH project and carries the look to it as ?look=, for guests
 * and signed-in users alike. A signed-out visitor is sent to sign-in with
 * the look kept as the login redirect, so sign-in resumes the flow.
 */
const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  createProject: vi.fn(async (title: string) => ({ id: "p9", title })),
  getProjects: vi.fn(async () => [] as unknown[]),
  setAfterSignIn: vi.fn(),
}));
const { replace, createProject, getProjects, setAfterSignIn } = mocks;

const sessionState = vi.hoisted(() => ({ session: null as { user: Record<string, unknown> } | null }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/services/auth/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: sessionState.session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
  isSupabaseConfigured: () => true,
}));
vi.mock("@/services/projects", () => ({ projectsService: { getProjects: mocks.getProjects, createProject: mocks.createProject } }));
vi.mock("@/services/auth/guest", () => ({
  claimPendingGuest: async () => {},
  clearPendingGuestClaim: () => {},
  hadAccountHere: () => false,
  isGuestUser: (u: { is_anonymous?: boolean; email?: string | null } | null | undefined) => !!u?.is_anonymous && !u.email,
  takeAfterSignIn: () => null,
  setAfterSignIn: mocks.setAfterSignIn,
}));
vi.mock("@/services/marketing", () => ({ captureEmailSubscription: async () => {} }));
vi.mock("@/features/onboarding/survey", () => ({ isOnboardingDone: () => true }));
vi.mock("@/features/transcribe/browserWhisper", () => ({ warmSpeechModel: vi.fn() }));

import StartPage from "../page";

const guestSession = { user: { is_anonymous: true } };
const realSession = { user: { is_anonymous: false, email: "parrr@example.com" } };

beforeEach(() => {
  window.localStorage.clear();
  replace.mockClear();
  createProject.mockClear();
  getProjects.mockClear();
  setAfterSignIn.mockClear();
});

describe("/start ?look= forwarding", () => {
  it("guest with a look: creates a fresh project and routes with ?look=", async () => {
    sessionState.session = guestSession;
    window.history.pushState({}, "", "/start?look=hormozi_box");
    render(<StartPage />);
    await waitFor(() => expect(createProject).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith("/projects/p9?look=hormozi_box");
  });

  it("signed-in user with a look: creates a fresh project and routes with ?look=", async () => {
    sessionState.session = realSession;
    window.history.pushState({}, "", "/start?look=kinetic_mix");
    render(<StartPage />);
    await waitFor(() => expect(createProject).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith("/projects/p9?look=kinetic_mix");
  });

  it("guest without a look keeps the old behaviour: no fresh project when one exists", async () => {
    sessionState.session = guestSession;
    getProjects.mockResolvedValueOnce([{ id: "p1", title: "Untitled 001", archived_at: null, deleted_at: null, updated_at: "2026-11-22T00:00:00Z" }]);
    window.history.pushState({}, "", "/start");
    render(<StartPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/projects/p1"));
    expect(createProject).not.toHaveBeenCalled();
  });

  it("signed-out visitor with a look: sent to sign-up with the look as the login redirect", async () => {
    sessionState.session = null;
    window.history.pushState({}, "", "/start?look=hormozi_box");
    render(<StartPage />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/login?mode=signup&redirect=%2Fstart%3Flook%3Dhormozi_box"),
    );
    expect(createProject).not.toHaveBeenCalled();
  });

  it("an unknown look id is ignored: a plain fresh project, no ?look=", async () => {
    sessionState.session = guestSession;
    window.history.pushState({}, "", "/start?look=no_such_look");
    render(<StartPage />);
    await waitFor(() => expect(createProject).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith("/projects/p9");
  });
});
