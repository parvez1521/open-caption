import type { PlanPricing } from "@capseasy/shared";

/**
 * Price display for the pricing + billing pages. The owner's currency rule:
 * a visitor sees exactly ONE currency — INR for India, USD elsewhere — so
 * this picks one field off the plan config and formats it; the other
 * currency is never rendered alongside.
 *
 * USD prices for the new plans are NOT set yet (owner brief gives INR
 * only). A null priceUsd means "INR only for now": a non-India visitor
 * sees the INR price with a plain note, never a guessed conversion.
 */
export type DisplayCurrency = "INR" | "USD";

/** True when the plan has a real USD price to show (Free $0 counts). */
export function hasUsdPrice(entry: PlanPricing): boolean {
  return entry.priceUsd !== null;
}

/** Plain note shown to non-India visitors while USD prices are unset. */
export const USD_PRICE_UNSET_NOTE = "Prices are in Indian rupees for now. US dollar prices are not set yet.";

export function priceLabel(entry: PlanPricing, currency: DisplayCurrency): string {
  if (currency === "INR") return entry.priceInr === 0 ? "₹0" : `₹${entry.priceInr.toLocaleString("en-IN")}`;
  if (entry.priceUsd === null) return entry.priceInr === 0 ? "₹0" : `₹${entry.priceInr.toLocaleString("en-IN")}`;
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

/** "5 processing minutes, one-time" for Free; "40 processing minutes a month" for paid plans. */
export function minutesLabel(minutesPerCycle: number, minutesOneTime: boolean): string {
  return minutesOneTime ? `${minutesPerCycle} processing minutes, one-time` : `${minutesPerCycle} processing minutes a month`;
}
