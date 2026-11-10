import { describe, expect, it } from "vitest";
import {
  RECORDER_MIME_CANDIDATES,
  buildTakeAssetRecord,
  buildTakeFileName,
  formatLabelForMime,
  pickRecorderMime,
  recorderErrorMessage,
  recorderSupport,
  type PrompterTake,
  type RecorderCaps,
} from "../recording";

/**
 * Teleprompter recording model (A13): mime selection, capability reasons,
 * take naming / bin records, and camera-error wording.
 *
 * MediaRecorder / getUserMedia themselves are NOT unit-tested here — they
 * need a real camera and browser; that is a device pass, not a unit test.
 */

const caps = (patch: Partial<RecorderCaps> = {}): RecorderCaps => ({
  mediaDevices: true,
  getUserMedia: true,
  mediaRecorder: true,
  secureContext: true,
  ...patch,
});

describe("pickRecorderMime", () => {
  it("pins the candidate list, best first", () => {
    expect(RECORDER_MIME_CANDIDATES).toEqual([
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ]);
  });

  it("returns the first candidate when everything is supported", () => {
    expect(pickRecorderMime(() => true)).toBe("video/webm;codecs=vp9,opus");
  });

  it("skips unsupported candidates in order", () => {
    expect(pickRecorderMime((m) => m === "video/webm")).toBe("video/webm");
    expect(pickRecorderMime((m) => m === "video/mp4")).toBe("video/mp4");
    expect(pickRecorderMime((m) => m.includes("vp8"))).toBe("video/webm;codecs=vp8,opus");
  });

  it("returns null when no candidate is supported", () => {
    expect(pickRecorderMime(() => false)).toBeNull();
  });
});

describe("recorderSupport", () => {
  it("is supported when every capability is present", () => {
    expect(recorderSupport(caps())).toEqual({ supported: true, reason: null });
  });

  it("names the secure-context reason first", () => {
    expect(recorderSupport(caps({ secureContext: false }))).toEqual({
      supported: false,
      reason: "Recording needs a secure (https) page",
    });
    // secure context is checked before every other missing piece
    expect(recorderSupport(caps({ secureContext: false, mediaRecorder: false })).reason).toBe(
      "Recording needs a secure (https) page",
    );
  });

  it("names the camera access API when mediaDevices or getUserMedia is missing", () => {
    expect(recorderSupport(caps({ mediaDevices: false })).reason).toBe("This browser has no camera access API");
    expect(recorderSupport(caps({ getUserMedia: false })).reason).toBe("This browser has no camera access API");
    expect(recorderSupport(caps({ mediaDevices: false })).supported).toBe(false);
  });

  it("names MediaRecorder when only recording is missing", () => {
    expect(recorderSupport(caps({ mediaRecorder: false }))).toEqual({
      supported: false,
      reason: "This browser can't record video (no MediaRecorder)",
    });
  });
});

describe("formatLabelForMime", () => {
  it("labels webm and mp4, with or without codec parameters", () => {
    expect(formatLabelForMime("video/webm")).toBe("WebM video");
    expect(formatLabelForMime("video/webm;codecs=vp9,opus")).toBe("WebM video");
    expect(formatLabelForMime("video/mp4")).toBe("MP4 video");
    expect(formatLabelForMime("video/mp4;codecs=avc1")).toBe("MP4 video");
  });

  it("falls back to the raw mime string for anything else", () => {
    expect(formatLabelForMime("video/quicktime")).toBe("video/quicktime");
  });
});

describe("buildTakeFileName", () => {
  it("builds the exact local-time name for webm", () => {
    // 10 Nov 2026, 09:05 local
    expect(buildTakeFileName(new Date(2026, 10, 10, 9, 5), "video/webm;codecs=vp9,opus")).toBe(
      "prompter-take-20261110-0905.webm",
    );
  });

  it("builds the exact local-time name for mp4, zero-padded", () => {
    // 3 Jan 2026, 23:59 local
    expect(buildTakeFileName(new Date(2026, 0, 3, 23, 59), "video/mp4")).toBe("prompter-take-20260103-2359.mp4");
  });

  it("falls back to webm for an unknown mime", () => {
    expect(buildTakeFileName(new Date(2026, 10, 10, 9, 5), "video/quicktime")).toBe("prompter-take-20261110-0905.webm");
  });
});

describe("buildTakeAssetRecord", () => {
  it("builds the media-bin record shape from the take and probed dims", () => {
    const blob = new Blob(["hello"], { type: "video/webm" });
    const take: PrompterTake = {
      blob,
      mime: "video/webm;codecs=vp9,opus",
      mirroredRecording: true,
      durationMs: 4200,
      fileName: "prompter-take-20261110-0905.webm",
    };
    const rec = buildTakeAssetRecord("project-1", take, { durationMs: 4150, width: 1280, height: 720 }, "asset-1", 123456);
    expect(rec).toEqual({
      id: "asset-1",
      projectId: "project-1",
      kind: "video",
      name: "prompter-take-20261110-0905.webm",
      mime: "video/webm",
      size: 5,
      durationMs: 4150,
      width: 1280,
      height: 720,
      blob,
      thumb: null,
      peaks: null,
      createdAt: 123456,
    });
  });
});

describe("recorderErrorMessage", () => {
  const domError = (name: string) => new DOMException("boom", name as never);

  it("maps NotAllowedError to the blocked-permission copy", () => {
    expect(recorderErrorMessage(domError("NotAllowedError"))).toBe(
      "Camera and microphone access was blocked. Allow it in your browser's site settings and try again — the prompter above keeps working without recording.",
    );
  });

  it("maps NotFoundError and OverconstrainedError to the no-camera copy", () => {
    expect(recorderErrorMessage(domError("NotFoundError"))).toBe("No camera could be found on this device.");
    expect(recorderErrorMessage(domError("OverconstrainedError"))).toBe("No camera could be found on this device.");
  });

  it("maps NotReadableError to the busy-camera copy", () => {
    expect(recorderErrorMessage(domError("NotReadableError"))).toBe("The camera is busy in another app or tab.");
  });

  it("maps SecurityError to the blocked-page copy", () => {
    expect(recorderErrorMessage(domError("SecurityError"))).toBe("The browser blocked camera access on this page.");
  });

  it("names the error in the default message, or 'unknown error'", () => {
    const weird = new Error("boom");
    weird.name = "WeirdError";
    expect(recorderErrorMessage(weird)).toBe("Recording couldn't start (WeirdError).");
    expect(recorderErrorMessage(null)).toBe("Recording couldn't start (unknown error).");
    expect(recorderErrorMessage("a string")).toBe("Recording couldn't start (unknown error).");
    expect(recorderErrorMessage(undefined)).toBe("Recording couldn't start (unknown error).");
  });
});
