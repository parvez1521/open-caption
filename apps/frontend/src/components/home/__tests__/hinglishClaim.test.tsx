import { render } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { HinglishClaim } from "../Sections";

/**
 * Homepage Hinglish claim (owner's words, 2026-11-13): "95% Hinglish caption accurate".
 * The claim is the owner's marketing claim, not a measured benchmark — this pins both
 * halves: the exact wording is present, and no tested/verified/benchmark language
 * appears anywhere in the claim. Reduced motion is mocked on so the count-up jumps
 * straight to 95 (the animation itself is the owner's on-screen check, not this test).
 */
describe("HinglishClaim", () => {
  it("states the owner's claim in his exact words, framed as a claim, not a benchmark", () => {
    window.matchMedia = vi.fn((q: string) => ({
      matches: q === "(prefers-reduced-motion: reduce)",
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const { container } = render(<HinglishClaim />);
    const claim = container.querySelector('[data-hero="claim"]')!;
    expect(claim.getAttribute("aria-label")).toContain("95% Hinglish caption accurate");
    expect(claim.textContent).toContain("95%");
    expect(claim.textContent).toContain("Hinglish caption accurate");
    expect(claim.textContent).toContain("Captionit’s claim for Hindi-English speech");
    expect(claim.textContent).not.toMatch(/tested|verified|benchmark|measured/i);
  });
});
