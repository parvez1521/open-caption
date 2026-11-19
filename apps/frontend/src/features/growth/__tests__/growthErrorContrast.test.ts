import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MA-A2-002: the growth error copy used text-red-700 (#B91C1C) on the dark
 * growth surface (#141412) — 2.85:1, below WCAG AA 4.5:1 for this size. The
 * fix is text-red-400 (#F87171), the error red AuthShell already uses on
 * dark, at 6.67:1. This test pins the ratio from the token values and the
 * class in the two growth files, so a future restyle fails here first.
 */

// WCAG 2.x relative luminance + contrast ratio, same maths the audit used.
function luminance(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i + 1, i + 3), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(fg: string, bg: string): number {
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (l1! + 0.05) / (l2! + 0.05);
}

const RED_700 = "#B91C1C"; // Tailwind red-700 — the failing error red
const RED_400 = "#F87171"; // Tailwind red-400 — the error red on dark
const GROWTH_BG = "#141412"; // bg-sand-50, the growth container

describe("growth error contrast (MA-A2-002)", () => {
  it("red-400 on the dark growth surface passes WCAG AA 4.5:1", () => {
    expect(contrast(RED_400, GROWTH_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it("red-700 on the same surface does not — that is why it is banned here", () => {
    expect(contrast(RED_700, GROWTH_BG)).toBeLessThan(4.5);
  });

  it("no growth error copy uses text-red-700; the alerts use text-red-400", () => {
    for (const file of ["src/features/growth/GrowthCoach.tsx", "src/features/growth/AccountsBar.tsx"]) {
      const src = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(src, `${file} must not use the failing red-700`).not.toContain("text-red-700");
      expect(src, `${file} error alerts should use red-400`).toContain('role="alert"');
    }
    const coach = readFileSync(resolve(process.cwd(), "src/features/growth/GrowthCoach.tsx"), "utf8");
    const bar = readFileSync(resolve(process.cwd(), "src/features/growth/AccountsBar.tsx"), "utf8");
    // Each role="alert" error paragraph carries the passing red.
    for (const [name, src] of [["GrowthCoach", coach], ["AccountsBar", bar]] as const) {
      const alerts = src.match(/<p role="alert" className="[^"]*"/g) ?? [];
      expect(alerts.length, `${name} should still render its error alerts`).toBeGreaterThan(0);
      for (const alert of alerts) expect(alert, `${name} alert: ${alert}`).toContain("text-red-400");
    }
  });
});
