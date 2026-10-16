/**
 * Shared plumbing for the single-line pack layouts (./lines.tsx): measuring a card's words (each in its own font and
 * size), fitting them to the caption box, the centred frame with the card entrance/exit, and colour maths.
 * Pure functions of their inputs (no CSS animations): see the export rules in ./kit.ts.
 */
import React from "react";
import type { CaptionStyleV2, Page, Word } from "@capseasy/shared";
import type { ACTIVE_EFFECTS } from "@capseasy/shared";
import { combineMotion, effectiveIntensity, entranceStyle, exitStyle } from "../motion";
import { backgroundCss, containerCss, displayText, famCss, fillCss, firstColor, layoutBox, scaleOf, wordGapPx } from "../text";
import type { MeasureSpec, PageRenderProps, TemplateCapabilities } from "../types";

// ---------------------------------------------------------------- capabilities

export const CORE_ENTRANCES = ["none", "fade", "rise", "drop", "pop", "zoom", "slide-left", "slide-right", "blur-in", "flip", "elastic", "mask-reveal", "glitch"] as const;

export const lineCaps = (over: Partial<TemplateCapabilities>): TemplateCapabilities => ({
  hero: false, alignment: true, stagger: false, accentPeriod: false, weight: true, color: true, background: true, emoji: false,
  activeEffects: ["none"] as (typeof ACTIVE_EFFECTS)[number][], entrances: CORE_ENTRANCES, ...over,
});

// ---------------------------------------------------------------- colour

/** [r, g, b, a] of a #rgb / #rrggbb / #rrggbbaa / rgb() / rgba() colour (null for anything else) */
export function parseColor(c: string): [number, number, number, number] | null {
  const s = c.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3 || h.length === 4) h = h.split("").map((x) => x + x).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (fn) {
    const p = fn[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.some((v) => Number.isNaN(v))) return null;
    return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
  }
  if (s === "transparent") return [0, 0, 0, 0];
  return null;
}

