import React from "react";

/**
 * The CaptionsEasy logo bars, bouncing like a sound wave. The one "working on it" animation, shown between events
 * (opening a project, creating, deleting, loading). Colours are the logo's: obsidian, orange, emerald.
 */
const BARS = [
  { color: "#1A1A1A", h: 0.62 },
  { color: "#FFA946", h: 1 },
  { color: "#34D399", h: 0.8 },
] as const;

/** tone="light" turns the dark bar cream, for use on dark backgrounds. */
export function LogoWave({ height = 40, className = "", tone = "light" }: { height?: number; className?: string; tone?: "dark" | "light" }) {
  const w = Math.max(4, Math.round(height * 0.19));
  return (
    <span className={`ce-wave ${className}`} style={{ height, gap: Math.max(3, Math.round(height * 0.12)) }} role="presentation" aria-hidden>
      {BARS.map((b) => (
        <span key={b.color} style={{ width: w, background: tone === "light" && b.color === "#1A1A1A" ? "#FFFFEB" : b.color, height: `${b.h * 100}%` }} />
      ))}
    </span>
  );
}
