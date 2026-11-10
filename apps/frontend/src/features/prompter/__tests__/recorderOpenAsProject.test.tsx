import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrompterTake } from "../recording";

/**
 * Chain 4 (Phase 7 → 4): Record-a-take handoff, component level.
 *
 * Per-phase coverage: prompter/__tests__/recording.test.ts pins the pure
 * model (mime pick, take naming, buildTakeAssetRecord's shape) — but the
 * PrompterRecorder component that actually wires a take into a project
 * (prepare → createProject → uploadVideo → saveAsset(bin record) →
 * navigate) had NO test. These tests mock the media/service APIs (the
 * A13 tests' stated seam: MediaRecorder / getUserMedia / the upload
 * pipeline are device machinery) and prove the wiring, its call order,
 * and its two failure modes.
 */

const h = vi.hoisted(() => ({
  push: vi.fn(),
  prepareVideo: vi.fn(),
  createProject: vi.fn(),
  uploadVideo: vi.fn(),
  saveAsset: vi.fn(),
  take: null as PrompterTake | null,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));

vi.mock("@/features/upload/prepareVideo", () => {
  class PrepareError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  }
  return { prepareVideo: h.prepareVideo, PrepareError };
});

vi.mock("@/services/projects", () => ({
  projectsService: { createProject: h.createProject },
}));
vi.mock("@/services/studio", () => ({
  studioService: { uploadVideo: h.uploadVideo },
}));
vi.mock("@/features/studio/mediaStore", () => ({ saveAsset: h.saveAsset }));

vi.mock("../usePrompterRecorder", () => ({
  usePrompterRecorder: () => ({
    status: "idle",
    error: null,
    take: h.take,
    elapsedMs: 0,
    support: { supported: true, reason: null },
    previewStream: null,
    startCamera: vi.fn(),
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    stopCamera: vi.fn(),
    discardTake: vi.fn(),
  }),
}));

import { PrepareError } from "@/features/upload/prepareVideo";
import PrompterRecorder from "../PrompterRecorder";

const take: PrompterTake = {
  blob: new Blob(["hello"], { type: "video/webm" }),
  mime: "video/webm;codecs=vp9,opus",
  mirroredRecording: false,
  durationMs: 4200,
  fileName: "prompter-take-20261110-0905.webm",
};
const prepared = {
  file: new File([take.blob], take.fileName, { type: "video/webm" }),
  durationMs: 4150,
  width: 1280,
  height: 720,
  rotation: 0,
  hasAudio: true,
  converted: false,
  previewMode: "native",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.take = take;
  h.prepareVideo.mockResolvedValue(prepared);
  h.createProject.mockResolvedValue({ id: "proj-new", title: "Prompter take" });
  h.uploadVideo.mockResolvedValue(undefined);
  h.saveAsset.mockResolvedValue(undefined);
  URL.createObjectURL = vi.fn(() => "blob:take-url");
  URL.revokeObjectURL = vi.fn();
});

describe("PrompterRecorder open-as-project (A13 take → media bin → project)", () => {
  it("runs prepare → create → upload → bin-record → navigate, in that order, with the prepared dims in the bin record", async () => {
    render(<PrompterRecorder />);
    fireEvent.click(screen.getByRole("button", { name: "Open as new project" }));

    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/projects/proj-new"));

    // prepare BEFORE create: a refused take must never create a project.
    // The recorder mime's codec parameters are stripped for the pipeline's
    // allow-list, and the on-device limits are the studio's (5 minutes).
    expect(h.prepareVideo).toHaveBeenCalledTimes(1);
    const [fileArg, limitsArg] = h.prepareVideo.mock.calls[0]! as [File, unknown];
    expect(fileArg).toBeInstanceOf(File);
    expect(fileArg.name).toBe(take.fileName);
    expect(fileArg.type).toBe("video/webm");
    expect(limitsArg).toEqual({ maxBytes: 2 * 1024 * 1024 * 1024, maxDurationSec: 5 * 60 });

    expect(h.createProject).toHaveBeenCalledTimes(1);
    expect(h.createProject.mock.calls[0]![0]).toMatch(/^Prompter take — /);
    expect(h.uploadVideo).toHaveBeenCalledWith("proj-new", prepared, expect.any(Function));

    const order = [h.prepareVideo, h.createProject, h.uploadVideo, h.saveAsset].map(
      (m) => m.mock.invocationCallOrder[0]!,
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));

    // the media-bin record: built from the take + the PREPARED probe
    // (4150 ms / 1280×720), not the recorder's own stamps (4200 ms).
    expect(h.saveAsset).toHaveBeenCalledTimes(1);
    const record = h.saveAsset.mock.calls[0]![0] as Record<string, unknown>;
    expect(record).toMatchObject({
      projectId: "proj-new",
      kind: "video",
      name: "prompter-take-20261110-0905.webm",
      mime: "video/webm",
      size: take.blob.size,
      durationMs: 4150,
      width: 1280,
      height: 720,
      thumb: null,
      peaks: null,
    });
    expect(record.blob).toBe(take.blob);
    expect(typeof record.id).toBe("string");
  });

  it("a take the pipeline refuses creates NO project, saves NO bin record, and keeps the take", async () => {
    h.prepareVideo.mockRejectedValue(new PrepareError("This video is longer than 5 minutes.", "TOO_LONG"));
    render(<PrompterRecorder />);
    fireEvent.click(screen.getByRole("button", { name: "Open as new project" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("longer than 5 minutes");
    expect(alert.textContent).toContain("still here to download");
    expect(h.createProject).not.toHaveBeenCalled();
    expect(h.uploadVideo).not.toHaveBeenCalled();
    expect(h.saveAsset).not.toHaveBeenCalled();
    expect(h.push).not.toHaveBeenCalled();
    // the take is still on screen to download or retry
    expect(screen.getByRole("button", { name: "Open as new project" })).toBeTruthy();
  });

  it("a failure after creation names the created project and still keeps the take", async () => {
    h.uploadVideo.mockRejectedValue(new Error("upload broke"));
    render(<PrompterRecorder />);
    fireEvent.click(screen.getByRole("button", { name: "Open as new project" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("upload broke");
    expect(alert.textContent).toContain("was created and can be opened from the Dashboard");
    expect(h.saveAsset).not.toHaveBeenCalled();
    expect(h.push).not.toHaveBeenCalled();
  });
});
