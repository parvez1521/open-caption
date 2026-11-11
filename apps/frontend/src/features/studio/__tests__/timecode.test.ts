import { describe, expect, it } from "vitest";
import { formatTimecode, frameDurationMs, parseTimecode, stepFrameMs } from "../timecode";

describe("formatTimecode", () => {
  it("starts at 00:00:00:00", () => {
    expect(formatTimecode(0, 30)).toBe("00:00:00:00");
  });
  it("counts frames at 30 fps", () => {
    expect(formatTimecode(frameDurationMs(30), 30)).toBe("00:00:00:01");
    expect(formatTimecode(1000, 30)).toBe("00:00:01:00");
    expect(formatTimecode(61000, 30)).toBe("00:01:01:00");
    expect(formatTimecode(3723000, 30)).toBe("01:02:03:00");
  });
  it("counts frames at 60 fps", () => {
    expect(formatTimecode(frameDurationMs(60), 60)).toBe("00:00:00:01");
    expect(formatTimecode(1000, 60)).toBe("00:00:01:00");
  });
  it("never shows a negative timecode", () => {
    expect(formatTimecode(-500, 30)).toBe("00:00:00:00");
  });
});

describe("parseTimecode", () => {
  it("parses full and short timecodes at 30 fps", () => {
    expect(parseTimecode("00:01:12:08", 30, 300000)).toBeCloseTo(72000 + 8 * frameDurationMs(30), 6);
    expect(parseTimecode("01:12:08", 30, 300000)).toBeCloseTo(72000 + 8 * frameDurationMs(30), 6);
    expect(parseTimecode("12:08", 30, 300000)).toBeCloseTo(12000 + 8 * frameDurationMs(30), 6);
  });
  it("parses plain seconds", () => {
    expect(parseTimecode("12.5", 30, 300000)).toBe(12500);
    expect(parseTimecode("0", 30, 300000)).toBe(0);
  });
  it("round-trips what formatTimecode shows", () => {
    for (const ms of [0, 1234, 59999, 61000, 183456]) {
      const tc = formatTimecode(ms, 30);
      const back = parseTimecode(tc, 30, 300000);
      expect(back).not.toBeNull();
      // round-trip lands on the frame boundary at or below the input
      expect(back!).toBeLessThanOrEqual(ms);
      expect(ms - back!).toBeLessThan(frameDurationMs(30));
    }
  });
  it("rejects malformed input", () => {
    expect(parseTimecode("", 30, 300000)).toBeNull();
    expect(parseTimecode("hello", 30, 300000)).toBeNull();
    expect(parseTimecode("00:00:00:30", 30, 300000)).toBeNull(); // frame 30 does not exist at 30 fps
    expect(parseTimecode("00:61:00:00", 30, 300000)).toBeNull();
    expect(parseTimecode("1:2:3:4:5", 30, 300000)).toBeNull();
    expect(parseTimecode("00:00:0x:00", 30, 300000)).toBeNull();
  });
  it("clamps out-of-range input to the video instead of erroring", () => {
    expect(parseTimecode("99:00:00:00", 30, 120000)).toBe(120000);
    expect(parseTimecode("9999", 30, 120000)).toBe(120000);
  });
});

describe("stepFrameMs", () => {
  it("moves exactly one frame at 30 fps", () => {
    expect(stepFrameMs(0, 30, 1, 60000)).toBeCloseTo(frameDurationMs(30), 9);
    expect(stepFrameMs(frameDurationMs(30), 30, 1, 60000)).toBeCloseTo(2 * frameDurationMs(30), 9);
    expect(stepFrameMs(1000, 30, -1, 60000)).toBeCloseTo(1000 - frameDurationMs(30), 9);
  });
  it("moves exactly one frame at 60 fps", () => {
    expect(stepFrameMs(0, 60, 1, 60000)).toBeCloseTo(frameDurationMs(60), 9);
    expect(stepFrameMs(1000, 60, -1, 60000)).toBeCloseTo(1000 - frameDurationMs(60), 9);
  });
  it("clamps at both ends", () => {
    expect(stepFrameMs(0, 30, -1, 60000)).toBe(0);
    expect(stepFrameMs(60000, 30, 1, 60000)).toBe(60000);
  });
  it("steps from a mid-frame position to the neighbouring frame boundary", () => {
    // 50 ms sits inside frame 1 at 30 fps (33.3–66.6 ms): back lands on 0, forward on 66.6
    expect(stepFrameMs(50, 30, -1, 60000)).toBe(0);
    expect(stepFrameMs(50, 30, 1, 60000)).toBeCloseTo(2 * frameDurationMs(30), 9);
  });
});
