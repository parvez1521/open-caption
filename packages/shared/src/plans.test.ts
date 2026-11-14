import { describe, expect, it } from "vitest";
import {
  FREE_LOOKS_COUNT,
  LEGACY_PLAN_PRICING,
  LEGACY_PLANS,
  PLAN_IDS,
  PLAN_PERIOD_DAYS,
  PLAN_PRICING,
  PLANS,
  TOTAL_LOOKS_COUNT,
  WATERMARK_REMOVAL_PRICE_INR,
  effectivePlanId,
  isLegacyPlanId,
  legacyPlanFor,
  planFor,
  planIdFor,
  pricingFor,
  pricingForStoredPlan,
} from "./plans";

describe("plans config", () => {
  it("free is frozen at its long-standing limits (paid tiers never shrink it)", () => {
    expect(PLANS.free).toEqual({
      maxUploadBytes: 50 * 1024 * 1024,
      maxLocalBytes: 2 * 1024 * 1024 * 1024,
      maxDurationSec: 5 * 60,
      cloudAsrMinutesPerMonth: 30,
      exportRetentionDays: 7,
      maxProjects: 10,
      videosPerMonth: 3,
      minutesPerCycle: 5,
      minutesOneTime: true,
    });
  });

  it("every tier has pricing, in display order, free first", () => {
    expect(PLAN_PRICING.map((p) => p.id)).toEqual(["free", "starter", "creator", "pro"]);
    for (const id of PLAN_IDS) {
      const pricing = pricingFor(id);
      expect(pricing.features.length).toBeGreaterThanOrEqual(4);
      if (id === "free") {
        expect(pricing.priceInr).toBe(0);
        expect(pricing.priceUsd).toBe(0);
      } else {
        expect(pricing.priceInr).toBeGreaterThan(0);
        // USD prices are not set yet (owner brief gives INR only) — null, never a guessed conversion.
        expect(pricing.priceUsd).toBeNull();
      }
    }
  });

  it("new prices are Free 0, Starter 149, Creator 349, Pro 749 INR", () => {
    expect(PLAN_PRICING.map((p) => [p.id, p.priceInr])).toEqual([
      ["free", 0],
      ["starter", 149],
      ["creator", 349],
      ["pro", 749],
    ]);
  });

  it("processing minutes per plan: Free 5 one-time, Starter 40, Creator 100, Pro 250", () => {
    expect(PLANS.free.minutesPerCycle).toBe(5);
    expect(PLANS.free.minutesOneTime).toBe(true);
    expect(PLANS.starter).toMatchObject({ minutesPerCycle: 40, minutesOneTime: false });
    expect(PLANS.creator).toMatchObject({ minutesPerCycle: 100, minutesOneTime: false });
    expect(PLANS.pro).toMatchObject({ minutesPerCycle: 250, minutesOneTime: false });
  });

  it("Creator is the Most Popular plan, and only Creator", () => {
    expect(PLAN_PRICING.filter((p) => p.isMostPopular).map((p) => p.id)).toEqual(["creator"]);
    expect(pricingFor("creator").isMostPopular).toBe(true);
    expect(pricingFor("creator").name).toBe("Creator");
  });

  it("display names are Free/Starter/Creator/Pro", () => {
    expect(PLAN_PRICING.map((p) => p.name)).toEqual(["Free", "Starter", "Creator", "Pro"]);
  });

  it("paid tiers only ever RAISE the scale limits, monotonically", () => {
    const order = ["free", "starter", "creator", "pro"] as const;
    for (const key of ["maxProjects", "maxDurationSec", "maxUploadBytes", "exportRetentionDays"] as const) {
      for (let i = 1; i < order.length; i++) {
        expect(PLANS[order[i]!][key]).toBeGreaterThanOrEqual(PLANS[order[i - 1]!][key]);
      }
    }
  });

  it("the video quota stays intact until the minutes cutover (Builder 2)", () => {
    expect(PLANS.free.videosPerMonth).toBe(3);
    expect(PLANS.starter.videosPerMonth).toBe(10);
    expect(PLANS.creator.videosPerMonth).toBe(20);
    expect(PLANS.pro.videosPerMonth).toBe(40);
  });

  it("processing minutes are not the old ASR allowance", () => {
    // cloudAsrMinutesPerMonth (30/120/300/600) is a different, unenforced
    // field. It must never be read as the minutes balance.
    expect(PLANS.free.cloudAsrMinutesPerMonth).toBe(30);
    expect(PLANS.free.minutesPerCycle).toBe(5);
    expect(PLANS.creator.cloudAsrMinutesPerMonth).toBe(300);
    expect(PLANS.creator.minutesPerCycle).toBe(100);
  });

  it("a stored growth value maps to creator, never to free", () => {
    expect(planIdFor("growth")).toBe("creator");
    expect(planFor("growth").minutesPerCycle).toBe(100);
    expect(planFor("growth").videosPerMonth).toBe(20);
    expect(isLegacyPlanId("growth")).toBe(true);
    expect(isLegacyPlanId("creator")).toBe(false);
  });

  it("the legacy Plus record is kept verbatim, off the pricing page", () => {
    expect(LEGACY_PLAN_PRICING.map((p) => p.id)).toEqual(["growth"]);
    expect(pricingFor("growth").name).toBe("Plus");
    expect(pricingFor("growth").priceInr).toBe(499);
    expect(pricingFor("growth").priceUsd).toBe(6);
    expect(pricingFor("growth").features[0]).toBe("20 videos a month");
    expect(LEGACY_PLANS.growth).toEqual(legacyPlanFor("growth"));
    expect(legacyPlanFor("growth").videosPerMonth).toBe(20);
    expect(legacyPlanFor("growth").minutesPerCycle).toBe(0);
    expect(PLAN_PRICING.map((p) => p.id)).not.toContain("growth");
    expect(pricingForStoredPlan("growth").name).toBe("Plus");
    expect(pricingForStoredPlan("creator").name).toBe("Creator");
    expect(pricingForStoredPlan("gold").name).toBe("Free");
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
    expect(effectivePlanId("growth", "2026-12-01T00:00:00Z", now)).toBe("creator");
    expect(effectivePlanId("growth", null, now)).toBe("creator");
    expect(effectivePlanId("free", "2020-01-01T00:00:00Z", now)).toBe("free");
    expect(effectivePlanId("growth", "not-a-date", now)).toBe("creator");
    expect(effectivePlanId("creator", "2026-12-01T00:00:00Z", now)).toBe("creator");
  });

  it("watermark removal is 69 INR, no USD price set; looks split is 25 of 150", () => {
    expect(WATERMARK_REMOVAL_PRICE_INR).toBe(69);
    expect(FREE_LOOKS_COUNT).toBe(25);
    expect(TOTAL_LOOKS_COUNT).toBe(150);
  });
});
