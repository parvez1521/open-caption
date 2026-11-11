/** Shared bits for the paper / sticker / overlay pack layouts (graphic*.tsx). */
import type React from "react";
import type { CaptionStyleV2, Page } from "@capseasy/shared";
import { ACTIVE_EFFECTS, shadowColorOf } from "@capseasy/shared";
import { famCss, scaleOf } from "../text";
import type { MeasureFn, PageRenderProps, TemplateCapabilities } from "../types";
import { withAlpha } from "./kit";

/** capabilities for a layout that draws itself: only what each template opts into is shown in the Style panel */
export const capsOwn = (over: Partial<TemplateCapabilities> = {}): TemplateCapabilities => ({
  hero: false, alignment: false, stagger: false, accentPeriod: false, weight: false, color: false, background: false, emoji: false,
  activeEffects: ["none"], entrances: ["none"], ...over,
});
export const ALL_ACTIVE = ACTIVE_EFFECTS;

export const px = (n: number) => `${n.toFixed(2)}px`;

/** glow as text-shadow layers (same recipe as text.ts shadowCss) */
export function glowLayers(style: CaptionStyleV2, sc: number): string[] {
  if (!style.glow.enabled) return [];
  const r = style.glow.radius * sc;
  return [`0 0 ${px(r)} ${withAlpha(style.glow.color, style.glow.intensity)}`, `0 0 ${px(r * 2)} ${withAlpha(style.glow.color, style.glow.intensity * 0.6)}`];
}
export const shadowLayers = (style: CaptionStyleV2, sc: number) => style.shadows.map((s) => `${px(s.x * sc)} ${px(s.y * sc)} ${px(s.blur * sc)} ${shadowColorOf(s)}`);

/** the style's shadows and glow as a CSS filter (for shapes, clipped tiles and gradient text, where text-shadow can't be used) */
export function dropFilter(style: CaptionStyleV2, sc: number, extra: string[] = []): string | undefined {
  const parts = [...extra, ...style.shadows.map((s) => `drop-shadow(${px(s.x * sc)} ${px(s.y * sc)} ${px(s.blur * sc)} ${shadowColorOf(s)})`)];
  if (style.glow.enabled) parts.push(`drop-shadow(0 0 ${px(style.glow.radius * sc * 0.6)} ${withAlpha(style.glow.color, style.glow.intensity)})`);
  return parts.length ? parts.join(" ") : undefined;
}

export const strokeOf = (style: CaptionStyleV2, sc: number): React.CSSProperties =>
  (style.stroke.enabled && style.stroke.width > 0 ? { WebkitTextStroke: `${px(style.stroke.width * sc)} ${style.stroke.color}`, paintOrder: "stroke fill" } : {}) as React.CSSProperties;

/** font spec for measuring text in the style's font (or an override) */
export const specOf = (style: CaptionStyleV2, sc: number, over: { fontId?: string; fontWeight?: number; fontStyle?: string } = {}) => ({
  fontFamily: famCss(over.fontId ?? style.fontId), fontWeight: over.fontWeight ?? style.fontWeight, fontStyle: over.fontStyle ?? style.fontStyle, letterSpacing: style.letterSpacing * sc,
});

/** width of a row of words at `size`, with `gapPx` between them */
export function rowWidth(texts: string[], size: number, spec: ReturnType<typeof specOf>, measure: MeasureFn, gapPx: number): number {
  return texts.reduce((a, t) => a + measure(t, { ...spec, fontSize: size }), 0) + Math.max(0, texts.length - 1) * gapPx;
}

/** scale factor (<= 1) that makes `width` fit `avail` */
export const fitScale = (width: number, avail: number) => (width > avail && width > 0 ? avail / width : 1);

/** time the card's i-th item starts entering, staggered from the card start */
export const staggerStart = (page: Page, i: number, stepMs: number) => page.startMs + i * stepMs;

export const scale = (p: PageRenderProps) => scaleOf(p.canvas);

/** relative luminance 0..1 of a #RRGGBB colour */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 1;
  const n = parseInt(m[1]!, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

/** string templateOption with a default */
export const optStr = (style: CaptionStyleV2, key: string, dflt: string) => (typeof style.templateOptions[key] === "string" ? (style.templateOptions[key] as string) : dflt);
export const optNum = (style: CaptionStyleV2, key: string, dflt: number) => (typeof style.templateOptions[key] === "number" ? (style.templateOptions[key] as number) : dflt);
