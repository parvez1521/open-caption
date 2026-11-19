import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ONBOARDING_ANSWERS_KEY, ONBOARDING_DONE_KEY } from "@/features/onboarding/survey";

/**
 * Onboarding survey page: Q1 then Q2, one screen at a time, Skip on every
 * step, Back on Q2. The last answer stores both answers (localStorage only)
 * and lands on the dashboard, where the user picks the tool. Guests and
 * flag-set users are sent back to /start instead of seeing the survey.
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
    expect(await screen.findByText("What best describes you?")).toBeTruthy();
    expect(screen.getByText("1 of 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Creator" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Back/ })).toBeNull();
    // MA-A5-006: focus lands on the Q1 heading once the survey is ready
    expect(document.activeElement?.textContent).toBe("What best describes you?");

    fireEvent.click(screen.getByRole("button", { name: "Freelance video editor" }));
    expect(await screen.findByText("What do you want to do?")).toBeTruthy();
    expect(screen.getByText("2 of 2")).toBeTruthy();
    // MA-A5-006: the clicked option unmounts — focus must follow to the Q2 heading, not <body>
    expect(document.activeElement?.textContent).toBe("What do you want to do?");
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
  });

  it("Back on Q2 returns to Q1 without marking done", async () => {
    render(<OnboardingPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Creator" }));
    await screen.findByText("What do you want to do?");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("What best describes you?")).toBeTruthy();
    // MA-A5-006: Back also returns focus to the Q1 heading
    expect(document.activeElement?.textContent).toBe("What best describes you?");
    expect(window.localStorage.getItem(ONBOARDING_DONE_KEY)).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("the last answer stores both answers, marks done, and lands on the dashboard", async () => {
    render(<OnboardingPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Creator" }));
    fireEvent.click(await screen.findByRole("button", { name: "Transcribe a video or audio" }));
    expect(nav.replace).toHaveBeenCalledWith("/dashboard");
    expect(window.localStorage.getItem(ONBOARDING_DONE_KEY)).toBe("1");
    expect(JSON.parse(window.localStorage.getItem(ONBOARDING_ANSWERS_KEY)!)).toEqual({
      userType: "creator",
      goal: "transcribe",
    });
  });

  it("every goal finishes on the dashboard — the user picks the tool there", async () => {
    const first = render(<OnboardingPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Teacher / educator" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit a video" }));
    expect(nav.replace).toHaveBeenCalledWith("/dashboard");
    expect(JSON.parse(window.localStorage.getItem(ONBOARDING_ANSWERS_KEY)!)).toEqual({
      userType: "teacher",
      goal: "edit",
    });

    nav.replace.mockClear();
    window.localStorage.clear();
    first.unmount();
    render(<OnboardingPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Business / brand" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add captions to a video" }));
    expect(nav.replace).toHaveBeenCalledWith("/dashboard");
    expect(JSON.parse(window.localStorage.getItem(ONBOARDING_ANSWERS_KEY)!)).toEqual({
      userType: "business",
      goal: "captions",
    });
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
    expect(screen.queryByText("What best describes you?")).toBeNull();
  });

  it("a returning user (flag set) is sent straight to /start", async () => {
    window.localStorage.setItem(ONBOARDING_DONE_KEY, "1");
    render(<OnboardingPage />);
    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/start"));
    expect(screen.queryByText("What best describes you?")).toBeNull();
  });
});
