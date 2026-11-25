import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * AI Edit front door (/editor) — HIDDEN (owner order 2026-11-25): while
 * AI_EDIT_ENABLED is false the page redirects to /dashboard instead of
 * rendering. The Dashboard lists every project, so no project access is
 * lost, and the old page body stays intact below the redirect — flipping
 * the flag in features/studio/aiEditEnabled.ts restores this front door.
 * To restore the old pins, flip the flag and re-add the "New AI Edit
 * project" tests that used to live here.
 */

const nav = vi.hoisted(() => ({ go: vi.fn(), busy: vi.fn(() => vi.fn()) }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const redirectMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_REDIRECT:/dashboard");
  }),
);
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

vi.mock("next/navigation", () => ({ useRouter: () => router, redirect: redirectMock }));
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

const here = path.dirname(fileURLToPath(import.meta.url));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  queryState.data = { projects: [] };
  queryState.isLoading = false;
  queryState.isError = false;
});

describe("AI Edit front door — hidden", () => {
  it("redirects to /dashboard instead of rendering", () => {
    // React re-attempts the throwing render, so the mock may be called
    // more than once — the pin is the destination, not the call count.
    expect(() => render(<VideoEditorPage />)).toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });

  it("renders nothing of the old front door — no New AI Edit button", () => {
    // The redirect throws during render, so the page body never mounts.
    expect(() => render(<VideoEditorPage />)).toThrow("NEXT_REDIRECT");
    expect(screen.queryByRole("button", { name: "New AI Edit project" })).toBeNull();
  });

  it("the old page body stays in the file behind the flag (source pin)", () => {
    const src = readFileSync(path.join(here, "../page.tsx"), "utf8");
    expect(src).toContain('if (!AI_EDIT_ENABLED) redirect("/dashboard")');
    expect(src).toContain("createBlankAiEditProject");
    expect(src).toContain("New AI Edit project");
  });
});
