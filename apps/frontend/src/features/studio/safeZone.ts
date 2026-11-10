import { PLATFORM_PRESETS, type Platform } from "@capseasy/shared";

/**
 * Slice 5.5 (b): platform safe-zone geometry for the studio PREVIEW guide.
 *
 * The inset values are NOT invented here: they are the `unsafe` fractions already stored on
 * the shared PLATFORM_PRESETS (packages/shared settings.ts) — "fractions of the frame covered
 * by platform UI (top/bottom/side rails)" — the same numbers the caption placement rules were
 * derived from. This module only turns those fractions into a rectangle the preview chrome can
 * draw. It lives in the frontend's studio chrome on purpose: nothing here is part of the
 * CaptionedVideo composition, so a guide can never reach an export (the parity test in
 * __tests__/safeZone.test.tsx pins that the Player's input props are identical with the
 * guide on and off).
 */
export interface SafeZoneRect {
  /** safe rectangle as percentages of the frame (CSS-ready numbers, 0–100) */
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

export interface SafeZone {
  platform: Platform;
  /** the preset's human label, e.g. "Instagram Reels" */
  label: string;
  /** the preset's stored unsafe fractions (0–1 of the frame, per edge) */
  unsafe: { top: number; bottom: number; left: number; right: number };
  safe: SafeZoneRect;
}

const pct = (fraction: number): number => Math.round(fraction * 10000) / 100;

/** The safe-zone rectangle for a platform preset: the frame minus the preset's unsafe insets. */
export function safeZoneFor(platform: Platform): SafeZone {
  const preset = PLATFORM_PRESETS[platform];
  const { unsafe } = preset;
  return {
    platform,
    label: preset.label,
    unsafe,
    safe: {
      leftPct: pct(unsafe.left),
      topPct: pct(unsafe.top),
      widthPct: pct(1 - unsafe.left - unsafe.right),
      heightPct: pct(1 - unsafe.top - unsafe.bottom),
    },
  };
}

/** CSS style for the safe rectangle element, positioned inside the preview frame box. */
export function safeZoneStyle(zone: SafeZone): { left: string; top: string; width: string; height: string } {
  return {
    left: `${zone.safe.leftPct}%`,
    top: `${zone.safe.topPct}%`,
    width: `${zone.safe.widthPct}%`,
    height: `${zone.safe.heightPct}%`,
  };
}
