/**
 * Delete/Backspace target resolution (owner bug 2026-11-10: "delete nahi ho raha").
 * Pins the priority order StudioPage's keyboard handler and toolbar Delete button share:
 * multi-word selection first, then the selected overlay, then the single selected word —
 * and nothing while blocked (dialog open / captions live).
 */
import { describe, expect, it } from "vitest";
import { resolveDeleteAction } from "../deleteSelection";

const base = { blocked: false, selectedWordIds: [] as string[], selectedOverlayId: null as string | null, selectedId: null as string | null };

describe("resolveDeleteAction", () => {
  it("prefers the multi-word selection over overlay and single word", () => {
    expect(resolveDeleteAction({ ...base, selectedWordIds: ["w1", "w2"], selectedOverlayId: "ov1", selectedId: "w9" }))
      .toEqual({ kind: "words", ids: ["w1", "w2"] });
  });

  it("falls back to the selected overlay", () => {
    expect(resolveDeleteAction({ ...base, selectedOverlayId: "ov1", selectedId: "w9" }))
      .toEqual({ kind: "overlay", id: "ov1" });
  });

  it("falls back to the single selected word", () => {
    expect(resolveDeleteAction({ ...base, selectedId: "w9" })).toEqual({ kind: "word", id: "w9" });
  });

  it("returns null when nothing is selected", () => {
    expect(resolveDeleteAction(base)).toBeNull();
  });

  it("returns null while blocked, whatever is selected", () => {
    expect(resolveDeleteAction({ ...base, blocked: true, selectedWordIds: ["w1"], selectedOverlayId: "ov1", selectedId: "w9" })).toBeNull();
  });

  it("accepts any iterable of word ids (the live selection is a Set)", () => {
    expect(resolveDeleteAction({ ...base, selectedWordIds: new Set(["a", "b"]) }))
      .toEqual({ kind: "words", ids: ["a", "b"] });
  });
});
