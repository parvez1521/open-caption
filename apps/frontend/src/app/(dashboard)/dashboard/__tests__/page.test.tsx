import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ONBOARDING_ANSWERS_KEY } from "@/features/onboarding/survey";

/**
 * Dashboard wiring: the stored onboarding answers highlight the matching
 * tool door (Transcribe / Editor / Captions). No stored answers — skipped
 * survey, returning user, corrupt storage — means no highlight and no crash.
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
    isAuthenticated: () => true,
    getCurrentUser: async () => null,
    subscribeToUserChanges: () => () => {},
  },
}));

vi.mock("@/services/auth/supabaseClient", () => ({
  isSupabaseConfigured: () => true,
}));

vi.mock("@/components/studio/StudioShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/workspace/ProjectsList", () => ({
  default: () => null,
}));

import DashboardPage from "../page";

describe("dashboard survey highlight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("highlights the Transcribe door for stored goal transcribe", async () => {
    window.localStorage.setItem(
      ONBOARDING_ANSWERS_KEY,
      JSON.stringify({ userType: "creator", goal: "transcribe" }),
    );
    render(<DashboardPage />);
    expect(await screen.findByText("Recommended for you")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Transcribe, recommended for you" })).toHaveAttribute(
      "href",
      "/transcribe",
    );
    expect(screen.getByRole("link", { name: "Editor" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Captions" })).toBeTruthy();
  });

  it("highlights the Editor door for stored goal edit", async () => {
    window.localStorage.setItem(
      ONBOARDING_ANSWERS_KEY,
      JSON.stringify({ userType: "freelance-editor", goal: "edit" }),
    );
    render(<DashboardPage />);
    expect(await screen.findByText("Recommended for you")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Editor, recommended for you" })).toHaveAttribute(
      "href",
      "/editor",
    );
  });

  it("no stored answers means no highlight, all three doors still render", async () => {
    render(<DashboardPage />);
    await screen.findByRole("link", { name: "Transcribe" });
    expect(screen.queryByText("Recommended for you")).toBeNull();
    expect(document.querySelectorAll("[data-recommended]")).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Editor" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Captions" })).toBeTruthy();
  });

  it("corrupt stored answers mean no highlight and no crash", async () => {
    window.localStorage.setItem(ONBOARDING_ANSWERS_KEY, "{not json");
    render(<DashboardPage />);
    await screen.findByRole("link", { name: "Transcribe" });
    expect(screen.queryByText("Recommended for you")).toBeNull();
  });
});
