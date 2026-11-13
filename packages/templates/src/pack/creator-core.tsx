/**
 * Shared engine for the Creator pack (two/three-line creator styles): a stack of rows, each row its own font, size
 * and paint, words drawn as layered copies (glow/shadow underlays, gradient body, shine overlays) so the in-browser
 * exporter draws exactly what the preview shows. Everything is a pure function of `timeMs` (see ./kit EXPORT RULES).
 *
 * Units: catalogue px (WhiteStair's editor scale) become our reference px with WS (x1.6), then x scaleOf(canvas).
 */
import React from "react";
import type { CaptionStyleV2, Page, Word } from "@capseasy/shared";
import { shadowColorOf } from "@capseasy/shared";
import { combineMotion, easeFn, effectiveIntensity, exitStyle } from "../motion";
import { backgroundCss, containerCss, displayText, famCss, layoutBox, scaleOf } from "../text";
import type { MeasureFn, PageRenderProps } from "../types";
import { applyCasing } from "@motion-ai/caption-engine/core";
import { keyframes, keyWordIndex, withAlpha } from "./kit";

/** WhiteStair editor px -> CaptionsEasy reference px (1080 short edge) */
export const WS = 1.6;

// ---------------------------------------------------------------- colour helpers
const HEX = /^#?([0-9a-f]{6})$/i;
export function hexToHsl(hex: string): [number, number, number] | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}
export function hslToHex(h: number, s: number, l: number): string {
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
}
/** shift a colour in HSL points (dl/ds in 0..100 units); non-hex colours pass through */
export function hsl(hex: string, dl: number, ds = 0, floorL = 0): string {
  const x = hexToHsl(hex);
  if (!x) return hex;
  return hslToHex(x[0], x[1] + ds, Math.max(floorL, x[2] + dl));
}
/** CSS alpha for any colour (hex -> rgba; rgba/named pass through) */
export const alpha = (c: string, a: number) => (HEX.test(c.trim()) ? withAlpha(c, a) : c);
/** black or white text on a coloured block (YIQ brightness, matches every WhiteStair Triple swatch) */
export function contrastText(bg: string): string {
  const m = HEX.exec(bg.trim());
  if (!m) return "#000000";
  const n = parseInt(m[1]!, 16);
  const yiq = (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
  return yiq >= 128 ? "#000000" : "#FFFFFF";
}
export const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** style.fill as a paint: solid colour, or a linear gradient laid across the frame */
export function fillPaint(fill: CaptionStyleV2["fill"]): { color?: string; image?: string } {
  if (fill.type === "solid") return { color: fill.color };
  return { image: `linear-gradient(${fill.angle}deg, ${fill.stops.map((s) => `${s.color} ${Math.round(s.at * 100)}%`).join(", ")})` };
}
export const firstOf = (fill: CaptionStyleV2["fill"]) => (fill.type === "solid" ? fill.color : fill.stops[0]!.color);

// ---------------------------------------------------------------- paint model
export interface Layer {
  image: string;
  /** layer width as a multiple of the frame width (shine sweeps use 2.6) */
  widthMul?: number;
  /** extra x offset of the layer in px */
  shift?: number;
  /** extra x offset as a fraction of the frame width (shine sweeps) */
  shiftFrac?: number;
}
export interface Under {
  color: string;
  textShadow?: string;
  filter?: string;
  stroke?: { width: number; color: string };
  dx?: number;
  dy?: number;
  opacity?: number;
}
export interface Paint {
  /** solid body colour (ignored when `layers` is set) */
  color?: string;
  /** background-image layers clipped to the glyphs, first = on top */
  layers?: Layer[];
  /** gradient frame: the whole row (continuous across words) or each word */
  frame?: "row" | "word";
  /** body text-shadow (solid bodies) / underlay shadow (gradient bodies) */
  textShadow?: string;
  /** filter on the body (drop-shadows follow the glyph shape) */
  filter?: string;
  stroke?: { width: number; color: string };
  /** copies drawn beneath the body, in order (first = bottom) */
  under?: Under[];
}

export interface Piece {
  text: string;
  opacity?: number;
  /** clip-path for the text layers (not for `extra`) */
  clip?: string;
  /** drawn over the piece (absolute, relative to the piece's padded box) */
  extra?: (box: { padX: number; padY: number; width: number; size: number }) => React.ReactNode;
}
export interface Item {
  key: string;
  text: string;
  /** split into pieces (typewriter chars, sparkle i's); default one piece */
  pieces?: Piece[];
  motion?: React.CSSProperties;
  /** this word's own paint (overrides the row's) */
  paint?: (sizePx: number) => Paint;
}
export interface RowSpec {
  key: string;
  items: Item[];
  family: string;
  weight: number;
  italic?: boolean;
  /** desired size px (before fitting to the caption box) */
  size: number;
  /** letter-spacing in em (catalogue tracking) */
  trackEm?: number;
  paint: (sizePx: number) => Paint;
  align?: "center" | "left" | "right";
  /** margin above the row in em of this row's size (negative = overlap) */
  mtEm?: number;
  /** line-height as a multiple of the row's size */
  lh?: number;
  skew?: number;
  z?: number;
  /** per-item motion, given the final size (distances in em read the same at any size) */
  motion?: (index: number, sizePx: number) => React.CSSProperties | undefined;
  /** a block behind the row (Triple's highlight), given the final size */
  box?: (sizePx: number) => React.CSSProperties;
  /** whole-row motion */
  rowMotion?: (sizePx: number) => React.CSSProperties | undefined;
  /** filter on the whole row (applies to every layer and decoration) */
  rowFilter?: string;
  /** space between words in em */
  gapEm?: number;
}

export interface Ctx {
  page: Page;
  timeMs: number;
  style: CaptionStyleV2;
  sc: number;
  /** effective motion intensity (style.motionIntensity x emotion) */
  k: number;
  settled?: boolean;
  measure: MeasureFn;
  box: { width: number; cx: number; cy: number };
  canvas: PageRenderProps["canvas"];
}

export const makeCtx = (p: PageRenderProps): Ctx => ({
  page: p.page, timeMs: p.timeMs, style: p.style, sc: scaleOf(p.canvas), k: effectiveIntensity(p.style, p.page.emotion),
  settled: p.settled, measure: p.measure, box: layoutBox(p.style, p.canvas, p.page.position), canvas: p.canvas,
});

// ---------------------------------------------------------------- text helpers
/** words of the card as display text (casing + punctuation), with an optional casing override */
export const textsOf = (ws: Word[], style: CaptionStyleV2, casing?: CaptionStyleV2["casing"]) =>
  ws.map((w) => (casing ? applyCasing(displayText(w, style, "none"), casing) : displayText(w, style)));

/** [before, key, after] around the card's key word (hero emphasis, engine hero, else longest word) */
export function splitKey(page: Page): [Word[], Word[], Word[]] {
  const ws = page.words;
  const k = Math.min(ws.length - 1, Math.max(0, keyWordIndex(page)));
  return [ws.slice(0, k), ws.slice(k, k + 1), ws.slice(k + 1)];
}
/** first `a` words, then the rest */
export const splitAt = (ws: Word[], a: number): [Word[], Word[]] => [ws.slice(0, a), ws.slice(a)];

/** items for a row of words (one piece per word) */
export const itemsOf = (ws: Word[], texts: string[]): Item[] => ws.map((w, i) => ({ key: w.id, text: texts[i]! }));

// ---------------------------------------------------------------- stock word transitions (WhiteStair's "Transitions" tab)
/** the WhiteStair per-word transitions, keyed by our entrance names; distances in catalogue px */
export const STOCK_ENTRANCES = ["none", "fade", "rise", "drop", "pop", "slide-left", "slide-right", "blur-in", "flip", "typewriter"] as const;

export interface EntrancePlan {
  /** css for word #i (reading order across the card) */
  word: (i: number) => React.CSSProperties | undefined;
  /** opacity of char #c of word #i (typewriter), or null when words are whole */
  char: ((i: number, c: number) => number) | null;
}

/**
 * The block's word transition: every word starts `stagger` after the previous one, from the card start
 * (WhiteStair runs block transitions from block start, delayBase per word; typewriter per character).
 * `whole` runs the transition once on the whole block (styles that paint one element per block).
 */
export function stockEntrance(ctx: Ctx, texts: string[], whole = false): EntrancePlan {
  const { style, timeMs, page, settled, sc, k } = ctx;
  const e = style.entrance;
  const t0 = page.startMs;
  if (settled || e.type === "none") return { word: () => undefined, char: null };
  const ease = easeFn(e.easing);
  const dur = Math.max(1, e.durationMs);
  const D = (px: number) => px * WS * sc * k;
  if (e.type === "typewriter") {
    // WhiteStair: 0.05 s per character, 0.03 s apart (at the default 400 ms speed)
    const charDur = dur / 8;
    const gap = dur * 0.075;
    const offs: number[] = [];
    let acc = 0;
    for (const t of texts) { offs.push(acc); acc += [...t].length; }
    return {
      word: () => undefined,
      char: (i, c) => Math.max(0, Math.min(1, (timeMs - t0 - (offs[i]! + c) * gap) / charDur)),
    };
  }
  const word = (i: number): React.CSSProperties | undefined => {
    const lin = Math.max(0, Math.min(1, (timeMs - t0 - (whole ? 0 : i * 100)) / dur));
    if (lin >= 1) return undefined;
    const p = ease(lin);
    const q = 1 - p;
    switch (e.type) {
      case "fade": return { opacity: p };
      case "rise": return { opacity: p, transform: `translateY(${(q * D(30)).toFixed(2)}px)` };
      case "drop": return { opacity: p, transform: `translateY(${(-q * D(30)).toFixed(2)}px)` };
      case "slide-left": return { opacity: p, transform: `translateX(${(-q * D(50)).toFixed(2)}px)` };
      case "slide-right": return { opacity: p, transform: `translateX(${(q * D(50)).toFixed(2)}px)` };
      case "pop": {
        const s = keyframes(lin, [[0, 0], [0.7, 1 + 0.1 * k], [1, 1]], ease);
        return { opacity: keyframes(lin, [[0, 0], [0.7, 1]], ease), transform: `scale(${s.toFixed(4)})` };
      }
      case "blur-in": return { opacity: p, filter: `blur(${(q * D(10)).toFixed(2)}px)`, transform: `scale(${(1 + q * 0.1 * k).toFixed(4)})` };
      case "flip": return { transform: `perspective(${(400 * WS * sc).toFixed(0)}px) rotateX(${(q * 90).toFixed(2)}deg)`, transformOrigin: "50% 100%" };
      default: return { opacity: p };
    }
  };
  return { word, char: null };
}

/** apply an entrance plan to rows built in reading order */
export function withEntrance(rows: RowSpec[], plan: EntrancePlan): RowSpec[] {
  let i = 0;
  return rows.map((r) => ({
    ...r,
    items: r.items.map((it) => {
      const n = i++;
      const m = plan.word(n);
      const pieces = plan.char ? [...(it.pieces ? it.pieces.map((p) => p.text).join("") : it.text)].map((ch, c) => ({ text: ch, opacity: plan.char!(n, c) })) : it.pieces;
      return { ...it, pieces, motion: m ? combineMotion(it.motion ?? {}, m) : it.motion };
    }),
  }));
}

// ---------------------------------------------------------------- user effects shared by every look
/** the user's drop shadows as a CSS filter chain (follows gradient glyphs) */
export const shadowFilter = (style: CaptionStyleV2, sc: number) =>
  style.shadows.map((s) => `drop-shadow(${(s.x * sc).toFixed(2)}px ${(s.y * sc).toFixed(2)}px ${(s.blur * sc).toFixed(2)}px ${shadowColorOf(s)})`).join(" ");
/** the user's drop shadows as text-shadow layers */
export const shadowText = (style: CaptionStyleV2, sc: number) => style.shadows.map((s) => `${(s.x * sc).toFixed(2)}px ${(s.y * sc).toFixed(2)}px ${(s.blur * sc).toFixed(2)}px ${shadowColorOf(s)}`);
export const strokeOf = (style: CaptionStyleV2, sc: number) => (style.stroke.enabled && style.stroke.width > 0 ? { width: style.stroke.width * sc, color: style.stroke.color } : undefined);
export const joinF = (...xs: (string | undefined | false)[]) => xs.filter(Boolean).join(" ") || undefined;
export const joinS = (...xs: (string | undefined | false)[]) => xs.filter(Boolean).join(", ") || undefined;

// ---------------------------------------------------------------- rendering
const ABS: React.CSSProperties = { position: "absolute", left: 0, top: 0, whiteSpace: "pre", pointerEvents: "none" };
const PAD_X = 0.18;
const PAD_Y = 0.4;

interface Placed { text: string; x: number; w: number; piece: Piece }

const PieceView: React.FC<{ pl: Placed; paint: Paint; frameW: number; size: number }> = ({ pl, paint, frameW, size }) => {
  const padX = PAD_X * size;
  const padY = PAD_Y * size;
  const pad: React.CSSProperties = { padding: `${padY.toFixed(2)}px ${padX.toFixed(2)}px` };
  const clip = pl.piece.clip ? { clipPath: pl.piece.clip } : {};
  const fw = paint.frame === "word" ? undefined : frameW;
  const body: React.CSSProperties = paint.layers?.length
    ? ({
        backgroundImage: paint.layers.map((l) => l.image).join(", "),
        backgroundSize: paint.layers.map((l) => `${((fw ?? pl.w) * (l.widthMul ?? 1)).toFixed(2)}px 100%`).join(", "),
        backgroundPosition: paint.layers.map((l) => `${(padX - (fw ? pl.x : 0) + (l.shift ?? 0) + (l.shiftFrac ?? 0) * (fw ?? pl.w)).toFixed(2)}px 0px`).join(", "),
        backgroundRepeat: "no-repeat",
        WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent",
      } as React.CSSProperties)
    : { color: paint.color ?? "#FFFFFF", textShadow: paint.textShadow };
  const strokeCss = paint.stroke ? ({ WebkitTextStroke: `${paint.stroke.width.toFixed(2)}px ${paint.stroke.color}`, paintOrder: "stroke fill" } as React.CSSProperties) : {};
  const unders: Under[] = [...(paint.under ?? [])];
  // a gradient body can't carry its own text-shadow (it would paint over the clipped fill): draw it on a copy beneath
  if (paint.layers?.length && paint.textShadow) unders.push({ color: "transparent", textShadow: paint.textShadow });
  return (
    <span style={{ position: "relative", display: "inline-block", whiteSpace: "pre", margin: `${(-padY).toFixed(2)}px ${(-padX).toFixed(2)}px`, opacity: pl.piece.opacity }}>
      {unders.map((u, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            ...ABS, ...pad, ...clip, color: u.color, WebkitTextFillColor: u.color, textShadow: u.textShadow, filter: u.filter, opacity: u.opacity,
            transform: u.dx || u.dy ? `translate(${(u.dx ?? 0).toFixed(2)}px, ${(u.dy ?? 0).toFixed(2)}px)` : undefined,
            ...(u.stroke ? ({ WebkitTextStroke: `${u.stroke.width.toFixed(2)}px ${u.stroke.color}` } as React.CSSProperties) : {}),
          } as React.CSSProperties}
        >
          {pl.text}
        </span>
      ))}
      <span style={{ position: "relative", display: "inline-block", whiteSpace: "pre", ...pad, ...clip, ...body, ...strokeCss, filter: paint.filter }}>{pl.text}</span>
      {pl.piece.extra ? pl.piece.extra({ padX, padY, width: pl.w, size }) : null}
    </span>
  );
};

