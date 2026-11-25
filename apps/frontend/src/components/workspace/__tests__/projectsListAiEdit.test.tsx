import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectsList from "../ProjectsList";
import type { Project } from "@/services/types";

/**
 * Dashboard project lists — AI Edit HIDDEN (owner order 2026-11-25):
 * - there is no AI Edit section and no "New AI Edit project" button
 *   anywhere while AI_EDIT_ENABLED is false;
 * - AI-Edit projects are NOT orphaned: they list with the caption
 *   projects instead (the flag tag still never shows as a chip), so an
 *   existing AI-Edit project stays reachable and opens in the Studio;
 * - the create modal has no AI Edit footer ("New blank project" gone);
 * - the normal create flow is unchanged.
 * To restore the old separation pins, flip the flag in
 * features/studio/aiEditEnabled.ts and re-add the AI Edit section tests.
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

describe("ProjectsList — AI Edit hidden", () => {
  it("no AI Edit section renders; AI-Edit projects list with the caption projects", async () => {
    const { unmount } = renderList();
    try {
      expect(await screen.findByText("Podcast ep 12")).toBeTruthy();
      expect(screen.getByText("Hook cut")).toBeTruthy();
      // the AI-Edit project is in the main list now, not a separate section
      expect(screen.getByText("Untitled AI Edit")).toBeTruthy();
      expect(screen.queryByRole("region", { name: "AI Edit projects" })).toBeNull();
      expect(screen.queryByRole("button", { name: "New AI Edit project" })).toBeNull();
    } finally {
      unmount();
    }
  });

  it("still no AI Edit section with zero AI-Edit projects", async () => {
    window.localStorage.removeItem("oc:ai-edit-project:ai1");
    const { unmount } = renderList();
    try {
      expect(await screen.findByText("Podcast ep 12")).toBeTruthy();
      expect(screen.queryByRole("region", { name: "AI Edit projects" })).toBeNull();
      expect(screen.queryByRole("button", { name: "New AI Edit project" })).toBeNull();
    } finally {
      unmount();
    }
  });

  it("a server-tagged project lists in the main list once, with no ai-edit chip", async () => {
    window.localStorage.removeItem("oc:ai-edit-project:ai1");
    projectFixtures.list = projectFixtures.defaults().map((p) =>
      p.id === "ai1" ? { ...p, tags: ["ai-edit", "hook"] } : p,
    );
    const { unmount } = renderList();
    try {
      expect(await screen.findByText("Podcast ep 12")).toBeTruthy();
      expect(screen.getAllByText("Untitled AI Edit")).toHaveLength(1);
      // a real user tag shows as a chip; the flag tag never does
      expect(document.body.textContent).toContain("hook");
      expect(document.body.textContent).not.toContain("ai-edit");
    } finally {
      unmount();
    }
  });

  it("the create modal has no AI Edit footer", async () => {
    const { unmount } = renderList();
    try {
      expect(await screen.findByText("Podcast ep 12")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "+ New project" }));
      expect(screen.queryByRole("button", { name: "New blank project" })).toBeNull();
      expect(screen.queryByText("AI Edit")).toBeNull();
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
