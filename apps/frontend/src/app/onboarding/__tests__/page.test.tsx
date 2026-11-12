import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ONBOARDING_ANSWERS_KEY, ONBOARDING_DONE_KEY } from "@/features/onboarding/survey";

/**
 * Onboarding survey page: Q1 then Q2, one screen at a time, Skip on every
 * step, Back on Q2. The last answer stores both answers (localStorage only)
 * and routes to the chosen tool. Guests and flag-set users are sent back to
 * /start instead of seeing the survey.
 */

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
const sessionState = vi.hoisted(() => ({
  // a signed-in, non-anonymous user by default; tests override per case
  user: { id: "u1", is_anonymous: false, email: "a@example.com" } as Record<string, unknown> | null,
}));

vi.mock("next/navigation", () => ({ useRouter: () => nav }));

vi.mock("@/services/auth/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: sessionState.user ? { user: sessionState.user } : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
  isSupabaseConfigured: () => true,
}));

import OnboardingPage from "../page";

describe("onboarding page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    sessionState.user = { id: "u1", is_anonymous: false, email: "a@example.com" };
  });

  it("shows Q1 first with progress, then Q2 on an answer", async () => {
    render(<OnboardingPage />);
    expect(await screen.findByText("Aap kya ho?")).toBeTruthy();
    expect(screen.getByText("1 of 2")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Creator" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Back/ })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Freelance video editor" }));
    expect(await screen.findByText("Aapko kya chahiye?")).toBeTruthy();
    expect(screen.getByText("2 of 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  });

  it("Back on Q2 returns to Q1 without marking done", async () => {
    render(<OnboardingPage />);
    fireEvent.click(await screen.findByRole("radio", { name: "Creator" }));
    await screen.findByText("Aapko kya chahiye?");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Aap kya ho?")).toBeTruthy();
    expect(window.localStorage.getItem(ONBOARDING_DONE_KEY)).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("the last answer stores both answers, marks done, and routes to the tool", async () => {
    render(<OnboardingPage />);
    fireEvent.click(await screen.findByRole("radio", { name: "Creator" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Transcribe a video or audio" }));
    expect(nav.replace).toHaveBeenCalledWith("/transcribe");
    expect(window.localStorage.getItem(ONBOARDING_DONE_KEY)).toBe("1");
    expect(JSON.parse(window.localStorage.getItem(ONBOARDING_ANSWERS_KEY)!)).toEqual({
      userType: "creator",
      goal: "transcribe",
    });
  });

  it("edit routes to the Normal Editor door and captions to the Captions home", async () => {
    const first = render(<OnboardingPage />);
    fireEvent.click(await screen.findByRole("radio", { name: "Teacher / educator" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Edit a video" }));
    expect(nav.replace).toHaveBeenCalledWith("/editor");

    nav.replace.mockClear();
    window.localStorage.clear();
    first.unmount();
    render(<OnboardingPage />);
    fireEvent.click(await screen.findByRole("radio", { name: "Business / brand" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Add captions to a video" }));
    expect(nav.replace).toHaveBeenCalledWith("/captions");
  });

  it("Skip marks the survey done and goes to /start, never showing again", async () => {
    render(<OnboardingPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    expect(nav.replace).toHaveBeenCalledWith("/start");
    expect(window.localStorage.getItem(ONBOARDING_DONE_KEY)).toBe("1");
  });

  it("a guest (anonymous session) never sees the survey", async () => {
    sessionState.user = { id: "g1", is_anonymous: true };
    render(<OnboardingPage />);
    // the guard redirects before any question renders
    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/start"));
    expect(screen.queryByText("Aap kya ho?")).toBeNull();
  });

  it("a returning user (flag set) is sent straight to /start", async () => {
    window.localStorage.setItem(ONBOARDING_DONE_KEY, "1");
    render(<OnboardingPage />);
    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/start"));
    expect(screen.queryByText("Aap kya ho?")).toBeNull();
  });
});