/** a row's natural width at `size` (glyphs + gaps) */
function rowWidth(r: RowSpec, size: number, ctx: Ctx): number {
  const spec = specOf(r, size, ctx);
  const gap = gapPx(r, size, ctx);
  return r.items.reduce((a, it, i) => a + ctx.measure(it.text, spec) + (i ? gap : 0), 0);
}
const specOf = (r: RowSpec, size: number, ctx: Ctx) => ({
  fontFamily: famCss(r.family), fontWeight: r.weight, fontStyle: r.italic ? "italic" : "normal", fontSize: size,
  letterSpacing: (r.trackEm ?? 0) * size + ctx.style.letterSpacing * ctx.sc,
});
const gapPx = (r: RowSpec, size: number, ctx: Ctx) => (r.gapEm ?? 0.26) * size + ctx.style.wordSpacing * ctx.sc;

/** final (fitted) size of a row: shrinks to the caption box, never grows */
export function fitRow(r: RowSpec, ctx: Ctx, slack = 0.94): number {
  const w = rowWidth(r, r.size, ctx);
  const max = ctx.box.width * slack;
  return w > max && w > 0 ? r.size * (max / w) : r.size;
}

const RowView: React.FC<{ r: RowSpec; ctx: Ctx }> = ({ r, ctx }) => {
  const size = fitRow(r, ctx);
  const spec = specOf(r, size, ctx);
  const gap = gapPx(r, size, ctx);
  const paint = r.paint(size);
  // x of every piece within the row (gradients run continuously across the row)
  let x = 0;
  const placed = r.items.map((it, i) => {
    if (i) x += gap;
    const pieces = it.pieces ?? [{ text: it.text }];
    const ps: Placed[] = pieces.map((pc) => {
      const w = ctx.measure(pc.text, spec);
      const p = { text: pc.text, x, w, piece: pc };
      x += w;
      return p;
    });
    return { it, ps };
  });
  const frameW = Math.max(1, x);
  const lh = (r.lh ?? 1.1) * ctx.style.lineHeight;
  const rowCss: React.CSSProperties = {
    position: "relative", zIndex: r.z ?? 1, display: "flex", alignItems: "baseline", whiteSpace: "pre",
    justifyContent: r.align === "left" ? "flex-start" : r.align === "right" ? "flex-end" : "center",
    fontFamily: spec.fontFamily, fontWeight: r.weight, fontStyle: spec.fontStyle, fontSize: size, letterSpacing: spec.letterSpacing,
    lineHeight: `${(lh * size).toFixed(2)}px`, marginTop: r.mtEm ? r.mtEm * size : undefined, filter: r.rowFilter,
  };
  const inner = (
    <>
      {placed.map(({ it, ps }, i) => (
        <span key={it.key} style={{ display: "inline-block", whiteSpace: "pre", marginLeft: i ? gap : 0, ...combineMotion(it.motion ?? {}, r.motion?.(i, size) ?? {}) }}>
          {ps.map((pl, j) => <PieceView key={j} pl={pl} paint={it.paint ? it.paint(size) : paint} frameW={frameW} size={size} />)}
        </span>
      ))}
    </>
  );
  const motion = r.rowMotion?.(size);
  const skew = r.skew ? `skewX(${r.skew}deg)` : undefined;
  if (r.box) {
    return (
      <div style={{ ...rowCss, justifyContent: "center", alignSelf: "center", ...combineMotion(motion ?? {}, skew ? { transform: skew } : {}) }}>
        <div style={{ display: "flex", alignItems: "baseline", whiteSpace: "pre", ...r.box(size) }}>{inner}</div>
      </div>
    );
  }
  return <div style={{ ...rowCss, ...combineMotion(motion ?? {}, skew ? { transform: skew } : {}) }}>{inner}</div>;
};

