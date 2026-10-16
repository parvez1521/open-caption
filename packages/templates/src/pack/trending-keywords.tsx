/**
 * Trending layouts built on plain lines of words: three-colour keywords with a dark halo, gold bevel caps, and the
 * light line that turns bold while it is spoken. Motion values are the catalogue's (30 fps frames → ms), scaled by
 * the motion intensity (1 at the defaults on a neutral card).
 */
import React from "react";
import type { CaptionStyleV2 } from "@capseasy/shared";
import { backgroundCss, displayText, strokeCss } from "../text";
import type { PageRenderProps } from "../types";
import { EASE, bezier, shade } from "./kit";
import { Row, cellsOf, fitCells, gapPx, justifyOf, restFill, solid, typeCss } from "./lines-engine";
import {
  FRAME, TFrame, clamp01, fr, glowAt, joinLayers, keywordOffset, keywords, lerp, linesOf, opt, shadowsAt, showOpacity,
} from "./trending-kit";

const marginAfter = (style: CaptionStyleV2, sc: number, size: number, last: boolean) => (last ? 0 : gapPx(style, sc, size));

// ============================================================ three-colour keywords (soft dark halo, no box)

/** row-scale-in-drift: 0.9 → 1 over twice the card's length, then a slow 1 → 1.04 creep over 30 frames */
const DRIFT_IN = bezier(0, -0.01, 0.08, 0.87);
const DRIFT_CREEP = bezier(0.36, 0.34, 0.99, 1);

/**
 * Heavy caps, words appearing as they are spoken (1 frame), soft five-layer dark halo instead of a box. About one word
 * in three is a keyword painted in one of three colours (highlight colour, then `accents`), the palette cycling from
 * keyword to keyword through the video. The card scales in from 0.9 and keeps creeping.
 */
export const TriKeywordsLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, settled } = p;
  const cells = cellsOf(page, style, linesOf(page));
  const fit = fitCells(p, cells);
  const { sc, size, intensity: k } = fit;
  const ratio = size / (style.fontSize * sc);
  const palette = [style.active.color, ...opt<string[]>(style, "accents", ["#FDFA14", "#F01916"])];
  const kw = keywords(page, 3);
  const off = keywordOffset(page, 3);
  const colorOf = new Map(kw.map((i, j) => [i, palette[(off + j) % palette.length]!]));

  const local = timeMs - page.startMs;
  const span = 2 * Math.max(FRAME, page.endMs - page.startMs);
  const s = settled ? 1 : local < span ? lerp(0.9, 1, DRIFT_IN(clamp01(local / span))) : lerp(1, 1.04, DRIFT_CREEP(clamp01((local - span) / fr(30))));
  const scale = 1 + (s - 1) * k;
  const shadow = joinLayers([...shadowsAt(style, sc, ratio), ...glowAt(style, sc)]);

  return (
    <TFrame p={p} box={fit.box} size={size} align={justifyOf(style.align)} inner={backgroundCss(style, sc)} motion={{ transform: `scale(${scale.toFixed(4)})` }}>
      {cells.map((line, li) => (
        <Row key={li} style={style}>
          {line.map((c, wi) => {
            const col = colorOf.get(c.i);
            return (
              <span
                key={c.w.id}
                style={{
                  ...typeCss(style, sc, size), ...(col && !c.w.color ? solid(col) : restFill(c.w, style)), ...strokeCss(style.stroke, sc), textShadow: shadow,
                  opacity: showOpacity(c.w, timeMs, FRAME, EASE.linear, settled), marginRight: marginAfter(style, sc, size, wi === line.length - 1),
                }}
              >
                {c.text}
              </span>
            );
          })}
        </Row>
      ))}
    </TFrame>
  );
};

// ============================================================ gold bevel caps

/** row-slide-up-zoom-out: rises 5 px (at the 130.5 px design size) in 3 frames, then settles 1 → 0.98 over twice the card */
const BEVEL_SETTLE = bezier(0.1, 0.01, 0, 1.14);
const RISE_EM = 5 / 130.5;

/** the bevel fill: the colour, its bottom 10–30 % mixed 20 % toward black */
const bevelFill = (c: string) => `linear-gradient(0deg, ${shade(c, -0.2)} 10%, ${c} 30%, ${c} 100%)`;
const userGradient = (fill: CaptionStyleV2["fill"]) =>
  fill.type === "gradient" ? `linear-gradient(${fill.angle}deg, ${fill.stops.map((s) => `${s.color} ${Math.round(s.at * 100)}%`).join(", ")})` : null;

/**
 * Big condensed caps with a shaded gold fill (a vertical gradient darkening the bottom), a hairline outline and a
 * bevel-like shadow stack: tight dark drops, a 1 px white edge, a dark halo and a bloom in the fill colour. Keywords
 * take the highlight colour with the same bevel. A line holding a single word is set at 1.4×. The card rises a few
 * px in 3 frames, then settles to 0.98.
 */
