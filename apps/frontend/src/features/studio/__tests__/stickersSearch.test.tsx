/**
 * Stickers search (2026-11-18): filterStickers matches every query token against a
 * sticker's label, id, tags and category (case-insensitive, substring), narrows by
 * category, and returns nothing — the panel's "No stickers match" empty state —
 * when nothing matches.
 */
import { describe, expect, it } from "vitest";
import { filterStickers, stickerShapes } from "../stickers";

const ALL = stickerShapes();

describe("filterStickers", () => {
  it("empty query returns all 110 stickers", () => {
    expect(filterStickers(ALL, "")).toHaveLength(110);
    expect(filterStickers(ALL, "   ")).toHaveLength(110);
  });

  it("matches by label, case-insensitively", () => {
    const ids = filterStickers(ALL, "CROWN").map((s) => s.id);
    expect(ids).toContain("crown");
    expect(filterStickers(ALL, "smiling face").map((s) => s.id)).toEqual(["face-smile"]);
  });

  it("matches by tag, not just by label", () => {
    const ids = filterStickers(ALL, "birthday").map((s) => s.id);
    expect(ids).toContain("gift");
    expect(ids).toContain("cake");
    expect(ids).toContain("balloon");
    expect(ids).toContain("party-popper");
    expect(ids).not.toContain("star");
  });

  it("matches by category name", () => {
    const ids = filterStickers(ALL, "animals").map((s) => s.id);
    expect(ids).toContain("cat-face");
    expect(ids).toContain("dog-face");
    expect(ids).toContain("paw-print");
    expect(ids).not.toContain("pizza");
  });

  it("every token must match (multi-word queries narrow)", () => {
    const ids = filterStickers(ALL, "heart arrow").map((s) => s.id);
    expect(ids).toEqual(["heart-arrow"]);
    expect(filterStickers(ALL, "heart banana")).toHaveLength(0);
  });

  it("matches hyphenated ids by substring", () => {
    expect(filterStickers(ALL, "thumbs").map((s) => s.id)).toEqual(["thumbs-up", "thumbs-down"]);
  });

  it("category narrowing works on its own and with a query", () => {
    const faces = filterStickers(ALL, "", "faces");
    expect(faces.length).toBe(8);
    expect(faces.every((s) => s.category === "faces")).toBe(true);
    expect(filterStickers(ALL, "heart", "faces").map((s) => s.id)).toEqual(["face-love"]);
    expect(filterStickers(ALL, "heart", "food")).toHaveLength(0);
  });

  it("returns an empty list for a query nothing matches (the empty state)", () => {
    expect(filterStickers(ALL, "zxqvkj")).toHaveLength(0);
    expect(filterStickers(ALL, "rocket", "food")).toHaveLength(0);
  });
});
