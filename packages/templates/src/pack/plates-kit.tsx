/**
 * Shared plumbing for the plate / stamp / whip looks (./plates*.tsx). The looks re-create caption styles catalogued in
 * docs/research/competitors-captions.md (VEED section 4.4, OpusClip section 3) from their published parameters: fonts,
 * colours, plate geometry and timing segments relative to each word's start. Everything is a pure function of
 * `timeMs` (export rules: see ./kit.ts); `settled` renders the final state.
 */
import type React from "react";
import type { CaptionStyleV2, Page, Word } from "@capseasy/shared";
import { shadowColorOf } from "@capseasy/shared";
import { famCss, fillCss } from "../text";
import type { TemplateCapabilities } from "../types";
import { EASE, bezier, keyWordIndex } from "./kit";
import { glowLayers, px, shadowLayers, strokeOf } from "./graphic-common";

/** the layout draws its own motion: no generic card entrance */
export const OWN_ENTRANCE = { type: "none", durationMs: 0, stagger: "none", easing: "outExpo" } as const;
export const NO_EXIT = { type: "none", durationMs: 0 } as const;

/** capabilities of a plates layout: only what the layout really honours (controls.test proves each one) */
export const platesCaps = (over: Partial<TemplateCapabilities> = {}): TemplateCapabilities => ({
  hero: false, alignment: false, stagger: false, accentPeriod: false, weight: true, color: true, background: false, emoji: false,
  activeEffects: ["none"], entrances: ["none"], ...over,
});

/** the easings the catalogued segments name (cubicOut, quadOut, expoOut, backOut) plus the source CSS curves */
export const EASES = {
  cubicOut: bezier(0.33, 1, 0.68, 1),
  quadOut: bezier(0.5, 1, 0.89, 1),
  expoOut: EASE.outExpo,
  /** Ticker's source curves: word rise cubic-bezier(.16,.84,.3,1), keyword pop cubic-bezier(.34,1.3,.64,1) */
  tickerRise: bezier(0.16, 0.84, 0.3, 1),
  tickerPop: bezier(0.34, 1.3, 0.64, 1),
  /** OpusClip's AV-engine keyframes: (.333,0,.667,1) on transform and blur, (.167,.167,.833,.833) on opacity */
  avMotion: bezier(0.333, 0, 0.667, 1),
  avFade: bezier(0.167, 0.167, 0.833, 0.833),
};

/**
 * The card's position in the video. Unknown (a lone preview card) counts as the first card, so previews and
 * single-card renders always show a look's regular card.
 */
export const ord = (page: Page) => page.index ?? 0;

/** The card's key word: the creator's hero, then a strong word, then the engine's pick (kit keyWordIndex). */
export function keyIndex(page: Page): number {
  if (!page.words.length) return -1;
  const hero = page.words.findIndex((w) => w.emphasis === "hero");
  if (hero >= 0) return hero;
  const strong = page.words.findIndex((w) => w.emphasis === "strong");
  if (strong >= 0) return strong;
  return keyWordIndex(page);
}

/** letters/digits in a word (a key word needs a few to carry a plate of its own) */
export const letterCount = (w: Word) => w.text.replace(/[^\p{L}\p{N}]/gu, "").length;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 0..1 of a segment that runs from `startMs + fromMs` to `startMs + toMs` (eased); settled = 1 */
export function seg(timeMs: number, startMs: number, fromMs: number, toMs: number, ease: (t: number) => number, settled?: boolean): number {
  if (settled) return 1;
  const a = startMs + fromMs;
  const d = toMs - fromMs;
  if (d <= 0) return timeMs >= a ? 1 : 0;
  return ease(clamp((timeMs - a) / d, 0, 1));
}

/** fade + rise from `riseEm` below over a word's segment; `k` = motion intensity */
export function riseIn(timeMs: number, startMs: number, fromMs: number, toMs: number, riseEm: number, sizePx: number, k: number, ease: (t: number) => number, settled?: boolean): React.CSSProperties {
  if (settled) return {};
  const p = seg(timeMs, startMs, fromMs, toMs, ease);
  if (p >= 1) return {};
  return { opacity: p, transform: `translateY(${px((1 - p) * riseEm * sizePx * k)})` };
}

export interface RunOpts {
  fontId?: string;
  fontWeight?: number;
  fontStyle?: string;
  fill?: CaptionStyleV2["fill"];
  /** px */
  letterSpacing?: number;
  lineHeight?: number;
  /** draw the style's outline, shadows and glow on these letters (default true) */
  decorate?: boolean;
}

/** typography for one run of text at `sizePx` in the style's font (or an override), with its outline/shadow/glow */
export function runCss(style: CaptionStyleV2, sc: number, sizePx: number, o: RunOpts = {}): React.CSSProperties {
  const decorate = o.decorate !== false;
  const layers = decorate ? [...shadowLayers(style, sc), ...glowLayers(style, sc)] : [];
  return {
    fontFamily: famCss(o.fontId ?? style.fontId),
    fontWeight: o.fontWeight ?? style.fontWeight,
    fontStyle: o.fontStyle ?? style.fontStyle,
    fontSize: sizePx,
    lineHeight: o.lineHeight ?? style.lineHeight,
    letterSpacing: o.letterSpacing ?? style.letterSpacing * sc,
    whiteSpace: "pre",
    ...fillCss(o.fill ?? style.fill),
    ...(decorate ? strokeOf(style, sc) : {}),
    ...(layers.length ? { textShadow: layers.join(", ") } : {}),
  };
}

/** a word's own colour (set in the editor) wins over the look's fill */
export const wordFill = (w: Word, fill: CaptionStyleV2["fill"]): CaptionStyleV2["fill"] => (w.color ? { type: "solid", color: w.color } : fill);

/** the style's shadows as box-shadow layers (plates cast them instead of the letters) */
export const boxShadowOf = (style: CaptionStyleV2, sc: number, mul = 1) =>
  style.shadows.length ? style.shadows.map((s) => `${px(s.x * sc * mul)} ${px(s.y * sc * mul)} ${px(s.blur * sc * mul)} ${shadowColorOf(s)}`).join(", ") : undefined;

/** solid colour of a fill (hero fills are usually solid) */
export const solidOf = (fill: CaptionStyleV2["fill"] | undefined, dflt: string) => (!fill ? dflt : fill.type === "solid" ? fill.color : fill.stops[0]!.color);
