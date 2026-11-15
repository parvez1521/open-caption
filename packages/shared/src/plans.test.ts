import { describe, expect, it } from "vitest";
import { PLAN_IDS, PLAN_PERIOD_DAYS, PLAN_PRICING, PLANS, effectivePlanId, planFor, planIdFor, pricingFor } from "./plans";

describe("plans config", () => {
  it("free is frozen at its long-standing limits (paid tiers never shrink it)", () => {
    // Owner-approved change 2026-11-15: free local uploads raised 2 GB -> 4 GB
    // (all plans now support >= 4 GB on-device uploads; server cap unchanged).
    expect(PLANS.free).toEqual({
      maxUploadBytes: 50 * 1024 * 1024,
      maxLocalBytes: 4 * 1024 * 1024 * 1024,
      maxDurationSec: 5 * 60,
      cloudAsrMinutesPerMonth: 30,
      exportRetentionDays: 7,
      maxProjects: 10,
      videosPerMonth: 3,
    });
  });

  it("every plan supports at least 4 GB local uploads (owner order 2026-11-15)", () => {
    for (const id of PLAN_IDS) {
      expect(PLANS[id].maxLocalBytes).toBeGreaterThanOrEqual(4 * 1024 * 1024 * 1024);
    }
  });

  it("no pricing feature mentions an upload size (owner order 2026-11-15)", () => {
    for (const entry of PLAN_PRICING) {
      for (const feature of entry.features) {
        expect(feature).not.toMatch(/upload/i);
      }
    }
  });

  it("no pricing surface mentions Clipper (owner order 2026-11-15)", () => {
    // The Free tier used to read "Editor, Clipper and Creator Studio included";
    // Clipper is hidden from every user-visible surface now, so no plan name,
    // tagline or feature bullet may name it.
    for (const entry of PLAN_PRICING) {
      expect(entry.name).not.toMatch(/clipper/i);
      expect(entry.tagline).not.toMatch(/clipper/i);
      for (const feature of entry.features) {
        expect(feature).not.toMatch(/clipper/i);
      }
    }
    expect(pricingFor("free").features).toContain("Editor and Creator Studio included");
  });

  it("every tier has pricing, in display order, free first", () => {
    expect(PLAN_PRICING.map((p) => p.id)).toEqual(["free", "starter", "growth", "pro"]);
    for (const id of PLAN_IDS) {
      const pricing = pricingFor(id);
      expect(pricing.features.length).toBeGreaterThanOrEqual(4);
      if (id === "free") {
        expect(pricing.priceInr).toBe(0);
        expect(pricing.priceUsd).toBe(0);
      } else {
        expect(pricing.priceInr).toBeGreaterThan(0);
        expect(pricing.priceUsd).toBeGreaterThan(0);
      }
    }
  });

  it("display names are Free/Starter/Plus/Pro while ids stay free/starter/growth/pro", () => {
    // The ₹499 tier's DISPLAY name is "Plus" (renamed from "Growth" to end the
    // clash with the Growth Studio product); its id deliberately stays
    // "growth" — that string is the billing identity on profiles/payments.
    expect(PLAN_PRICING.map((p) => p.name)).toEqual(["Free", "Starter", "Plus", "Pro"]);
    expect(pricingFor("growth").name).toBe("Plus");
  });

  it("paid tiers only ever RAISE the scale limits, monotonically", () => {
    const order = ["free", "starter", "growth", "pro"] as const;
    for (const key of ["maxProjects", "maxDurationSec", "maxUploadBytes", "exportRetentionDays"] as const) {
      for (let i = 1; i < order.length; i++) {
        expect(PLANS[order[i]!][key]).toBeGreaterThanOrEqual(PLANS[order[i - 1]!][key]);
      }
    }
  });

  it("unknown plan strings read as free; the period is 30 days", () => {
    expect(planIdFor("gold")).toBe("free");
    expect(planIdFor(null)).toBe("free");
    expect(planFor("starter").maxProjects).toBe(50);
    expect(PLAN_PERIOD_DAYS).toBe(30);
  });

  it("an expired paid period falls back to free; a live one keeps its tier", () => {
    const now = new Date("2026-11-11T00:00:00Z");
    expect(effectivePlanId("growth", "2026-11-10T00:00:00Z", now)).toBe("free");
    expect(effectivePlanId("growth", "2026-12-01T00:00:00Z", now)).toBe("growth");
    expect(effectivePlanId("growth", null, now)).toBe("growth");
    expect(effectivePlanId("free", "2020-01-01T00:00:00Z", now)).toBe("free");
    expect(effectivePlanId("growth", "not-a-date", now)).toBe("growth");
  });
});
