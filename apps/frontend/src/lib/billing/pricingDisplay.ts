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
