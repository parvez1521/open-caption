import { describe, expect, it } from "vitest";
import { CaptionDocSchema, defaultStyle, type Page, type Word } from "@capseasy/shared";
import {
  applyPositionToAllCards,
  captionBoxFractions,
  captionFontPx,
  clampCaptionPosition,
  clearAllCardPositions,
  clearCurrentCardPosition,
  effectiveCardPosition,
  fractionFromPointer,
  setCurrentCardPosition,
  setSelectedCardsPosition,
  shiftCardPositionsByGlobalDelta,
  shiftSelectedCardsByDelta,
} from "../captionPosition";

/**
 * Per-card caption position (owner 2026-11-16): one card's caption moves
 * without moving the rest. The override is stored on the card
 * (doc.cards[firstWordId].position); unset = the global style position.
 */

const style = defaultStyle();
const canvas = { width: 1080, height: 1920, fps: 30 };

const mkWord = (id: string, text: string, startMs: number, endMs: number): Word => ({ id, text, startMs, endMs });

const pageOf = (words: Word[], position: { x: number; y: number } | null = null, id = "p1"): Page => ({
  id,
  startMs: words[0]?.startMs ?? 0,
  endMs: words[words.length - 1]?.endMs ?? 0,
  words,
  lines: [words],
  heroIndex: -1,
  emotion: "neutral",
  position,
  styleOverride: null,
});

const docWith = (words: Word[], cards: Record<string, unknown> = {}) =>
  CaptionDocSchema.parse({ version: 2, language: "en", words, cards });

describe("clampCaptionPosition — the centre stays inside the frame", () => {
  it("clamps both axes to [0.05, 0.95] and rounds to 3 decimals", () => {
    expect(clampCaptionPosition({ x: -1, y: 2 })).toEqual({ x: 0.05, y: 0.95 });
    expect(clampCaptionPosition({ x: 0.123456, y: 0.987654 })).toEqual({ x: 0.123, y: 0.95 });
    expect(clampCaptionPosition({ x: 0.5, y: 0.68 })).toEqual({ x: 0.5, y: 0.68 });
  });
});

describe("effectiveCardPosition — override wins, else the global position", () => {
  it("returns the card override when set", () => {
    const page = pageOf([mkWord("w1", "hi", 0, 400)], { x: 0.5, y: 0.2 });
    expect(effectiveCardPosition(page, style)).toEqual({ x: 0.5, y: 0.2 });
  });

  it("falls back to the style position when the card has no override", () => {
    const page = pageOf([mkWord("w1", "hi", 0, 400)], null);
    expect(effectiveCardPosition(page, style)).toEqual(style.position);
  });
});

describe("setCurrentCardPosition — one doc edit per move, no-op when nothing changes", () => {
  const words = [mkWord("w1", "hi", 0, 400), mkWord("w2", "you", 420, 800)];
  const page = pageOf(words);

  it("writes the override onto the card's first word id", () => {
    const next = setCurrentCardPosition(docWith(words), page, style, { x: 0.5, y: 0.2 });
    expect(next.cards.w1?.position).toEqual({ x: 0.5, y: 0.2 });
    // the doc still validates — the override is a declared CardMeta field
    expect(() => CaptionDocSchema.parse(next)).not.toThrow();
  });

  it("clamps the stored value to the frame band", () => {
    const next = setCurrentCardPosition(docWith(words), page, style, { x: 0, y: 1 });
    expect(next.cards.w1?.position).toEqual({ x: 0.05, y: 0.95 });
  });

  it("returns the SAME doc when there is no card, no first word, or no change", () => {
    const doc = docWith(words);
    expect(setCurrentCardPosition(doc, null, style, { x: 0.5, y: 0.2 })).toBe(doc);
    expect(setCurrentCardPosition(doc, pageOf([]), style, { x: 0.5, y: 0.2 })).toBe(doc);
    // already at the effective position (the style default) — a clamped-to-zero drag earns no undo step
    expect(setCurrentCardPosition(doc, page, style, style.position)).toBe(doc);
  });
});

