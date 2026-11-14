import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaptionDocSchema, type CaptionDoc } from "@capseasy/shared";
import { CaptionsPanel } from "../panels/CaptionsPanel";
import { aiEditIntroSeen, markAiEditIntroSeen, modeFromSearch, projectModeOf, setProjectMode, START_DOORS } from "../projectMode";

/**
 * Package 2 item G — the two doors. Covered here:
 *  - the device mode record (default = captions, editor round-trips, ?mode= parsing)
 *  - the Captions panel's "Generate captions" empty state (only when the action is
 *    provided; busy shows progress instead of the button)
 *  - the UploadPanel in editor mode: no language question, no transcription session,
 *    and the upload completes with the editorMode flag so the server opens the project
 *    with an empty caption document.
 */

describe("project mode record", () => {
  beforeEach(() => window.localStorage.clear());
  it("defaults every project to the captions door", () => {
    expect(projectModeOf("p1")).toBe("captions");
  });
  it("round-trips the editor door per project", () => {
    setProjectMode("p1", "editor");
    expect(projectModeOf("p1")).toBe("editor");
    expect(projectModeOf("p2")).toBe("captions");
    setProjectMode("p1", "captions");
    expect(projectModeOf("p1")).toBe("captions");
  });
  it("parses only the two real modes out of a query string", () => {
    expect(modeFromSearch("?mode=editor")).toBe("editor");
    expect(modeFromSearch("?mode=captions")).toBe("captions");
    expect(modeFromSearch("?mode=banana")).toBeNull();
    expect(modeFromSearch("")).toBeNull();
  });
});

describe("the retired AI Edit door falls back to captions", () => {
  beforeEach(() => window.localStorage.clear());
  it("a stored ai-edit record reads as the captions default", () => {
    window.localStorage.setItem("oc:project-mode:p1", "ai-edit");
    expect(projectModeOf("p1")).toBe("captions");
    expect(projectModeOf("p2")).toBe("captions");
  });
  it("?mode=ai-edit parses to nothing (the caller falls back to the default)", () => {
    expect(modeFromSearch("?mode=ai-edit")).toBeNull();
    expect(modeFromSearch("?mode=ai")).toBeNull();
  });
  it("the chooser offers exactly two doors, captions first", () => {
    expect(START_DOORS.map((d) => d.mode)).toEqual(["captions", "editor"]);
    for (const d of START_DOORS) {
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.sub.length).toBeGreaterThan(0);
    }
  });
  it("the first-run intro flag is per project and sticks", () => {
    expect(aiEditIntroSeen("p1")).toBe(false);
    markAiEditIntroSeen("p1");
    expect(aiEditIntroSeen("p1")).toBe(true);
    expect(aiEditIntroSeen("p2")).toBe(false);
  });
});

const emptyDoc: CaptionDoc = CaptionDocSchema.parse({ version: 2, language: "en", words: [] });

function renderCaptions(extra: Partial<React.ComponentProps<typeof CaptionsPanel>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CaptionsPanel
        doc={emptyDoc}
        pages={[]}
        currentPageId={null}
        timeMs={0}
        selectedId={null}
        onSelect={vi.fn()}
        onSeek={vi.fn()}
        edit={vi.fn()}
        heroSupported
        selectedWordIds={new Set()}
        onWordSelectionChange={vi.fn()}
        {...extra}
      />
    </QueryClientProvider>,
  );
}

describe("CaptionsPanel — Generate captions (Normal Editor projects)", () => {
  it("offers Generate captions in the empty state and fires it", () => {
    const onGenerateCaptions = vi.fn();
    renderCaptions({ onGenerateCaptions });
    expect(screen.getByText("No captions yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Generate captions" }));
    expect(onGenerateCaptions).toHaveBeenCalledTimes(1);
  });
  it("without the action, the plain no-speech empty state shows (no fake button)", () => {
    renderCaptions();
    expect(screen.getByText("No spoken words found")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Generate captions" })).toBeNull();
  });
  it("while generating, progress replaces the button", () => {
    renderCaptions({ onGenerateCaptions: vi.fn(), generateBusy: true, generateProgress: 0.42 });
    expect(screen.getByText(/Writing your captions… 42%/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Generate captions" })).toBeNull();
  });
});

// ---- UploadPanel: heavy neighbours mocked; the panel's own mode logic is what's tested
const uploadVideo = vi.fn();
const startSession = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/services/studio", () => ({ studioService: { uploadVideo: (...a: unknown[]) => uploadVideo(...a), savePatch: vi.fn(async () => ({})) } }));
vi.mock("@/features/transcribe/session", () => ({ startSession: (...a: unknown[]) => startSession(...a), getSession: () => null }));
vi.mock("@/features/transcribe/browserWhisper", () => ({ preloadSpeechModel: vi.fn() }));
vi.mock("@/features/upload/prepareVideo", () => ({
  PrepareError: class PrepareError extends Error { code = "X"; },
  prepareVideo: vi.fn(async (file: File) => ({
    file, durationMs: 60_000, width: 1080, height: 1920, rotation: 0,
    videoCodec: "avc1", audioCodec: "mp4a", hasAudio: true, previewMode: "native", needsCompat: false, converted: false,
  })),
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

import { UploadPanel } from "../UploadPanel";

describe("UploadPanel — the doors at upload time", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.matchMedia = vi.fn((q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia;
    uploadVideo.mockImplementation(async (_pid: string, _v: unknown, _p: unknown, _a: unknown, onRegistered?: (id: string) => void) => {
      onRegistered?.("vid-1");
      return { jobId: null, videoId: "vid-1" };
    });
  });

  it("editor mode: no language question, upload completes with editorMode, no session starts", async () => {
    const onUploaded = vi.fn();
    const { container } = render(<UploadPanel projectId="p1" onUploaded={onUploaded} mode="editor" onModeChange={vi.fn()} />);
    expect(screen.queryByText("Language spoken in the video")).toBeNull();
    expect(screen.getByRole("radio", { name: /Normal Editor/ })).toBeTruthy();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "clip.mp4", { type: "video/mp4" })] } });
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(startSession).not.toHaveBeenCalled();
    const opts = uploadVideo.mock.calls[0]?.[5] as { editorMode?: boolean } | undefined;
    expect(opts?.editorMode).toBe(true);
  });

  it("captions mode (the default door): the language question is asked, as today", () => {
    render(<UploadPanel projectId="p1" onUploaded={vi.fn()} />);
    expect(screen.getByText("Language spoken in the video")).toBeTruthy();
  });

  it("both doors render in the toggle", () => {
    render(<UploadPanel projectId="p1" onUploaded={vi.fn()} mode="captions" onModeChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /^Captions/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Normal Editor/ })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /^AI Edit/ })).toBeNull();
  });

  it("captions mode: transcription still happens — language asked, session starts", async () => {
    const onUploaded = vi.fn();
    const { container } = render(<UploadPanel projectId="p1" onUploaded={onUploaded} mode="captions" onModeChange={vi.fn()} />);
    expect(screen.getByText("Language spoken in the video")).toBeTruthy();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "clip.mp4", { type: "video/mp4" })] } });
    // no remembered language in this browser: the panel asks, the pick starts the upload
    const english = await screen.findByRole("radio", { name: /^English/ });
    fireEvent.click(english);
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(startSession).toHaveBeenCalled();
    const opts = uploadVideo.mock.calls[0]?.[5] as { editorMode?: boolean } | undefined;
    expect(opts?.editorMode).toBeFalsy();
  });
});
