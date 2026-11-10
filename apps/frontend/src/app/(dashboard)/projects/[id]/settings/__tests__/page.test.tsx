import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Per-project settings page (slice 8.3): every control is wired to the REAL
 * storage the rest of the app reads — details go through the project PATCH
 * service, export defaults are written as the FULL parsed settings object
 * (never a partial blob), and delete goes through the project delete
 * service. Services are mocked at the module boundary; nothing here talks
 * to a network.
 */

const calls = vi.hoisted(() => ({
  updateProjectDetails: vi.fn(async () => ({})),
  deleteProject: vi.fn(async () => undefined),
  archiveProject: vi.fn(async () => ({})),
  unarchiveProject: vi.fn(async () => ({})),
  savePatch: vi.fn(async () => ({})),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "proj-1" }),
  useRouter: () => ({ push: calls.push }),
}));
vi.mock("@/components/studio/StudioShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/services/projects", () => ({
  projectsService: {
    getProjectById: async () => ({
      id: "proj-1",
      title: "My Video",
      description: "A demo project",
      status: "CREATED",
      language: "en",
      aspect_ratio: "9:16",
      folder: "Podcast",
      tags: ["hook"],
      created_at: "2026-11-10T06:00:00.000Z",
      updated_at: "2026-11-10T06:00:00.000Z",
      archived_at: undefined,
    }),
    updateProjectDetails: calls.updateProjectDetails,
    deleteProject: calls.deleteProject,
    archiveProject: calls.archiveProject,
    unarchiveProject: calls.unarchiveProject,
  },
}));
vi.mock("@/services/studio", () => ({
  studioService: {
    getStudio: async () => ({
      project: {
        id: "proj-1",
        title: "My Video",
        status: "ready",
        language: "en",
        aspect_ratio: "9:16",
        look_id: null,
        template_id: null,
        style_json: null,
        settings_json: { exportSettings: { resolution: "720p", fps: 60 }, maxWordsPerCard: 4 },
        platform: "reels",
      },
      video: null,
      document: { revision: 1, doc: null },
      job: null,
      canTranscribe: true,
      cloudAvailable: false,
    }),
    savePatch: calls.savePatch,
  },
}));

import ProjectSettingsPage from "../page";

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectSettingsPage />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProjectSettingsPage", () => {
  it("loads the project's real values into the controls", async () => {
    renderPage();
    expect(await screen.findByDisplayValue("My Video")).toBeTruthy();
    expect(screen.getByDisplayValue("A demo project")).toBeTruthy();
    expect(screen.getByDisplayValue("Podcast")).toBeTruthy();
    expect(screen.getByDisplayValue("hook")).toBeTruthy();
    // export defaults come from settings_json.exportSettings (720p/60), not the schema defaults
    const resolution = screen.getByLabelText("Resolution") as HTMLSelectElement;
    expect(resolution.value).toBe("720p");
    const fps = screen.getByLabelText("Frame rate") as HTMLSelectElement;
    expect(fps.value).toBe("60");
  });

  it("saving details sends one PATCH-shaped call with every detail field", async () => {
    renderPage();
    const title = await screen.findByDisplayValue("My Video");
    fireEvent.change(title, { target: { value: "Renamed" } });
    fireEvent.click(screen.getByText("Save details"));
    await waitFor(() => expect(calls.updateProjectDetails).toHaveBeenCalledTimes(1));
    expect(calls.updateProjectDetails).toHaveBeenCalledWith("proj-1", {
      title: "Renamed",
      description: "A demo project",
      language: "en",
      platform: "reels",
      aspect_ratio: "9:16",
      folder: "Podcast",
      tags: ["hook"],
    });
    expect(await screen.findByText("Saved.")).toBeTruthy();
  });

  it("saving export defaults writes the FULL settings object with only exportSettings changed", async () => {
    renderPage();
    const resolution = await screen.findByLabelText("Resolution");
    fireEvent.change(resolution, { target: { value: "4k" } });
    fireEvent.click(screen.getByText("Save export defaults"));
    await waitFor(() => expect(calls.savePatch).toHaveBeenCalledTimes(1));
    const [id, patch] = calls.savePatch.mock.calls[0] as unknown as [string, { settings_json: Record<string, unknown>; composition_json?: unknown }];
    expect(id).toBe("proj-1");
    // the pre-existing setting survives the write — no partial-blob clobber
    expect(patch.settings_json.maxWordsPerCard).toBe(4);
    expect(patch.settings_json.exportSettings).toEqual({ resolution: "4k", fps: 60 });
    // Stage C is enabled in the app, so the composition dual-write rides along
    expect(patch).toHaveProperty("composition_json");
  });

  it("delete asks first, then calls the real delete service and leaves to the projects list", async () => {
    renderPage();
    await screen.findByDisplayValue("My Video");
    fireEvent.click(screen.getByText("Delete project"));
    expect(calls.deleteProject).not.toHaveBeenCalled();
    expect(screen.getByText("Delete this project?")).toBeTruthy();
    const buttons = screen.getAllByText("Delete project");
    fireEvent.click(buttons[buttons.length - 1]!);
    await waitFor(() => expect(calls.deleteProject).toHaveBeenCalledWith("proj-1"));
    await waitFor(() => expect(calls.push).toHaveBeenCalledWith("/captions"));
  });
});
