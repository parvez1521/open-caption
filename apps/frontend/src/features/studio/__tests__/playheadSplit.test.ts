import { describe, expect, it } from "vitest";
import type { Page, Word } from "@capseasy/shared";
import { canSplitAtPlayhead, splitWordIdAtPlayhead } from "../playheadSplit";

const word = (id: string, startMs: number, endMs: number): Word => ({ id, text: id, startMs, endMs });
const page = (id: string, words: Word[], endPad = 0): Page => ({
  id,
  startMs: words[0]!.startMs,
  endMs: words[words.length - 1]!.endMs + endPad,
  words,
  lines: [words],
  heroIndex: -1,
  emotion: "neutral",
  position: null,
  styleOverride: null,
});

// card 1: a(0-400) b(450-900) c(950-1400) · gap · card 2: d(2000-2400) e(2450-2900)
const pages = [
  page("p1", [word("a", 0, 400), word("b", 450, 900), word("c", 950, 1400)]),
  page("p2", [word("d", 2000, 2400), word("e", 2450, 2900)]),
];

describe("splitWordIdAtPlayhead", () => {
  it("splits at the first word starting at/after the playhead inside the active card", () => {
    expect(splitWordIdAtPlayhead(pages, 100)).toBe("b"); // inside word a → next word starts the new card
    expect(splitWordIdAtPlayhead(pages, 449)).toBe("b");
    expect(splitWordIdAtPlayhead(pages, 450)).toBe("b"); // exactly on b's start
    expect(splitWordIdAtPlayhead(pages, 500)).toBe("c"); // inside b → c
    expect(splitWordIdAtPlayhead(pages, 2100)).toBe("e"); // second card
  });

  it("no split when the playhead is at the card's first word (it already starts the card)", () => {
    expect(splitWordIdAtPlayhead(pages, 0)).toBeNull();
    expect(splitWordIdAtPlayhead(pages, 2000)).toBeNull();
  });

  it("no split inside the last word of a card (no word at/after the playhead)", () => {
    expect(splitWordIdAtPlayhead(pages, 1000)).toBeNull();
    expect(splitWordIdAtPlayhead(pages, 2600)).toBeNull();
  });

  it("no split in a gap, before the first card, or past the end", () => {
    expect(splitWordIdAtPlayhead(pages, 1500)).toBeNull();
    expect(splitWordIdAtPlayhead(pages, 99999)).toBeNull();
    expect(splitWordIdAtPlayhead([], 100)).toBeNull();
    expect(splitWordIdAtPlayhead(pages, -5)).toBeNull();
  });

  it("no split for a single-word card", () => {
    const single = [page("s", [word("x", 0, 1000)])];
    expect(splitWordIdAtPlayhead(single, 500)).toBeNull();
  });

  it("canSplitAtPlayhead mirrors the finder", () => {
    expect(canSplitAtPlayhead(pages, 100)).toBe(true);
    expect(canSplitAtPlayhead(pages, 1500)).toBe(false);
  });
});
