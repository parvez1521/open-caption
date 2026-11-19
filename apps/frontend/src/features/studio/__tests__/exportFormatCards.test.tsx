import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CaptionedVideoInput } from "@capseasy/compositions";
import { CaptionDocSchema } from "@capseasy/shared";
import { EXPORT_OPTIONS } from "../exportOptions";
import { FORMAT_SHORT_LABEL, FormatPreview } from "../exportFormatPreview";
import { ExportModal } from "../ExportModal";

/**
 * Owner order 2026-11-15: the Export modal's format list is square cards with a
 * visual preview of each export, and the short format name only — no description
 * sentences. These tests pin the previews and the card grid.
 */

const sentryCapture = vi.hoisted(() => ({ exception: vi.fn(), message: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({
  captureException: sentryCapture.exception,
  captureMessage: sentryCapture.message,
}));

const studioMocks = vi.hoisted(() => ({
  recordBrowserExport: vi.fn(async () => {}),
  releaseBrowserExport: vi.fn(async () => {}),
}));

vi.mock("@/services/studio", () => ({
  studioService: {
    listExports: async () => [],
    videoQuota: async () => ({
      videoQuota: { plan: "free", limit: 3, used: 0, remaining: 3, windowStart: "", windowEnd: "" },
      quotaReady: true,
    }),
    createExport: async () => ({ ready: false, companionOnline: false }),
    reserveBrowserExport: async () => {},
    releaseBrowserExport: studioMocks.releaseBrowserExport,
    recordBrowserExport: studioMocks.recordBrowserExport,
    exportDownloadUrl: async () => "https://example.test/dl",
    cancelJob: async () => {},
    retryJob: async () => {},
  },
}));

/** the in-progress render: the test resolves it by hand, so the render overlay can be checked mid-render */
let resolveRender: ((blob: Blob) => void) | null = null;

const browserExportMocks = vi.hoisted(() => ({
  canExportInBrowser: vi.fn(async () => ({ ok: true })),
  exportMp4InBrowser: vi.fn(async (opts: { onProgress?: (f: number) => void; signal?: AbortSignal }) => {
    opts.onProgress?.(0.42);
    return new Promise<Blob>((resolve, reject) => {
      resolveRender = resolve;
      // the real encoder watches the signal: cancelling rejects the render
      opts.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
  }),
  saveBlob: vi.fn(() => {}),
}));

vi.mock("../browserExport", () => ({
  canExportInBrowser: browserExportMocks.canExportInBrowser,
  exportMp4InBrowser: browserExportMocks.exportMp4InBrowser,
  saveBlob: browserExportMocks.saveBlob,
}));

const SAMPLE = "Hello world";

describe("FormatPreview — one visual preview per export kind", () => {
  it("MP4 shows a video frame with the caption words on it", () => {
    const { container } = render(<FormatPreview kind="mp4" sampleWords={SAMPLE} />);
    expect(container.textContent).toContain("Hello world");
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("SRT shows timestamped subtitle lines", () => {
    const { container } = render(<FormatPreview kind="srt" sampleWords={SAMPLE} />);
    expect(container.textContent).toContain("00:00:01,000 --> 00:00:03,000");
    expect(container.textContent).toContain("Hello world");
  });

  it("VTT shows the WEBVTT header and dot timestamps", () => {
    const { container } = render(<FormatPreview kind="vtt" sampleWords={SAMPLE} />);
    expect(container.textContent).toContain("WEBVTT");
    expect(container.textContent).toContain("00:00:01.000 --> 00:00:03.000");
    expect(container.textContent).toContain("Hello world");
  });

  it("ASS shows a styled subtitle line", () => {
    const { container } = render(<FormatPreview kind="ass" sampleWords={SAMPLE} />);
    expect(container.textContent).toContain("Hello");
    expect(container.textContent).toContain("world");
  });

  it("TXT shows plain text lines and no timings", () => {
    const { container } = render(<FormatPreview kind="txt" sampleWords={SAMPLE} />);
    expect(container.textContent).toContain("Hello world");
    expect(container.textContent).not.toContain("00:00");
  });

  it("JSON shows a words code snippet", () => {
    const { container } = render(<FormatPreview kind="json" sampleWords={SAMPLE} />);
    expect(container.textContent).toContain("words");
    expect(container.textContent).toContain("Hello");
  });

  it("overlay kinds show a transparency checkerboard with the caption line on it", () => {
    for (const kind of ["mov_alpha", "webm_alpha"] as const) {
      const { container } = render(<FormatPreview kind={kind} sampleWords={SAMPLE} />);
      expect(container.textContent).toContain("Hello world");
      const checker = container.querySelector("[data-testid='format-preview-checkerboard']");
      expect(checker).not.toBeNull();
    }
  });

  it("PNG shows a still frame with the caption line", () => {
    const { container } = render(<FormatPreview kind="png" sampleWords={SAMPLE} />);
    expect(container.textContent).toContain("Hello world");
  });

  it("falls back to short sample words when the project has none", () => {
    const { container } = render(<FormatPreview kind="mp4" sampleWords="" />);
    expect(container.textContent).toContain("Hello world");
  });

  it("every offered kind has a short label", () => {
    for (const o of EXPORT_OPTIONS) {
      expect(FORMAT_SHORT_LABEL[o.kind]).toBeTruthy();
      expect(FORMAT_SHORT_LABEL[o.kind].length).toBeLessThanOrEqual(5);
    }
  });
});

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const doc = CaptionDocSchema.parse({
    version: 2,
    language: "en",
    words: [
      { id: "w1", text: "Hello", startMs: 0, endMs: 400 },
      { id: "w2", text: "world", startMs: 420, endMs: 800 },
    ],
  });
  const renderInput: CaptionedVideoInput = { src: "blob:test", doc };
  render(
    <QueryClientProvider client={qc}>
      <ExportModal
        projectId="p1"
        title="test"
        video={{ width: 1080, height: 1920, durationMs: 6000, fps: 30 }}
        renderInput={renderInput}
        saving={false}
        onClose={() => {}}
        flushSave={async () => {}}
        exportSettings={{ resolution: "1080p", fps: 30 }}
        onExportSettings={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe("ExportModal — square preview cards", () => {
  it("renders every format as a square card with a preview and the short name only", async () => {
    renderModal();
    const group = await screen.findByRole("group", { name: "Export format" });
    expect(group.className).toContain("grid-cols-2");
    expect(group.className).toContain("sm:grid-cols-4");
    const cards = within(group).getAllByRole("button");
    expect(cards).toHaveLength(EXPORT_OPTIONS.length);
    for (const card of cards) {
      expect(card.className).toContain("aspect-square");
      expect(card.getAttribute("aria-pressed")).not.toBeNull();
    }
    // short names only — the old description sentences are gone from the list
    for (const label of ["MP4", ".srt", ".vtt", ".ass", ".txt", ".json", ".mov", ".webm"]) {
      expect(within(group).getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText(/Ready for Reels/)).toBeNull();
    expect(screen.queryByText(/For YouTube/)).toBeNull();
    expect(screen.queryByText(/transparent overlay/)).toBeNull();
    // MP4 keeps its badge and previews the project's real first caption words
    expect(within(group).getByText("Most popular")).toBeTruthy();
    const mp4 = within(group).getByRole("button", { name: /MP4/ });
    expect(mp4.textContent).toContain("Hello world");
    // SRT card previews its timestamps
    const srt = within(group).getByRole("button", { name: /\.srt/ });
    expect(srt.textContent).toContain("00:00:01,000");
  });

  it("clicking a card selects it and shows the Render button", async () => {
    renderModal();
    const group = await screen.findByRole("group", { name: "Export format" });
    const srt = within(group).getByRole("button", { name: /\.srt/ });
    expect(srt.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(srt);
    expect(srt.getAttribute("aria-pressed")).toBe("true");
    expect(srt.className).toContain("border-st-em");
    expect(await screen.findByRole("button", { name: /Export SRT/ })).toBeTruthy();
  });

  it("opens with no format pre-selected and the Render button already visible", async () => {
    renderModal();
    const group = await screen.findByRole("group", { name: "Export format" });
    const cards = within(group).getAllByRole("button");
    for (const card of cards) {
      expect(card.getAttribute("aria-pressed")).toBe("false");
      expect(card.className).not.toContain("border-st-em");
    }
    // the MP4 card keeps its badge but no longer looks pre-selected
    const mp4 = within(group).getByRole("button", { name: /MP4/ });
    expect(mp4.className).not.toContain("bg-st-lav/40");
    // the Render button is on screen from the start, off until a format is picked
    const renderBtn = screen.getByRole("button", { name: "Render" });
    expect(renderBtn.getAttribute("disabled")).not.toBeNull();
    fireEvent.click(mp4);
    const renderMp4 = await screen.findByRole("button", { name: "Render MP4" });
    expect(renderMp4.getAttribute("disabled")).toBeNull();
  });

  it("a queued overlay shows a small Queued badge, not a sentence", async () => {
    renderModal();
    const group = await screen.findByRole("group", { name: "Export format" });
    const webm = within(group).getByRole("button", { name: /\.webm/ });
    fireEvent.click(webm);
    fireEvent.click(await screen.findByRole("button", { name: /Render WebM overlay/ }));
    expect(await within(group).findByText("Queued")).toBeTruthy();
    expect(screen.queryByText(/No paired computer/)).toBeNull();
  });
});

describe("ExportModal — render progress lives outside the modal", () => {
  it("Render MP4 hides the modal and shows a centred progress overlay", async () => {
    // jsdom has no createObjectURL: VideoReady (opened on completion) needs it
    if (typeof URL.createObjectURL !== "function") {
      Object.defineProperty(URL, "createObjectURL", { value: () => "blob:mock", configurable: true });
    }
    renderModal();
    const group = await screen.findByRole("group", { name: "Export format" });
    fireEvent.click(within(group).getByRole("button", { name: /MP4/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Render MP4" }));
    // the progress is a centred overlay, not a bottom bar: a full-screen
    // blurred backdrop covers the Studio, the card sits in the middle
    const bar = await screen.findByRole("status");
    const overlay = bar.parentElement;
    expect(overlay).not.toBeNull();
    expect(overlay!.className).toContain("fixed inset-0");
    expect(overlay!.className).toContain("items-center");
    expect(overlay!.className).toContain("justify-center");
    expect(overlay!.className).toContain("backdrop-blur-sm");
    expect(overlay!.className).toContain("bg-black/60");
    expect(bar.className).not.toContain("bottom-");
    // no second render can start while one runs: the modal's Render button
    // stays disabled for as long as progress is non-null
    expect((screen.getByText("Render MP4") as HTMLButtonElement).disabled).toBe(true);
    // the Export modal overlay is hidden while the render runs in this tab
    // (still mounted — unmounting it would abort the render)
    const modalOverlay = document.querySelector("div.fixed.inset-0.z-50");
    expect(modalOverlay).not.toBeNull();
    expect(modalOverlay).toHaveAttribute("hidden");
    expect(bar.textContent).toContain("Rendering your MP4 in this tab");
    expect(bar.textContent).toContain("42%");
    expect(bar.textContent).toContain("Keep this tab open. Nothing is uploaded");
    expect(within(bar).getByRole("button", { name: "Cancel" })).toBeTruthy();
    // finishing the render shows the done state in the same overlay, not back inside the modal
    await act(async () => {
      resolveRender?.(new Blob(["x"], { type: "video/mp4" }));
    });
    expect(await screen.findByText(/Your MP4 is downloading/)).toBeTruthy();
    expect(document.querySelector("div.fixed.inset-0.z-50")).toHaveAttribute("hidden");
  });

  it("Cancel stops the render and brings the modal back", async () => {
    renderModal();
    const group = await screen.findByRole("group", { name: "Export format" });
    fireEvent.click(within(group).getByRole("button", { name: /MP4/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Render MP4" }));
    const bar = await screen.findByRole("status");
    await act(async () => {
      fireEvent.click(within(bar).getByRole("button", { name: "Cancel" }));
    });
    // the overlay is gone and the modal is back (no longer hidden)
    expect(screen.queryByRole("status")).toBeNull();
    const modalOverlay = document.querySelector("div.fixed.inset-0.z-50");
    expect(modalOverlay).not.toBeNull();
    expect(modalOverlay).not.toHaveAttribute("hidden");
    expect(await screen.findByRole("group", { name: "Export format" })).toBeTruthy();
  });

  it("MA-A1-008: a failed export record is reported to Sentry instead of swallowed", async () => {
    sentryCapture.exception.mockClear();
    studioMocks.recordBrowserExport.mockRejectedValueOnce(new Error("count failed"));
    renderModal();
    const group = await screen.findByRole("group", { name: "Export format" });
    fireEvent.click(within(group).getByRole("button", { name: /MP4/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Render MP4" }));
    await screen.findByRole("status");
    await act(async () => {
      resolveRender?.(new Blob(["x"], { type: "video/mp4" }));
    });
    await vi.waitFor(() =>
      expect(sentryCapture.exception).toHaveBeenCalledWith(
        expect.objectContaining({ message: "count failed" }),
        expect.objectContaining({ tags: { area: "browser-export" }, extra: { op: "recordBrowserExport" } }),
      ),
    );
  });

  it("MA-A1-008: a failed slot release after a render error is reported to Sentry", async () => {
    sentryCapture.exception.mockClear();
    studioMocks.releaseBrowserExport.mockRejectedValueOnce(new Error("release failed"));
    browserExportMocks.exportMp4InBrowser.mockRejectedValueOnce(new Error("encoder died"));
    renderModal();
    const group = await screen.findByRole("group", { name: "Export format" });
    fireEvent.click(within(group).getByRole("button", { name: /MP4/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Render MP4" }));
    await vi.waitFor(() =>
      expect(sentryCapture.exception).toHaveBeenCalledWith(
        expect.objectContaining({ message: "release failed" }),
        expect.objectContaining({ extra: expect.objectContaining({ op: "releaseBrowserExport" }) }),
      ),
    );
  });
});
