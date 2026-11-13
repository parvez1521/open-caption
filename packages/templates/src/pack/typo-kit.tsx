/**
 * Helpers for the typographic compositions (pack/typo*.tsx): a word is drawn as one "Ink" token in its own face
 * (font, weight, size, tracking) and paint (solid or gradient-clipped fill, text-shadow stack, outline), placed in
 * rows that are fitted as a whole to the caption box. Everything is a pure function of the props (export-safe:
 * gradient faces get a solid shadow copy underneath, no blend modes, no CSS animations).
 */
import React from "react";
import type { CaptionStyleV2, Page } from "@capseasy/shared";
import { shadowColorOf } from "@capseasy/shared";
import { combineMotion, effectiveIntensity, exitStyle } from "../motion";
import { backgroundCss, containerCss, displayText, famCss, layoutBox, scaleOf } from "../text";
import type { MeasureFn, PageRenderProps, TemplateCapabilities } from "../types";
import { withAlpha } from "./kit";

/** capabilities for a composition that animates itself: only the controls it honours */
export const typoCaps = (over: Partial<TemplateCapabilities>): TemplateCapabilities => ({
  hero: true, alignment: false, stagger: false, accentPeriod: false, weight: false, color: true, background: true, emoji: false,
  activeEffects: ["none"], entrances: ["none"], ...over,
});

/** a type face at a concrete pixel size */
export interface Face {
  font: string;
  weight: number;
  italic?: boolean;
  size: number;
  /** letter-spacing, px */
  ls: number;
  lh: number;
}

export const scaleFace = (f: Face, k: number): Face => ({ ...f, size: f.size * k, ls: f.ls * k });

export const measureSpec = (f: Face) => ({ fontFamily: famCss(f.font), fontWeight: f.weight, fontStyle: f.italic ? "italic" : "normal", fontSize: f.size, letterSpacing: f.ls });

export const faceCss = (f: Face): React.CSSProperties => ({
  fontFamily: famCss(f.font), fontWeight: f.weight, fontStyle: f.italic ? "italic" : "normal", fontSize: f.size, letterSpacing: f.ls, lineHeight: f.lh, whiteSpace: "pre",
});

export const textW = (measure: MeasureFn, text: string, f: Face) => measure(text, measureSpec(f));

/** how a word is painted */
export interface Paint {
  /** solid text colour */
  color?: string;
  /** background-image clipped to the glyphs (wins over color) */
  bg?: string;
  /** background-size / background-position lists for layered `bg` (no-repeat) */
  bgSize?: string;
  bgPos?: string;
  /** colour of the shadow copy under a gradient face */
  under?: string;
  /** text-shadow list */
  shadow?: string;
  /** -webkit-text-stroke value ("2px #000") */
  stroke?: string;
  filter?: string;
}

const ABS: React.CSSProperties = { position: "absolute", left: 0, top: 0, whiteSpace: "pre", pointerEvents: "none" };

