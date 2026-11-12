import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * AI Clipper section route: renders its own heading and project picker,
 * separate from /clipper, and offers no link/URL input — files come from the
 * device only (G6 verdict stands).
 */

vi.mock("@/components/studio/StudioShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/services/auth", () => ({
  authService: { isAuthenticated: () => true },
}));

vi.mock("@/services/auth/supabaseClient", () => ({
  isSupabaseConfigured: () => true,
}));

vi.mock("@/services/projects", () => ({
  projectsService: {
    getProjectsPage: async () => ({ projects: [] }),
    createProject: async () => ({ id: "p-new" }),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { projects: [] }, isLoading: false, isError: false, refetch: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/features/ai-clipper/AiClipperWorkspace", () => ({
  AiClipperWorkspace: () => <div>ai-clipper workspace</div>,
}));

import AiClipperPage from "../page";

describe("ai-clipper page", () => {
  it("renders its own heading and empty state, with no URL input", () => {
    render(<AiClipperPage />);
    expect(screen.getByRole("heading", { name: "AI Clipper" })).toBeTruthy();
    expect(screen.getByText(/ranked short clips out/)).toBeTruthy();
    expect(screen.getByText(/No long video yet/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Start with a new long video/ })).toBeTruthy();
    expect(document.querySelector('input[type="url"]')).toBeNull();
    expect(screen.queryByText(/paste a link/i)).toBeNull();
    expect(screen.queryByText(/YouTube/i)).toBeNull();
  });
});
