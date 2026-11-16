import { render } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { HomePricingSection } from "../Sections";

/**
 * Homepage pricing section (owner order 2026-11-15): the last section on the
 * homepage, a clean summary of the same four plans /pricing shows. It renders
 * from the same PLAN_PRICING config as /pricing, so the plans and prices
 * cannot drift. Pins the owner rules: no upload-size string anywhere, no
 * "Clipper" anywhere (the stale plans.ts bullet is filtered at render time
 * and "Editor and Creator Studio included" is printed on every plan instead),
 * and a link to the full comparison on /pricing.
 */
describe("HomePricingSection", () => {
  it("renders all four plans with their INR prices and links to /pricing", () => {
    const { container } = render(<HomePricingSection />);
    const text = container.textContent ?? "";
    for (const [name, price] of [
      ["Free", "₹0"],
      ["Starter", "₹149"],
      ["Plus", "₹499"],
      ["Pro", "₹799"],
    ] as const) {
      expect(text).toContain(name);
      expect(text).toContain(price);
    }
    expect(text).toContain("for 30 days");
    expect(text.match(/Editor and Creator Studio included/g)?.length).toBe(4);
    expect(text).not.toContain("Clipper");
    expect(text).not.toMatch(/Uploads up to|\bMB\b|\bGB\b/i);
    expect(text).not.toMatch(/upload/i);
    const link = container.querySelector('a[href="/pricing"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("See full comparison");
  });

  it("is the homepage pricing anchor the page scroll-reveal already targets", () => {
    const { container } = render(<HomePricingSection />);
    expect(container.querySelector("#pricing")).not.toBeNull();
    expect(container.querySelectorAll("[data-tier]").length).toBe(4);
  });
});
