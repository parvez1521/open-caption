import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectsList from "../ProjectsList";
import type { Project } from "@/services/types";

/**
 * MA-A2-005: the dashboard modals (create / folder & tags / delete) had no
 * Esc close, no focus trap and no role="dialog" — unlike the Studio modals,
 * which use the shared useDialogEscapeAndTrap hook. They now reuse that hook
 * (role="dialog", alertdialog for the destructive delete). The create input's
 * autoFocus is gone: the hook owns initial focus and lands it on the dialog.
 * Mock setup copied from projectsListPagination.test.tsx.
 */

const nav = vi.hoisted(() => ({ go: vi.fn(), busy: () => () => undefined, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
const getProjectsPage = vi.hoisted(() =>
  vi.fn(async ({ offset = 0 }: { offset?: number } = {}) => {
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
    return { projects: [mk(offset)], total: 1, limit: 100, offset, orgReady: true };
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

async function openCardMenu() {
  expect(await screen.findByText("Project 0")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Actions for Project 0"));
}

describe("ProjectsList — dashboard modals (MA-A2-005)", () => {
  it("create modal is a dialog: role + aria-modal, focus lands on it, Escape closes it", async () => {
    renderList();
    expect(await screen.findByText("Project 0")).toBeTruthy();
    fireEvent.click(screen.getByText("+ New project"));
    const dialog = screen.getByRole("dialog", { name: "New project" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "New project" })).toBeNull();
  });

  it("Tab from the create modal's last control wraps to the first", async () => {
    renderList();
    expect(await screen.findByText("Project 0")).toBeTruthy();
    fireEvent.click(screen.getByText("+ New project"));
    const dialog = screen.getByRole("dialog", { name: "New project" });
    const last = screen.getByRole("button", { name: "New blank project" });
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(dialog.querySelector("input"));
  });

  it("delete modal is an alertdialog and Escape closes it without deleting", async () => {
    renderList();
    await openCardMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete this project" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("alertdialog", { name: "Delete this project" })).toBeNull();
  });

  it("folder & tags modal is a dialog and Escape closes it", async () => {
    renderList();
    await openCardMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Folder & tags…" }));
    const dialog = screen.getByRole("dialog", { name: "Folder & tags" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Folder & tags" })).toBeNull();
  });
});