describe("clearCurrentCardPosition — Reset", () => {
  it("clears the override and returns the same doc when there is none", () => {
    const words = [mkWord("w1", "hi", 0, 400)];
    const doc = docWith(words, { w1: { position: { x: 0.5, y: 0.2 } } });
    const cleared = clearCurrentCardPosition(doc, pageOf(words, { x: 0.5, y: 0.2 }));
    expect(cleared.cards.w1?.position).toBeNull();
    expect(clearCurrentCardPosition(cleared, pageOf(words, null))).toBe(cleared);
  });
});

describe("applyPositionToAllCards — one position for every caption", () => {
  const words = [mkWord("w1", "hi", 0, 400), mkWord("w2", "you", 420, 800), mkWord("w3", "too", 820, 1200)];
  const pages = [pageOf([words[0]!], null, "p1"), pageOf([words[1]!], { x: 0.5, y: 0.2 }, "p2"), pageOf([words[2]!], null, "p3")];

  it("copies the position onto every card, including cards with no override yet", () => {
    const next = applyPositionToAllCards(docWith(words), pages, style, { x: 0.25, y: 0.8 });
    expect(next.cards.w1?.position).toEqual({ x: 0.25, y: 0.8 });
    expect(next.cards.w2?.position).toEqual({ x: 0.25, y: 0.8 });
    expect(next.cards.w3?.position).toEqual({ x: 0.25, y: 0.8 });
    expect(() => CaptionDocSchema.parse(next)).not.toThrow();
  });

  it("clamps the copied position to the frame band", () => {
    const next = applyPositionToAllCards(docWith(words), pages, style, { x: 0, y: 1 });
    expect(next.cards.w1?.position).toEqual({ x: 0.05, y: 0.95 });
  });

  it("returns the SAME doc when every card is already at that position", () => {
    const doc = docWith(words);
    // the global default is the effective position of every card here
    expect(applyPositionToAllCards(doc, pages, style, style.position)).toBe(doc);
  });

  it("skips cards already at the target but writes the rest", () => {
    const doc = docWith(words, { w2: { position: { x: 0.25, y: 0.8 } } });
    const next = applyPositionToAllCards(doc, pages, style, { x: 0.25, y: 0.8 });
    expect(next.cards.w1?.position).toEqual({ x: 0.25, y: 0.8 });
    expect(next.cards.w3?.position).toEqual({ x: 0.25, y: 0.8 });
    // w2's entry is untouched (same object, not rewritten)
    expect(next.cards.w2).toBe(doc.cards.w2);
  });
});

describe("setSelectedCardsPosition — a selective move touches only the picked cards", () => {
  const words = [mkWord("w1", "hi", 0, 400), mkWord("w2", "you", 420, 800), mkWord("w3", "too", 820, 1200)];
  const pages = [pageOf([words[0]!], null, "p1"), pageOf([words[1]!], { x: 0.5, y: 0.2 }, "p2"), pageOf([words[2]!], null, "p3")];

  it("writes the override onto the selected cards only; the rest keep theirs", () => {
    const doc = docWith(words, { w2: { position: { x: 0.5, y: 0.2 } } });
    const next = setSelectedCardsPosition(doc, pages, style, new Set(["p1", "p3"]), { x: 0.25, y: 0.8 });
    expect(next.cards.w1?.position).toEqual({ x: 0.25, y: 0.8 });
    expect(next.cards.w3?.position).toEqual({ x: 0.25, y: 0.8 });
    // p2 was not selected: its old override survives untouched
    expect(next.cards.w2?.position).toEqual({ x: 0.5, y: 0.2 });
    expect(() => CaptionDocSchema.parse(next)).not.toThrow();
  });

  it("clamps the stored value to the frame band", () => {
    const next = setSelectedCardsPosition(docWith(words), pages, style, new Set(["p1"]), { x: 0, y: 1 });
    expect(next.cards.w1?.position).toEqual({ x: 0.05, y: 0.95 });
  });

  it("returns the SAME doc when the selection is empty or every selected card is already there", () => {
    const doc = docWith(words);
    expect(setSelectedCardsPosition(doc, pages, style, new Set(), { x: 0.25, y: 0.8 })).toBe(doc);
    // p2 already sits at 0.2 via its override in the doc — not just the page fixture
    const withOverride = docWith(words, { w2: { position: { x: 0.5, y: 0.2 } } });
    expect(setSelectedCardsPosition(withOverride, pages, style, new Set(["p2"]), { x: 0.5, y: 0.2 })).toBe(withOverride);
  });
});

