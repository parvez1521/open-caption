import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectsList from "../ProjectsList";
import type { Project } from "@/services/types";

/**
 * Dashboard project lists (Studio revision phase 2, Task 9; AI Edit
 * workflow 2026-11-20):
 * - the caption list never shows AI-Edit projects; they live in their own
 *   AI Edit section;
 * - the AI Edit section ALWAYS renders — even with zero AI-Edit projects —
 *   with a first-class "New AI Edit project" button, so the workflow is
 *   visible instead of buried in the create modal;
 * - a project tagged "ai-edit" on the server lists under AI Edit on any
 *   device, with no local flag needed; the flag tag never shows as a chip;
 * - the create modal's "New blank project" creates a blank AI-Edit project
 *   and navigates to its timeline;
 * - the normal create flow is unchanged.
 */

const nav = vi.hoisted(() => ({ go: vi.fn(), busy: () => () => undefined, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
const createProject = vi.hoisted(() => vi.fn(async (title: string) => ({ id: "new-ai", title })));
const updateProjectOrg = vi.hoisted(() => vi.fn(async () => ({})));
const projectFixtures = vi.hoisted(() => {
  const base = (id: string, title: string, created: string, extra: Record<string, unknown> = {}) => ({
    id, title, status: "CREATED", created_at: created, updated_at: created, archived_at: null, deleted_at: null, ...extra,
  });
  return {
    defaults: () => [
      base("cap1", "Podcast ep 12", "2026-11-17T10:00:00.000Z"),
      base("cap2", "Hook cut", "2026-11-16T10:00:00.000Z"),
      base("ai1", "Untitled AI Edit", "2026-11-18T10:00:00.000Z"),
    ] as unknown as Project[],
    list: [] as unknown as Project[],
  };
});

vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/components/brand/BrandNav", () => ({ useBrandNav: () => nav }));
vi.mock("@/services/projects", () => ({
  projectsService: {
    getProjectsPage: () =>
      Promise.resolve({
        projects: projectFixtures.list,
        orgReady: true,
      }),
    createProject,
    deleteProject: vi.fn(),
    duplicateProject: vi.fn(),
    archiveProject: vi.fn(),
    unarchiveProject: vi.fn(),
    updateProjectOrg,
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
  projectFixtures.list = projectFixtures.defaults();
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

  it("the AI Edit section always renders — even with zero AI-Edit projects — with the workflow and a first-class button", async () => {
    window.localStorage.removeItem("oc:ai-edit-project:ai1");
    const { unmount } = renderList();
    try {
      expect(await screen.findByText("Podcast ep 12")).toBeTruthy();
      const section = screen.getByRole("region", { name: "AI Edit projects" });
      expect(section.textContent).toContain("Start blank, upload a video, plan visuals from what is said, and generate them with Puter.");
      expect(screen.getByRole("button", { name: "New AI Edit project" })).toBeTruthy();
      expect(section.textContent).toContain("No AI Edit projects yet.");
    } finally {
      unmount();
    }
  });

  it("'New AI Edit project' creates a blank AI-Edit project, tags it on the server, and opens its timeline", async () => {
    const { unmount } = renderList();
    try {
      expect(await screen.findByText("Podcast ep 12")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "New AI Edit project" }));
      await vi.waitFor(() => expect(createProject).toHaveBeenCalledWith("Untitled AI Edit"));
      await vi.waitFor(() => expect(updateProjectOrg).toHaveBeenCalledWith("new-ai", { tags: ["ai-edit"] }));
      await vi.waitFor(() => expect(nav.go).toHaveBeenCalledWith("/projects/new-ai", "Opening your AI Edit project"));
      expect(window.localStorage.getItem("oc:ai-edit-project:new-ai")).toBe("1");
    } finally {
      unmount();
    }
  });

  it("a server-tagged project lists under AI Edit on a device with no local flag", async () => {
    window.localStorage.removeItem("oc:ai-edit-project:ai1");
    projectFixtures.list = projectFixtures.defaults().map((p) =>
      p.id === "ai1" ? { ...p, tags: ["ai-edit", "hook"] } : p,
    );
    const { unmount } = renderList();
    try {
      expect(await screen.findByText("Podcast ep 12")).toBeTruthy();
      const section = screen.getByRole("region", { name: "AI Edit projects" });
      expect(section.textContent).toContain("Untitled AI Edit");
      // exactly one card with that title: it is NOT also in the caption list
      expect(screen.getAllByText("Untitled AI Edit")).toHaveLength(1);
      // the flag tag never shows as a chip; a real user tag does
      expect(section.textContent).toContain("hook");
      expect(section.textContent).not.toContain("ai-edit");
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
