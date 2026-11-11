/**
 * Motion kit for the premium looks, part B (pack/premium-b-*.tsx): After Effects speed ramps, an analytic spring,
 * velocity-based motion blur, card timing (entrance / spoken / exit windows) and the glyph painter the five looks
 * share. Everything is a pure function of `timeMs` (export rules: see ./kit.ts).
 *
 * What the in-browser exporter (@remotion/web-renderer 4.0.484, read from its dist) really supports, and how these
 * looks stay inside it:
 *  - 3D transforms: yes, through a WebGL pass per element whose total matrix is not 2D. Only the element's own
 *    `transform` is read: the CSS `perspective` property on a parent and a z component in `transform-origin` are
 *    ignored, so perspective lives INSIDE each element's transform (`perspective()` + translateZ), and every parent
 *    stays 2D (no nested 3D, so the browser's flattening and the exporter's matrix product agree). The pass crops the
 *    element to its box (+ box-shadow), not its text-shadow, so 3D letters carry padding that holds their shadows.
 *  - clip-path inset()/polygon(): yes (percent or px lengths only; `em` is read as px).
 *  - filter blur()/brightness(): yes (canvas ctx.filter); drop-shadow() forces an extra precompose, avoided here.
 *  - linear-gradient + background-clip:text: yes, but stop positions are clamped to 0..100 %, so moving bands are
 *    sampled into in-range stops (`bandGradient`) instead of sliding stops past the box.
 *  - no mix-blend-mode: RGB splits and echoes are tinted copies composited "in back" of the main layer.
 */
import React from "react";
import type { CaptionStyleV2, Page, Word } from "@capseasy/shared";
import { shadowColorOf } from "@capseasy/shared";
import { combineMotion, effectiveIntensity, exitStyle, showAt } from "../motion";
import { containerCss, famCss, fillCss, layoutBox, scaleOf } from "../text";
import type { MeasureFn, PageRenderProps, TemplateCapabilities } from "../types";
import { bezier, withAlpha } from "./kit";

// ------------------------------------------------------------------------------------------- capabilities

/** the layout draws its own entrance, spoken-word motion and card exit */
export const OWN_ENTRANCE = { type: "none", durationMs: 0, stagger: "none", easing: "outExpo" } as const;
export const NO_EXIT = { type: "none", durationMs: 0 } as const;

/** only the controls these layouts honour (controls.test proves each one changes the render) */
export const premiumCaps = (over: Partial<TemplateCapabilities> = {}): TemplateCapabilities => ({
  hero: true, alignment: false, stagger: false, accentPeriod: false, weight: true, color: true, background: false, emoji: false,
  activeEffects: ["none"], entrances: ["none"], ...over,
});

// ------------------------------------------------------------------------------------------- curves

/** After Effects speed ramps as cubic-beziers (the "ishaan-motion" set) */
export const AE = {
  /** slow, whip, slow: the default move */
  ramp: bezier(0.86, 0, 0.07, 1),
  /** camera moves and big pulls */
  hard: bezier(0.95, 0, 0.05, 1),
  /** entries that land and glide */
  out: bezier(0.16, 1, 0.3, 1),
  /** tiny overshoot for pops */
  outBack: bezier(0.34, 1.32, 0.64, 1),
  /** accelerating away into a cut */
  in: bezier(0.7, 0, 0.84, 0),
  inOut: bezier(0.65, 0, 0.35, 1),
};

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Step response of a damped spring, 0 -> 1, `tMs` after it is released (0 before). `freqHz` is the natural
 * frequency, `zeta` the damping ratio (< 1 overshoots: 0.66 ~ 6 %, 0.45 ~ 20 %). Analytic, so it is the same at
 * any frame rate.
 */
export function spring(tMs: number, freqHz: number, zeta: number): number {
  if (tMs <= 0) return 0;
  const t = tMs / 1000;
  const w = 2 * Math.PI * freqHz;
  if (zeta >= 1) return 1 - Math.exp(-w * t) * (1 + w * t);
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
}

