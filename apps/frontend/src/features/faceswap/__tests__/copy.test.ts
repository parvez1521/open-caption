import { describe, expect, it } from "vitest";
import { UI_COPY } from "../copy";

/**
 * Owner rule (2026-11-18): NEVER tell the user a model is downloading.
 * Every user-facing string on /face-swap lives in copy.ts, and this test
 * enforces the rule: no string may mention a model at all, and none may
 * say anything is downloading. "Download PNG" is the finished image
 * leaving the tab — allowed, and it contains neither word.
 */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (typeof value === "function") {
    // Call the formatter with a sample argument to inspect its output.
    try {
      out.push((value as (n: number) => string)(3));
    } catch {
      // A formatter that needs other args is covered by the static strings.
    }
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) allStrings(v, out);
  }
  return out;
}

describe("face-swap copy", () => {
  it("never mentions a model or anything downloading", () => {
    const strings = allStrings(UI_COPY);
    expect(strings.length).toBeGreaterThan(5);
    for (const s of strings) {
      expect(s).not.toMatch(/model/i);
      expect(s).not.toMatch(/downloading/i);
    }
  });

  it("keeps the neutral progress copy", () => {
    expect(UI_COPY.preparing).toBe("Getting ready…");
    expect(UI_COPY.swapping).toBe("Swapping your face…");
    expect(UI_COPY.downloadPng).toBe("Download PNG");
    expect(UI_COPY.swapsLeft(3)).toBe("3 of 5 swaps left today");
  });
});
