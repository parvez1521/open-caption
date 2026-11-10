import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getLook } from "@capseasy/templates";
import { LOOKS_WITH_STILLS, TemplatePoster } from "../panels/LooksPanel";

/**
 * Phase 9 W2, quirk (d): ONE transient black "Roll Hero" card in the picker. The live-preview
 * render path was probed separately (both roll looks render sample text at every 33 ms frame
 * of the loop through PageView — no null/blank frames), but the POSTER under the live layer had
 * a proven flaw: it requested a pre-rendered still for every built-in look, while only 39
 * stills exist in apps/frontend/public/looks/. Roll Hero has none, so its card first painted a
 * 404 <img> over the black stage — a black card — until the image error (or a live-slot grant)
 * replaced it. Pin: looks without a still render the swatch directly (no <img> at all); looks
 * with a still still request it.
 */
describe("TemplatePoster still selection (quirk d)", () => {
  it("the still set is exactly the 39 files the gallery ships", () => {
    expect(LOOKS_WITH_STILLS.size).toBe(39);
    for (const id of LOOKS_WITH_STILLS) expect(getLook(id), id).toBeTruthy();
    expect(LOOKS_WITH_STILLS.has("roll_hero")).toBe(false);
    expect(LOOKS_WITH_STILLS.has("roll_stack")).toBe(false);
  });

  it("Roll Hero (no still on disk) renders the swatch, never a doomed <img>", () => {
    const look = getLook("roll_hero")!;
    const view = render(<TemplatePoster look={look} />);
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.textContent).toMatch(/WATCH/);
  });

  it("a look with a still (hormozi_box) still requests its webp", () => {
    const look = getLook("hormozi_box")!;
    const view = render(<TemplatePoster look={look} />);
    const img = view.container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/looks/hormozi_box.webp");
  });
});
