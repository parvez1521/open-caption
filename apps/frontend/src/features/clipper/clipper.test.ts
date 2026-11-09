import { describe, expect, it } from "vitest";
import { CLIP_MIN_MS, clampClipRange, clipProjectTitle, fmtClipRange, fmtClipTime } from "./clipper";

describe("fmtClipTime / fmtClipRange", () => {
  it("formats m:ss with a padded seconds part", () => {
    expect(fmtClipTime(0)).toBe("0:00");
    expect(fmtClipTime(32_000)).toBe("0:32");
    expect(fmtClipTime(65_000)).toBe("1:05");
    expect(fmtClipTime(760_000)).toBe("12:40");
    expect(fmtClipRange(32_000, 65_000)).toBe("0:32–1:05");
  });
});

describe("clampClipRange", () => {
  it("passes a valid range through (rounded)", () => {
    expect(clampClipRange({ startMs: 1000.4, endMs: 20_000.6 }, 120_000)).toEqual({ startMs: 1000, endMs: 20_001 });
  });

  it("clamps both edges to the media", () => {
    expect(clampClipRange({ startMs: -5000, endMs: 999_000 }, 120_000)).toEqual({ startMs: 0, endMs: 120_000 });
  });

  it("enforces the minimum duration by widening the end, then pulling the start back at the media end", () => {
    expect(clampClipRange({ startMs: 10_000, endMs: 11_000 }, 120_000)).toEqual({ startMs: 10_000, endMs: 10_000 + CLIP_MIN_MS });
    expect(clampClipRange({ startMs: 119_000, endMs: 119_500 }, 120_000)).toEqual({ startMs: 120_000 - CLIP_MIN_MS, endMs: 120_000 });
  });

  it("a reversed range becomes a minimum-length range at the start edge", () => {
    const out = clampClipRange({ startMs: 30_000, endMs: 20_000 }, 120_000);
    expect(out.endMs - out.startMs).toBe(CLIP_MIN_MS);
    expect(out.startMs).toBe(30_000);
  });
});

describe("clipProjectTitle", () => {
  it("appends the range as a Clip suffix", () => {
    expect(clipProjectTitle("My podcast", 32_000, 65_000)).toBe("My podcast · Clip 0:32–1:05");
  });

  it("falls back to Untitled and never exceeds the 120-char project limit", () => {
    expect(clipProjectTitle("", 0, 15_000)).toBe("Untitled project · Clip 0:00–0:15");
    const long = clipProjectTitle("x".repeat(300), 0, 15_000);
    expect(long.length).toBe(120);
    expect(long.endsWith("· Clip 0:00–0:15")).toBe(true);
  });
});
