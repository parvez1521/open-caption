import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UploadPanel } from "../UploadPanel";
import { prepareVideo, type PreparedVideo } from "@/features/upload/prepareVideo";
import { studioService } from "@/services/studio";

/**
 * Replace footage, keep captions — UploadPanel behaviour:
 * - "Keep my captions" is the default choice; the language question is hidden (nothing is transcribed).
 * - A same-length cut swaps straight through: onKeepFootage runs, onUploaded fires with the SAME video id.
 * - A different-length cut warns first (old vs new length); "Keep captions anyway" proceeds,
 *   "Regenerate captions instead" switches to the fresh path (new video, new transcription).
 * - Keep is disabled for a server-upload video.
 */

vi.mock("@/features/transcribe/browserWhisper", () => ({ preloadSpeechModel: vi.fn() }));
vi.mock("@/features/transcribe/session", () => ({ getSession: () => undefined, startSession: vi.fn() }));
vi.mock("@/features/transcribe/runtime", () => ({
  MODELS: { en: { id: "m-en" }, hinglish: { id: "m-en" }, hindi: { id: "m-hi" } },
  PROJECT_LANGUAGE: { en: "en", hinglish: "hinglish", hindi: "hi" },
  SHIPPED_LANGUAGES: [
    { key: "en", choiceLabel: "English" },
    { key: "hinglish", choiceLabel: "Hinglish" },
    { key: "hindi", choiceLabel: "Hindi" },
  ],
  isConstrainedDevice: () => false,
  likelySpeechLanguage: () => "en",
  saveSpeechLanguage: vi.fn(),
  savedSpeechLanguage: () => null,
  speechLanguageOf: (l: string | null) => (l === "hinglish" ? "hinglish" : l === "hindi" ? "hindi" : "en"),
}));
vi.mock("@/features/upload/prepareVideo", () => ({
  prepareVideo: vi.fn(),
  PrepareError: class PrepareError extends Error {
    constructor(
      message: string,
      public code: "UNREADABLE" | "TOO_LONG" | "TOO_BIG" | "CANT_CONVERT",
    ) {
      super(message);
    }
  },
}));
vi.mock("@/services/studio", () => ({
  studioService: { uploadVideo: vi.fn(), savePatch: vi.fn() },
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/services/api-client", () => ({ ApiError: class ApiError extends Error {} }));
vi.mock("@/features/studio/preflight", () => ({ transcribePreflightWarning: () => null }));
vi.mock("@/lib/billing/pricingDisplay", () => ({ uploadLimitLabel: () => "4 GB" }));

const file = new File(["fake-video-bytes"], "grade.mp4", { type: "video/mp4" });
const readyFor = (durationMs: number): PreparedVideo => ({
  file,
  durationMs,
  width: 1080,
  height: 1920,
  rotation: 0,
  videoCodec: "h264",
  audioCodec: "aac",
  hasAudio: true,
  converted: false,
  previewMode: "native",
  needsCompat: false,
});

const pickFile = (container: HTMLElement) => {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
};

const renderPanel = (over: {
  replaceMode?: "keep" | "fresh";
  previousDurationMs?: number | null;
  keepAllowed?: boolean;
  onKeepFootage?: (ready: PreparedVideo) => Promise<void>;
  onUploaded?: (videoId: string) => void;
  onReplaceModeChange?: (m: "keep" | "fresh") => void;
} = {}) => {
  const onKeepFootage = over.onKeepFootage ?? vi.fn().mockResolvedValue(undefined);
  const onUploaded = over.onUploaded ?? vi.fn();
  const utils = render(
    <UploadPanel
      projectId="proj-1"
      onUploaded={onUploaded}
      limits={{ maxBytes: 4 * 1024 * 1024 * 1024, maxDurationSec: 300 }}
      language="hinglish"
      videoId="vid-1"
      replaceMode={over.replaceMode ?? "keep"}
      onReplaceModeChange={over.onReplaceModeChange ?? vi.fn()}
      previousDurationMs={over.previousDurationMs ?? 60_000}
      keepAllowed={over.keepAllowed ?? true}
      onKeepFootage={onKeepFootage}
    />,
  );
  return { ...utils, onKeepFootage, onUploaded };
};

beforeEach(() => {
  // jsdom has no matchMedia; UploadPanel reads it in an effect.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  vi.mocked(prepareVideo).mockReset();
  vi.mocked(studioService.uploadVideo).mockReset();
  vi.mocked(studioService.uploadVideo).mockResolvedValue({ jobId: null, videoId: "vid-2" });
  vi.mocked(studioService.savePatch).mockReset();
  vi.mocked(studioService.savePatch).mockResolvedValue(undefined as never);
});

describe("UploadPanel — replace footage, keep captions", () => {
  it("Keep my captions is the default choice and no language is asked", () => {
    renderPanel();
    expect(screen.getByRole("radio", { name: /Keep my captions/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: /Start fresh with new captions/ }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/Captions stay on the same timeline/)).toBeTruthy();
    expect(screen.queryByText(/Language spoken in the video/)).toBeNull();
  });

  it("a same-length cut keeps captions: onKeepFootage runs, same video id is reported, no new video is registered", async () => {
    vi.mocked(prepareVideo).mockResolvedValue(readyFor(60_500));
    const { container, onKeepFootage, onUploaded } = renderPanel();
    pickFile(container);
    await waitFor(() => expect(onKeepFootage).toHaveBeenCalledTimes(1));
    expect(onKeepFootage).toHaveBeenCalledWith(expect.objectContaining({ durationMs: 60_500 }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith("vid-1"));
    expect(studioService.uploadVideo).not.toHaveBeenCalled();
  });

  it("a different-length cut warns first; Keep captions anyway proceeds with the same video id", async () => {
    vi.mocked(prepareVideo).mockResolvedValue(readyFor(65_000));
    const { container, onKeepFootage, onUploaded } = renderPanel();
    pickFile(container);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("1:05");
    expect(screen.getByRole("alert").textContent).toContain("1:00");
    expect(onKeepFootage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep captions anyway" }));
    await waitFor(() => expect(onKeepFootage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith("vid-1"));
    expect(studioService.uploadVideo).not.toHaveBeenCalled();
  });

  it("Regenerate captions instead switches to fresh and registers a new video", async () => {
    vi.mocked(prepareVideo).mockResolvedValue(readyFor(65_000));
    const onReplaceModeChange = vi.fn();
    const { container, onKeepFootage, onUploaded } = renderPanel({ onReplaceModeChange });
    pickFile(container);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Regenerate captions instead" }));
    expect(onReplaceModeChange).toHaveBeenCalledWith("fresh");
    await waitFor(() => expect(studioService.uploadVideo).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith("vid-2"));
    expect(onKeepFootage).not.toHaveBeenCalled();
  });

  it("fresh mode registers a new video and never calls the keep path", async () => {
    vi.mocked(prepareVideo).mockResolvedValue(readyFor(65_000));
    const { container, onKeepFootage, onUploaded } = renderPanel({ replaceMode: "fresh" });
    pickFile(container);
    await waitFor(() => expect(studioService.uploadVideo).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith("vid-2"));
    expect(onKeepFootage).not.toHaveBeenCalled();
  });

  it("keep is disabled for a server-upload video, with the reason shown", () => {
    renderPanel({ keepAllowed: false });
    const keep = screen.getByRole("radio", { name: /Keep my captions/ }) as HTMLButtonElement;
    expect(keep.disabled).toBe(true);
    expect(screen.getByText(/uploaded to our servers/)).toBeTruthy();
  });
});
