/** Display label for a motion-registry category id: "lower-thirds" → "Lower Thirds", "qr-cta" → "QR CTA". */
export function motionCategoryLabel(category: string): string {
  return category
    .split("-")
    .map((w) => (w === "qr" ? "QR" : w === "cta" ? "CTA" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
