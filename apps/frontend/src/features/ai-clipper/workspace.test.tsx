import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * AI Clipper workspace honest states: a missing project, a project with no
 * video, and a project with no captions all say so plainly and point at the
 * Studio — the section never pretends it can clip what is not there.
 */

const studioState = vi.hoisted(() => ({
  query: { isLoading: false },
  data: null as unknown,
  doc: null as unknown,
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("@/features/studio/useStudio", () => ({
  useStudio: () => studioState,
}));

vi.mock("@/features/upload/useDeviceVideo", () => ({
  useDeviceVideo: () => ({ video: null }),
}));

vi.mock("@/features/studio/useWaveform", () => ({
  useWaveform: () => ({ peaks: null }),
  PEAKS_PER_SECOND: 10,
}));

vi.mock("@/features/clipper/useSceneAnalysis", () => ({
  useSceneAnalysis: () => ({ cuts: [], state: "idle" }),
}));

vi.mock("@/features/clipper/highlightAi", () => ({
  fetchClipAiStatus: async () => null,
  runClipCloudModel: async () => "",
}));

vi.mock("@/features/create/localModel", () => ({
  onModelState: () => () => undefined,
  runLocalModel: async () => "",
}));

import { AiClipperWorkspace } from "./AiClipperWorkspace";

describe("AiClipperWorkspace honest states", () => {
  it("says the project could not be found", () => {
    studioState.data = null;
    studioState.doc = null;
    render(<AiClipperWorkspace projectId="missing" />);
    expect(screen.getByText(/could not be found/)).toBeTruthy();
  });

  it("says a project with no video has no video yet, with a link into the Studio", () => {
    studioState.data = { project: { title: "Long video" }, video: null };
    studioState.doc = null;
    render(<AiClipperWorkspace projectId="p1" />);
    expect(screen.getByText(/has no video yet/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open the project to add one/ }).getAttribute("href")).toBe("/projects/p1");
  });

  it("says a video with no captions needs its captions first", () => {
    studioState.data = {
      project: { title: "Long video" },
      video: { id: "v1", durationMs: 60000 },
    };
    studioState.doc = null;
    render(<AiClipperWorkspace projectId="p1" />);
    expect(screen.getByText(/needs its captions first/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open the project to caption it/ }).getAttribute("href")).toBe("/projects/p1");
  });
});
