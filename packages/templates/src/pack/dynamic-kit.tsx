/**
 * Composition engine for the Estate and Dynamic looks (pack/dynamic.tsx). A composition is a list of rows; a row is a
 * list of items; an item is one or more of the card's words set in one face, size and paint, optionally inside a box
 * (badge), each word arriving with its own keyframed motion when it is spoken. The engine measures every word, places
 * rows (centred, left, right, justified, overlaid or pinned to another row's edge), fits the whole block to the
 * caption box (long words never overflow) and renders it with absolute positions, so nothing reflows while words
 * arrive. Everything is a pure function of `timeMs` (see the export rules in ./kit).
 */
import React from "react";
import type { CaptionStyleV2, Page, Word } from "@capseasy/shared";
import { combineMotion, effectiveIntensity, exitStyle, showAt } from "../motion";
import { containerCss, displayText, famCss, fillCss, layoutBox, scaleOf, shadowCss, strokeCss } from "../text";
import type { MeasureFn, PageRenderProps } from "../types";
import { ringShadow, withAlpha } from "./kit";

// ---------------------------------------------------------------------------------------------------------- faces

export interface Face {
  family: string;
  weight: number;
  italic?: boolean;
  /** tracking in em (catalogue letter-spacing), on top of the style's own letter spacing */
  trackEm?: number;
  /** vertical stretch of the glyphs (Bebas "condensed-tall") */
  scaleY?: number;
  casing?: CaptionStyleV2["casing"];
}

/** the style's own font (Font / Weight controls) */
export const bodyFace = (style: CaptionStyleV2, trackEm = 0, extra: Partial<Face> = {}): Face => ({
  family: style.fontId, weight: style.fontWeight, italic: style.fontStyle === "italic", trackEm, ...extra,
});
/** the style's hero font (Hero font control), falling back to the body font */
export const heroFace = (style: CaptionStyleV2, fallbackWeight: number, trackEm = 0): Face => ({
  family: style.hero.fontId ?? style.fontId, weight: style.hero.fontWeight ?? fallbackWeight, trackEm,
});

// ---------------------------------------------------------------------------------------------------------- paints

export type Paint =
  /** the style's fill, outline, shadows and glow (Text colour, Fill, Outline, Shadow, Glow controls); `glow` adds layers, `bare` drops the shadows */
  | { kind: "body"; glow?: (size: number) => string[]; bare?: boolean }
  /** a solid colour; `glow` adds its own layers (in px for this size); `bare` skips the style's shadows/outline */
  | { kind: "solid"; color: string; glow?: (size: number) => string[]; bare?: boolean }
  /** gradient-clipped text; `under` paints a shadow copy below (text-shadow can't sit on clipped text) */
  | { kind: "gradient"; css: string; base: string; glow?: (size: number) => string[]; bare?: boolean }
  /** the Estate "blended" word (see blendLayers): light fill (a solid colour, or the style's gradient), dark halo; `bold` emboldens (em) */
  | { kind: "blend"; light: CaptionStyleV2["fill"]; dark: string; bold?: number };

