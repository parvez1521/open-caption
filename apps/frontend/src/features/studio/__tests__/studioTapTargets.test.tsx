import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaptionDocSchema, type CaptionDoc, type Page, type Word } from "@capseasy/shared";
import type { CaptionedVideoInput } from "@capseasy/compositions";
import { CaptionsPanel } from "../panels/CaptionsPanel";
import { ExportModal } from "../ExportModal";

/**
 * MA-A3-004: sub-44px tap targets across the Studio panels — word chips
 * (~24px at lg), hidden-word restore, the pinned word-action buttons, the
 * ExportModal quality/resolution/fps radios, the render overlay's
 * Cancel/Share/Dismiss, the export-history Cancel/Retry, the AudioPanel
 * Remove/Place buttons and the StudioPage Stop button. The fix is the
 * in-repo hit-expander pattern (MA-A5-009, Timeline mode switcher):
 * a ::before that stretches the hit area to 44px without changing the
 * visible layout — vertical-only where buttons sit side by side, so an
 * expanded neighbour can never steal the tap. These tests pin the
 * expander class on the rendered buttons; AudioPanel/StudioPage are
 * pinned by source scan (no cheap render harness exists for them).
 */

const EXPANDER = "before:-inset-y-2.5";
const EXPANDER_X = "before:-inset-x-1";

// ---------------------------------------------------------------------------
// CaptionsPanel
// ---------------------------------------------------------------------------

const initialDoc: CaptionDoc = CaptionDocSchema.parse({
  version: 2,
  language: "en",
  words: [
    { id: "w1", text: "Dulha", startMs: 0, endMs: 400 },
    { id: "w2", text: "Dulhan?", startMs: 420, endMs: 800 },
    { id: "w3", text: "hota", startMs: 820, endMs: 1200 },
    { id: "w4", text: "hai?", startMs: 1220, endMs: 1600 },
  ],
});

const pageOf = (words: Word[], id = "p1"): Page => ({
  id,
  startMs: words[0]?.startMs ?? 0,
  endMs: words[words.length - 1]?.endMs ?? 0,
  words,
  lines: [words],
  heroIndex: -1,
  emotion: "neutral",
  position: null,
  styleOverride: null,
});

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Harness() {
    const [doc, setDoc] = useState(initialDoc);
    const [selectedId, setSelectedId] = useState<string | null>("w1");
    const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());
    return (
      <QueryClientProvider client={qc}>
        <CaptionsPanel
          doc={doc}
          pages={[pageOf(doc.words)]}
          currentPageId="p1"
          timeMs={0}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onSeek={() => {}}
          edit={(fn) => setDoc((d) => fn(d))}
          heroSupported
          selectedWordIds={selectedWordIds}
          onWordSelectionChange={setSelectedWordIds}
        />
      </QueryClientProvider>
    );
  }
  return render(<Harness />);
}

describe("MA-A3-004 — CaptionsPanel tap targets", () => {
  it("word chips carry the 44px vertical hit expander", () => {
    renderPanel();
    const chip = screen.getByRole("button", { name: "Dulha" });
    expect(chip.className).toContain("relative");
    expect(chip.className).toContain(EXPANDER);
    expect(chip.className).toContain("before:content-['']");
  });

  it("pinned word-action buttons carry the expander", () => {
    renderPanel();
    const editor = screen.getByTestId("pinned-word-editor");
    for (const name of ["Split card here", "Join previous", "Join next", "Hide word"]) {
      expect(within(editor).getByRole("button", { name }).className).toContain(EXPANDER);
    }
  });

  it("hidden-word restore buttons carry the expander", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Hide word" }));
    const toggle = screen.getByRole("button", { name: /1 hidden word/ });
    fireEvent.click(toggle);
    // the word chip and the restore button share the word text — scope to
    // the hidden-words section under the toggle
    const section = toggle.parentElement!;
    const restore = within(section).getByRole("button", { name: "Dulha" });
    expect(restore.className).toContain("line-through");
    expect(restore.className).toContain(EXPANDER);
  });
});

// ---------------------------------------------------------------------------
// ExportModal
// ---------------------------------------------------------------------------