const rgbaStr = (r: number, g: number, b: number, a: number) =>
  `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

/** the colour with its alpha multiplied by `mul` */
export function alphaMul(c: string, mul: number): string {
  const p = parseColor(c);
  if (!p) return mul >= 0.5 ? c : "transparent";
  return rgbaStr(p[0], p[1], p[2], p[3] * mul);
}

/** linear mix a -> b (t = 0..1), alpha included */
export function mix(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const pa = parseColor(a);
  const pb = parseColor(b);
  if (!pa || !pb) return t < 0.5 ? a : b;
  return rgbaStr(pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t, pa[3] + (pb[3] - pa[3]) * t);
}

export const sameColor = (a: string | undefined, b: string | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** solid text colour css (also clears a gradient fill) */
export const solid = (c: string): React.CSSProperties => ({ color: c, WebkitTextFillColor: c, backgroundImage: "none" }) as React.CSSProperties;

/** a word's resting fill: the user's per-word colour, else the style fill */
export const restFill = (w: Word, style: CaptionStyleV2): React.CSSProperties => (w.color ? solid(w.color) : fillCss(style.fill));
export const restColor = (w: Word, style: CaptionStyleV2) => w.color ?? firstColor(style.fill);

// ---------------------------------------------------------------- shadows

/** the style's drop shadows as text-shadow layers (alpha multiplied by `mul`) */
export const shadowLayers = (style: CaptionStyleV2, sc: number, mul = 1) =>
  style.shadows.map((s) => `${(s.x * sc).toFixed(2)}px ${(s.y * sc).toFixed(2)}px ${(s.blur * sc).toFixed(2)}px ${mul === 1 ? s.color : alphaMul(s.color, mul)}`);

/** the same shadows as filter drop-shadows (for gradient-clipped text, where a text-shadow would paint over the fill) */
export const shadowFilters = (style: CaptionStyleV2, sc: number) =>
  style.shadows.map((s) => `drop-shadow(${(s.x * sc).toFixed(2)}px ${(s.y * sc).toFixed(2)}px ${(s.blur * sc * 0.5).toFixed(2)}px ${s.color})`);

/** the standard two-layer glow (same as the core layouts) */
export function stdGlow(style: CaptionStyleV2, sc: number): string[] {
  if (!style.glow.enabled) return [];
  const r = style.glow.radius * sc;
  return [`0 0 ${r.toFixed(2)}px ${alphaMul(style.glow.color, style.glow.intensity)}`, `0 0 ${(r * 2).toFixed(2)}px ${alphaMul(style.glow.color, style.glow.intensity * 0.6)}`];
}

export const joinShadows = (layers: string[]) => (layers.length ? layers.join(", ") : "none");

// ---------------------------------------------------------------- typography

export interface FontSpec {
  fontId: string;
  fontWeight: number;
  fontStyle?: "normal" | "italic";
}

/** font css for one word (size in px) */
export function typeCss(style: CaptionStyleV2, sc: number, size: number, font?: Partial<FontSpec>): React.CSSProperties {
  return {
    fontFamily: famCss(font?.fontId ?? style.fontId),
    fontWeight: font?.fontWeight ?? style.fontWeight,
    fontStyle: font?.fontStyle ?? style.fontStyle,
    fontSize: size,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing * sc,
    wordSpacing: style.wordSpacing * sc,
    display: "inline-block",
    whiteSpace: "pre",
    position: "relative",
  };
}

/** One word of a card, with what the layout needs to measure and draw it. */
export interface Cell {
  w: Word;
  /** index in page.words */
  i: number;
  text: string;
  /** size multiplier over the card's base size */
  mult: number;
  font?: Partial<FontSpec>;
  /** extra horizontal px (at the reference size, i.e. before fitting) the word's box adds (padding) */
  padEm?: number;
}

/** page.words index of each line word */
export function cellsOf(page: Page, style: CaptionStyleV2, lines: Word[][] = page.lines, per?: (w: Word, i: number) => Partial<Cell>): Cell[][] {
  const index = new Map(page.words.map((w, i) => [w.id, i]));
  return lines.map((l) => l.map((w) => {
    const i = index.get(w.id) ?? 0;
    const extra = per?.(w, i) ?? {};
    return { w, i, text: displayText(w, style), mult: 1, ...extra };
  }));
}

const specOf = (style: CaptionStyleV2, sc: number, size: number, font?: Partial<FontSpec>): MeasureSpec => ({
  fontFamily: famCss(font?.fontId ?? style.fontId),
  fontWeight: font?.fontWeight ?? style.fontWeight,
  fontStyle: font?.fontStyle ?? style.fontStyle,
  letterSpacing: style.letterSpacing * sc,
  fontSize: size,
});

/** gap between two words in px at a given base size */
export const gapPx = (style: CaptionStyleV2, sc: number, size: number, gapEm = 0.3) => gapEm * size + wordGapPx(style, sc);

export interface Fit {
  sc: number;
  box: { width: number; cx: number; cy: number };
  /** the card's base text size in px, after fitting */
  size: number;
  /** each cell's rendered width in px at the fitted size (glyphs only) */
  widths: number[][];
  /** each line's width in px at the fitted size (glyphs + gaps + padding) */
  lineWidths: number[];
  intensity: number;
}

/** Measure every word (each in its own font/size) and shrink the card so the widest line fits the caption box. */
export function fitCells(p: PageRenderProps, cells: Cell[][], opts: { gapEm?: number; sizeScale?: number; reservePx?: number } = {}): Fit {
  const { style, canvas, measure, page } = p;
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const base = style.fontSize * sc * (opts.sizeScale ?? 1);
  const lineAt = (size: number) => cells.map((line) => {
    const ws = line.map((c) => measure(c.text, specOf(style, sc, size * c.mult, c.font)));
    const pads = line.reduce((a, c) => a + (c.padEm ?? 0) * 2 * size * c.mult, 0);
    const total = ws.reduce((a, b) => a + b, 0) + pads + Math.max(0, line.length - 1) * gapPx(style, sc, size, opts.gapEm);
    return { ws, total };
  });
  const first = lineAt(base);
  const widest = Math.max(1, ...first.map((l) => l.total));
  const avail = Math.max(10, box.width - (opts.reservePx ?? 0));
  const size = widest > avail ? base * (avail / widest) : base;
  const final = size === base ? first : lineAt(size);
  return { sc, box, size, widths: final.map((l) => l.ws), lineWidths: final.map((l) => l.total), intensity: effectiveIntensity(style, page.emotion) };
}

export const justifyOf = (a: CaptionStyleV2["align"]) => (a === "left" ? "flex-start" : a === "right" ? "flex-end" : "center");

/**
 * The centred caption block: the container keeps translate(-50%, -50%) (+ rotation); the inner column carries the
 * background, the card entrance (from `enterFromMs`, default the card start) and the exit.
 */
export const Frame: React.FC<{
  p: PageRenderProps;
  fit: Fit;
  background?: boolean;
  enterFromMs?: number;
  rowGapPx?: number;
  inner?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ p, fit, background = true, enterFromMs, rowGapPx, inner, children }) => {
  const { page, timeMs, style, canvas, settled } = p;
  const local = timeMs - (enterFromMs ?? page.startMs);
  return (
    <div style={containerCss(fit.box, style.rotation)}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: justifyOf(style.align),
          rowGap: rowGapPx ?? (style.lineHeight - 1) * fit.size * 0.5,
          ...(background ? backgroundCss(style, fit.sc) : {}),
          ...inner,
          ...combineMotion(entranceStyle(style, local, canvas.fps, fit.intensity, settled, fit.size), exitStyle(style, page.endMs - timeMs, settled, fit.size)),
        }}
      >
        {children}
      </div>
    </div>
  );
};

/** one row of words */
export const Row: React.FC<{ style: CaptionStyleV2; children: React.ReactNode; align?: "baseline" | "center" }> = ({ style, children, align = "baseline" }) => (
  <div style={{ display: "flex", flexWrap: "nowrap", justifyContent: justifyOf(style.align), alignItems: align, whiteSpace: "pre", position: "relative" }}>{children}</div>
);

/**
 * How "on" a state is that switches on at `onMs` and off at `offMs`, with a CSS-transition-like fade of `durMs`
 * each way (0..1). Paused/scrubbing (`settled`) snaps to the state at that time.
 */
export function stateAmount(timeMs: number, onMs: number, offMs: number, durMs: number, ease: (t: number) => number, settled?: boolean): number {
  if (settled || durMs <= 0) return timeMs >= onMs && timeMs < offMs ? 1 : 0;
  if (timeMs < onMs) return 0;
  const inT = ease(Math.min(1, (timeMs - onMs) / durMs));
  if (timeMs < offMs) return inT;
  // switching off: fade from wherever it got to
  const outT = ease(Math.min(1, (timeMs - offMs) / durMs));
  const reached = ease(Math.min(1, (offMs - onMs) / durMs));
  return reached * (1 - outT);
}

/** the word being spoken (the last one whose start has passed; the first before any) */
export function currentWordIndex(page: Page, timeMs: number): number {
  let cur = 0;
  page.words.forEach((w, i) => {
    if (timeMs >= w.startMs) cur = i;
  });
  return cur;
}
