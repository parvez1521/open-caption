import { describe, expect, it } from "vitest";
import {
  dismissFreePopup,
  FREE_POPUP_DISMISSED_KEY,
  shouldShowFreePopup,
} from "../freePopup";

/** Minimal in-memory stand-in for localStorage. */
function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe("shouldShowFreePopup", () => {
  // inside the free window (ends 5 Dec 2026, 23:59 IST)
  const inside = new Date("2026-12-01T10:00:00Z");
  // after the free window ended
  const after = new Date("2026-12-06T10:00:00Z");

  it("shows when never dismissed and the free window is open", () => {
    expect(shouldShowFreePopup(inside, memoryStorage())).toBe(true);
  });

  it("hides after a dismissal", () => {
    const storage = memoryStorage();
    dismissFreePopup(inside, storage);
    expect(storage.getItem(FREE_POPUP_DISMISSED_KEY)).toBe(
      inside.toISOString(),
    );
    expect(shouldShowFreePopup(inside, storage)).toBe(false);
  });

  it("stays hidden 6 days after a dismissal", () => {
    const storage = memoryStorage({
      [FREE_POPUP_DISMISSED_KEY]: new Date("2026-11-25T10:00:00Z").toISOString(),
    });
    expect(shouldShowFreePopup(inside, storage)).toBe(false);
  });

  it("shows again exactly 7 days after a dismissal", () => {
    const storage = memoryStorage({
      [FREE_POPUP_DISMISSED_KEY]: new Date("2026-11-24T10:00:00Z").toISOString(),
    });
    expect(shouldShowFreePopup(inside, storage)).toBe(true);
  });

  it("never shows after the free window ends, even when never dismissed", () => {
    expect(shouldShowFreePopup(after, memoryStorage())).toBe(false);
  });

  it("shows when the stored dismissal value is garbage", () => {
    const storage = memoryStorage({ [FREE_POPUP_DISMISSED_KEY]: "not-a-date" });
    expect(shouldShowFreePopup(inside, storage)).toBe(true);
  });
});
