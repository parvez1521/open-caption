import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AiGeneratePanel } from "../panels/AiGeneratePanel";
import type { AiEditPlanItem } from "../aiEditPlanner";

vi.mock("next/script", () => ({ default: () => null }));

const mockSdk = {
  sdkStatus: "ready" as const,
  signedIn: false as boolean | null,
  loadAttempt: 0,
  signInError: "",
  retryLoad: vi.fn(),
  signIn: vi.fn(async () => {
    mockSdk.signedIn = true;
  }),
  refreshSignedIn: vi.fn(),
  handleScriptLoad: vi.fn(),
  handleScriptError: vi.fn(),
};
vi.mock("../../ai-generator/usePuterSdk", () => ({ usePuterSdk: () => mockSdk }));

const txt2img = vi.fn(async (_prompt: string) => ({ src: "https://example.invalid/gen.png" }));
const txt2vid = vi.fn(async (_prompt: string, _opts: unknown) => ({ src: "https://example.invalid/gen.mp4" }));
vi.mock("../../ai-generator/puter", () => ({
  getPuter: () => ({ ai: { txt2img, txt2vid }, auth: { isSignedIn: () => mockSdk.signedIn } }),
  puterErrorMessage: (err: unknown) => (err instanceof Error ? err.message : "Puter failed."),
}));

// The media bin: whatever the panel just imported is what the bin lists.
let importedName = "";
vi.mock("../mediaStore", () => ({
  listProjectAssets: async () => [
    { id: "asset-1", projectId: "p1", kind: "image", name: importedName, mime: "image/png", size: 10, durationMs: 5000, blob: new Blob(["x"]), createdAt: 1 },
  ],
}));

const PLAN: AiEditPlanItem[] = [
  { startMs: 0, endMs: 2000, kind: "image", prompt: "a sunrise over hills", sourceText: "hello world" },
  { startMs: 5000, endMs: 9000, kind: "video", prompt: "a forest at dawn", sourceText: "now a new idea" },
];

function renderPanel(overrides: Partial<React.ComponentProps<typeof AiGeneratePanel>> = {}) {
  const props: React.ComponentProps<typeof AiGeneratePanel> = {
    projectId: "p1",
    getTimeMs: () => 0,
    hasVideo: true,
    videoLocked: false,
    onImportMedia: vi.fn(async (files: File[]) => {
      importedName = files[0]?.name ?? "";
      return [];
    }),
    onPlaceImage: vi.fn(),
    onPlaceImageAt: vi.fn(),
    onInsertVideo: vi.fn(() => true),
    onUploadVideo: vi.fn(async () => []),
    transcript: {
      state: "ready",
      words: [
        { text: "hello", startMs: 0, endMs: 400 },
        { text: "world", startMs: 500, endMs: 900 },
        { text: "now", startMs: 5000, endMs: 5400 },
      ],
    },
    onTranscribe: vi.fn(),
    planRunner: vi.fn(async () => ({ plan: PLAN, dropped: 0 })),
    durationMs: 20_000,
    ...overrides,
  };
  const utils = render(<AiGeneratePanel {...props} />);
  return { ...utils, props };
}

describe("AiGeneratePanel — sign-in gates generation, not upload", () => {
  it("upload works without Puter sign-in; the sign-in box waits at step 4", async () => {
    mockSdk.signedIn = false;
    const { props, rerender } = renderPanel({ hasVideo: false });
    expect(screen.getByRole("button", { name: "Upload video" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "Sign in with Puter" })).toBeTruthy();
    expect(screen.queryByText(/Upload is locked/)).toBeNull();

    mockSdk.signedIn = true;
    rerender(<AiGeneratePanel {...props} />);
    expect(screen.queryByRole("button", { name: "Sign in with Puter" })).toBeNull();
    expect(screen.getByText(/Signed in — press Generate on any approved prompt in step 3/)).toBeTruthy();
  });

  it("uploads a video without signing in", async () => {
    mockSdk.signedIn = false;
    const { props } = renderPanel({ hasVideo: false });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["video"], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.queryByText("Adding…")).toBeNull());
    expect(props.onUploadVideo).toHaveBeenCalledTimes(1);
  });

  it("planning works without sign-in, but Generate stays locked until sign-in", async () => {
    mockSdk.signedIn = false;
    const { props, rerender } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Make a visual plan" }));
    await waitFor(() => expect(screen.getByText("a sunrise over hills")).toBeTruthy());
    const generate = screen.getByRole("button", { name: "Generate this image" });
    expect(generate.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Generation needs a free Puter sign-in — step 4/)).toBeTruthy();

    mockSdk.signedIn = true;
    rerender(<AiGeneratePanel {...props} />);
    expect(screen.getByRole("button", { name: "Generate this image" }).hasAttribute("disabled")).toBe(false);
  });
});

