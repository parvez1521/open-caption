/**
 * Shared toolkit for the pack layouts (src/pack/*.tsx). Everything here is a pure function of its inputs, so a
 * layout built on it renders identically in the studio Player, the in-browser export and the server renderer.
 *
 * Rendering rules every pack layout follows (the in-browser exporter, @remotion/web-renderer, redraws the DOM on a
 * canvas and supports only part of CSS):
 *  - OK: linear-gradient backgrounds, background-clip:text, text-shadow, -webkit-text-stroke, filter (blur,
 *    drop-shadow), box-shadow, border-radius, clip-path, mask-image, opacity, 2D and 3D transforms, inline SVG.
 *  - Avoid: radial-gradient / conic-gradient (build them from linear gradients or soft shadows), mix-blend-mode,
 *    backdrop-filter, CSS animations/transitions (every value must come from `timeMs`), web fonts inside SVG <text>.
 */
import type React from "react";
import { Easing } from "remotion";
import type { CaptionStyleV2, Page, Word } from "@capseasy/shared";
import { withAlpha } from "@motion-ai/caption-engine/core";
import { displayText } from "../text";

export { withAlpha };

/** 32-bit FNV-1a: stable across runs and machines */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** deterministic 0..1 random number for (seed, i) */
export function rand(seed: number, i = 0): number {
  let x = (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** seed for one card: the same card always lays out (and "randomises") the same way */
export const pageSeed = (page: Page) => hash(`${page.id}|${page.words.map((w) => w.id).join(",")}`);

/** pick an index 0..n-1 for this card (rotating layouts, composition cycling) */
export const pick = (seed: number, n: number, salt = 0) => Math.min(n - 1, Math.floor(rand(seed, salt) * n));

/** CSS cubic-bezier as an easing function */
export const bezier = (x1: number, y1: number, x2: number, y2: number) => Easing.bezier(x1, y1, x2, y2);
export const EASE = {
  linear: (t: number) => t,
  ease: bezier(0.25, 0.1, 0.25, 1),
  easeIn: bezier(0.42, 0, 1, 1),
  easeOut: bezier(0, 0, 0.58, 1),
  easeInOut: bezier(0.42, 0, 0.58, 1),
  /** cubic-bezier(.175,.885,.32,1.275): overshooting "back out" */
  backOut: bezier(0.175, 0.885, 0.32, 1.275),
  /** cubic-bezier(.16,1,.3,1) */
  outExpo: bezier(0.16, 1, 0.3, 1),
  /** cubic-bezier(.22,1,.36,1) */
  outQuint: bezier(0.22, 1, 0.36, 1),
  /** cubic-bezier(.2,.8,.2,1) */
  outSoft: bezier(0.2, 0.8, 0.2, 1),
  /** cubic-bezier(.34,1.56,.64,1) */
  outBack: bezier(0.34, 1.56, 0.64, 1),
};

/** 0..1 progress of a tween that starts `delayMs` after `startMs` and lasts `durMs` (settled → 1) */
export function tween(timeMs: number, startMs: number, durMs: number, ease: (t: number) => number = EASE.outExpo, delayMs = 0, settled?: boolean): number {
  if (settled) return 1;
  if (durMs <= 0) return timeMs >= startMs + delayMs ? 1 : 0;
  const t = Math.min(1, Math.max(0, (timeMs - startMs - delayMs) / durMs));
  return ease(t);
}

/** raw linear 0..1 of a time window (for multi-stop keyframes, which ease per segment) */
export const linear01 = (timeMs: number, startMs: number, durMs: number, settled?: boolean) =>
  settled ? 1 : durMs <= 0 ? 1 : Math.min(1, Math.max(0, (timeMs - startMs) / durMs));

/**
 * CSS-style keyframes: `stops` are [offset 0..1, value] pairs; `ease` applies per segment like CSS
 * animation-timing-function. Values interpolate linearly between stops.
 */
export function keyframes(t: number, stops: [number, number][], ease: (t: number) => number = EASE.linear): number {
  if (t <= stops[0]![0]) return stops[0]![1];
  for (let i = 1; i < stops.length; i++) {
    const [a, va] = stops[i - 1]!;
    const [b, vb] = stops[i]!;
    if (t <= b) return va + (vb - va) * ease(b === a ? 1 : (t - a) / (b - a));
  }
  return stops[stops.length - 1]![1];
}

export const isSpoken = (w: Word, timeMs: number) => timeMs >= w.startMs;
export const isActive = (w: Word, timeMs: number) => timeMs >= w.startMs && timeMs < w.endMs;

/** The card's key word: the user's hero (emphasis) wins, then the engine's heroIndex, then the longest word with ≥ minLetters. */
export function keyWordIndex(page: Page, minLetters = 4): number {
  const hero = page.words.findIndex((w) => w.emphasis === "hero");
  if (hero >= 0) return hero;
  if (page.heroIndex >= 0 && page.heroIndex < page.words.length) return page.heroIndex;
  let best = 0;
  let len = -1;
  page.words.forEach((w, i) => {
    const n = w.text.replace(/[^\p{L}\p{N}]/gu, "").length;
    if (n >= minLetters && n > len) { best = i; len = n; }
  });
  return best;
}

/** display text of every word on the card, in order (casing + punctuation rules applied) */
export const wordTexts = (page: Page, style: CaptionStyleV2, casing: CaptionStyleV2["casing"] = style.casing) => page.words.map((w) => displayText(w, style, casing));

/**
 * An outline made of `n` offset copies in a ring (the "sticker"/"bubble" look): thicker and rounder than
 * -webkit-text-stroke, and it survives the exporter. Returns text-shadow layers.
 */
export function ringShadow(radiusPx: number, color: string, n = 16, dx = 0, dy = 0): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(`${(Math.cos(a) * radiusPx + dx).toFixed(2)}px ${(Math.sin(a) * radiusPx + dy).toFixed(2)}px 0 ${color}`);
  }
  return out;
}

/** gradient text fill (linear only: the exporter can't draw radial gradients) */
export function gradientText(gradient: string): React.CSSProperties {
  return { backgroundImage: gradient, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent" } as React.CSSProperties;
}

/** lighten (amt > 0) or darken (amt < 0) a #RRGGBB colour toward white/black by amt 0..1 */
export function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)));
  return `#${ch.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;
}

/** first colour of a fill (solid colour, or the gradient's first stop) */
export const fillColor = (fill: CaptionStyleV2["fill"]) => (fill.type === "solid" ? fill.color : fill.stops[0]!.color);

/** the card's position in the video (cycling compositions), falling back to its seed when unknown */
export const cardOrdinal = (page: Page) => page.index ?? pageSeed(page);
