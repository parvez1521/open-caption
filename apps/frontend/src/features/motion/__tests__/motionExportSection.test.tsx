/**
 * MotionExportSection (Wave 3): the standalone export UI on the customize page.
 * The browser renderer is mocked at the browserExport boundary — what is pinned is the
 * section's own behaviour: the option groups and their honest copy, the dims readout,
 * progress + a Cancel that really aborts (and saves nothing), the real error message
 * with a working Retry, and the downloaded file's name on success.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultMotionConfig } from "@capseasy/motion";

const h = vi.hoisted(() => ({
  canExport: vi.fn(async (): Promise<{ ok: boolean; reason?: string }> => ({ ok: true })),
  render: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/features/studio/browserExport", () => ({
  canExportVideoInBrowser: h.canExport,
  exportVideoInBrowser: h.render,
  saveBlob: h.save,
}));

import { MotionExportSection } from "../MotionExportSection";
import { TRANSPARENT_EXPORT_NOTE } from "../exportConfig";

const config = defaultMotionConfig("subscribe-pill");
const blob = new Blob(["video-bytes"], { type: "video/mp4" });

beforeEach(() => {
  h.canExport.mockReset();
  h.canExport.mockResolvedValue({ ok: true });
  h.render.mockReset();
  h.render.mockResolvedValue(blob);
  h.save.mockReset();
});

describe("MotionExportSection — options and honest copy", () => {
  it("renders every option group with the exact honest wording", async () => {
    const view = render(<MotionExportSection config={config} />);
    expect(screen.getByRole("heading", { name: /export this animation/i })).toBeTruthy();
    // background choices, chroma first with its exact label
    expect(screen.getByRole("button", { name: "Solid colour background for chroma-key removal in your editor" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dark" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Black" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "White" })).toBeTruthy();
    // chroma is the default background, so its colour picker shows, at pure green
    const picker = screen.getByLabelText("Chroma colour") as HTMLInputElement;
    expect(picker.value).toBe("#00ff00");
    // aspect / size / fps / format choices
    for (const name of ["1:1", "16:9", "9:16", "720p", "1080p", "30 fps", "60 fps", "MP4", "WebM"]) {
      expect(screen.getByRole("button", { name }), name).toBeTruthy();
    }
    // the solid-background note sits with the format choice, and the transparency line is shown
    expect(view.container.textContent).toContain("These files have a solid background");
    expect(view.container.textContent).toContain(TRANSPARENT_EXPORT_NOTE);
    expect(view.container.textContent).not.toContain("WebM with transparency");
    // default selection: 9:16 at 1080 -> the dims readout
    expect(view.container.textContent).toContain("Exports at 1080 × 1920");
    await waitFor(() => expect(h.canExport).toHaveBeenCalled());
    view.unmount();
  });

  it("switching aspect updates the dims readout; switching format relabels the export button", async () => {
    const view = render(<MotionExportSection config={config} />);
    fireEvent.click(screen.getByRole("button", { name: "16:9" }));
    expect(view.container.textContent).toContain("Exports at 1920 × 1080");
    fireEvent.click(screen.getByRole("button", { name: "720p" }));
    expect(view.container.textContent).toContain("Exports at 1280 × 720");
    fireEvent.click(screen.getByRole("button", { name: "WebM" }));
    expect(screen.getByRole("button", { name: "Export WebM" })).toBeTruthy();
    expect(view.container.textContent).toContain("These files have a solid background");
    view.unmount();
  });

  it("a browser that cannot encode disables export and says why", async () => {
    h.canExport.mockResolvedValue({ ok: false, reason: "This browser can't encode video. Use Chrome, Edge or Safari." });
    render(<MotionExportSection config={config} />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("can't encode video"));
    expect((screen.getByRole("button", { name: "Export MP4" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("MotionExportSection — render flow", () => {
  it("success: renders the built job, downloads <template>-<w>x<h>.mp4 and reports it", async () => {
    render(<MotionExportSection config={config} />);
    await waitFor(() => expect(h.canExport).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Export MP4" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledWith(blob, "subscribe-pill-1080x1920.mp4"));
    const job = h.render.mock.calls[0][0] as Record<string, unknown>;
    expect(job).toMatchObject({ container: "mp4", videoCodec: "h264", width: 1080, height: 1920, fps: 30, durationMs: 4000 });
    const input = job.input as { backdrop: string; src: null; overlays: unknown[] };
    expect(input.backdrop).toBe("#00FF00");
    expect(input.src).toBeNull();
    expect(input.overlays).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toContain("Downloaded subscribe-pill-1080x1920.mp4");
  });

  it("progress shows a percentage and Cancel aborts the render — nothing is saved, no error is shown", async () => {
    h.render.mockImplementation(
      (job: { signal?: AbortSignal; onProgress?: (f: number) => void }) =>
        new Promise<Blob>((_resolve, reject) => {
          job.onProgress?.(0.5);
          job.signal?.addEventListener("abort", () => reject(new Error("renderMediaOnWeb() was cancelled")));
        }),
    );
    const view = render(<MotionExportSection config={config} />);
    await waitFor(() => expect(h.canExport).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Export MP4" }));
    await waitFor(() => expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50"));
    expect(view.container.textContent).toContain("50%");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Export MP4" })).toBeTruthy());
    expect(h.save).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    view.unmount();
  });

  it("failure shows the renderer's real message and Retry runs the export again", async () => {
    h.render.mockRejectedValueOnce(new Error("VP9 encoder exploded"));
    render(<MotionExportSection config={config} />);
    await waitFor(() => expect(h.canExport).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Export MP4" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("VP9 encoder exploded"));
    expect(h.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledWith(blob, "subscribe-pill-1080x1920.mp4"));
    expect(h.render).toHaveBeenCalledTimes(2);
  });
});