const sentryCapture = vi.hoisted(() => ({ exception: vi.fn(), message: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({
  captureException: sentryCapture.exception,
  captureMessage: sentryCapture.message,
}));

const studioMocks = vi.hoisted(() => ({
  listExports: vi.fn(async () => [] as unknown[]),
  recordBrowserExport: vi.fn(async () => {}),
  releaseBrowserExport: vi.fn(async () => {}),
}));

vi.mock("@/services/studio", () => ({
  studioService: {
    listExports: studioMocks.listExports,
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

let resolveRender: ((blob: Blob) => void) | null = null;

const browserExportMocks = vi.hoisted(() => ({
  canExportInBrowser: vi.fn(async () => ({ ok: true })),
  exportMp4InBrowser: vi.fn(async (opts: { onProgress?: (f: number) => void }) => {
    opts.onProgress?.(0.42);
    return new Promise<Blob>((resolve) => {
      resolveRender = resolve;
    });
  }),
  saveBlob: vi.fn(() => {}),
}));

vi.mock("../browserExport", () => ({
  canExportInBrowser: browserExportMocks.canExportInBrowser,
  exportMp4InBrowser: browserExportMocks.exportMp4InBrowser,
  saveBlob: browserExportMocks.saveBlob,
}));

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

describe("MA-A3-004 — ExportModal tap targets", () => {
  it("quality / resolution / fps radios carry the expander (vertical + 1px horizontal)", async () => {
    renderModal();
    await screen.findByRole("group", { name: "Export format" });
    for (const name of ["Best", "1080p", "30 fps"]) {
      const radio = screen.getByRole("radio", { name });
      expect(radio.className).toContain("relative");
      expect(radio.className).toContain(EXPANDER);
      expect(radio.className).toContain(EXPANDER_X);
    }
  });

  it("export-history Cancel / Retry carry the expander", async () => {
    studioMocks.listExports.mockResolvedValueOnce([
      { id: "e1", kind: "mp4", resolution: "1080p", created_at: "2026-11-19T10:00:00.000Z", status_v2: "queued", job_id: "j1" },
      { id: "e2", kind: "mp4", resolution: "720p", created_at: "2026-11-19T09:00:00.000Z", status_v2: "failed", job_id: "j2" },
    ]);
    renderModal();
    await screen.findByRole("group", { name: "Export format" });
    expect(await screen.findByText("Your exports")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" }).className).toContain(EXPANDER);
    expect(screen.getByRole("button", { name: "Retry" }).className).toContain(EXPANDER);
  });

  it("render overlay Cancel / Share / Dismiss carry the expander", async () => {
    if (typeof URL.createObjectURL !== "function") {
      Object.defineProperty(URL, "createObjectURL", { value: () => "blob:mock", configurable: true });
    }
    renderModal();
    const group = await screen.findByRole("group", { name: "Export format" });
    fireEvent.click(within(group).getByRole("button", { name: /MP4/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Render MP4" }));
    const bar = await screen.findByRole("status");
    expect(within(bar).getByRole("button", { name: "Cancel" }).className).toContain(EXPANDER);
    await act(async () => {
      resolveRender?.(new Blob(["x"], { type: "video/mp4" }));
    });
    expect(await screen.findByText(/Your MP4 is downloading/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share" }).className).toContain(EXPANDER);
    const dismiss = screen.getByRole("button", { name: "Dismiss" });
    expect(dismiss.className).toContain("before:-inset-y-2");
    expect(dismiss.className).toContain(EXPANDER_X);
  });
});

// ---------------------------------------------------------------------------
// Source pins: no cheap render harness exists for these two surfaces.
// ---------------------------------------------------------------------------

describe("MA-A3-004 — AudioPanel / StudioPage tap targets (source pins)", () => {
  it("AudioPanel Remove / Place carry the expander", () => {
    const src = readFileSync(resolve(process.cwd(), "src/features/studio/panels/AudioPanel.tsx"), "utf8");
    const remove = src.match(/<Button tone="danger" className="([^"]*)" onClick=\{\(\) => onRemoveBleep/);
    expect(remove?.[1]).toContain(EXPANDER);
    const place = src.match(/<Button className="([^"]*)" disabled=\{!a\.durationMs\}/);
    expect(place?.[1]).toContain(EXPANDER);
  });

  it("StudioPage Stop carries the expander", () => {
    const src = readFileSync(resolve(process.cwd(), "src/features/studio/StudioPage.tsx"), "utf8");
    const stop = src.match(/<Button className="([^"]*)" onClick=\{\(\) => getSession\(projectId\)\?\.stop\(\)\}>Stop/);
    expect(stop?.[1]).toContain(EXPANDER);
  });
});
