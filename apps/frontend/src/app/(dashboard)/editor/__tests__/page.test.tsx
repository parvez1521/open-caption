import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * AI Edit front door (/editor): the page must offer starting a NEW AI Edit
 * right here — not just list old projects. The "New AI Edit project"
 * button used to live only on the Dashboard, so opening AI Edit from the
 * sidebar showed nothing but the project list (owner report 2026-11-20).
 * Clicking it creates a blank AI-Edit project and opens its Studio, where
 * the guided 5-step panel lives.
 */

const nav = vi.hoisted(() => ({ go: vi.fn(), busy: vi.fn(() => vi.fn()) }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const queryState = vi.hoisted(() => ({
  data: { projects: [] as Array<{ id: string; title: string; created_at: string }> },
  isLoading: false,
  isError: false,
}));
const projectsService = vi.hoisted(() => ({
  getAllProjects: vi.fn(async () => ({ projects: [] })),
  createProject: vi.fn(async (title: string) => ({ id: "new-ai-edit-id", title })),
  updateProjectOrg: vi.fn(async () => ({})),
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ ...queryState, refetch: vi.fn() }),
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
vi.mock("@/components/brand/BrandNav", () => ({
  useBrandNav: () => nav,
}));
vi.mock("@/services/projects", () => ({ projectsService }));

import VideoEditorPage from "../page";

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  queryState.data = { projects: [] };
  queryState.isLoading = false;
  queryState.isError = false;
});

describe("AI Edit front door", () => {
  it("with zero projects the empty state offers a New AI Edit project, not just Captions", () => {
    render(<VideoEditorPage />);
    expect(screen.getAllByRole("button", { name: "New AI Edit project" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /go to Captions/i })).toBeTruthy();
  });

  it("with existing projects the header still offers a New AI Edit project", () => {
    queryState.data = {
      projects: [{ id: "p1", title: "Goibibo part 2", created_at: "2026-11-18T00:00:00.000Z" }],
    };
    render(<VideoEditorPage />);
    expect(screen.getByRole("button", { name: "New AI Edit project" })).toBeTruthy();
    // the title shows twice: Continue editing + the All projects grid
    expect(screen.getAllByText("Goibibo part 2")).toHaveLength(2);
  });

  it("clicking it creates a blank AI-Edit project and opens its Studio", async () => {
    render(<VideoEditorPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "New AI Edit project" })[0]);
    await waitFor(() => expect(projectsService.createProject).toHaveBeenCalledWith("Untitled AI Edit"));
    expect(projectsService.updateProjectOrg).toHaveBeenCalledWith("new-ai-edit-id", { tags: ["ai-edit"] });
    expect(nav.go).toHaveBeenCalledWith("/projects/new-ai-edit-id", "Opening your AI Edit project");
  });

  it("a failed creation shows the error instead of navigating anywhere", async () => {
    projectsService.createProject.mockRejectedValueOnce(new Error("network down"));
    render(<VideoEditorPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "New AI Edit project" })[0]);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("network down"));
    expect(nav.go).not.toHaveBeenCalled();
  });
});
