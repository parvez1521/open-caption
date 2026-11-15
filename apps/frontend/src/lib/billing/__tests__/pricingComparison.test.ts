// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CREATABLE_EXPORT_KINDS, EXPORT_EXTENSIONS, PLAN_PRICING, PLANS, pricingFor } from "@capseasy/shared";
import { LOOKS } from "@capseasy/templates";
import { priceLabel } from "../pricingDisplay";
import {
  comparisonRows,
  durationLabel,
  exportFormatsLabel,
  studioIncludedLabel,
  supportLabel,
} from "../pricingComparison";

const row = (rows: ReturnType<typeof comparisonRows>, id: string) => rows.find((r) => r.id === id)!;

describe("pricingComparison", () => {
  it("covers all four live plans, in card order", () => {
    const rows = comparisonRows("INR");
    expect(PLAN_PRICING.map((p) => p.name)).toEqual(["Free", "Starter", "Plus", "Pro"]);
    for (const r of rows) expect(r.values).toHaveLength(4);
  });

  it("price row matches PLAN_PRICING in each currency, one currency only", () => {
    expect(row(comparisonRows("INR"), "price").values).toEqual(
      PLAN_PRICING.map((p) => priceLabel(p, "INR")),
    );
    expect(row(comparisonRows("USD"), "price").values).toEqual(["$0", "$4", "$6", "$10"]);
    expect(row(comparisonRows("INR"), "price").values).toEqual(["₹0", "₹299", "₹499", "₹799"]);
  });

  it("quota, duration, projects and retention match PLANS exactly", () => {
    const rows = comparisonRows("INR");
    expect(row(rows, "videos").values).toEqual(
      PLAN_PRICING.map((p) => String(PLANS[p.id].videosPerMonth)),
    );
    expect(row(rows, "videos").values).toEqual(["3", "10", "20", "40"]);
    expect(row(rows, "duration").values).toEqual(["5 min", "30 min", "1 hour", "3 hours"]);
    expect(row(rows, "duration").values).toEqual(
      PLAN_PRICING.map((p) => durationLabel(PLANS[p.id].maxDurationSec)),
    );
    expect(row(rows, "projects").values).toEqual(["10", "50", "200", "1,000"]);
    expect(row(rows, "retention").values).toEqual(["7 days", "30 days", "60 days", "60 days"]);
  });

  it("looks row shows the whole registry on every plan", () => {
    expect(LOOKS.length).toBe(150);
    expect(row(comparisonRows("INR"), "looks").values).toEqual([
      "All 150",
      "All 150",
      "All 150",
      "All 150",
    ]);
  });

  it("export formats row derives from CREATABLE_EXPORT_KINDS, same on every plan", () => {
    const label = exportFormatsLabel();
    expect(label).toBe(
      CREATABLE_EXPORT_KINDS.map((k) => EXPORT_EXTENSIONS[k].toUpperCase()).join(" · "),
    );
    expect(label).toContain("MP4");
    expect(label).toContain("SRT");
    expect(row(comparisonRows("INR"), "formats").values).toEqual([label, label, label, label]);
  });

  it("studio row says Editor and Creator Studio included, with no Clipper anywhere", () => {
    expect(studioIncludedLabel()).toBe("Editor and Creator Studio included");
    expect(row(comparisonRows("INR"), "studio").values).toEqual([
      "Included",
      "Included",
      "Included",
      "Included",
    ]);
  });

  it("support row reads the plan features; Free has none", () => {
    expect(supportLabel(pricingFor("free"))).toBeNull();
    expect(supportLabel(pricingFor("starter"))).toBe("Email support");
    expect(supportLabel(pricingFor("pro"))).toBe("Priority email support");
    expect(row(comparisonRows("INR"), "support").values).toEqual([
      "—",
      "Email support",
      "Email support",
      "Priority email support",
    ]);
  });

  it("no row mentions uploads, MB/GB, or Clipper", () => {
    const rows = comparisonRows("INR");
    const text = rows.flatMap((r) => [r.label, ...r.values]).join(" | ");
    expect(text).not.toMatch(/clipper/i);
    expect(text).not.toMatch(/\bMB\b|\bGB\b/i);
    expect(text).not.toMatch(/upload/i);
    expect(text).not.toMatch(/minute/i);
    expect(text).not.toMatch(/₹149|₹349|₹749/);
  });
});