describe("AiGeneratePanel — guided steps", () => {
  it("each step says what it needs: no video blocks listen and plan, no transcript blocks the plan", () => {
    mockSdk.signedIn = true;
    renderPanel({ hasVideo: false, transcript: { state: "idle", words: [] } });
    expect(screen.getByText("1. Add your video")).toBeTruthy();
    expect(screen.getByText(/Add a video first — the plan is built from the words in your video/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Listen to the video" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Make a visual plan" })).toBeNull();
  });

  it("with a video but no transcript yet, step 3 waits for step 2", () => {
    mockSdk.signedIn = true;
    renderPanel({ transcript: { state: "idle", words: [] } });
    expect(screen.getByRole("button", { name: "Listen to the video" })).toBeTruthy();
    expect(screen.getByText(/Listen to the video first — the plan follows what is said/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Make a visual plan" })).toBeNull();
  });

  it("transcribing shows progress in step 2", () => {
    mockSdk.signedIn = true;
    renderPanel({ transcript: { state: "transcribing", words: [], progress: 0.5 } });
    expect(screen.getByText(/Listening to the video… 50%/)).toBeTruthy();
  });
});

describe("AiGeneratePanel — style chooser", () => {
  it("renders a preview per style", () => {
    mockSdk.signedIn = true;
    const { container } = renderPanel();
    expect(container.querySelectorAll('svg[role="img"]').length).toBe(4);
    for (const label of ["Cinematic", "Clean", "Bold", "Warm"]) expect(screen.getByText(label)).toBeTruthy();
  });
});

describe("AiGeneratePanel — transcript plan to timeline", () => {
  it("plans from the transcript, shows placements with timestamps, and generates + places a visual at its planned time", async () => {
    mockSdk.signedIn = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(["bytes"], { type: "image/png" }) })),
    );
    const { props } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Make a visual plan" }));
    await waitFor(() => expect(screen.getByText("a sunrise over hills")).toBeTruthy());
    expect(screen.getByText(/0:00 – 0:02 · Image/)).toBeTruthy();
    expect(screen.getByText(/0:05 – 0:09 · Video/)).toBeTruthy();
    expect(props.planRunner).toHaveBeenCalledWith(
      expect.objectContaining({ styleId: "cinematic", durationMs: 20_000 }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Generate this image" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add to timeline" })).toBeTruthy());
    expect(txt2img).toHaveBeenCalledWith(expect.stringContaining("a sunrise over hills"));

    fireEvent.click(screen.getByRole("button", { name: "Add to timeline" }));
    await waitFor(() => expect(props.onPlaceImageAt).toHaveBeenCalled());
    expect(props.onImportMedia).toHaveBeenCalledTimes(1);
    expect(props.onPlaceImageAt).toHaveBeenCalledWith({ id: "asset-1", name: expect.stringContaining("AI image") }, 0);
    vi.unstubAllGlobals();
  });

  it("asks to listen first when there is no transcript yet", () => {
    mockSdk.signedIn = true;
    const onTranscribe = vi.fn();
    renderPanel({ transcript: { state: "idle", words: [] }, onTranscribe });
    fireEvent.click(screen.getByRole("button", { name: "Listen to the video" }));
    expect(onTranscribe).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Make a visual plan" })).toBeNull();
  });
});
