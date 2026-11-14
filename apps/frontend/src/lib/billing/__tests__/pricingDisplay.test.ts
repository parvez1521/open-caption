// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PLANS, pricingFor, pricingForStoredPlan } from "@capseasy/shared";
import { USD_PRICE_UNSET_NOTE, hasUsdPrice, minutesLabel, priceLabel, projectCountLabel, uploadLimitLabel } from "../pricingDisplay";

describe("pricingDisplay", () => {
  it("shows exactly one currency (owner rule: never ₹ and $ together)", () => {
    expect(priceLabel(pricingFor("starter"), "INR")).toBe("₹149");
    // USD is not set for the new plans: a non-India visitor sees the INR
    // price, never a guessed conversion.
    expect(priceLabel(pricingFor("starter"), "USD")).toBe("₹149");
    expect(hasUsdPrice(pricingFor("starter"))).toBe(false);
    expect(hasUsdPrice(pricingFor("creator"))).toBe(false);
    expect(hasUsdPrice(pricingFor("pro"))).toBe(false);
    expect(priceLabel(pricingFor("free"), "INR")).toBe("₹0");
    expect(priceLabel(pricingFor("free"), "USD")).toBe("$0");
    expect(hasUsdPrice(pricingFor("free"))).toBe(true);
  });

  it("the legacy Plus record keeps its old USD price for payment history", () => {
    expect(priceLabel(pricingForStoredPlan("growth"), "USD")).toBe("$6");
    expect(priceLabel(pricingForStoredPlan("growth"), "INR")).toBe("₹499");
    expect(USD_PRICE_UNSET_NOTE).toContain("Indian rupees");
  });

  it("minutes labels name the one-time Free grant and the monthly paid grants", () => {
    expect(minutesLabel(PLANS.free.minutesPerCycle, PLANS.free.minutesOneTime)).toBe("5 processing minutes, one-time");
    expect(minutesLabel(PLANS.creator.minutesPerCycle, PLANS.creator.minutesOneTime)).toBe("100 processing minutes a month");
  });

  it("upload-limit labels match the feature bullets on the same card (deep-audit B5)", () => {
    // plans.ts bullets: 50 MB / 200 MB / 500 MB / 2 GB — the summary line must
    // render the same numbers (it previously divided by 1,000,000 and showed
    // 52 / 210 / 524 / 2147).
    expect(uploadLimitLabel(PLANS.free.maxUploadBytes)).toBe("50 MB");
    expect(uploadLimitLabel(PLANS.starter.maxUploadBytes)).toBe("200 MB");
    expect(uploadLimitLabel(PLANS.creator.maxUploadBytes)).toBe("500 MB");
    expect(uploadLimitLabel(PLANS.pro.maxUploadBytes)).toBe("2 GB");
    for (const entry of [pricingFor("free"), pricingFor("starter"), pricingFor("creator"), pricingFor("pro")]) {
      const bullet = entry.features.find((f) => f.startsWith("Uploads up to "));
      expect(bullet).toBe(`Uploads up to ${uploadLimitLabel(PLANS[entry.id as "free" | "starter" | "creator" | "pro"].maxUploadBytes)}`);
    }
  });

  it("project counts carry thousands separators, matching the bullets", () => {
    expect(projectCountLabel(PLANS.free.maxProjects)).toBe("10");
    expect(projectCountLabel(PLANS.pro.maxProjects)).toBe("1,000");
  });
});
