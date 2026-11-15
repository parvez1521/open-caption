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

  it("upload-limit labels still render per-plan server caps (used by terms + upload errors)", () => {
    // maxUploadBytes is unchanged (Supabase Free bounds storage files at 50 MB);
    // the labels are still used by the terms page, the upload hint, /transcribe
    // and the server videos route — but NO pricing feature bullet mentions them.
    expect(uploadLimitLabel(PLANS.free.maxUploadBytes)).toBe("50 MB");
    expect(uploadLimitLabel(PLANS.starter.maxUploadBytes)).toBe("200 MB");
    expect(uploadLimitLabel(PLANS.growth.maxUploadBytes)).toBe("500 MB");
    expect(uploadLimitLabel(PLANS.pro.maxUploadBytes)).toBe("2 GB");
    for (const entry of [pricingFor("free"), pricingFor("starter"), pricingFor("growth"), pricingFor("pro")]) {
      expect(entry.features.some((f) => f.startsWith("Uploads up to "))).toBe(false);
    }
  });

  it("project counts carry thousands separators, matching the bullets", () => {
    expect(projectCountLabel(PLANS.free.maxProjects)).toBe("10");
    expect(projectCountLabel(PLANS.pro.maxProjects)).toBe("1,000");
  });
});
