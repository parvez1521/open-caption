import React from "react";

/**
 * The one progress bar: a rounded caption line that fills solid emerald to
 * the REAL percent, with an orange square cursor block riding at the fill tip
 * — the same cursor as the caption-lines mark. The percent and any caption
 * (% · ETA) are passed in from real values; this component never invents a
 * percent of its own.
 */
export function CaptionProgress({
  percent,
  caption,
  className = "",
  trackClassName = "bg-st-line",
  captionClassName = "text-st-faint",
}: {
  /** real percent, 0–100 */
  percent: number;
  /** e.g. "42% · About 20 seconds left" — already computed from real values */
  caption?: React.ReactNode;
  className?: string;
  trackClassName?: string;
  captionClassName?: string;
}) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div className={className}>
      <div
        className={`relative mx-auto h-2 w-72 max-w-full overflow-visible rounded-full ${trackClassName}`}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-[#34D399] transition-all duration-500" style={{ width: `${pct}%` }} />
        <span
          aria-hidden
          className="absolute top-1/2 h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-[#FFA946] transition-all duration-500"
          style={{ left: `${pct}%` }}
        />
      </div>
      {caption != null ? <p className={`mt-2 text-xs tabular-nums ${captionClassName}`}>{caption}</p> : null}
    </div>
  );
}
