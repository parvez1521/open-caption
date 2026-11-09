import { describe, expect, it } from "vitest";
import { SNAP_THRESHOLD_PX, snapMove, snapValue } from "../snap";

// at 0.01 px/ms (100 ms per screen px), the 7px threshold is 700 ms
const PX = 0.01;

describe("snapValue", () => {
  it("snaps to the nearest candidate within the threshold and reports it (the guide line target)", () => {
    expect(snapValue(1050, [0, 1000, 5000], PX)).toEqual({ value: 1000, snappedTo: 1000 });
    expect(snapValue(4600, [0, 1000, 5000], PX)).toEqual({ value: 5000, snappedTo: 5000 });
  });

  it("does not snap outside the threshold", () => {
    expect(snapValue(2000, [0, 1000, 5000], PX)).toEqual({ value: 2000, snappedTo: null });
    expect(snapValue(1701, [1000], PX)).toEqual({ value: 1701, snappedTo: null });
    expect(snapValue(1699, [1000], PX).snappedTo).toBe(1000); // 699ms < 700ms threshold
  });

  it("the threshold is in screen px: zooming in shrinks the ms window", () => {
    // at 1 px/ms the 7px window is just 7 ms
    expect(snapValue(1005, [1000], 1).snappedTo).toBe(1000);
    expect(snapValue(1008, [1000], 1).snappedTo).toBeNull();
    expect(SNAP_THRESHOLD_PX).toBe(7);
  });

  it("picks the closest candidate, not the first", () => {
    expect(snapValue(1400, [1000, 1500], PX).snappedTo).toBe(1500);
  });

  it("honours enabled=false and bad scales", () => {
    expect(snapValue(1001, [1000], PX, { enabled: false })).toEqual({ value: 1001, snappedTo: null });
    expect(snapValue(1001, [1000], 0)).toEqual({ value: 1001, snappedTo: null });
    expect(snapValue(Number.NaN, [1000], PX).snappedTo).toBeNull();
  });

  it("supports a custom threshold", () => {
    expect(snapValue(1030, [1000], PX, { thresholdPx: 0.2 }).snappedTo).toBeNull(); // 0.2px = 20ms window
    expect(snapValue(1010, [1000], PX, { thresholdPx: 0.2 }).snappedTo).toBe(1000);
  });
});

describe("snapMove", () => {
  it("snaps the start edge and keeps the block's duration", () => {
    expect(snapMove(1050, 2000, [1000], PX)).toEqual({ startMs: 1000, snappedTo: 1000 });
  });

  it("falls through to the end edge when the start is out of range", () => {
    // block 3000..5000: end edge is 100ms from the 5100 candidate, start is far away
    expect(snapMove(3000, 2000, [5100], PX)).toEqual({ startMs: 3100, snappedTo: 5100 });
  });

  it("prefers the start edge when both could snap", () => {
    expect(snapMove(1050, 2000, [1000, 3100], PX).snappedTo).toBe(1000);
  });

  it("returns the raw start when nothing snaps", () => {
    expect(snapMove(2000, 1000, [9000], PX)).toEqual({ startMs: 2000, snappedTo: null });
  });
});
