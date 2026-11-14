/**
 * Customer phone for Cashfree orders — one rule, shared by the billing
 * page (client-side) and the checkout route (server-side).
 *
 * Cashfree's production /pg/orders REQUIRES customer_details.customer_phone
 * and answers 400 without it; the hosted checkout page does not collect it
 * for us. Accept an Indian 10-digit mobile, or an international number
 * with a + country code. Separators (spaces, dashes, dots, brackets) are
 * stripped. Returns the cleaned number, or null when it is not a valid
 * phone. Never invent a number — a fake one would land on a real
 * customer's receipt.
 */
export function normalizeCustomerPhone(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/[\s\-().]/g, "");
  if (!cleaned) return null;
  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1);
    if (!/^\d+$/.test(digits) || digits.length < 7 || digits.length > 15) return null;
    return cleaned;
  }
  if (!/^\d+$/.test(cleaned)) return null;
  // Indian mobile with a trunk 0: 09876543210 -> 9876543210.
  if (cleaned.length === 11 && cleaned.startsWith("0") && /^[6-9]\d{9}$/.test(cleaned.slice(1))) {
    return cleaned.slice(1);
  }
  // Indian mobile with country code, no +: 919876543210 -> +919876543210.
  if (cleaned.length === 12 && cleaned.startsWith("91") && /^[6-9]\d{9}$/.test(cleaned.slice(2))) {
    return `+${cleaned}`;
  }
  // Plain Indian 10-digit mobile.
  if (/^[6-9]\d{9}$/.test(cleaned)) return cleaned;
  return null;
}
