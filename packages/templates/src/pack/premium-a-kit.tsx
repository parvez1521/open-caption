/**
 * Shared toolkit for the premium motion looks, part A (./premium-a*.tsx): After Effects speed curves, an analytic
 * damped spring (with velocity, for motion blur and stretch), velocity-based blur, a decaying camera shake,
 * kerning-preserving letter splitting, and the centred frame. Everything is a pure function of its inputs (export
 * rules: ./kit.ts), so the Player, the server render and the in-browser export draw the same frame.
 */
import React from "react";
import type { CaptionStyleV2, Page, Word } from "@capseasy/shared";
import { shadowColorOf } from "@capseasy/shared";
import { combineMotion, effectiveIntensity, exitStyle } from "../motion";
import { backgroundCss, containerCss, famCss, fillCss, layoutBox, scaleOf } from "../text";
import type { MeasureFn, PageRenderProps, TemplateCapabilities } from "../types";
import { bezier, rand, withAlpha } from "./kit";

/** one frame of the 30 fps timelines the motion is designed on */
export const FRAME = 1000 / 30;

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** linear 0..1 of a window that starts at `startMs` and lasts `durMs` */
export const prog = (timeMs: number, startMs: number, durMs: number) => (durMs <= 0 ? (timeMs >= startMs ? 1 : 0) : clamp01((timeMs - startMs) / durMs));
export const px = (n: number) => `${n.toFixed(2)}px`;

/**
 * After Effects speed curves (cubic-bezier influence handles):
 *  ramp: slow, whip, slow (the default move) · hard: camera moves · out: entries that land and glide ·
 *  outBack: a tiny overshoot for pops · in: accelerating away into a cut · glide: an exponential-ease tail (AE
 *  "easy ease" at 90 % influence), the long soft settle of a tracking animator.
 */
export const AE = {
  ramp: bezier(0.86, 0, 0.07, 1),
  hard: bezier(0.95, 0, 0.05, 1),
  out: bezier(0.16, 1, 0.3, 1),
  outBack: bezier(0.34, 1.32, 0.64, 1),
  in: bezier(0.7, 0, 0.84, 0),
  inOut: bezier(0.65, 0, 0.35, 1),
  glide: bezier(0.06, 0.72, 0.08, 1),
  sine: bezier(0.37, 0, 0.63, 1),
};

/** capabilities of a premium layout: it animates itself (no generic card entrance); only what it honours is listed */
export const premiumCaps = (over: Partial<TemplateCapabilities> = {}): TemplateCapabilities => ({
  hero: false, alignment: false, stagger: false, accentPeriod: false, weight: true, color: true, background: true, emoji: false,
  activeEffects: ["none"], entrances: ["none"], ...over,
});
export const OWN_ENTRANCE = { type: "none", durationMs: 0, stagger: "none", easing: "outExpo" } as const;
export const NO_EXIT = { type: "none", durationMs: 0 } as const;

// ------------------------------------------------------------------------------------------------ physics

export interface SpringCfg {
  stiffness: number;
  damping: number;
  mass?: number;
}
/**
 * Closed-form damped spring from 0 to 1 at `tSec` (any real time, not stepped by frames): position and velocity
 * (per second). Same physics as Remotion's spring(), without its frame stepping, so velocity is exact.
 */
export function springAt(tSec: number, cfg: SpringCfg): { x: number; v: number } {
  if (tSec <= 0) return { x: 0, v: 0 };
  const m = cfg.mass ?? 1;
  const w0 = Math.sqrt(cfg.stiffness / m);
  const z = cfg.damping / (2 * Math.sqrt(cfg.stiffness * m));
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    const e = Math.exp(-z * w0 * tSec);
    const c = Math.cos(wd * tSec);
    const s = Math.sin(wd * tSec);
    const x = 1 - e * (c + ((z * w0) / wd) * s);
    const v = e * ((z * w0 * z * w0) / wd + wd) * s;
    return { x, v };
  }
  // critically damped (or over): the critically damped form is close enough for captions
  const e = Math.exp(-w0 * tSec);
  return { x: 1 - e * (1 + w0 * tSec), v: e * w0 * w0 * tSec };
}

/** motion blur from speed (180° shutter): 0.28 × px moved per frame, capped */
export const shutterBlur = (pxPerFrame: number, cap: number) => Math.min(cap, Math.abs(pxPerFrame) * 0.28);

/** speed of `f` (any 1-D function of ms) in units per frame at `t`, from a centred difference */
export const perFrame = (f: (ms: number) => number, t: number) => f(t + FRAME / 2) - f(t - FRAME / 2);

/**
 * A camera hit: a few frames of decaying jitter (stepped per frame like a hand-keyed AE wiggle on 1s), from `startMs`.
 * Returns px offsets and a rotation in degrees; zero after ~4 decay times.
 */