const hex = (c: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** a + (b - a) * t between two #RRGGBB colours */
export function mix(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  if (!x || !y) return a;
  return `#${x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The exportable stand-in for WhiteStair's luminance-adaptive word (canvas grayscale/contrast/invert + difference
 * composite, which needs the video's pixels). We can't read the video and the exporter can't blend, so the word is
 * painted in BOTH tones at once: the light tone fills the letters (fading a little toward the dark tone at the
 * baseline), wrapped in a tight hard halo of the dark tone plus a soft dark bloom. Over dark footage it reads as the
 * light word; over bright footage the dark halo carries the letterforms, so it stays readable on any frame and keeps
 * the palette's light/dark pair.
 */
export function blendLayers(light: CaptionStyleV2["fill"], dark: string, size: number, bold = 0): { fill: string; shadows: string[] } {
  const fill = light.type === "solid"
    ? `linear-gradient(180deg, ${light.color} 0%, ${light.color} 52%, ${mix(light.color, dark, 0.32)} 100%)`
    : `linear-gradient(${light.angle}deg, ${light.stops.map((s) => `${s.color} ${Math.round(s.at * 100)}%`).join(", ")})`;
  return {
    fill,
    shadows: [
      ...ringShadow(Math.max(1, size * (0.036 + bold)), dark, 16),
      `0 0 ${(size * 0.07).toFixed(2)}px ${withAlpha(dark, 0.95)}`,
      `0 ${(size * 0.03).toFixed(2)}px ${(size * 0.2).toFixed(2)}px ${withAlpha(dark, 0.7)}`,
    ],
  };
}

const ABS: React.CSSProperties = { position: "absolute", left: 0, top: 0, whiteSpace: "pre", pointerEvents: "none" };

/** One word painted: solid text carries its shadows directly; clipped (gradient) text gets a shadow copy below. */
const Ink: React.FC<{ text: string; paint: Paint; style: CaptionStyleV2; sc: number; size: number }> = ({ text, paint, style, sc, size }) => {
  const stroke = strokeCss(style.stroke, sc);
  const styleShadow = (extra: string[]) => {
    const s = shadowCss(style, sc, extra);
    return s === "none" ? undefined : s;
  };
  let fill: React.CSSProperties;
  let shadow: string | undefined;
  let base = "#000000";
  let bare = false;
  switch (paint.kind) {
    case "body":
      fill = fillCss(style.fill);
      bare = !!paint.bare;
      shadow = bare ? undefined : styleShadow(paint.glow?.(size) ?? []);
      base = style.fill.type === "solid" ? style.fill.color : style.fill.stops[style.fill.stops.length - 1]!.color;
      break;
    case "solid":
      fill = { color: paint.color };
      bare = !!paint.bare;
      shadow = bare ? paint.glow?.(size).join(", ") : styleShadow(paint.glow?.(size) ?? []);
      base = paint.color;
      break;
    case "gradient":
      fill = { backgroundImage: paint.css, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent" } as React.CSSProperties;
      bare = !!paint.bare;
      shadow = bare ? paint.glow?.(size).join(", ") : styleShadow(paint.glow?.(size) ?? []);
      base = paint.base;
      break;
    case "blend": {
      const b = blendLayers(paint.light, paint.dark, size, paint.bold ?? 0);
      fill = { backgroundImage: b.fill, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent" } as React.CSSProperties;
      shadow = styleShadow(b.shadows);
      const lightBase = paint.light.type === "solid" ? paint.light.color : paint.light.stops[0]!.color;
      base = lightBase;
      // emboldened: a stroke in the light tone on the copy below (half of it shows outside the letters)
      if (paint.bold && !(style.stroke.enabled && style.stroke.width > 0)) {
        const strokeBold = { WebkitTextStroke: `${(paint.bold * 2 * size).toFixed(2)}px ${lightBase}` } as React.CSSProperties;
        return (
          <span style={{ position: "relative", display: "inline-block", whiteSpace: "pre" }}>
            <span aria-hidden style={{ ...ABS, color: lightBase, textShadow: shadow, ...strokeBold }}>{text}</span>
            <span style={{ position: "relative", whiteSpace: "pre", ...fill }}>{text}</span>
          </span>
        );
      }
      break;
    }
  }
  const strokeCssOrNone = bare ? {} : stroke;
  const clipped = fill.backgroundImage !== undefined;
  if (!clipped) return <span style={{ whiteSpace: "pre", ...fill, ...strokeCssOrNone, textShadow: shadow }}>{text}</span>;
  return (
    <span style={{ position: "relative", display: "inline-block", whiteSpace: "pre" }}>
      <span aria-hidden style={{ ...ABS, color: base, textShadow: shadow, ...strokeCssOrNone }}>{text}</span>
      <span style={{ position: "relative", whiteSpace: "pre", ...fill }}>{text}</span>
    </span>
  );
};

// ---------------------------------------------------------------------------------------------------------- motion

export interface MotionCtx {
  /** ms since this motion started (negative: not yet) */
  t: number;
  /** motion intensity (style x emotion) */
  k: number;
  /** font size of the word, px */
  size: number;
}
export type Motion = (c: MotionCtx) => React.CSSProperties;

export interface EnterSpec {
  dur: number;
  ease: (t: number) => number;
  /** start offsets: x/y in em of the word, or xPct in % of its own width */
  x?: number;
  y?: number;
  xPct?: number;
  /** start scale, rotation (deg), blur (em) */
  scale?: number;
  rot?: number;
  blur?: number;
  origin?: string;
  /** opacity from (linear 0..1, eased 0..1); default: follows the eased progress */
  opacity?: (lin: number, p: number) => number;
}

/** A CSS-keyframe-like entrance ("from" values -> rest) as a pure function of time. Distances scale with intensity. */
export const enter = (s: EnterSpec): Motion => ({ t, k, size }) => {
  if (t < 0) return { opacity: 0 };
  const lin = Math.min(1, t / s.dur);
  if (lin >= 1) return {};
  const p = s.ease(lin);
  const q = 1 - p;
  const parts: string[] = [];
  if (s.xPct) parts.push(`translateX(${(s.xPct * q * Math.min(k, 1.6)).toFixed(2)}%)`);
  if (s.x || s.y) parts.push(`translate(${((s.x ?? 0) * q * k * size).toFixed(2)}px, ${((s.y ?? 0) * q * k * size).toFixed(2)}px)`);
  if (s.rot) parts.push(`rotate(${(s.rot * q * k).toFixed(2)}deg)`);
  if (s.scale !== undefined && s.scale !== 1) parts.push(`scale(${(1 + (s.scale - 1) * q * k).toFixed(4)})`);
  const blur = s.blur ? s.blur * q * k * size : 0;
  return {
    opacity: Math.max(0, Math.min(1, s.opacity ? s.opacity(lin, p) : p)),
    transform: parts.length ? parts.join(" ") : undefined,
    transformOrigin: s.origin,
    filter: blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : undefined,
  };
};

/** words that just appear when spoken (WhiteStair's "Default" transition) */
export const cut: Motion = ({ t }) => (t < 0 ? { opacity: 0 } : {});

// ---------------------------------------------------------------------------------------------------------- layout

export interface BoxSpec {
  /** CSS colour or linear-gradient */
  color: string;
  /** padding and radius in em of the item's size */
  padX: number;
  padY: number;
  radius: number;
  /** extra line height of the box over the font size (em) */
  body?: number;
  /** the box's own motion (t from the item's first word) */
  motion?: Motion;
}

export interface Item {
  /** word indices on the card */
  idx: number[];
  /** size, in units of the style's font size */
  size: number;
  face: Face;
  paint: Paint;
  /** motion of each word (t from the word's own show time, or the item's first word with `together`) */
  motion: Motion;
  together?: boolean;
  /** the words take turns in one slot (only the latest spoken one shows) */
  turns?: boolean;
  box?: BoxSpec;
  /** pick a word's motion by its position in the item (for late words in a box) */
  motionFor?: (wordStart: number, itemStart: number) => { motion: Motion; at: number };
  valign?: "center" | "top" | "bottom";
  /** opacity multiplier (a word set back behind words laid over it) */
  dim?: number;
  /** nudges in em of the item size */
  dx?: number;
  dy?: number;
}

export interface Row {
  items: Item[];
  align?: "center" | "left" | "right" | "justify";
  /** line height factor of this row (times style.lineHeight) */
  lh?: number;
  /** extra space above the row, in units of the base font size (negative overlaps the row above) */
  gap?: number;
  /** centre this row vertically on the previous row (words sliding across a big word) */
  overlay?: boolean;
  /** pin the row's left edge (or right edge with anchor "end") to an x computed from the rows above */
  at?: (above: RowGeom[]) => number;
  anchor?: "start" | "end";
}

export interface RowGeom {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PlacedWord {
  word: Word;
  text: string;
  x: number;
  y: number;
  size: number;
  lineH: number;
  face: Face;
  paint: Paint;
  motion: Motion;
  at: number;
  hidden: boolean;
  dim: number;
}
interface PlacedBox {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  spec: BoxSpec;
  at: number;
  size: number;
}

export interface Geometry {
  words: PlacedWord[];
  boxes: PlacedBox[];
  width: number;
  height: number;
  /** px per unit of the style's font size after fitting */
  unit: number;
}

const gapEm = 0.27;

/** measure, place and fit a composition */
export function layoutRows(rows: Row[], page: Page, style: CaptionStyleV2, sc: number, measure: MeasureFn, maxWidth: number, timeMs: number, settled?: boolean): Geometry {
  const u = style.fontSize * sc;
  const ws = style.wordSpacing * sc;
  const texts = page.words.map((w) => displayText(w, style));
  const textOf = (i: number, f: Face) => (f.casing ? displayText(page.words[i]!, style, f.casing) : texts[i]!);
  const lsPx = (f: Face, size: number) => (f.trackEm ?? 0) * size + style.letterSpacing * sc;
  const widthOf = (i: number, f: Face, size: number) =>
    measure(textOf(i, f), { fontFamily: famCss(f.family), fontWeight: f.weight, fontStyle: f.italic ? "italic" : "normal", fontSize: size, letterSpacing: lsPx(f, size) });
  const blendPad = (it: Item, size: number) => (it.paint.kind === "blend" ? size * 0.06 : 0);

  // 1) natural geometry at unit scale (f = 1)
  interface ItemGeom { it: Item; size: number; ww: number[]; w: number; h: number; shown: number[] }
  const live = rows.map((r) => ({ ...r, items: r.items.filter((it) => it.idx.length && it.idx.every((i) => i >= 0 && i < page.words.length)) })).filter((r) => r.items.length);
  const geoms = live.map((r) => {
    const items: ItemGeom[] = r.items.map((it) => {
      const size = it.size * u;
      const ww = it.idx.map((i) => widthOf(i, it.face, size));
      const gap = size * gapEm + ws;
      const pad = (it.box ? it.box.padX * size * 2 : 0) + blendPad(it, size) * 2;
      const w = (it.turns ? Math.max(...ww) : ww.reduce((a, b) => a + b, 0) + gap * (ww.length - 1)) + pad;
      const h = size * (r.lh ?? 1) * style.lineHeight;
      return { it, size, ww, w, h, shown: it.idx };
    });
    const itemGap = Math.max(...items.map((g) => g.size)) * gapEm + ws;
    const w = items.reduce((a, g) => a + g.w, 0) + itemGap * (items.length - 1);
    const h = Math.max(...items.map((g) => g.h));
    return { row: r, items, w, h, itemGap };
  });

  // 2) horizontal placement: pinned rows first, then the block width, then centred/right/justified rows
  const placed: RowGeom[] = [];
  let y = 0;
  const xs: (number | null)[] = [];
  geoms.forEach((g, ri) => {
    if (ri > 0) {
      if (g.row.overlay) y = placed[ri - 1]!.y + placed[ri - 1]!.h / 2 - g.h / 2;
      else y += placed[ri - 1]!.h + (g.row.gap ?? 0) * u;
    } else y = 0;
    let x: number | null = null;
    if (g.row.align === "left") x = 0;
    if (g.row.at) {
      const at = g.row.at(placed);
      x = g.row.anchor === "end" ? at - g.w : at;
    }
    xs.push(x);
    placed.push({ x: x ?? 0, y, w: g.w, h: g.h });
  });
  const minX = Math.min(0, ...xs.filter((x): x is number => x !== null));
  let W = 0;
  geoms.forEach((g, ri) => {
    const x = xs[ri];
    W = Math.max(W, x === null ? g.w : x - minX + g.w);
  });
  geoms.forEach((g, ri) => {
    const r = placed[ri]!;
    const x = xs[ri];
    if (x !== null) r.x = x - minX;
    else if (g.row.align === "right") r.x = W - g.w;
    else if (g.row.align === "justify") { r.x = 0; r.w = Math.max(W, g.w); }
    else r.x = (W - g.w) / 2;
  });
  const top = Math.min(...placed.map((p) => p.y));
  const bottom = Math.max(...placed.map((p) => p.y + p.h));

  // 3) fit to the caption box
  const f = Math.min(1, maxWidth / Math.max(1, W));
  const words: PlacedWord[] = [];
  const boxes: PlacedBox[] = [];
  geoms.forEach((g, ri) => {
    const r = placed[ri]!;
    const justify = g.row.align === "justify" && g.items.length > 1;
    const spare = justify ? Math.max(0, r.w - g.w) / (g.items.length - 1) : 0;
    let x = r.x;
    for (const ig of g.items) {
      const it = ig.it;
      const vy = it.valign === "top" ? 0 : it.valign === "bottom" ? g.h - ig.h : (g.h - ig.h) / 2;
      const iy = r.y - top + vy + (it.dy ?? 0) * ig.size;
      const ix = x + (it.dx ?? 0) * ig.size;
      const start = Math.min(...it.idx.map((i) => showAt(page.words[i]!)));
      if (it.box) {
        const bh = ig.size * ((it.box.body ?? 1.02) + it.box.padY * 2);
        boxes.push({ key: `${ri}-${it.idx[0]}`, x: ix * f, y: (iy + (ig.h - bh) / 2) * f, w: ig.w * f, h: bh * f, spec: it.box, at: start, size: ig.size * f });
      }
      let wx = ix + (it.box ? it.box.padX * ig.size : 0) + blendPad(it, ig.size);
      // turns: the latest word that has started (the first one before any)
      let turn = it.idx[0]!;
      if (it.turns) for (const i of it.idx) if (settled ? true : timeMs >= showAt(page.words[i]!)) turn = i;
      it.idx.forEach((i, k) => {
        const own = showAt(page.words[i]!);
        const m = it.motionFor ? it.motionFor(own, start) : { motion: it.motion, at: it.together ? start : own };
        words.push({
          word: page.words[i]!, text: textOf(i, it.face), x: wx * f, y: iy * f, size: ig.size * f, lineH: ig.h * f, face: it.face, paint: it.paint,
          motion: m.motion, at: m.at, hidden: !!it.turns && i !== turn, dim: it.dim ?? 1,
        });
        if (!it.turns) wx += ig.ww[k]! + ig.size * gapEm + ws;
      });
      x += ig.w + g.itemGap + spare;
    }
  });
  return { words, boxes, width: W * f, height: (bottom - top) * f, unit: u * f };
}

/** index of the word being spoken (else the last one already spoken, else the first) */
export function currentWord(page: Page, timeMs: number): number {
  let cur = 0;
  page.words.forEach((w, i) => {
    if (timeMs >= showAt(w)) cur = i;
  });
  return cur;
}

export interface Rendered {
  /** rows of the composition for this card at this time */
  rows: Row[];
  /** the template's own card exit when the style's exit is "none" */
  ownExit?: (msUntilEnd: number, unit: number) => React.CSSProperties;
}

/** Render a composition: container (centring + exit) > block > boxes, then words. */
export const CompositionView: React.FC<PageRenderProps & { build: Rendered }> = ({ page, timeMs, style, canvas, measure, settled, build }) => {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const k = effectiveIntensity(style, page.emotion);
  const g = layoutRows(build.rows, page, style, sc, measure, box.width * 0.96, timeMs, settled);
  const until = page.endMs - timeMs;
  const exit = style.exit.type === "none" && build.ownExit ? (settled ? {} : build.ownExit(until, g.unit)) : exitStyle(style, until, settled, g.unit);
  return (
    <div style={combineMotion(containerCss(box, style.rotation), exit)}>
      <div style={{ position: "relative", width: g.width, height: g.height, wordSpacing: style.wordSpacing * sc, lineHeight: style.lineHeight }}>
        {g.boxes.map((b) => {
          const m = settled || !b.spec.motion ? {} : b.spec.motion({ t: timeMs - b.at, k, size: b.size });
          return (
            <div
              key={`box-${b.key}`}
              style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, background: b.spec.color, borderRadius: b.spec.radius * b.size, ...m }}
            />
          );
        })}
        {g.words.map((w) => {
          if (w.hidden) return null;
          const m = settled ? {} : w.motion({ t: timeMs - w.at, k, size: w.size });
          const { transform, ...rest } = m;
          if (w.dim !== 1) rest.opacity = Number(rest.opacity ?? 1) * w.dim;
          const stretch = w.face.scaleY && w.face.scaleY !== 1 ? `scaleY(${w.face.scaleY})` : "";
          const tf = [transform, stretch].filter(Boolean).join(" ");
          return (
            <span
              key={w.word.id}
              style={{
                position: "absolute", left: w.x, top: w.y, height: w.lineH, lineHeight: `${w.lineH}px`, whiteSpace: "pre",
                fontFamily: famCss(w.face.family), fontWeight: w.face.weight, fontStyle: w.face.italic ? "italic" : "normal", fontSize: w.size,
                letterSpacing: (w.face.trackEm ?? 0) * w.size + style.letterSpacing * sc,
                ...rest,
                transformOrigin: rest.transformOrigin ?? "50% 60%",
                transform: tf || undefined,
              }}
            >
              <Ink text={w.text} paint={w.paint} style={style} sc={sc} size={w.size} />
            </span>
          );
        })}
      </div>
    </div>
  );
};
