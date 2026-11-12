import React from "react";
import { BRAND_NAME, BRAND_WORDMARK_ACCENT, BRAND_WORDMARK_LEAD } from "@/lib/brand";

/**
 * The one Open Caption logo, used everywhere a logo appears.
 * The mark is the caption-lines mark — two horizontal caption lines with an
 * orange cursor block at the end of the second line (public/brand/opencaption-icon*.svg);
 * the wordmark is live text set in the site fonts (bold lead + serif-italic accent),
 * driven by the central brand config in src/lib/brand.ts — renaming the brand is a
 * one-place change there.
 *   variant: "full" = mark + wordmark, "mark" = the caption-lines mark, "word" = wordmark only
 *   tone:    "dark" for light backgrounds, "light" for dark backgrounds
 */
export function Logo({
  variant = "full",
  tone = "light",
  height = 28,
  className = "",
}: {
  variant?: "full" | "mark" | "word";
  tone?: "dark" | "light";
  height?: number;
  className?: string;
}) {
  const markSrc = `/brand/opencaption-icon${tone === "light" ? "-light" : ""}.svg`;
  return (
    <span className={`inline-flex shrink-0 select-none items-center gap-2 ${className}`} role="img" aria-label={BRAND_NAME}>
      {variant !== "word" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={markSrc} alt="" aria-hidden="true" height={height} className="block shrink-0 select-none" style={{ height, width: "auto" }} draggable={false} />
      )}
      {variant !== "mark" && (
        <span className="font-styled font-black leading-none tracking-tight" style={{ fontSize: height * 0.82 }}>
          {BRAND_WORDMARK_LEAD}
          <span className="font-serif font-normal italic">{BRAND_WORDMARK_ACCENT}</span>
        </span>
      )}
    </span>
  );
}