describe("shiftCardPositionsByGlobalDelta — a global move moves overridden cards too", () => {
  const words = [mkWord("w1", "hi", 0, 400), mkWord("w2", "you", 420, 800), mkWord("w3", "too", 820, 1200)];

  it("shifts every override by the same delta as the global position", () => {
    const doc = docWith(words, { w2: { position: { x: 0.5, y: 0.2 } }, w3: { position: { x: 0.25, y: 0.8 } } });
    const next = shiftCardPositionsByGlobalDelta(doc, { x: 0.5, y: 0.72 }, { x: 0.5, y: 0.2 });
    // global moved up 0.52; both overrides move up 0.52 too
    expect(next.cards.w2?.position).toEqual({ x: 0.5, y: 0.05 });
    expect(next.cards.w3?.position).toEqual({ x: 0.25, y: 0.28 });
    // w1 has no override: no entry is written for it
    expect(next.cards.w1).toBeUndefined();
    expect(() => CaptionDocSchema.parse(next)).not.toThrow();
  });

  it("clamps a shifted override to the frame band instead of leaving it", () => {
    const doc = docWith(words, { w2: { position: { x: 0.5, y: 0.9 } } });
    const next = shiftCardPositionsByGlobalDelta(doc, { x: 0.5, y: 0.72 }, { x: 0.5, y: 0.95 });
    expect(next.cards.w2?.position).toEqual({ x: 0.5, y: 0.95 });
  });

  it("returns the SAME doc when there are no overrides, the delta is zero, or every shift is a no-op", () => {
    const plain = docWith(words);
    expect(shiftCardPositionsByGlobalDelta(plain, { x: 0.5, y: 0.72 }, { x: 0.5, y: 0.2 })).toBe(plain);
    const withOverride = docWith(words, { w2: { position: { x: 0.5, y: 0.2 } } });
    expect(shiftCardPositionsByGlobalDelta(withOverride, { x: 0.5, y: 0.72 }, { x: 0.5, y: 0.72 })).toBe(withOverride);
    // the override is already at the band edge and the shift would push past it
    const atEdge = docWith(words, { w2: { position: { x: 0.5, y: 0.95 } } });
    expect(shiftCardPositionsByGlobalDelta(atEdge, { x: 0.5, y: 0.72 }, { x: 0.5, y: 0.95 })).toBe(atEdge);
  });
});