/** One word in its face and paint. `css` positions/animates the token (transform, opacity, margins). */
export const Ink: React.FC<{ text: string; face: Face; paint: Paint; css?: React.CSSProperties; children?: React.ReactNode }> = ({ text, face, paint, css, children }) => {
  const font = faceCss(face);
  const stroke = paint.stroke ? ({ WebkitTextStroke: paint.stroke, paintOrder: "stroke fill" } as React.CSSProperties) : {};
  if (!paint.bg) {
    return (
      <span style={{ position: "relative", display: "inline-block", ...font, color: paint.color, textShadow: paint.shadow, filter: paint.filter, ...stroke, ...css }}>
        {text}
        {children}
      </span>
    );
  }
  // gradient face: shadow/outline drawn by a solid copy underneath (text-shadow would show through clipped glyphs)
  return (
    <span style={{ position: "relative", display: "inline-block", ...font, filter: paint.filter, ...css }}>
      {paint.shadow || paint.stroke ? <span aria-hidden style={{ ...ABS, color: paint.under ?? "#000000", textShadow: paint.shadow, ...stroke }}>{text}</span> : null}
      <span style={{ position: "relative", whiteSpace: "pre", backgroundImage: paint.bg, ...(paint.bgSize ? { backgroundSize: paint.bgSize, backgroundPosition: paint.bgPos, backgroundRepeat: "no-repeat" } : {}), WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent" } as React.CSSProperties}>{text}</span>
      {children}
    </span>
  );
};

/** CSS linear-gradient for a style fill (solid -> undefined) */
export const fillBg = (fill: CaptionStyleV2["fill"]) =>
  fill.type === "solid" ? undefined : `linear-gradient(${fill.angle}deg, ${fill.stops.map((s) => `${s.color} ${Math.round(s.at * 100)}%`).join(", ")})`;

/** paint for a style fill (solid colour or gradient) */
export const fillPaint = (fill: CaptionStyleV2["fill"]): Paint =>
  fill.type === "solid" ? { color: fill.color } : { bg: fillBg(fill), under: fill.stops[fill.stops.length - 1]!.color };

/** the style's own shadows + glow, after any look-specific layers (`extra`, already in px) */
export function shadowStack(style: CaptionStyleV2, sc: number, extra: string[] = [], mul = 1): string | undefined {
  const layers = [...extra, ...style.shadows.map((s) => `${(s.x * sc * mul).toFixed(2)}px ${(s.y * sc * mul).toFixed(2)}px ${(s.blur * sc * mul).toFixed(2)}px ${shadowColorOf(s)}`)];
  if (style.glow.enabled) {
    const r = style.glow.radius * sc;
    layers.push(`0 0 ${r.toFixed(2)}px ${withAlpha(style.glow.color, style.glow.intensity)}`, `0 0 ${(r * 2).toFixed(2)}px ${withAlpha(style.glow.color, style.glow.intensity * 0.6)}`);
  }
  return layers.length ? layers.join(", ") : undefined;
}

/** the style's outline as a -webkit-text-stroke value (scaled by `mul`) */
export const strokeOf = (style: CaptionStyleV2, sc: number, mul = 1) =>
  style.stroke.enabled && style.stroke.width > 0 ? `${(style.stroke.width * sc * mul).toFixed(2)}px ${style.stroke.color}` : undefined;

/** everything a composition needs from its props */
export function typoCtx(p: PageRenderProps) {
  const { page, style, canvas } = p;
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  // emotion and the Motion intensity slider scale every distance/rotation/scale offset
  const k = Math.min(2.5, Math.max(0, effectiveIntensity(style, page.emotion)));
  return { sc, box, k, base: style.fontSize * sc, ls: style.letterSpacing * sc, ws: style.wordSpacing * sc };
}

/** display text of each word with an explicit casing */
export const textsOf = (page: Page, style: CaptionStyleV2, casing: CaptionStyleV2["casing"] = style.casing) => page.words.map((w) => displayText(w, style, casing));

/** shrink factor that makes the widest row fit (never grows) */
export const fitK = (widths: number[], maxW: number) => {
  const w = Math.max(1, ...widths);
  return w > maxW ? maxW / w : 1;
};

/**
 * The outer frame: centred on the caption position (transform `translate(-50%, -50%)` first, so exits never
 * shift it), whole-card exit applied, children stacked in a column.
 */
export const Frame: React.FC<{ p: PageRenderProps; sizePx: number; align?: React.CSSProperties["alignItems"]; children: React.ReactNode }> = ({ p, sizePx, align, children }) => {
  const box = layoutBox(p.style, p.canvas, p.page.position);
  return (
    <div style={combineMotion(containerCss(box, p.style.rotation), exitStyle(p.style, p.page.endMs - p.timeMs, p.settled, sizePx), align ? { alignItems: align } : {})}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: align ?? "center", ...backgroundCss(p.style, scaleOf(p.canvas)) }}>
        {children}
      </div>
    </div>
  );
};

