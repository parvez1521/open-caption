import React from "react";

/**
 * The caption-lines mark, drawn inline (no asset fetch): two horizontal
 * caption lines with an orange cursor block at the end of the second line —
 * the same geometry as public/brand/opencaption-icon.svg. The "something is
 * happening" mark, shown between events (opening a project, creating,
 * deleting, loading). Only the cursor block moves: it blinks gently, and
 * under reduced motion it is fully static (see .oc-cursor-blink in globals.css).
 */
export function LoadingMark({ height = 40, className = "", tone = "light" }: { height?: number; className?: string; tone?: "dark" | "light" }) {
  const line = tone === "light" ? "#FFFFEB" : "#1A1A1A";
  return (
    <svg
      viewBox="0 0 100 100"
      height={height}
      width={height}
      className={className}
      role="presentation"
      aria-hidden
      style={{ display: "block" }}
    >
      <rect x="16" y="32" width="46" height="13" rx="6.5" fill={line} />
      <rect x="16" y="55" width="60" height="13" rx="6.5" fill={line} />
      <rect className="oc-cursor-blink" x="80" y="55" width="13" height="13" rx="2.5" fill="#FFA946" />
    </svg>
  );
}
