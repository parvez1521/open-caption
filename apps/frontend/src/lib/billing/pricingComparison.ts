import { CREATABLE_EXPORT_KINDS, EXPORT_EXTENSIONS, PLAN_PRICING, PLANS, type PlanPricing } from "@capseasy/shared";
import { LOOKS } from "@capseasy/templates";
import { priceLabel, projectCountLabel, type DisplayCurrency } from "./pricingDisplay";

/**
 * The /pricing comparison table, built FROM the plan config — never typed
 * twice. Every value below reads off PLAN_PRICING / PLANS (the same config
 * the API routes enforce and the plan cards render), the looks count off
 * the @capseasy/templates registry, and the export formats off
 * CREATABLE_EXPORT_KINDS. If the owner edits a price, a quota or a look,
 * the table follows with no second edit.
 *
 * Two deliberate exclusions, both owner decisions (2026-11-15):
 * - NO upload-size row: upload limits were removed from pricing copy, so
 *   no value here may mention MB/GB or uploads at all.
 * - NO Clipper: plans.ts still carries the old "Editor, Clipper and
 *   Creator Studio included" bullet (a parallel branch is removing it).
 *   The studio label below strips the Clipper clause at render time, and
 *   no raw feature string is ever rendered by the table.
 */
export interface ComparisonRow {
  id: string;
  label: string;
  /** one value per plan, in PLAN_PRICING order */
  values: string[];
}

/** "5 min" / "30 min" / "1 hour" / "3 hours" — from maxDurationSec, never typed. */
export function durationLabel(maxDurationSec: number): string {
  const minutes = Math.round(maxDurationSec / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/**
 * The studio row label, derived from the plan features: the free plan's
 * "Editor, … and Creator Studio included" bullet with the Clipper clause
 * stripped. Once the parallel Clipper-removal branch lands, the source
 * bullet reads "Editor and Creator Studio included" and this is a no-op.
 */
export function studioIncludedLabel(): string {
  const fallback = "Editor and Creator Studio included";
  const feature = PLAN_PRICING.flatMap((p) => p.features).find((f) => f.includes("Editor"));
  if (!feature) return fallback;
  return feature.replace(/,?\s*Clipper\b/g, "").replace(/\s{2,}/g, " ").trim();
}

/** The plan's support line, or null when the plan carries none (Free). */
export function supportLabel(entry: PlanPricing): string | null {
  return entry.features.find((f) => /support/i.test(f)) ?? null;
}

/** "MP4 · SRT · VTT · ASS · TXT · JSON · MOV · WEBM" — from CREATABLE_EXPORT_KINDS. */
export function exportFormatsLabel(): string {
  return CREATABLE_EXPORT_KINDS.map((k) => EXPORT_EXTENSIONS[k].toUpperCase()).join(" · ");
}

export function comparisonRows(currency: DisplayCurrency): ComparisonRow[] {
  const entries = PLAN_PRICING;
  const limits = entries.map((e) => PLANS[e.id]);
  return [
    {
      id: "price",
      label: "Price, 30-day pass",
      values: entries.map((e) => priceLabel(e, currency)),
    },
    {
      id: "videos",
      label: "Videos per month",
      values: limits.map((l) => String(l.videosPerMonth)),
    },
    {
      id: "duration",
      label: "Longest video",
      values: limits.map((l) => durationLabel(l.maxDurationSec)),
    },
    {
      id: "projects",
      label: "Projects",
      values: limits.map((l) => projectCountLabel(l.maxProjects)),
    },
    {
      id: "retention",
      label: "Exports kept",
      values: limits.map((l) => `${l.exportRetentionDays} days`),
    },
    {
      id: "looks",
      label: "Caption looks",
      values: entries.map(() => `All ${LOOKS.length}`),
    },
    {
      id: "formats",
      label: "Export formats",
      values: entries.map(() => exportFormatsLabel()),
    },
    {
      id: "studio",
      label: studioIncludedLabel(),
      values: entries.map(() => "Included"),
    },
    {
      id: "support",
      label: "Support",
      values: entries.map((e) => supportLabel(e) ?? "—"),
    },
  ];
}