/** opacity/transform of a token from animated values (null = at rest) */
export function motionCss(v: { o?: number; x?: number; y?: number; s?: number; r?: number; blur?: number }, origin?: string): React.CSSProperties {
  const tf: string[] = [];
  if (v.x && Math.abs(v.x) > 0.01) tf.push(`translateX(${v.x.toFixed(2)}px)`);
  if (v.y && Math.abs(v.y) > 0.01) tf.push(`translateY(${v.y.toFixed(2)}px)`);
  if (v.r && Math.abs(v.r) > 0.01) tf.push(`rotate(${v.r.toFixed(2)}deg)`);
  if (v.s !== undefined && Math.abs(v.s - 1) > 0.0005) tf.push(`scale(${v.s.toFixed(4)})`);
  const out: React.CSSProperties = {};
  if (tf.length) {
    out.transform = tf.join(" ");
    if (origin) out.transformOrigin = origin;
  }
  if (v.o !== undefined && v.o < 0.999) out.opacity = Math.max(0, Math.min(1, v.o));
  if (v.blur && v.blur > 0.15) out.filter = `blur(${v.blur.toFixed(2)}px)`;
  return out;
}

/** merge a token's own filter (drop-shadows) with a motion blur */
export const withFilter = (css: React.CSSProperties, filter?: string): React.CSSProperties =>
  filter ? { ...css, filter: css.filter ? `${filter} ${css.filter as string}` : filter } : css;

/** the alphanumeric length of a word */
export const alnumLen = (t: string) => t.replace(/[^\p{L}\p{N}]/gu, "").length;

/** one placed word */
export interface Tok {
  key: string;
  text: string;
  face: Face;
  paint: Paint;
  /** space after this token, px */
  gap: number;
  /** word index on the card (-1 = none) */
  i: number;
  css?: React.CSSProperties;
}
export interface Row {
  toks: Tok[];
  justify?: "flex-start" | "center" | "flex-end";
  items?: "baseline" | "flex-end" | "center" | "flex-start";
  /** margin-top, px (scaled with the fit) */
  mt?: number;
  /** horizontal offset, px (scaled with the fit) */
  dx?: number;
  /** left indent, px (takes space; scaled with the fit) */
  ml?: number;
  z?: number;
}

export const rowWidth = (r: Row, measure: MeasureFn) =>
  r.toks.reduce((a, t, j) => a + textW(measure, t.text, t.face) + (j < r.toks.length - 1 ? t.gap : 0), 0) + Math.abs(r.dx ?? 0) + (r.ml ?? 0);

/** scale every row by one factor so the widest fits `maxW` */
export function fitRows(rows: Row[], measure: MeasureFn, maxW: number): { rows: Row[]; f: number } {
  const f = fitK(rows.map((r) => rowWidth(r, measure)), maxW);
  if (f === 1) return { rows, f };
  return {
    f,
    rows: rows.map((r) => ({ ...r, mt: r.mt !== undefined ? r.mt * f : undefined, dx: r.dx !== undefined ? r.dx * f : undefined, ml: r.ml !== undefined ? r.ml * f : undefined, toks: r.toks.map((t) => ({ ...t, face: scaleFace(t.face, f), gap: t.gap * f })) })),
  };
}

/** rows stacked in a column that is as wide as its widest row */
export const RowsView: React.FC<{ rows: Row[]; css?: React.CSSProperties }> = ({ rows, css }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", ...css }}>
    {rows.map((r, ri) =>
      r.toks.length ? (
        <div
          key={ri}
          style={{
            position: "relative", display: "flex", whiteSpace: "pre", justifyContent: r.justify ?? "center", alignItems: r.items ?? "baseline",
            marginTop: r.mt, marginLeft: r.ml, zIndex: r.z, transform: r.dx ? `translateX(${r.dx.toFixed(2)}px)` : undefined,
          }}
        >
          {r.toks.map((t, j) => (
            <Ink key={t.key} text={t.text} face={t.face} paint={t.paint} css={{ ...t.css, marginRight: j < r.toks.length - 1 ? t.gap : undefined }} />
          ))}
        </div>
      ) : null,
    )}
  </div>
);
