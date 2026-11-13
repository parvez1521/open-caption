/**
 * Word-plate layouts: every word sits on a plate of its own, and the card's key word gets a bigger plate in another
 * colour, in line with the rest.
 *  - PlateTickerLayout (VEED "Ticker"): heavy italic caps, left-aligned, square red plates with a hard black offset
 *    box; the key word is 1.37x, black on a yellow plate, and pops 0.8 -> 1.
 *  - SandTilesLayout (VEED "Sticker"): rounded sand tiles with plum text rising in; the key word is white italic
 *    serif at 1.2x on a lavender tile.
 */
import React from "react";
import type { CaptionStyleV2, Page, Word } from "@capseasy/shared";
import { effectiveIntensity, exitStyle, showAt } from "../motion";
import { backgroundCss, containerCss, displayText, layoutBox, scaleOf } from "../text";
import type { MeasureFn, PageRenderProps } from "../types";
import { glowLayers, optNum, optStr, px, specOf } from "./graphic-common";
import { EASES, boxShadowOf, keyIndex, riseIn, runCss, seg, solidOf, wordFill } from "./plates-kit";

interface PlateSpec {
  /** plate colour, text fill, font and size for this word */
  plate: string;
  fill: CaptionStyleV2["fill"];
  fontId: string;
  fontWeight: number;
  fontStyle: string;
  size: number;
  letterSpacing: number;
}

interface FlowOpts {
  page: Page;
  style: CaptionStyleV2;
  sc: number;
  measure: MeasureFn;
  boxWidth: number;
  /** plate side padding and corner radius, in em of the word's own size */
  padX: number;
  /** italic faces lean right: extra side padding (share of padX), twice as much on the left */
  lean: number;
  radius: number;
  /** plate height in em (the text line box) */
  plateHeight: number;
  /** gap between plates and between rows, in em of the body size */
  gapEm: number;
  rowGapEm: number;
  keyAt: number;
  spec: (i: number, base: number) => PlateSpec;
  motion: (w: Word, i: number, s: PlateSpec, base: number) => React.CSSProperties;
  justify: string;
  /** shrink when the widest plate is wider than this share of the wrap width */
  fill: number;
}