/** a smooth one-shot impulse: 0 at t <= 0, peaks at 1 when t = tauMs, decays to 0 (no stop, no snap) */
export const impulse = (tMs: number, tauMs: number) => (tMs <= 0 ? 0 : (tMs / tauMs) * Math.exp(1 - tMs / tauMs));

/** derivative of f at t, per ms */
export const vel = (f: (t: number) => number, t: number, h = 8) => (f(t + h) - f(t - h)) / (2 * h);

/** motion blur radius for a speed in px/ms: a 180° shutter at 30 fps (0.28 x px per frame), capped */
export const shutter = (pxPerMs: number, capPx: number) => Math.min(capPx, Math.abs(pxPerMs) * (1000 / 30) * 0.28);

/** big scale changes read naturally in log space: S0 -> 1 as t goes 0 -> 1, most of the travel early, long settle */
export const logZoom = (s0: number, t: number, power = 4) => Math.pow(s0, Math.pow(1 - clamp01(t), power));

// ------------------------------------------------------------------------------------------- card timing

export const cardDur = (page: Page) => Math.max(1, page.endMs - page.startMs);
/** the card's exit window: its last `ms`, never more than `share` of the card */
export const exitWindow = (page: Page, ms: number, share = 0.3) => Math.max(0, Math.min(ms, cardDur(page) * share));
/** when a word appears on its card (a little ahead of speech) */
export const appearAt = (w: Word) => showAt(w);

/** emotion and the Motion intensity slider scale every distance, angle and zoom */
export const intensityOf = (p: PageRenderProps) => clamp(effectiveIntensity(p.style, p.page.emotion), 0, 2.5);

// ------------------------------------------------------------------------------------------- paint

export const px = (n: number) => `${n.toFixed(2)}px`;

/** the style's shadows (scaled by `mul`) and glow as text-shadow layers */
export function styleShadows(style: CaptionStyleV2, sc: number, mul = 1): string[] {
  const out = style.shadows.map((s) => `${px(s.x * sc * mul)} ${px(s.y * sc * mul)} ${px(s.blur * sc * mul)} ${shadowColorOf(s)}`);
  if (style.glow.enabled) {
    const r = style.glow.radius * sc;
    out.push(`0 0 ${px(r)} ${withAlpha(style.glow.color, style.glow.intensity)}`, `0 0 ${px(r * 2)} ${withAlpha(style.glow.color, style.glow.intensity * 0.6)}`);
  }
  return out;
}
export const joinShadows = (layers: (string | false | null | undefined)[]) => {
  const l = layers.filter(Boolean) as string[];
  return l.length ? l.join(", ") : undefined;
};

/** the style's outline as CSS (scaled by `mul`) */
export const outlineCss = (style: CaptionStyleV2, sc: number, mul = 1): React.CSSProperties =>
  (style.stroke.enabled && style.stroke.width > 0 ? { WebkitTextStroke: `${px(style.stroke.width * sc * mul)} ${style.stroke.color}`, paintOrder: "stroke fill" } : {}) as React.CSSProperties;

/** a word's own colour (set in the editor) wins over the look's fill */
export const fillOf = (w: Word, fill: CaptionStyleV2["fill"]): CaptionStyleV2["fill"] => (w.color ? { type: "solid", color: w.color } : fill);
export const solid = (color: string): CaptionStyleV2["fill"] => ({ type: "solid", color });

const ABS: React.CSSProperties = { position: "absolute", left: 0, top: 0, whiteSpace: "pre", pointerEvents: "none" };

/**
 * One run of text in a fill. A gradient fill is clipped to the glyphs, so its shadow and outline are drawn by a solid
 * copy underneath (a text-shadow would show through transparent glyphs).
 */
