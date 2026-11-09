import { describe, expect, it } from "vitest";
import { PANEL_PX_PER_MS, formatDelta, isPastThreshold, pxToMs, rangeSelection, toggleIds } from "../dragSelect";

// a flat word order spanning three caption "cards" — selection must not stop at card boundaries
const IDS = ["a1", "a2", "b1", "b2", "b3", "c1"];

describe("rangeSelection", () => {
  it("selects the contiguous range forwards, across cards", () => {
    expect([...rangeSelection(IDS, "a2", "b3")]).toEqual(["a2", "b1", "b2", "b3"]);
  });

  it("selects the same range when dragged backwards", () => {
    expect([...rangeSelection(IDS, "b3", "a2")]).toEqual(["a2", "b1", "b2", "b3"]);
  });

  it("a press with no movement selects just that word", () => {
    expect([...rangeSelection(IDS, "b2", "b2")]).toEqual(["b2"]);
  });

  it("covers the whole list from first to last", () => {
    expect(rangeSelection(IDS, "a1", "c1").size).toBe(IDS.length);
  });

  it("unknown anchor selects nothing; unknown focus falls back to the anchor", () => {
    expect(rangeSelection(IDS, "zz", "b1").size).toBe(0);
    expect([...rangeSelection(IDS, "b1", "zz")]).toEqual(["b1"]);
  });
});

describe("toggleIds", () => {
  it("adds missing ids and removes present ones, without mutating the input", () => {
    const cur = new Set(["a1", "b1"]);
    const next = toggleIds(cur, ["b1", "b2"]);
    expect([...next].sort()).toEqual(["a1", "b2"]);
    expect([...cur].sort()).toEqual(["a1", "b1"]);
  });
});

describe("pxToMs", () => {
  it("converts at the timeline's zoom scale", () => {
    expect(pxToMs(100, 0.5)).toBe(200);
    expect(pxToMs(-100, 0.5)).toBe(-200);
    expect(pxToMs(33, 0.1)).toBe(330);
  });

  it("converts at the caption panel's fixed sensitivity (100px = 1s)", () => {
    expect(pxToMs(100, PANEL_PX_PER_MS)).toBe(1000);
    expect(pxToMs(-45, PANEL_PX_PER_MS)).toBe(-450);
  });

  it("rounds to whole milliseconds and survives a bad scale", () => {
    expect(pxToMs(10, 3)).toBe(3);
    expect(pxToMs(10, 0)).toBe(0);
    expect(pxToMs(Number.NaN, 1)).toBe(0);
  });
});

describe("formatDelta", () => {
  it("formats the live readout with sign, two decimals and a true minus", () => {
    expect(formatDelta(320)).toBe("+0.32s");
    expect(formatDelta(-150)).toBe("−0.15s");
    expect(formatDelta(0)).toBe("+0.00s");
    expect(formatDelta(1500)).toBe("+1.50s");
    expect(formatDelta(-2000)).toBe("−2.00s");
  });
});

describe("isPastThreshold", () => {
  it("keeps small movements as clicks and counts real drags", () => {
    expect(isPastThreshold(2, 2)).toBe(false);
    expect(isPastThreshold(6, 0)).toBe(false);
    expect(isPastThreshold(7, 0)).toBe(true);
    expect(isPastThreshold(0, -9)).toBe(true);
  });
});