export const GoldBevelLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, settled } = p;
  const lines = linesOf(page);
  const cells = cellsOf(page, style, lines).map((line) => (line.length === 1 ? line.map((c) => ({ ...c, mult: 1.4 })) : line));
  const fit = fitCells(p, cells);
  const { sc, size, intensity: k } = fit;
  const kw = new Set(keywords(page, 3));

  const local = timeMs - page.startMs;
  const span = 2 * Math.max(FRAME, page.endMs - page.startMs);
  const rise = settled ? 0 : 1 - clamp01(local / fr(3));
  const s = settled ? 0.98 : lerp(1, 0.98, BEVEL_SETTLE(clamp01((local - fr(3)) / span)));
  const motion = { transform: `translateY(${(rise * RISE_EM * size * k).toFixed(2)}px) scale(${(1 + (s - 1) * k).toFixed(4)})` };

  return (
    <TFrame p={p} box={fit.box} size={size} align={justifyOf(style.align)} inner={backgroundCss(style, sc)} motion={motion}>
      {cells.map((line, li) => (
        <Row key={li} style={style}>
          {line.map((c, wi) => {
            const px = size * c.mult;
            const ratio = px / (style.fontSize * sc);
            const color = c.w.color ?? (kw.has(c.i) ? style.active.color : style.fill.type === "solid" ? style.fill.color : style.fill.stops[0]!.color);
            const gradient = !c.w.color && !kw.has(c.i) ? userGradient(style.fill) ?? bevelFill(color) : bevelFill(color);
            const em = (v: number) => (v * px).toFixed(2);
            const styleShadows = shadowsAt(style, sc, ratio);
            const under = joinLayers([
              ...styleShadows.slice(0, 2), `0 ${em(0.00766)}px 0 #FFFFFF`, ...styleShadows.slice(2),
              `0 0 ${em(0.12261)}px ${color}`, `0 0 ${em(0.0613)}px ${color}`, ...glowAt(style, sc),
            ]);
            const type = typeCss(style, sc, px);
            return (
              <span key={c.w.id} style={{ ...type, opacity: showOpacity(c.w, timeMs, FRAME, EASE.linear, settled), marginRight: marginAfter(style, sc, size, wi === line.length - 1) }}>
                <span aria-hidden style={{ position: "absolute", left: 0, top: 0, whiteSpace: "pre", color, textShadow: under }}>{c.text}</span>
                <span style={{ position: "relative", whiteSpace: "pre", backgroundImage: gradient, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", ...strokeCss(style.stroke, sc) } as React.CSSProperties}>{c.text}</span>
              </span>
            );
          })}
        </Row>
      ))}
    </TFrame>
  );
};

// ============================================================ light line, bold while spoken

/** row-slide-up-fade-in (20 px at the 67.5 px design size, 4 frames); the one-word keyword card rises 90 px over 10 frames */
const IMAN_EASE = bezier(0.07, 0, 0, 1);
const ROW_RISE_EM = 20 / 67.5;
const SOLO_RISE_EM = 90 / 67.5;

/**
 * Light-weight sentence-case lines; the line being spoken jumps to bold (a straight weight swap, as in the original:
 * lines are measured at the bold weight so nothing overflows when it happens). Key words the creator marks are bold
 * italic at the hero size in the highlight colour. The card slides up 0.3 em and fades in over 4 frames; a one-word
 * card is an italic keyword that rises 1.33 em over 10 frames.
 */
export const LightBoldLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, settled } = p;
  const bold = opt<number>(style, "boldWeight", 700);
  const solo = page.words.length === 1;
  const isKey = (i: number) => solo || page.words[i]!.emphasis === "hero" || page.words[i]!.emphasis === "strong";
  const heroFont = (italic: boolean) => ({ fontId: style.hero.fontId ?? style.fontId, fontWeight: style.hero.fontWeight ?? bold, fontStyle: (italic ? "italic" : "normal") as "italic" | "normal" });
  const lines = linesOf(page, true); // always two lines: the weight jump moves line to line
  // measured at the bold weight: the widest the line ever gets
  const cells = cellsOf(page, style, lines, (w, i) => (isKey(i) ? { mult: style.hero.scale, font: heroFont(true), text: displayText(w, style, style.hero.casing ?? style.casing) } : { font: { fontWeight: Math.max(bold, style.fontWeight) } }));
  const fit = fitCells(p, cells);
  const { sc, size, intensity: k } = fit;
  const ratio = size / (style.fontSize * sc);
  const shadow = joinLayers([...shadowsAt(style, sc, ratio), ...glowAt(style, sc)]);

  const local = timeMs - page.startMs;
  const rise = settled ? 0 : 1 - IMAN_EASE(clamp01(local / fr(solo ? 10 : 4)));
  const fade = settled ? 1 : clamp01(local / fr(4));
  const motion = { transform: `translateY(${(rise * (solo ? SOLO_RISE_EM : ROW_RISE_EM) * size * k).toFixed(2)}px)`, opacity: fade };

  const lineSpan = (li: number) => ({ start: lines[li]![0]!.startMs, end: lines[li]![lines[li]!.length - 1]!.endMs });

  return (
    <TFrame p={p} box={fit.box} size={size} align={justifyOf(style.align)} inner={backgroundCss(style, sc)} motion={motion}>
      {cells.map((line, li) => {
        const { start, end } = lineSpan(li);
        const spoken = timeMs >= start && timeMs < end;
        return (
          <Row key={li} style={style}>
            {line.map((c, wi) => {
              const key = isKey(c.i);
              // key words stay bold italic; the one-word card is italic and swaps weight like any line
              const font = key ? (solo ? { ...heroFont(true), fontWeight: spoken ? bold : style.fontWeight } : heroFont(true)) : { fontWeight: spoken ? bold : style.fontWeight };
              return (
                <span
                  key={c.w.id}
                  style={{
                    ...typeCss(style, sc, size * c.mult, font), ...(key && !solo && !c.w.color ? solid(style.active.color) : restFill(c.w, style)), ...strokeCss(style.stroke, sc), textShadow: shadow,
                    opacity: showOpacity(c.w, timeMs, FRAME, EASE.linear, settled), marginRight: marginAfter(style, sc, size, wi === line.length - 1),
                  }}
                >
                  {c.text}
                </span>
              );
            })}
          </Row>
        );
      })}
    </TFrame>
  );
};
