import { describe, expect, it } from "vitest";
import { PLAN_IDS, PLAN_PERIOD_DAYS, PLAN_PRICING, PLANS, effectivePlanId, planFor, planIdFor, pricingFor } from "./plans";

describe("plans config", () => {
  it("free is frozen at its long-standing limits (paid tiers never shrink it)", () => {
    expect(PLANS.free).toEqual({
      maxUploadBytes: 50 * 1024 * 1024,
      maxLocalBytes: 2 * 1024 * 1024 * 1024,
      maxDurationSec: 5 * 60,
      cloudAsrMinutesPerMonth: 30,
      exportRetentionDays: 7,
      maxProjects: 10,
    });
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
