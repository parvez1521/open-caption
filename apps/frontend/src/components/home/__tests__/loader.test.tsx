import { render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Loader } from "../Loader";

/**
 * Homepage intro loader (BUG-007): the intro line is
 * "Every word, on screen, on time." — the word "on" appears twice.
 * The word spans were keyed by the word itself, so two spans shared key
 * "on" and React logged a duplicate-key warning on every home load.
 * The fix keys each span by word + index. This test pins both halves:
 * all six words render in order, and no duplicate-key warning is logged.
 */
describe("Loader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders every intro word once and logs no duplicate-key warning", () => {
    window.matchMedia = vi.fn((q: string) => ({
      matches: false,
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(<Loader onDone={() => {}} />);
    const words = [...container.querySelectorAll("[data-w]")].map((el) =>
      el.textContent?.trim(),
    );
    expect(words).toEqual(["Every", "word,", "on", "screen,", "on", "time."]);
    const dupKey = errorSpy.mock.calls
      .flat()
      .filter((arg) => typeof arg === "string" && arg.includes("same key"));
    expect(dupKey).toEqual([]);
    errorSpy.mockRestore();
  });
});