export const Glyphs: React.FC<{ text: string; font: React.CSSProperties; fill: CaptionStyleV2["fill"]; shadow?: string; stroke?: React.CSSProperties; css?: React.CSSProperties; children?: React.ReactNode }> = ({ text, font, fill, shadow, stroke, css, children }) => {
  if (fill.type === "solid") {
    return (
      <span style={{ position: "relative", display: "inline-block", whiteSpace: "pre", ...font, color: fill.color, textShadow: shadow, ...stroke, ...css }}>
        {text}
        {children}
      </span>
    );
  }
  const under = fill.stops[fill.stops.length - 1]!.color;
  return (
    <span style={{ position: "relative", display: "inline-block", whiteSpace: "pre", ...font, ...css }}>
      {shadow || (stroke && Object.keys(stroke).length) ? <span aria-hidden style={{ ...ABS, color: under, textShadow: shadow, ...stroke }}>{text}</span> : null}
      <span style={{ position: "relative", whiteSpace: "pre", ...fillCss(fill) }}>{text}</span>
      {children}
    </span>
  );
};

/**
 * A soft light band across glyphs as a background-clip gradient. The exporter clamps stop positions to 0..100 %, so
 * the band (gaussian, centred at `center` %, `width` % wide, alpha `peak`) is sampled into in-range stops and can
 * travel in and out of the word without its stops sliding past the box.
 */
export function bandGradient(angleDeg: number, bands: { center: number; width: number; peak: number }[], rgb = "255,255,255", step = 2.5): string {
  const stops: string[] = [];
  for (let x = 0; x <= 100.0001; x += step) {
    let a = 0;
    for (const b of bands) a += b.peak * Math.exp(-(((x - b.center) / Math.max(0.5, b.width * 0.5)) ** 2));
    stops.push(`rgba(${rgb},${Math.min(1, a).toFixed(3)}) ${x.toFixed(1)}%`);
  }
  return `linear-gradient(${angleDeg}deg, ${stops.join(", ")})`;
}

// ------------------------------------------------------------------------------------------- layout

export interface FontSpec {
  fontFamily: string;
  fontWeight: number | string;
  fontStyle?: string;
  letterSpacing?: number;
}
export const specOf = (style: CaptionStyleV2, sc: number, over: { fontId?: string; fontWeight?: number; fontStyle?: string } = {}): FontSpec => ({
  fontFamily: famCss(over.fontId ?? style.fontId), fontWeight: over.fontWeight ?? style.fontWeight, fontStyle: over.fontStyle ?? style.fontStyle, letterSpacing: style.letterSpacing * sc,
});
export const fontCss = (spec: FontSpec, size: number, lineHeight: number): React.CSSProperties => ({
  fontFamily: spec.fontFamily, fontWeight: spec.fontWeight, fontStyle: spec.fontStyle, letterSpacing: spec.letterSpacing, fontSize: size, lineHeight, whiteSpace: "pre",
});

export interface PlacedWord {
  w: Word;
  /** index on the card */
  i: number;
  text: string;
  /** glyph width at the fitted size, px */
  width: number;
  /** centre relative to the card centre, px (before any camera move) */
  cx: number;
  cy: number;
}
export interface Placed {
  lines: PlacedWord[][];
  size: number;
  gap: number;
  lineH: number;
  /** fitted block width / height, px */
  width: number;
  height: number;
}

/**
 * Lines of separately boxed words at the base size, shrunk as a whole so the widest line fits `maxW`. Each word gets
 * its centre relative to the card centre (for perspective and zoom origins). `gapEm` is the space between words.
 */