/** the plates, wrapped into rows like the source's text box; shrinks the whole card if a single plate can't fit */
function PlateFlow(o: FlowOpts & { timeMs: number; settled?: boolean }): React.ReactElement {
  const { page, style, sc, measure } = o;
  const base0 = style.fontSize * sc;
  const texts = page.words.map((w, i) => displayText(w, style, i === o.keyAt ? style.hero.casing ?? style.casing : style.casing));
  const plateW = (i: number, base: number) => {
    const s = o.spec(i, base);
    return measure(texts[i]!, { ...specOf(style, sc, { fontId: s.fontId, fontWeight: s.fontWeight, fontStyle: s.fontStyle }), letterSpacing: s.letterSpacing, fontSize: s.size }) + o.padX * (2 + 3 * o.lean) * s.size;
  };
  const widest = Math.max(1, ...page.words.map((_, i) => plateW(i, base0)));
  const avail = o.boxWidth * o.fill;
  const base = widest > avail ? base0 * (avail / widest) : base0;
  const shadowMul = (size: number) => size / base0;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: o.justify, alignItems: "center", columnGap: o.gapEm * base + style.wordSpacing * sc, rowGap: o.rowGapEm * base, width: "100%" }}>
      {page.words.map((w, i) => {
        const s = o.spec(i, base);
        return (
          <span key={w.id} style={{ display: "inline-block", ...o.motion(w, i, s, base) }}>
            <span style={{
              display: "block", backgroundColor: s.plate, padding: `0 ${px(o.padX * (1 + o.lean) * s.size)} 0 ${px(o.padX * (1 + 2 * o.lean) * s.size)}`, borderRadius: o.radius * s.size,
              boxShadow: boxShadowOf(style, sc, shadowMul(s.size)),
            }}>
              <span style={{ display: "block", ...runCss(style, sc, s.size, { fontId: s.fontId, fontWeight: s.fontWeight, fontStyle: s.fontStyle, fill: s.fill, letterSpacing: s.letterSpacing, lineHeight: o.plateHeight, decorate: true }), textShadow: textGlow(style, sc) }}>{texts[i]}</span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** on a plate the style's shadows belong to the plate (box-shadow); the letters keep only the glow */
const textGlow = (style: CaptionStyleV2, sc: number) => glowLayers(style, sc).join(", ") || undefined;

// ---------------------------------------------------------------------------------------------- ticker (red plates)

/** key word stamp: scale 0.8 -> 1 from start-40 ms to start+170 ms (source curve .34,1.3,.64,1), alpha 0 -> 1 by start+50 ms */
function tickerStamp(timeMs: number, startMs: number, k: number, settled?: boolean): React.CSSProperties {
  if (settled) return {};
  const p = seg(timeMs, startMs, -40, 170, EASES.tickerPop);
  const a = seg(timeMs, startMs, -40, 50, EASES.quadOut);
  if (p >= 1 && a >= 1) return {};
  return { opacity: a, transform: `scale(${(1 - 0.2 * k * (1 - p)).toFixed(4)})` };
}

export const PlateTickerLayout: React.FC<PageRenderProps> = ({ page, timeMs, style, canvas, measure, settled }) => {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const k = effectiveIntensity(style, page.emotion);
  const key = keyIndex(page);
  const red = optStr(style, "plate", "#FF1F0F");
  const ink = solidOf(style.hero.fill, "#0A0A0A");
  const justify = style.align === "right" ? "flex-end" : style.align === "center" ? "center" : "flex-start";
  const spec = (i: number, base: number): PlateSpec => {
    const isKey = i === key;
    const size = isKey ? base * style.hero.scale : base;
    return {
      plate: isKey ? style.active.color : red,
      fill: wordFill(page.words[i]!, isKey ? { type: "solid", color: ink } : style.fill),
      fontId: isKey ? style.hero.fontId ?? style.fontId : style.fontId,
      fontWeight: isKey ? style.hero.fontWeight ?? style.fontWeight : style.fontWeight,
      fontStyle: style.fontStyle,
      size,
      // the key word is set a little tighter (-0.025 em against the body's tracking)
      letterSpacing: isKey ? -0.025 * size : style.letterSpacing * sc * (size / base),
    };
  };
  const base = style.fontSize * sc;
  return (
    <div style={containerCss(box, style.rotation)}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: justify, width: "100%", ...backgroundCss(style, sc), ...exitStyle(style, page.endMs - timeMs, settled, base) }}>
        <PlateFlow
          page={page} style={style} sc={sc} measure={measure} boxWidth={box.width} timeMs={timeMs} settled={settled}
          padX={0.26} lean={style.fontStyle === "italic" ? 0.12 : 0} radius={0} plateHeight={style.lineHeight} gapEm={0.12} rowGapEm={0} keyAt={key} spec={spec} justify={justify} fill={0.88}
          // body plates rise 0.24 em with their word and fade in, start-30 ms to start+100 ms
          motion={(w, i, s) => (i === key ? tickerStamp(timeMs, showAt(w), k, settled) : riseIn(timeMs, showAt(w), -30, 100, 0.24, s.size, k, EASES.tickerRise, settled))}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------- sand tiles

export const SandTilesLayout: React.FC<PageRenderProps> = ({ page, timeMs, style, canvas, measure, settled }) => {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const k = effectiveIntensity(style, page.emotion);
  const key = keyIndex(page);
  const sand = optStr(style, "plate", "#FFF4E1");
  const ink = solidOf(style.hero.fill, "#FFFFFF");
  const tile = optNum(style, "tileHeight", 1.32);
  const spec = (i: number, base: number): PlateSpec => {
    const isKey = i === key;
    const size = isKey ? base * style.hero.scale : base;
    return {
      plate: isKey ? style.active.color : sand,
      fill: wordFill(page.words[i]!, isKey ? { type: "solid", color: ink } : style.fill),
      fontId: isKey ? style.hero.fontId ?? style.fontId : style.fontId,
      fontWeight: isKey ? style.hero.fontWeight ?? style.fontWeight : style.fontWeight,
      fontStyle: isKey && style.templateOptions.heroItalic !== false ? "italic" : style.fontStyle,
      size,
      letterSpacing: style.letterSpacing * sc * (size / base),
    };
  };
  const base = style.fontSize * sc;
  return (
    <div style={containerCss(box, style.rotation)}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", ...backgroundCss(style, sc), ...exitStyle(style, page.endMs - timeMs, settled, base) }}>
        <PlateFlow
          page={page} style={style} sc={sc} measure={measure} boxWidth={box.width} timeMs={timeMs} settled={settled}
          padX={0.3} lean={0} radius={0.26} plateHeight={tile} gapEm={0.16} rowGapEm={Math.max(0, style.lineHeight - tile)} keyAt={key} spec={spec} justify="center" fill={1}
          // every tile rises 0.35 em with its word and fades in, start-80 ms to start+160 ms (expoOut)
          motion={(w, _i, _s, b) => riseIn(timeMs, showAt(w), -80, 160, 0.35, b, k, EASES.expoOut, settled)}
        />
      </div>
    </div>
  );
};
