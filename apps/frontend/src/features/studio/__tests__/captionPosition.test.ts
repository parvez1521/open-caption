import { describe, expect, it } from "vitest";
import { CaptionDocSchema, defaultStyle, type Page, type Word } from "@capseasy/shared";
import {
  captionBoxFractions,
  clampCaptionPosition,
  clearCurrentCardPosition,
  effectiveCardPosition,
  fractionFromPointer,
  POSITION_PRESETS,
  setCurrentCardPosition,
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

describe("POSITION_PRESETS — the 3×3 grid", () => {
  it("has nine cells: Top/Middle/Bottom × Left/Center/Right", () => {
    expect(POSITION_PRESETS).toHaveLength(9);
    const byId = Object.fromEntries(POSITION_PRESETS.map((p) => [p.id, p]));
    expect(byId["top-center"]).toEqual(expect.objectContaining({ x: 0.5, y: 0.2 }));
    expect(byId["middle-center"]).toEqual(expect.objectContaining({ x: 0.5, y: 0.5 }));
    expect(byId["bottom-center"]).toEqual(expect.objectContaining({ x: 0.5, y: 0.8 }));
    expect(byId["middle-left"]).toEqual(expect.objectContaining({ x: 0.25, y: 0.5 }));
    expect(byId["middle-right"]).toEqual(expect.objectContaining({ x: 0.75, y: 0.5 }));
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