export function placeLines(page: Page, texts: string[], spec: FontSpec, baseSize: number, gapEm: number, gapPx: number, lineHeight: number, maxW: number, measure: MeasureFn, extraEm = 0): Placed {
  const lines = (page.lines.length ? page.lines : [page.words]).map((l) => l.map((w) => page.words.indexOf(w)).filter((i) => i >= 0));
  const widthAt = (i: number, size: number) => measure(texts[i]!, { ...spec, fontSize: size }) + extraEm * size;
  const lineW = (l: number[], size: number) => l.reduce((a, i) => a + widthAt(i, size), 0) + Math.max(0, l.length - 1) * (gapEm * size + gapPx);
  const widest = Math.max(1, ...lines.map((l) => lineW(l, baseSize)));
  const size = widest > maxW ? baseSize * (maxW / widest) : baseSize;
  const gap = gapEm * size + gapPx * (size / baseSize);
  const lineH = size * lineHeight;
  const out: PlacedWord[][] = [];
  let width = 0;
  lines.forEach((l, li) => {
    const ws = l.map((i) => widthAt(i, size));
    const total = ws.reduce((a, b) => a + b, 0) + Math.max(0, l.length - 1) * gap;
    width = Math.max(width, total);
    let x = -total / 2;
    const cy = (li - (lines.length - 1) / 2) * lineH;
    out.push(
      l.map((i, j) => {
        const cx = x + ws[j]! / 2;
        x += ws[j]! + gap;
        return { w: page.words[i]!, i, text: texts[i]!, width: ws[j]!, cx, cy };
      }),
    );
  });
  return { lines: out, size, gap, lineH, width, height: lines.length * lineH };
}

/** centres of each character of `text`, from the word's left edge, px (prefix measurement) */
export function letterCenters(text: string, spec: FontSpec, size: number, measure: MeasureFn): { chars: string[]; centers: number[] } {
  const chars = Array.from(text);
  const at = { ...spec, fontSize: size };
  const edges = [0];
  for (let i = 1; i <= chars.length; i++) edges.push(measure(chars.slice(0, i).join(""), at));
  return { chars, centers: chars.map((_, i) => (edges[i]! + edges[i + 1]!) / 2) };
}

/**
 * The outer frame: centred on the caption position with `translate(-50%, -50%)` first (so the generic exit never
 * shifts it), the style's rotation, and the Style panel's generic exit on top of the look's own.
 */
export const Frame: React.FC<{ p: PageRenderProps; size: number; css?: React.CSSProperties; children: React.ReactNode }> = ({ p, size, css, children }) => {
  const box = layoutBox(p.style, p.canvas, p.page.position);
  return <div style={combineMotion(containerCss(box, p.style.rotation), exitStyle(p.style, p.page.endMs - p.timeMs, p.settled, size), css ?? {})}>{children}</div>;
};

/** everything a layout needs from its props */
export function ctxOf(p: PageRenderProps) {
  const sc = scaleOf(p.canvas);
  const box = layoutBox(p.style, p.canvas, p.page.position);
  return { sc, box, k: intensityOf(p), base: p.style.fontSize * sc };
}

/** opacity/transform/filter from animated values (identity values are left out) */
export function tf(v: { x?: number; y?: number; s?: number; sx?: number; r?: number; skew?: number }): string | undefined {
  const out: string[] = [];
  if (v.x && Math.abs(v.x) > 0.005) out.push(`translateX(${v.x.toFixed(2)}px)`);
  if (v.y && Math.abs(v.y) > 0.005) out.push(`translateY(${v.y.toFixed(2)}px)`);
  if (v.r && Math.abs(v.r) > 0.002) out.push(`rotate(${v.r.toFixed(3)}deg)`);
  if (v.skew && Math.abs(v.skew) > 0.002) out.push(`skewX(${v.skew.toFixed(3)}deg)`);
  if (v.s !== undefined && Math.abs(v.s - 1) > 0.0002) out.push(`scale(${v.s.toFixed(4)})`);
  if (v.sx !== undefined && Math.abs(v.sx - 1) > 0.0002) out.push(`scaleX(${v.sx.toFixed(4)})`);
  return out.length ? out.join(" ") : undefined;
}
export const blurCss = (b: number) => (b > 0.12 ? `blur(${b.toFixed(2)}px)` : undefined);
