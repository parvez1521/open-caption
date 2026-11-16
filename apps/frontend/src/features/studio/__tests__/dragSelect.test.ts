import { describe, expect, it } from "vitest";
import { PANEL_PX_PER_MS, formatDelta, groupDragBounds, isPastThreshold, pxToMs, rangeSelection, toggleIds } from "../dragSelect";

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

describe("groupDragBounds", () => {
  // contiguous words: the give-way window, not the old between-neighbours clamp
  const WORDS = [
    { id: "a", startMs: 0, endMs: 300 },
    { id: "b", startMs: 300, endMs: 600 },
    { id: "c", startMs: 600, endMs: 900 },
    { id: "d", startMs: 900, endMs: 1200 },
  ];

  it("a contiguous word can slide into both neighbours (give-way), bounded by their far edges", () => {
    // b can start no earlier than a.start + 40 = 40, and end no later than c.end − 40 = 860
    const r = groupDragBounds(WORDS, new Set(["b"]), 40, 5000);
    expect(r.contiguous).toBe(true);
    expect(r.firstId).toBe("b");
    expect(r.lastId).toBe("b");
    expect(r.minDxMs).toBe(-260);
    expect(r.maxDxMs).toBe(260);
  });

  it("a contiguous run is bounded by its outer neighbours only", () => {
    const r = groupDragBounds(WORDS, new Set(["b", "c"]), 40, 5000);
    expect(r.contiguous).toBe(true);
    expect(r.firstId).toBe("b");
    expect(r.lastId).toBe("c");
    expect(r.minDxMs).toBe(-260); // run start 300 → 40
    expect(r.maxDxMs).toBe(260); // run end 900 → 1160
  });

  it("the first word cannot pass 0 and the last cannot pass the video end", () => {
    const first = groupDragBounds(WORDS, new Set(["a"]), 40, 5000);
    expect(first.minDxMs).toBe(0);
    const last = groupDragBounds(WORDS, new Set(["d"]), 40, 1200);
    expect(last.maxDxMs).toBe(0);
  });

  it("with ripple the end is bounded only by the video", () => {
    const r = groupDragBounds(WORDS, new Set(["b"]), 40, 5000, true);
    expect(r.minDxMs).toBe(-260);
    expect(r.maxDxMs).toBe(5000 - 600);
  });

  it("a scattered selection is clamped to never overlap an unselected neighbour", () => {
    // a and c selected with b between them: a cannot move earlier than 0, c cannot
    // move later than d.start (900); neither may cross the unselected b
    const r = groupDragBounds(WORDS, new Set(["a", "c"]), 40, 5000);
    expect(r.contiguous).toBe(false);
    expect(r.minDxMs).toBe(0); // a already starts at 0
    expect(r.maxDxMs).toBe(0); // c ends at 900 = d.start
  });

  it("returns a zero window for an empty selection", () => {
    const r = groupDragBounds(WORDS, new Set(), 40, 5000);
    expect(r).toEqual({ contiguous: false, firstId: null, lastId: null, minDxMs: 0, maxDxMs: 0 });
  });
});