export function shake(timeMs: number, startMs: number, ampPx: number, rotDeg: number, decayMs: number, seed: number): { x: number; y: number; r: number } {
  const t = timeMs - startMs;
  if (t < 0 || t > decayMs * 5) return { x: 0, y: 0, r: 0 };
  const f = Math.floor(t / FRAME);
  const env = Math.exp(-(f * FRAME) / decayMs);
  const a = rand(seed, f * 3) * Math.PI * 2;
  return { x: Math.cos(a) * ampPx * env, y: Math.sin(a) * ampPx * env, r: (rand(seed, f * 3 + 1) * 2 - 1) * rotDeg * env };
}

// ------------------------------------------------------------------------------------------------ type

/** a face at a concrete px size */
export interface Face {
  fontId: string;
  weight: number | string;
  italic?: boolean;
  size: number;
  /** tracking in px */
  ls: number;
}
export const faceSpec = (f: Face) => ({ fontFamily: famCss(f.fontId), fontWeight: f.weight, fontStyle: f.italic ? "italic" : "normal", fontSize: f.size, letterSpacing: f.ls });
export const faceCss = (f: Face, lineHeight: number): React.CSSProperties => ({
  fontFamily: famCss(f.fontId), fontWeight: f.weight, fontStyle: f.italic ? "italic" : "normal", fontSize: f.size, letterSpacing: f.ls, lineHeight, whiteSpace: "pre",
});

const SEG = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
/** user-perceived characters (a flag or an accented letter stays one piece) */
export const graphemes = (s: string): string[] => (SEG ? Array.from(SEG.segment(s), (g) => g.segment) : Array.from(s));

export interface Glyph {
  ch: string;
  /** left edge from the start of the word, px (kerning and tracking included) */
  x: number;
  /** advance to the next glyph, px (kerning and tracking included) */
  adv: number;
  /** the glyph's own advance (with tracking) when set alone: the kerning lost by splitting is adv - solo */
  solo: number;
}

/**
 * A word split into letters without losing its kerning: each letter's position is the width of the text before it,
 * so pairs like "AV" or "To" keep the spacing the font designed.
 */
export function glyphsOf(text: string, face: Face, measure: MeasureFn): { glyphs: Glyph[]; width: number } {
  const spec = faceSpec(face);
  const chars = graphemes(text);
  const xs: number[] = [0];
  let acc = "";
  for (const ch of chars) {
    acc += ch;
    xs.push(measure(acc, spec));
  }
  const glyphs = chars.map((ch, i) => ({ ch, x: xs[i]!, adv: xs[i + 1]! - xs[i]!, solo: measure(ch, spec) }));
  return { glyphs, width: xs[xs.length - 1] ?? 0 };
}

// ------------------------------------------------------------------------------------------------ paint

/**
 * The style's drop shadows (scaled with the fitted size by `ratio`) and glow as CSS drop-shadow filters, cast by a
 * whole group. The premium looks never use text-shadow on animated letters: the in-browser exporter draws a glyph
 * once per text-shadow layer, so a fading or blurred letter would come out brighter and heavier than in the Player.
 * A drop-shadow group is precomposited once by the exporter and looks the same everywhere.
 */
export function decorFilters(style: CaptionStyleV2, sc: number, ratio = 1): string[] {
  const out = style.shadows.map((s) => `drop-shadow(${px(s.x * sc * ratio)} ${px(s.y * sc * ratio)} ${px(s.blur * sc * ratio)} ${shadowColorOf(s)})`);
  if (style.glow.enabled) out.push(`drop-shadow(0 0 ${px(style.glow.radius * sc * 0.6)} ${withAlpha(style.glow.color, style.glow.intensity)})`);
  return out;
}

export const strokeCss = (style: CaptionStyleV2, sc: number, ratio = 1): React.CSSProperties =>
  (style.stroke.enabled && style.stroke.width > 0 ? { WebkitTextStroke: `${px(style.stroke.width * sc * ratio)} ${style.stroke.color}`, paintOrder: "stroke fill" } : {}) as React.CSSProperties;

/** a word's fill: the creator's per-word colour wins over the style fill */
export const wordFillCss = (w: Word, fill: CaptionStyleV2["fill"]): React.CSSProperties => (w.color ? { color: w.color, WebkitTextFillColor: w.color, backgroundImage: "none" } as React.CSSProperties : fillCss(fill));