/** The card: rows stacked in a column as wide as the widest row (so left/right rows hang off its edges). */
export const Stack: React.FC<{ ctx: Ctx; rows: RowSpec[]; wrap?: React.CSSProperties; children?: React.ReactNode }> = ({ ctx, rows, wrap, children }) => {
  const { style, page, timeMs, settled, sc } = ctx;
  return (
    <div style={combineMotion(containerCss(ctx.box, style.rotation), exitStyle(style, page.endMs - timeMs, settled, style.fontSize * sc))}>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "stretch", ...(wrap ?? {}), ...backgroundCss(style, sc) }}>
        {rows.filter((r) => r.items.length).map((r) => <RowView key={r.key} r={r} ctx={ctx} />)}
        {children}
      </div>
    </div>
  );
};

/** the style's glow as an extra outer glow (looks whose signature has no glow still honour the Glow control) */
export const userGlow = (style: CaptionStyleV2, sc: number) =>
  style.glow.enabled && style.glow.intensity > 0 ? `drop-shadow(0 0 ${(style.glow.radius * sc).toFixed(2)}px ${alpha(style.glow.color, Math.min(1, style.glow.intensity))})` : undefined;

/** helper: tween 0..1 of a window with a CSS-like curve */
export const win = (timeMs: number, start: number, dur: number, settled?: boolean) => (settled ? 1 : Math.max(0, Math.min(1, (timeMs - start) / Math.max(1, dur))));
