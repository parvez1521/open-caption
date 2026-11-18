import { describe, expect, it } from "vitest";
import {
  FOOTAGE_SWAP_DRIFT_WARN_MS,
  footageSwapDriftMs,
  formatClockMs,
  needsFootageSwapDriftWarning,
  resolveUploadOutcome,
} from "../footageSwap";

describe("footage swap — drift warning", () => {
  it("warns only when the new cut is more than ~2 s off the old one", () => {
    expect(FOOTAGE_SWAP_DRIFT_WARN_MS).toBe(2000);
    expect(needsFootageSwapDriftWarning(60_000, 60_000)).toBe(false);
    expect(needsFootageSwapDriftWarning(60_000, 61_500)).toBe(false);
    expect(needsFootageSwapDriftWarning(60_000, 62_000)).toBe(false);
    expect(needsFootageSwapDriftWarning(60_000, 62_001)).toBe(true);
    expect(needsFootageSwapDriftWarning(60_000, 57_999)).toBe(true);
    // a grade-only tweak keeps the length: no warning
    expect(needsFootageSwapDriftWarning(84_200, 84_200)).toBe(false);
  });

  it("no warning when either duration is unknown", () => {
    expect(footageSwapDriftMs(null, 60_000)).toBeNull();
    expect(footageSwapDriftMs(60_000, null)).toBeNull();
    expect(needsFootageSwapDriftWarning(null, 60_000)).toBe(false);
    expect(needsFootageSwapDriftWarning(undefined, undefined)).toBe(false);
  });

  it("drift is the absolute change", () => {
    expect(footageSwapDriftMs(60_000, 63_500)).toBe(3500);
    expect(footageSwapDriftMs(63_500, 60_000)).toBe(3500);
  });

  it("formats durations as m:ss for the warning", () => {
    expect(formatClockMs(0)).toBe("0:00");
    expect(formatClockMs(84_000)).toBe("1:24");
    expect(formatClockMs(91_000)).toBe("1:31");
    expect(formatClockMs(3_600_000)).toBe("60:00");
  });
});

describe("footage swap — what an upload means for the doc", () => {
  it("same video id keeps the captions; a new video id resets them", () => {
    expect(resolveUploadOutcome({ uploadedVideoId: "vid-1", currentVideoId: "vid-1" })).toBe("keep");
    expect(resolveUploadOutcome({ uploadedVideoId: "vid-2", currentVideoId: "vid-1" })).toBe("reset");
  });

  it("no current video means the fresh path", () => {
    expect(resolveUploadOutcome({ uploadedVideoId: "vid-1", currentVideoId: null })).toBe("reset");
  });

  it("PER-05-A: re-attaching the same footage to a captioned project keeps the captions", () => {
    // video gone on this device, same file picked again under a new video id:
    // the copied captions belong to this video, so the upload must not reset them
    expect(resolveUploadOutcome({ uploadedVideoId: "vid-2", currentVideoId: "vid-1", hasCaptions: true })).toBe("keep");
    // no captions to protect: the fresh path is still the honest one
    expect(resolveUploadOutcome({ uploadedVideoId: "vid-2", currentVideoId: "vid-1", hasCaptions: false })).toBe("reset");
    expect(resolveUploadOutcome({ uploadedVideoId: "vid-2", currentVideoId: "vid-1" })).toBe("reset");
    // and with no current video there is nothing to keep, captions or not
    expect(resolveUploadOutcome({ uploadedVideoId: "vid-1", currentVideoId: null, hasCaptions: true })).toBe("reset");
  });
});
