import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { CaptionProgress } from "@/components/brand/CaptionProgress";
import { LoadingMark } from "@/components/brand/LoadingMark";
import { Logo } from "@/components/brand/Logo";

/**
 * Logo / intro / loading-bar rebrand guards: the mark is caption lines +
 * cursor (never the upstream's three vertical bars), the brand assets are
 * opencaption-* (no captionseasy-* file may remain in public/brand), and
 * the progress bar shows only a real percent with the cursor at its tip.
 */
describe("brand rebrand", () => {
  it("Logo points at the opencaption-* mark, wordmark unchanged", () => {
    const { container } = render(<Logo tone="dark" height={28} />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/brand/opencaption-icon.svg");
    expect(container.textContent).toContain("Open");
    expect(container.textContent).toContain("Caption");
    const { container: light } = render(<Logo tone="light" height={28} />);
    expect(light.querySelector("img")!.getAttribute("src")).toBe("/brand/opencaption-icon-light.svg");
  });

  it("no captionseasy-* asset remains in public/brand", () => {
    const dir = join(__dirname, "..", "..", "..", "..", "public", "brand");
    const files = readdirSync(dir);
    expect(files.filter((f) => f.startsWith("captionseasy"))).toEqual([]);
    for (const f of ["opencaption-icon.svg", "opencaption-icon-light.svg", "opencaption-app-icon.svg", "opencaption-icon-192.png", "opencaption-icon-512.png"]) {
      expect(existsSync(join(dir, f))).toBe(true);
    }
  });

  it("LoadingMark draws caption lines + orange cursor, never vertical bars", () => {
    const { container } = render(<LoadingMark height={40} tone="dark" />);
    const svg = container.querySelector("svg")!;
    const rects = [...svg.querySelectorAll("rect")];
    expect(rects).toHaveLength(3);
    // two horizontal lines (wider than tall) + one square cursor block
    expect(Number(rects[0]!.getAttribute("width"))).toBeGreaterThan(Number(rects[0]!.getAttribute("height")));
    expect(Number(rects[1]!.getAttribute("width"))).toBeGreaterThan(Number(rects[1]!.getAttribute("height")));
    expect(rects[2]!.getAttribute("width")).toBe(rects[2]!.getAttribute("height"));
    expect(rects[2]!.getAttribute("fill")).toBe("#FFA946");
  });

  it("CaptionProgress shows the real percent with the cursor at the fill tip", () => {
    render(<CaptionProgress percent={42} caption="42% · About 20 seconds left" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
    expect(screen.getByText("42% · About 20 seconds left")).toBeTruthy();
  });

  it("the upstream hero line and fake counter are gone from the intro", () => {
    const loader = readFileSync(join(__dirname, "..", "..", "home", "Loader.tsx"), "utf8");
    expect(loader).not.toContain("Don't edit, just upload.");
    expect(loader).not.toContain("data-count");
    expect(loader).not.toContain("ce-count");
    expect(loader).toContain("Every word, on screen, on time.");
  });
});
