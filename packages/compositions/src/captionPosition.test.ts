import { describe, expect, it } from "vitest";
import { CaptionDocSchema, defaultStyle, ProjectSettingsSchema } from "@capseasy/shared";
import { layoutBox } from "@capseasy/templates";
import { computePages } from "./CaptionedVideo";

/**
 * Per-card caption position (owner 2026-11-16): the render-parity proof.
 * Preview, browser export and server render all render the same
 * CaptionedVideo composition, which lays pages out through computePages
 * (derivePages copies doc.cards[firstWordId].position onto the Page) and
 * places each card through layoutBox(style, canvas, page.position). So an
 * overridden card renders at its override on every surface, and a plain card
 * renders at the global style position — with no render-path change.
 */

const style = defaultStyle();
const settings = ProjectSettingsSchema.parse({});
const canvas = { width: 1080, height: 1920, fps: 30 };

const docWith = (cards: Record<string, unknown> = {}) =>
  CaptionDocSchema.parse({
    version: 2,
    language: "en",
    words: [
      { id: "w1", text: "one", startMs: 0, endMs: 400 },
      { id: "w2", text: "two", startMs: 420, endMs: 800 },
      { id: "w3", text: "three", startMs: 820, endMs: 1200 },
      { id: "w4", text: "four", startMs: 1220, endMs: 1600 },
      { id: "w5", text: "five", startMs: 1620, endMs: 2000 },
      { id: "w6", text: "six", startMs: 2020, endMs: 2400 },
    ],
    cards,
  });

describe("per-card caption position — render parity (preview ≡ export ≡ server)", () => {
  it("an overridden card carries its override; a plain card carries null", () => {
    const pages = computePages(docWith({ w1: { position: { x: 0.5, y: 0.2 } } }), settings, style, canvas);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages[0]!.position).toEqual({ x: 0.5, y: 0.2 });
    expect(pages[1]!.position).toBeNull();
  });

  it("layoutBox puts the overridden card at the override and the plain card at the global position", () => {
    const pages = computePages(docWith({ w1: { position: { x: 0.5, y: 0.2 } } }), settings, style, canvas);
    const moved = layoutBox(style, canvas, pages[0]!.position);
    expect(moved.cy).toBeCloseTo(0.2 * canvas.height, 6);
    expect(moved.cx).toBeCloseTo(0.5 * canvas.width, 6);
    const plain = layoutBox(style, canvas, pages[1]!.position);
    expect(plain.cy).toBeCloseTo(style.position.y * canvas.height, 6);
    expect(plain.cx).toBeCloseTo(style.position.x * canvas.width, 6);
  });

  it("a doc with no overrides renders every card at the global position (byte-identical behaviour)", () => {
    const pages = computePages(docWith(), settings, style, canvas);
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      expect(page.position).toBeNull();
      expect(layoutBox(style, canvas, page.position).cy).toBeCloseTo(style.position.y * canvas.height, 6);
    }
  });
});
