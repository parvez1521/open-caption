import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectsList from "../ProjectsList";
import type { Project } from "@/services/types";

/**
 * MA-A4-001: the list used to render only the first 100 projects and never
 * say so. It now shows "Showing N of M" and a Load more button that fetches
 * the next page with offset.
 */

const nav = vi.hoisted(() => ({ go: vi.fn(), busy: () => () => undefined, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
const getProjectsPage = vi.hoisted(() =>
  vi.fn(async ({ offset = 0 }: { offset?: number } = {}) => {
    const total = 150;
    const mk = (i: number) =>
      ({
        id: `p${i}`,
        title: `Project ${i}`,
        status: "CREATED",
        created_at: "2026-11-17T10:00:00.000Z",
        updated_at: "2026-11-17T10:00:00.000Z",
        archived_at: null,
        deleted_at: null,
      }) as unknown as Project;
    const start = offset;
    const count = Math.min(100, total - start);
    return {
      projects: Array.from({ length: count }, (_, k) => mk(start + k)),
      total,
      limit: 100,
      offset,
      orgReady: true,
    };
  }),
);

vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/components/brand/BrandNav", () => ({ useBrandNav: () => nav }));
vi.mock("@/services/projects", () => ({
  projectsService: {
    getProjectsPage,
    createProject: vi.fn(),
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
});

describe("ProjectsList — pagination (MA-A4-001)", () => {
  it("shows 'Showing 100 of 150' and Load more fetches the next page with offset 100", async () => {
    const { unmount } = renderList();
    try {
      expect(await screen.findByText("Project 0")).toBeTruthy();
      // the count line shows both above the list and above the Load more button
      expect(screen.getAllByText(/Showing 100 of 150 projects/)).toHaveLength(2);
      const loadMore = screen.getByRole("button", { name: "Load more projects" });
      fireEvent.click(loadMore);
      expect(await screen.findByText("Project 149")).toBeTruthy();
      expect(getProjectsPage).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 100 }),
      );
      expect(screen.getAllByText(/Showing 150 of 150 projects/)).toHaveLength(1);
      expect(screen.queryByRole("button", { name: "Load more projects" })).toBeNull();
    } finally {
      unmount();
    }
  });
});
