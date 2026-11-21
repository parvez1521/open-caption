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

const READY_TRANSCRIPT = {
  state: "ready" as const,
  words: [
    { text: "hello", startMs: 0, endMs: 400 },
    { text: "world", startMs: 500, endMs: 900 },
    { text: "now", startMs: 5000, endMs: 5400 },
  ],
};

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
    transcript: READY_TRANSCRIPT,
    onTranscribe: vi.fn(),
    planRunner: vi.fn(async () => ({ plan: PLAN, dropped: 0 })),
    durationMs: 20_000,
    ...overrides,
  };
  const utils = render(<AiGeneratePanel {...props} />);
  return { ...utils, props };
}

describe("AiGeneratePanel — sign-in gates generation, not upload", () => {
  it("upload works without Puter sign-in, and no sign-in box shows until a run needs it", async () => {
    mockSdk.signedIn = false;
    const { props } = renderPanel({ hasVideo: false });
    expect(screen.getByRole("button", { name: "Upload video" }).hasAttribute("disabled")).toBe(false);
    expect(screen.queryByRole("button", { name: "Sign in with Puter" })).toBeNull();
    expect(screen.queryByText(/Upload is locked/)).toBeNull();
    expect(props.onUploadVideo).not.toHaveBeenCalled();
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
});

describe("AiGeneratePanel — one tap runs the whole chain", () => {
  it("plans from the transcript, then generates + places every visual at its planned time, on its own", async () => {
    mockSdk.signedIn = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(["bytes"], { type: "image/png" }) })),
    );
    const { props } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Create visuals" }));
    await waitFor(() => expect(screen.getByText("a sunrise over hills")).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByText(/0:00 – 0:02 · Image/)).toBeTruthy();
    expect(screen.getByText(/0:05 – 0:09 · Video/)).toBeTruthy();
    expect(props.planRunner).toHaveBeenCalledWith(
      expect.objectContaining({ styleId: "cinematic", durationMs: 20_000 }),
    );

    await waitFor(() => expect(screen.getByText(/2 visuals on your timeline/)).toBeTruthy(), { timeout: 5000 });
    expect(txt2img).toHaveBeenCalledWith(expect.stringContaining("a sunrise over hills"));
    expect(txt2vid).toHaveBeenCalledWith(expect.stringContaining("a forest at dawn"), expect.anything());
    expect(props.onImportMedia).toHaveBeenCalledTimes(2);
    expect(props.onPlaceImageAt).toHaveBeenCalledWith({ id: "asset-1", name: expect.stringContaining("AI image") }, 0);
    expect(props.onInsertVideo).toHaveBeenCalledWith(
      { id: "asset-1", name: expect.stringContaining("AI video"), durationMs: 5000 },
      5000,
    );
    vi.unstubAllGlobals();
  });

  it("listens and plans without sign-in, then waits for sign-in and resumes generating on its own", async () => {
    mockSdk.signedIn = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(["bytes"], { type: "image/png" }) })),
    );
    const { props, rerender } = renderPanel();
    const imgCallsBefore = txt2img.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Create visuals" }));
    await waitFor(() => expect(screen.getByText("a sunrise over hills")).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByRole("button", { name: "Sign in with Puter" })).toBeTruthy();
    expect(txt2img.mock.calls.length).toBe(imgCallsBefore);

    mockSdk.signedIn = true;
    rerender(<AiGeneratePanel {...props} />);
    // the waiting chain notices the sign-in on the next poll and carries on by itself.
    await waitFor(() => expect(screen.getByText(/2 visuals on your timeline/)).toBeTruthy(), { timeout: 5000 });
    expect(txt2img.mock.calls.length).toBe(imgCallsBefore + 1);
    vi.unstubAllGlobals();
  });

  it("starts listening when there is no transcript yet, then carries on once the words arrive", async () => {
    mockSdk.signedIn = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(["bytes"], { type: "image/png" }) })),
    );
    const onTranscribe = vi.fn();
    const { props, rerender } = renderPanel({ transcript: { state: "idle", words: [] }, onTranscribe });
    fireEvent.click(screen.getByRole("button", { name: "Create visuals" }));
    expect(onTranscribe).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Listening to your video/)).toBeTruthy();

    rerender(<AiGeneratePanel {...props} transcript={READY_TRANSCRIPT} />);
    await waitFor(() => expect(screen.getByText(/2 visuals on your timeline/)).toBeTruthy(), { timeout: 5000 });
    expect(props.planRunner).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("one failed visual does not stop the rest, and its retry works", async () => {
    mockSdk.signedIn = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(["bytes"], { type: "image/png" }) })),
    );
    txt2img.mockRejectedValueOnce(new Error("Puter failed."));
    const { props } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Create visuals" }));
    await waitFor(() => expect(screen.getByText(/1 visual on your timeline — 1 failed/)).toBeTruthy(), { timeout: 5000 });
    expect(props.onInsertVideo).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Puter failed/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry 1 failed visual" }));
    await waitFor(() => expect(screen.getByText(/2 visuals on your timeline/)).toBeTruthy(), { timeout: 5000 });
    expect(props.onPlaceImageAt).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("a failed plan says so instead of spinning", async () => {
    mockSdk.signedIn = true;
    renderPanel({ planRunner: vi.fn(async () => { throw new Error("The free AI service is not switched on yet."); }) });
    fireEvent.click(screen.getByRole("button", { name: "Create visuals" }));
    await waitFor(() => expect(screen.getByText(/The free AI service is not switched on yet/)).toBeTruthy(), { timeout: 5000 });
  });

  it("an empty plan with words in the transcript does not blame the speech", async () => {
    mockSdk.signedIn = true;
    renderPanel({ planRunner: vi.fn(async () => ({ plan: [], dropped: 0 })) });
    fireEvent.click(screen.getByRole("button", { name: "Create visuals" }));
    await waitFor(() => expect(screen.getByText(/The free AI answered but made no visuals from this transcript/)).toBeTruthy(), { timeout: 5000 });
    expect(screen.queryByText(/no clear speech/)).toBeNull();
  });
});

describe("AiGeneratePanel — no video, no run", () => {
  it("without a video the run button is disabled and the look is locked", () => {
    mockSdk.signedIn = true;
    renderPanel({ hasVideo: false, transcript: { state: "idle", words: [] } });
    expect(screen.getByRole("button", { name: "Create visuals" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Add a video first — the look applies to the visuals made for it/)).toBeTruthy();
  });

  it("transcribing shows progress while the run waits", () => {
    mockSdk.signedIn = true;
    renderPanel({ transcript: { state: "transcribing", words: [], progress: 0.5 } });
    fireEvent.click(screen.getByRole("button", { name: "Create visuals" }));
    expect(screen.getByText(/Listening to your video… 50%/)).toBeTruthy();
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
