import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectsList from "../ProjectsList";
import type { Project } from "@/services/types";

/**
 * Dashboard project lists (Studio revision phase 2, Task 9):
 * - the caption list never shows AI-Edit projects; they live in their own
 *   AI Edit section;
 * - the create modal's "New blank project" creates a blank AI-Edit project
 *   and navigates to its timeline;
 * - the normal create flow is unchanged.
 */

const nav = vi.hoisted(() => ({ go: vi.fn(), busy: () => () => undefined, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
const createProject = vi.hoisted(() => vi.fn(async (title: string) => ({ id: "new-ai", title })));

vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/components/brand/BrandNav", () => ({ useBrandNav: () => nav }));
vi.mock("@/services/projects", () => ({
  projectsService: {
    getProjectsPage: () =>
      Promise.resolve({
        projects: [
          { id: "cap1", title: "Podcast ep 12", status: "CREATED", created_at: "2026-11-17T10:00:00.000Z", updated_at: "2026-11-17T10:00:00.000Z", archived_at: null, deleted_at: null },
          { id: "cap2", title: "Hook cut", status: "CREATED", created_at: "2026-11-16T10:00:00.000Z", updated_at: "2026-11-16T10:00:00.000Z", archived_at: null, deleted_at: null },
          { id: "ai1", title: "Untitled AI Edit", status: "CREATED", created_at: "2026-11-18T10:00:00.000Z", updated_at: "2026-11-18T10:00:00.000Z", archived_at: null, deleted_at: null },
        ] as unknown as Project[],
        orgReady: true,
      }),
    createProject,
    deleteProject: vi.fn(),
    duplicateProject: vi.fn(),
    archiveProject: vi.fn(),
    unarchiveProject: vi.fn(),
    updateProjectOrg: vi.fn(),
  },
}));
vi.mock("@/services/studio", () => ({ studioService: { getStudio: () => Promise.resolve({}) } }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function renderList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectsList />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  // the third fixture project is an AI-Edit project on this device
  window.localStorage.setItem("oc:ai-edit-project:ai1", "1");
});

describe("ProjectsList — AI Edit separation", () => {
  it("caption list hides AI-Edit projects; the AI Edit section lists only them", async () => {
    const { unmount } = renderList();
    try {
      expect(await screen.findByText("Podcast ep 12")).toBeTruthy();
      expect(screen.getByText("Hook cut")).toBeTruthy();
      const section = screen.getByRole("region", { name: "AI Edit projects" });
      expect(section.textContent).toContain("Untitled AI Edit");
      expect(section.textContent).not.toContain("Podcast ep 12");
      expect(section.textContent).not.toContain("Hook cut");
    } finally {
      unmount();
    }
  });

  it("'New blank project' creates a blank AI-Edit project and opens its timeline", async () => {
    const { unmount } = renderList();
    try {
      expect(await screen.findByText("Podcast ep 12")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "+ New project" }));
      fireEvent.click(screen.getByRole("button", { name: "New blank project" }));
      await vi.waitFor(() => expect(createProject).toHaveBeenCalledWith("Untitled AI Edit"));
      await vi.waitFor(() => expect(nav.go).toHaveBeenCalledWith("/projects/new-ai", "Opening your AI Edit project"));
      expect(window.localStorage.getItem("oc:ai-edit-project:new-ai")).toBe("1");
    } finally {
      unmount();
    }
  });

  it("the normal create flow is unchanged", async () => {
    const { unmount } = renderList();
    try {
      expect(await screen.findByText("Podcast ep 12")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "+ New project" }));
      fireEvent.change(screen.getByPlaceholderText("e.g. Podcast ep. 12 — hook cut"), { target: { value: "My caption project" } });
      fireEvent.click(screen.getByRole("button", { name: "Create project" }));
      await vi.waitFor(() => expect(createProject).toHaveBeenCalledWith("My caption project"));
      await vi.waitFor(() => expect(nav.go).toHaveBeenCalledWith(expect.stringContaining("/projects/new-ai?mode=captions"), "Opening your project"));
    } finally {
      unmount();
    }
  });
});
