import type { PlanPricing } from "@capseasy/shared";

/**
 * Price display for the pricing + billing pages. The owner's currency rule:
 * a visitor sees exactly ONE currency — INR for India, USD elsewhere — so
 * this picks one field off the plan config and formats it; the other
 * currency is never rendered alongside.
 */
export type DisplayCurrency = "INR" | "USD";

export function priceLabel(entry: PlanPricing, currency: DisplayCurrency): string {
  if (currency === "INR") return entry.priceInr === 0 ? "₹0" : `₹${entry.priceInr.toLocaleString("en-IN")}`;
  return entry.priceUsd === 0 ? "$0" : `$${entry.priceUsd}`;
}

/**
 * Upload-limit display in the SAME units the plan feature bullets use
 * (binary: the limits are 50/200/500 × 1024² and 2 × 1024³). Deep-audit B5:
 * the pricing summary line divided by 1,000,000 and showed different numbers
 * (52/210/524/2147 MB) from the bullets on the very same card.
 */
export function uploadLimitLabel(maxUploadBytes: number): string {
  const mib = maxUploadBytes / (1024 * 1024);
  if (mib >= 1024) return `${Math.round(mib / 1024)} GB`;
  return `${Math.round(mib)} MB`;
}

/** Project-count display with thousands separators (1,000 — not 1000). */
export function projectCountLabel(maxProjects: number): string {
  return maxProjects.toLocaleString("en-US");
}
