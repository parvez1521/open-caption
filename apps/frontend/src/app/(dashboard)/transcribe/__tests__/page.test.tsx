import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Standalone Transcribe page: renders the upload flow for guests (no auth
 * calls on this page at all), lists all 14 shipped languages by name only.
 * Upload-only: there is no link mode on this page.
 */

vi.mock("@/components/studio/StudioShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

/**
 * Done-phase tests drive a mocked worker run (no real model in jsdom).
 * Words span a 4 s silence gap, so they land in two timed segments — the
 * full transcript is still one text.
 */
const doneWords = vi.hoisted(() => [
  { id: "w1", text: "Aaj", startMs: 0, endMs: 400 },
  { id: "w2", text: "hum", startMs: 400, endMs: 800 },
  { id: "w3", text: "ek", startMs: 5000, endMs: 5400 },
  { id: "w4", text: "video", startMs: 5400, endMs: 6000 },
  { id: "w5", text: "banayenge", startMs: 6000, endMs: 6800 },
]);

vi.mock("@/features/transcribe/standalone", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/transcribe/standalone")>();
  return {
    ...original,
    probeMediaFile: async () => ({ durationMs: 30000, hasAudio: true, hasVideo: true }),
    runStandaloneTranscribe: () => ({
      promise: Promise.resolve({ words: doneWords, durationMs: 30000, device: "wasm" }),
      cancel: vi.fn(),
    }),
  };
});

import TranscribePage from "../page";

describe("transcribe page", () => {
  it("renders the upload flow with all 14 languages by name only", () => {
    render(<TranscribePage />);
    expect(screen.getByRole("heading", { name: "Transcribe" })).toBeTruthy();
    expect(screen.getByText(/Upload a file\. Get its transcript\./)).toBeTruthy();
    const select = screen.getByLabelText(/What's spoken in the file?/);
    expect(select.tagName).toBe("SELECT");
    const options = [...select.querySelectorAll("option")];
    expect(options).toHaveLength(14);
    expect(options.map((o) => o.textContent)).toContain("Tamil (தமிழ்)");
    // the picker shows language names, never the model labels
    expect(options.map((o) => o.textContent).join(" ")).not.toContain("whisper-base");
    expect(screen.getByRole("button", { name: "Transcribe" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Transcribe" })).toHaveProperty("disabled", true);
  });

  it("is upload-only: no link tab, no link input, no fetch button", () => {
    render(<TranscribePage />);
    expect(screen.queryByRole("tab", { name: "Paste a link" })).toBeNull();
    expect(document.querySelector('input[type="url"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Fetch link" })).toBeNull();
    expect(screen.getByText(/Drop a video or audio file here/)).toBeTruthy();
  });
});

describe("transcribe page done phase", () => {
  beforeEach(() => {
    // The page guards the run on Worker + WebAssembly; jsdom has no Worker,
    // so the run would take the "can't run here" error path instead.
    vi.stubGlobal("Worker", class {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the full transcript all together, plus a Fix mistakes action, segments kept", async () => {
    render(<TranscribePage />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "clip.mp4", { type: "video/mp4" })] } });
    const transcribe = screen.getByRole("button", { name: "Transcribe" });
    await waitFor(() => expect(transcribe).not.toBeDisabled());
    fireEvent.click(transcribe);
    const heading = await screen.findByRole("heading", { name: "Full transcript" });
    expect(heading).toBeTruthy();
    // the whole text in one block, even though the words span two segments
    const block = screen.getByTestId("full-transcript");
    expect(block.textContent).toContain("Aaj hum");
    expect(block.textContent).toContain("ek video banayenge");
    expect(screen.getByRole("button", { name: "Fix mistakes" })).toBeTruthy();
    // timed segments are still listed below with their timestamps
    expect(screen.getByText("00:00:00,000")).toBeTruthy();
    expect(screen.getByText("00:00:05,000")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  });
});
