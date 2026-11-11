// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PLANS, pricingFor } from "@capseasy/shared";
import { priceLabel, projectCountLabel, uploadLimitLabel } from "../pricingDisplay";

describe("pricingDisplay", () => {
  it("shows exactly one currency (owner rule: never ₹ and $ together)", () => {
    expect(priceLabel(pricingFor("starter"), "INR")).toBe("₹299");
    expect(priceLabel(pricingFor("starter"), "USD")).toBe("$4");
    expect(priceLabel(pricingFor("free"), "INR")).toBe("₹0");
    expect(priceLabel(pricingFor("free"), "USD")).toBe("$0");
  });

  it("upload-limit labels match the feature bullets on the same card (deep-audit B5)", () => {
    // plans.ts bullets: 50 MB / 200 MB / 500 MB / 2 GB — the summary line must
    // render the same numbers (it previously divided by 1,000,000 and showed
    // 52 / 210 / 524 / 2147).
    expect(uploadLimitLabel(PLANS.free.maxUploadBytes)).toBe("50 MB");
    expect(uploadLimitLabel(PLANS.starter.maxUploadBytes)).toBe("200 MB");
    expect(uploadLimitLabel(PLANS.growth.maxUploadBytes)).toBe("500 MB");
    expect(uploadLimitLabel(PLANS.pro.maxUploadBytes)).toBe("2 GB");
    for (const entry of [pricingFor("free"), pricingFor("starter"), pricingFor("growth"), pricingFor("pro")]) {
      const bullet = entry.features.find((f) => f.startsWith("Uploads up to "));
      expect(bullet).toBe(`Uploads up to ${uploadLimitLabel(PLANS[entry.id].maxUploadBytes)}`);
    }
  });

  it("project counts carry thousands separators, matching the bullets", () => {
    expect(projectCountLabel(PLANS.free.maxProjects)).toBe("10");
    expect(projectCountLabel(PLANS.pro.maxProjects)).toBe("1,000");
  });
});
