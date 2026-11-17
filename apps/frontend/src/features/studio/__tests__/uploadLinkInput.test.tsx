import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UploadPanel } from "../UploadPanel";
import { prepareVideo, type PreparedVideo } from "@/features/upload/prepareVideo";
import { studioService } from "@/services/studio";

/**
 * Paste a direct video link in the Studio upload:
 * - the link input is there, with the one-line note that YouTube links don't work.
 * - a YouTube link fails with the plain named error and never reaches prepareVideo.
 * - a direct MP4 link is fetched in the browser and then takes the exact path
 *   a picked file takes (prepareVideo -> uploadVideo -> onUploaded).
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

const file = new File(["fake-video-bytes"], "linked-video.mp4", { type: "video/mp4" });
const ready: PreparedVideo = {
  file,
  durationMs: 60_000,
  width: 1280,
  height: 720,
  rotation: 0,
  videoCodec: "h264",
  audioCodec: "aac",
  hasAudio: true,
  converted: false,
  previewMode: "native",
  needsCompat: false,
};

const renderPanel = (onUploaded: (videoId: string) => void = vi.fn()) =>
  render(
    <UploadPanel
      projectId="proj-1"
      onUploaded={onUploaded}
      limits={{ maxBytes: 4 * 1024 * 1024 * 1024, maxDurationSec: 300 }}
      language="hinglish"
    />,
  );

const pasteLink = (url: string) => {
  fireEvent.change(screen.getByLabelText("Or paste a direct video link"), { target: { value: url } });
  fireEvent.click(screen.getByRole("button", { name: "Add from link" }));
};

describe("UploadPanel — paste a direct video link", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
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
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(prepareVideo).mockReset();
    vi.mocked(prepareVideo).mockResolvedValue(ready);
    vi.mocked(studioService.uploadVideo).mockReset();
    vi.mocked(studioService.uploadVideo).mockResolvedValue({ jobId: null, videoId: "vid-2" });
    vi.mocked(studioService.savePatch).mockReset();
    vi.mocked(studioService.savePatch).mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the link input and the one-line YouTube note", () => {
    renderPanel();
    expect(screen.getByLabelText("Or paste a direct video link")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add from link" })).toBeTruthy();
    expect(screen.getByText("Direct MP4 or WebM links only. YouTube links don't work.")).toBeTruthy();
  });

  it("a YouTube link fails plainly and never reaches prepareVideo", async () => {
    renderPanel();
    pasteLink("https://www.youtube.com/watch?v=oFwB6gZLRmc");
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("Links from youtube.com don't share the video file");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prepareVideo).not.toHaveBeenCalled();
  });

  it("a direct MP4 link is fetched and takes the picked-file path", async () => {
    const onUploaded = vi.fn();
    renderPanel(onUploaded);
    fetchMock.mockResolvedValueOnce({ ok: true, headers: { get: () => null } });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-type" ? "video/mp4" : name.toLowerCase() === "content-length" ? "10" : null,
      },
      blob: async () => new Blob(["0123456789"], { type: "video/mp4" }),
    });
    pasteLink("https://cdn.example.com/clips/trailer.mp4");
    await waitFor(() => expect(prepareVideo).toHaveBeenCalledTimes(1));
    const picked = vi.mocked(prepareVideo).mock.calls[0]![0] as File;
    expect(picked).toBeInstanceOf(File);
    expect(picked.name).toBe("trailer.mp4");
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith("vid-2"));
  });

  it("a dead link shows the plain reach error and nothing is prepared", async () => {
    renderPanel();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    pasteLink("https://example.com/gone.mp4");
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("Couldn't reach this link");
    expect(prepareVideo).not.toHaveBeenCalled();
  });
});