/** blend two #RRGGBB colours (anything else: pick by t) */
export function mixHex(a: string, b: string, t: number): string {
  const pa = /^#?([0-9a-f]{6})$/i.exec(a.trim());
  const pb = /^#?([0-9a-f]{6})$/i.exec(b.trim());
  if (!pa || !pb) return t < 0.5 ? a : b;
  const na = parseInt(pa[1]!, 16);
  const nb = parseInt(pb[1]!, 16);
  const ch = (n: number, s: number) => (n >> s) & 255;
  const out = [16, 8, 0].map((s) => Math.round(lerp(ch(na, s), ch(nb, s), clamp01(t))));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** a gradient fill as a CSS image (null for solid fills) */
export const gradientImage = (fill: CaptionStyleV2["fill"]) =>
  fill.type === "solid" ? null : `linear-gradient(${fill.angle}deg, ${fill.stops.map((s) => `${s.color} ${Math.round(s.at * 100)}%`).join(", ")})`;

/**
 * One run of text (a letter or a word) in a solid colour or a gradient. A gradient is clipped to the glyphs and sized
 * to the whole line (`slice`: the line's width/height and where this run starts in it), so a line split into letters
 * still shows ONE continuous gradient. Its shadows/outline go on a solid copy underneath, because a text-shadow on
 * gradient-clipped text paints over the gradient.
 */
export const Ink: React.FC<{
  text: string;
  css: React.CSSProperties;
  color: string;
  gradient?: string | null;
  slice?: { w: number; h: number; x: number };
  shadow?: string;
  stroke?: React.CSSProperties;
}> = ({ text, css, color, gradient, slice, shadow, stroke }) => {
  if (!gradient) {
    return <span style={{ ...css, color, WebkitTextFillColor: color, backgroundImage: "none", textShadow: shadow, ...stroke } as React.CSSProperties}>{text}</span>;
  }
  return (
    <span style={{ position: "relative", ...css }}>
      {shadow || (stroke && Object.keys(stroke).length) ? (
        <span aria-hidden style={{ position: "absolute", left: 0, top: 0, whiteSpace: "pre", color, WebkitTextFillColor: color, textShadow: shadow, ...stroke } as React.CSSProperties}>{text}</span>
      ) : null}
      <span
        style={{
          position: "relative", whiteSpace: "pre", backgroundImage: gradient, backgroundRepeat: "no-repeat",
          ...(slice ? { backgroundSize: `${px(slice.w)} ${px(slice.h)}`, backgroundPosition: `${px(-slice.x)} 0px` } : {}),
          WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent",
        } as React.CSSProperties}
      >
        {text}
      </span>
    </span>
  );
};

// ------------------------------------------------------------------------------------------------ frame

/** everything a layout needs from its props */
export function ctxOf(p: PageRenderProps) {
  const { page, style, canvas } = p;
  const sc = scaleOf(canvas);
  return {
    sc,
    box: layoutBox(style, canvas, page.position),
    /** motion intensity × emotion, clamped */
    k: Math.min(2.5, Math.max(0, effectiveIntensity(style, page.emotion))),
    base: style.fontSize * sc,
  };
}

/** the card's position in the video; unknown (a lone preview card) counts as the first */
export const ordOf = (page: Page) => page.index ?? 0;

/**
 * The centred caption block: the container keeps translate(-50%, -50%) (+ the style's rotation) first; the inner
 * column carries the look's own card motion, chained with the exit the creator picks.
 */
export const Shell: React.FC<{ p: PageRenderProps; box: { width: number; cx: number; cy: number }; size: number; motion?: React.CSSProperties; inner?: React.CSSProperties; children: React.ReactNode }> = ({ p, box, size, motion, inner, children }) => {
  const { page, timeMs, style, settled } = p;
  const justify = style.align === "left" ? "flex-start" : style.align === "right" ? "flex-end" : "center";
  return (
    <div style={containerCss(box, style.rotation)}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: justify, position: "relative", ...backgroundCss(style, scaleOf(p.canvas)), ...inner, ...combineMotion(motion ?? {}, exitStyle(style, page.endMs - timeMs, settled, size)) }}>
        {children}
      </div>
    </div>
  );
};

/** the word being spoken (the last one whose start has passed; -1 before the first) */
export function spokenIndex(page: Page, timeMs: number): number {
  let cur = -1;
  page.words.forEach((w, i) => {
    if (timeMs >= w.startMs) cur = i;
  });
  return cur;
}

/**
 * Re-break a card's lines so its type can stay big. The card's lines are broken upstream by measuring the raw
 * (uncased) words, which under-measures caps and display faces, so a 2–3 word card can arrive as one line that would
 * have to shrink to fit. A line that overflows `boxW` at the base size is split in two (balanced by width) when that
 * keeps the type larger, up to `maxLines`. Word order never changes. `widthAt(line)` = the line's width at base size.
 */
export function breakToFit(lines: Word[][], widthAt: (line: Word[]) => number, boxW: number, maxLines = 2): Word[][] {
  const fit = (ls: Word[][]) => Math.min(1, ...ls.map((l) => boxW / Math.max(1, widthAt(l))));
  let out = lines;
  while (out.length < maxLines) {
    let worst = -1;
    let ww = boxW;
    out.forEach((l, i) => {
      const w = widthAt(l);
      if (l.length >= 2 && w > ww) {
        worst = i;
        ww = w;
      }
    });
    if (worst < 0) break;
    const l = out[worst]!;
    let cut = 1;
    let cutW = Infinity;
    for (let c = 1; c < l.length; c++) {
      const m = Math.max(widthAt(l.slice(0, c)), widthAt(l.slice(c)));
      if (m < cutW) {
        cutW = m;
        cut = c;
      }
    }
    const next = [...out.slice(0, worst), l.slice(0, cut), l.slice(cut), ...out.slice(worst + 1)];
    if (fit(next) <= fit(out)) break;
    out = next;
  }
  return out;
}

/** card lines (falls back to one line of every word) */
export const linesOf = (page: Page): Word[][] => {
  const ls = page.lines.filter((l) => l.length > 0);
  return ls.length ? ls : [page.words];
};