describe("shiftSelectedCardsByDelta — a nudge shifts selected cards by one step", () => {
  const words = [mkWord("w1", "hi", 0, 400), mkWord("w2", "you", 420, 800), mkWord("w3", "too", 820, 1200)];
  const pages = [pageOf([words[0]!], null, "p1"), pageOf([words[1]!], { x: 0.5, y: 0.2 }, "p2"), pageOf([words[2]!], null, "p3")];

  it("shifts each selected card by the step, keeping their offsets; the rest stay", () => {
    const doc = docWith(words, { w2: { position: { x: 0.5, y: 0.2 } } });
    const next = shiftSelectedCardsByDelta(doc, pages, style, new Set(["p1", "p2"]), { dx: 0, dy: -0.01 });
    // p1 had no override (effective = global 0.72) → now 0.71 as an override
    expect(next.cards.w1?.position).toEqual({ x: 0.5, y: 0.71 });
    // p2 keeps its offset: 0.2 - 0.01
    expect(next.cards.w2?.position).toEqual({ x: 0.5, y: 0.19 });
    // p3 was not selected: untouched
    expect(next.cards.w3).toBeUndefined();
    expect(() => CaptionDocSchema.parse(next)).not.toThrow();
  });

  it("clamps a shifted card to the frame band", () => {
    const doc = docWith(words, { w2: { position: { x: 0.5, y: 0.95 } } });
    const next = shiftSelectedCardsByDelta(doc, pages, style, new Set(["p2"]), { dx: 0, dy: 0.05 });
    expect(next.cards.w2?.position).toEqual({ x: 0.5, y: 0.95 });
  });

  it("returns the SAME doc when the selection is empty, the step is zero, or every shift is a no-op", () => {
    const doc = docWith(words, { w2: { position: { x: 0.5, y: 0.2 } } });
    expect(shiftSelectedCardsByDelta(doc, pages, style, new Set(), { dx: 0, dy: -0.01 })).toBe(doc);
    expect(shiftSelectedCardsByDelta(doc, pages, style, new Set(["p2"]), { dx: 0, dy: 0 })).toBe(doc);
    const atEdge = docWith(words, { w2: { position: { x: 0.5, y: 0.95 } } });
    expect(shiftSelectedCardsByDelta(atEdge, pages, style, new Set(["p2"]), { dx: 0, dy: 0.05 })).toBe(atEdge);
  });
});

describe("captionFontPx — the drag ghost's text size", () => {
  it("scales the style font size to the canvas", () => {
    expect(captionFontPx(style, canvas)).toBeGreaterThan(0);
    expect(captionFontPx(style, { width: 540, height: 960, fps: 30 })).toBeCloseTo(captionFontPx(style, canvas) / 2, 6);
  });
});

describe("clearAllCardPositions — every card back to the global position", () => {
  it("clears all overrides and returns the same doc when there are none", () => {
    const words = [mkWord("w1", "hi", 0, 400), mkWord("w2", "you", 420, 800)];
    const doc = docWith(words, { w1: { position: { x: 0.5, y: 0.2 } }, w2: { position: { x: 0.75, y: 0.8 } } });
    const cleared = clearAllCardPositions(doc);
    expect(cleared.cards.w1?.position).toBeNull();
    expect(cleared.cards.w2?.position).toBeNull();
    expect(clearAllCardPositions(cleared)).toBe(cleared);
    const plain = docWith(words);
    expect(clearAllCardPositions(plain)).toBe(plain);
  });

  it("a cleared doc renders every card at the global position", () => {
    const words = [mkWord("w1", "hi", 0, 400)];
    const doc = docWith(words, { w1: { position: { x: 0.5, y: 0.2 } } });
    const cleared = clearAllCardPositions(doc);
    expect(effectiveCardPosition(pageOf(words, cleared.cards.w1?.position ?? null), style)).toEqual(style.position);
  });
});

describe("captionBoxFractions — the preview drag hit box", () => {
  it("centres on the effective position with the laid-out width", () => {
    const page = pageOf([mkWord("w1", "hi", 0, 400)], { x: 0.5, y: 0.2 });
    const box = captionBoxFractions(page, style, canvas);
    expect(box.x).toBe(0.5);
    expect(box.y).toBe(0.2);
    expect(box.w).toBeGreaterThan(0);
    expect(box.w).toBeLessThanOrEqual(1);
    expect(box.h).toBeGreaterThan(0);
    expect(box.h).toBeLessThanOrEqual(1);
  });

  it("grows taller with more lines", () => {
    const words = [mkWord("w1", "hi", 0, 400)];
    const one = captionBoxFractions({ ...pageOf(words), lines: [words] }, style, canvas);
    const two = captionBoxFractions({ ...pageOf(words), lines: [words, words] }, style, canvas);
    expect(two.h).toBeGreaterThan(one.h);
  });
});

describe("fractionFromPointer — pointer to frame fractions", () => {
  it("converts client coords with the frame rect", () => {
    const rect = { left: 100, top: 50, width: 400, height: 800 } as DOMRect;
    expect(fractionFromPointer(300, 450, rect)).toEqual({ x: 0.5, y: 0.5 });
  });
});
