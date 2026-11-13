/** Paper layouts: die-cut sticker, torn-paper cutout, ransom-note letters (static and stop-motion). */
import React from "react";
import type { CaptionStyleV2, Word } from "@capseasy/shared";
import { combineMotion, effectiveIntensity, entranceStyle, exitStyle, staggerUnit } from "../motion";
import { backgroundCss, baseTextCss, containerCss, displayText, famCss, fillCss, layoutBox, lineWidth, scaleOf } from "../text";
import type { PageRenderProps } from "../types";
import { WordSpan, staggerPlan } from "../layouts/WordSpan";
import { EASE, fillColor, hash, keyWordIndex, keyframes, linear01, rand, ringShadow } from "./kit";
import { dropFilter, fitScale, glowLayers, luminance, optStr, px, rowWidth, specOf, strokeOf } from "./graphic-common";

const stack: React.CSSProperties = { gridArea: "1 / 1" };

// ---------------------------------------------------------------- die-cut sticker

/**
 * Marker-hatch texture: stripes of the fill and the fill darkened to 82 % at -14deg (0.055 em / 0.09 em). The exporter
 * can't repeat gradients, so the stripes are spelled out as hard stops of one linear-gradient across the word.
 */
function hatch(widthPx: number, heightPx: number, sizePx: number): string {
  const a = (-14 * Math.PI) / 180;
  const len = Math.abs(widthPx * Math.sin(a)) + Math.abs(heightPx * Math.cos(a));
  const period = 0.09 * sizePx;
  const on = 0.055 * sizePx;
  const n = Math.min(160, Math.ceil(len / period) + 1);
  const pc = (v: number) => `${((v / len) * 100).toFixed(3)}%`;
  const dark = "rgba(0,0,0,0.18)";
  const clear = "rgba(0,0,0,0)";
  const stops: string[] = [];
  for (let i = 0; i < n; i++) {
    const s = i * period;
    stops.push(`${clear} ${pc(s)}`, `${clear} ${pc(s + on)}`, `${dark} ${pc(s + on)}`, `${dark} ${pc(s + period)}`);
  }
  return `linear-gradient(-14deg, ${stops.join(", ")})`;
}

const StickerWord: React.FC<{
  text: string; size: number; fontId: string; fontWeight: number; fill: CaptionStyleV2["fill"]; style: CaptionStyleV2; sc: number;
  widthPx: number; motion: React.CSSProperties; paper: string; shade: string;
}> = ({ text, size, fontId, fontWeight, fill, style, sc, widthPx, motion, paper, shade }) => {
  const r = 0.165 * size;
  const keyline = style.stroke.enabled && style.stroke.width > 0 ? ringShadow(0.07 * size * (style.stroke.width / 4), style.stroke.color, 18) : [];
  const layers = [...keyline, ...ringShadow(r, paper, 28), ...ringShadow(r, shade, 28, 0.06 * size, 0.105 * size), ...glowLayers(style, sc)];
  const font: React.CSSProperties = { fontFamily: famCss(fontId), fontWeight, fontSize: size, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing * sc, whiteSpace: "pre" };
  const lineH = size * style.lineHeight;
  return (
    <span style={{ display: "inline-grid", ...motion }}>
      {/* paper, keyline and shadow rings around a solid fill (text-shadow needs an opaque glyph to cast from) */}
      <span style={{ ...stack, ...font, color: fillColor(fill), textShadow: layers.join(", ") }}>{text}</span>
      {fill.type === "gradient" ? <span style={{ ...stack, ...font, ...fillCss(fill) }}>{text}</span> : null}
      <span style={{ ...stack, ...font, backgroundImage: hatch(widthPx, lineH, size), WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent" } as React.CSSProperties}>{text}</span>
    </span>
  );
};

/** stickerPop: scale 0.4, Y 0.18 em, rotate -6deg -> 1.08 at 70 % -> 1; 0.42 s back-out per segment */
function stickerPop(timeMs: number, start: number, k: number, size: number, settled?: boolean): React.CSSProperties {
  if (settled) return {};
  if (timeMs < start) return { opacity: 0 };
  const t = linear01(timeMs, start, 420);
  if (t >= 1) return {};
  const s = keyframes(t, [[0, 1 - 0.6 * k], [0.7, 1 + 0.08 * k], [1, 1]], EASE.backOut);
  const y = keyframes(t, [[0, 0.18 * size * k], [0.7, 0], [1, 0]], EASE.backOut);
  const rot = keyframes(t, [[0, -6 * k], [0.7, 0], [1, 0]], EASE.backOut);
  return { opacity: Math.min(1, t / 0.3), transform: `translateY(${px(y)}) rotate(${rot.toFixed(2)}deg) scale(${Math.max(0, s).toFixed(4)})` };
}

/** Key word big and UPPERCASE, the other words small and lowercase above (before it) and below (after it). */
export const StickerLayout: React.FC<PageRenderProps> = ({ page, timeMs, style, canvas, measure, settled }) => {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const k = effectiveIntensity(style, page.emotion);
  const key = keyWordIndex(page);
  const heroFont = style.hero.fontId ?? style.fontId;
  const heroWeight = style.hero.fontWeight ?? style.fontWeight;
  const texts = page.words.map((w, i) => displayText(w, style, i === key ? style.hero.casing ?? "upper" : style.casing));
  const small0 = style.fontSize * sc;
  const hero0 = small0 * style.hero.scale;
  const smallSpec = specOf(style, sc);
  const heroSpec = specOf(style, sc, { fontId: heroFont, fontWeight: heroWeight });
  const gap = (s: number) => 0.3 * s + style.wordSpacing * sc;
  const above = texts.slice(0, key);
  const below = texts.slice(key + 1);
  const ring = (s: number) => 2 * 0.2 * s;
  const widest = Math.max(
    measure(texts[key]!, { ...heroSpec, fontSize: hero0 }) + ring(hero0),
    rowWidth(above, small0, smallSpec, measure, gap(small0)) + ring(small0),
    rowWidth(below, small0, smallSpec, measure, gap(small0)) + ring(small0),
  );
  const f = fitScale(widest, box.width);
  const small = small0 * f;
  const hero = hero0 * f;
  const paper = optStr(style, "paper", "#f7f4ec");
  const shade = optStr(style, "shadow", "#141414");
  const word = (i: number) => {
    const isHero = i === key;
    const size = isHero ? hero : small;
    const w: Word = page.words[i]!;
    const fill: CaptionStyleV2["fill"] = w.color ? { type: "solid", color: w.color } : isHero ? (style.hero.fill ?? { type: "solid", color: style.active.color }) : style.fill;
    const widthPx = measure(texts[i]!, { ...(isHero ? heroSpec : smallSpec), fontSize: size });
    return (
      <StickerWord key={w.id} text={texts[i]!} size={size} fontId={isHero ? heroFont : style.fontId} fontWeight={isHero ? heroWeight : style.fontWeight} fill={fill}
        style={style} sc={sc} widthPx={widthPx} paper={paper} shade={shade} motion={stickerPop(timeMs, page.startMs + i * 80, k, size, settled)} />
    );
  };
  const row = (from: number, to: number, size: number) =>
    to > from ? (
      <div style={{ display: "flex", flexWrap: "nowrap", justifyContent: "center", columnGap: gap(size) }}>
        {Array.from({ length: to - from }, (_, j) => word(from + j))}
      </div>
    ) : null;
  return (
    <div style={containerCss(box, style.rotation)}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", filter: dropFilter({ ...style, glow: { ...style.glow, enabled: false } }, sc), ...backgroundCss(style, sc), ...exitStyle(style, page.endMs - timeMs, settled, hero) }}>
        {row(0, key, small)}
        {row(key, key + 1, hero)}
        {row(key + 1, page.words.length, small)}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- torn paper

/**
 * Heavy ink on a thick torn warm-paper cutout: the paper is 51 ring copies of the words (15 at 0.275 em plus 36 at
 * 0.22 em, so the edge is ragged), drawn as a second copy of the line underneath, so the ink can take any fill.
 * Words enter with the regular entrance controls (this style's transitions aren't locked).
 */
export const TornPaperLayout: React.FC<PageRenderProps> = ({ page, timeMs, style, canvas, measure, settled }) => {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const intensity = effectiveIntensity(style, page.emotion);
  const lines = page.lines.map((l) => l.map((w) => displayText(w, style)));
  const base = style.fontSize * sc;
  const widest = Math.max(1, ...lines.map((t) => lineWidth(t, base, style, sc, measure)));
  const avail = box.width - 2 * 0.275 * base;
  const size = widest > avail ? base * (avail / widest) : base;
  const paper = optStr(style, "paper", "#f4efe2");
  const backStyle: CaptionStyleV2 = {
    ...style, fill: { type: "solid", color: paper }, stroke: { ...style.stroke, enabled: false }, shadows: [], glow: { ...style.glow, enabled: false },
    active: { ...style.active, color: paper, boxColor: paper },
  };
  const rings = [...ringShadow(0.275 * size, paper, 15), ...ringShadow(0.22 * size, paper, 36)].join(", ");
  const frontCss = baseTextCss(style, sc, size);
  const backCss = { ...baseTextCss(backStyle, sc, size), textShadow: rings };
  const stagger = staggerPlan(style, page, lines);
  const copy = (back: boolean) => (
    <div aria-hidden={back || undefined} style={{ ...stack, display: "flex", flexDirection: "column", alignItems: "center", rowGap: (style.lineHeight - 1) * size * 0.5 }}>
      {page.lines.map((line, li) => (
        <div key={li} style={{ display: "flex", flexWrap: "nowrap", justifyContent: "center", whiteSpace: "pre" }}>
          {line.map((w, wi) => (
            <WordSpan key={w.id} word={back ? { ...w, color: undefined } : w} display={lines[li]![wi]!} timeMs={timeMs} style={back ? backStyle : style} canvas={canvas} intensity={intensity}
              baseCss={back ? backCss : frontCss} trailingSpace={wi < line.length - 1} settled={settled} reveal="all" stagger={stagger?.(w.id)} />
          ))}
        </div>
      ))}
    </div>
  );
  return (
    <div style={containerCss(box, style.rotation)}>
      <div style={{
        display: "grid", filter: `drop-shadow(0 ${px(0.07 * size)} ${px(0.05 * size)} rgba(0,0,0,0.30))`,
        ...backgroundCss(style, sc),
        ...combineMotion(staggerUnit(style) === "none" ? entranceStyle(style, timeMs - page.startMs, canvas.fps, intensity, settled, size) : {}, exitStyle(style, page.endMs - timeMs, settled, size)),
      }}>
        {copy(true)}
        {copy(false)}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- ransom note

/** the 14 magazine faces (the style's own font takes the first slot) */
export const RANSOM_FONTS = ["Anton", "Archivo Black", "Bebas Neue", "Alfa Slab One", "Bangers", "Passion One", "Righteous", "Playfair Display", "Luckiest Guy", "Permanent Marker", "Fontdiner Swanky", "Passero One", "Galindo", "Oswald"];
const RANSOM_WEIGHT: Record<string, number> = { Oswald: 700, "Playfair Display": 900 };
const PAPERS = ["#FFFFFF", "#F4ECD8", "#E8DCC4", "#1A1A1A", "#C21807", "#D32F2F", "#E65100", "#F57C00", "#1565C0", "#512DA8", "#2E7D32", "#FBC02D", "#6D4C41", "#E0E0E0"];
/** dark inks for light papers: mostly near-black, sometimes navy, maroon or forest */
const DARK_INKS = ["#1A237E", "#7B1F1F", "#1B5E20"];

interface Cut { font: string; weight: number; paper: string; ink: string; rot: number; scale: number; ph: number; pv: number; clip: string }

function cutFor(seed: number, baseFont: string): Cut {
  const r = (i: number) => rand(seed, i);
  // the style's own font takes slot 0 of the 14 (it gets a second ticket so a font change always shows on the card)
  const fi = Math.min(14, Math.floor(r(0) * 15));
  const font = fi === 0 || fi === 14 ? baseFont : RANSOM_FONTS[fi]!;
  const paper = PAPERS[Math.min(13, Math.floor(r(1) * 14))]!;
  const light = luminance(paper) > 0.4;
  const ink = light ? (r(2) < 0.25 ? DARK_INKS[Math.min(2, Math.floor(r(3) * 3))]! : "#111111") : "#FFFFFF";
  const j = (i: number) => (r(10 + i) * 4).toFixed(2);
  return {
    font, weight: RANSOM_WEIGHT[font] ?? 400, paper, ink,
    rot: (r(4) * 2 - 1) * 8, scale: 0.86 + r(5) * 0.3, ph: 0.12 + r(6) * 0.18, pv: 0.04 + r(7) * 0.09,
    // a torn polygon: every corner nudged in by 0-4 %
    clip: `polygon(${j(0)}% ${j(1)}%, ${(100 - +j(2)).toFixed(2)}% ${j(3)}%, ${(100 - +j(4)).toFixed(2)}% ${(100 - +j(5)).toFixed(2)}%, ${j(6)}% ${(100 - +j(7)).toFixed(2)}%)`,
  };
}

/** ransomPop: scale 0.3, rotate -12deg -> 1.14 / 3deg at 70 % -> 1 / 0; 0.34 s back-out */
function ransomPop(timeMs: number, start: number, k: number, settled?: boolean): { css: React.CSSProperties; scale: number; rot: number } {
  if (settled) return { css: {}, scale: 1, rot: 0 };
  if (timeMs < start) return { css: { opacity: 0 }, scale: 1 - 0.7 * k, rot: -12 * k };
  const t = linear01(timeMs, start, 340);
  const scale = keyframes(t, [[0, 1 - 0.7 * k], [0.7, 1 + 0.14 * k], [1, 1]], EASE.backOut);
  const rot = keyframes(t, [[0, -12 * k], [0.7, 3 * k], [1, 0]], EASE.backOut);
  return { css: { opacity: Math.min(1, t / 0.2) }, scale: Math.max(0, scale), rot };
}

/** Every letter a magazine cut-out. `live`: each letter re-randomises 5 times a second (1 s step cycle). */
export const RansomLayout: React.FC<PageRenderProps> = ({ page, timeMs, style, canvas, measure, settled }) => {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const k = effectiveIntensity(style, page.emotion);
  const live = style.templateOptions.ransomLive === true;
  const variants = live ? 5 : 1;
  const base0 = style.fontSize * sc;
  const all = page.words;
  const wordCuts = all.map((w) => [...displayText(w, style)].map((ch, ci) => Array.from({ length: variants }, (_, v) => cutFor(hash(`${w.id}|${ci}|${ch}|${v}`), style.fontId))));
  const letterGap = (s: number) => 0.04 * s + style.letterSpacing * sc;
  const wordGap = (s: number) => 0.45 * s + style.wordSpacing * sc;
  const cellW = (ch: string, vs: Cut[], s: number) => Math.max(...vs.map((c) => measure(ch, { fontFamily: famCss(c.font), fontWeight: c.weight, fontSize: s }) + 2 * c.ph * s));
  const wordW = all.map((w, i) => { const t = [...displayText(w, style)]; return t.reduce((b, ch, ci) => b + cellW(ch, wordCuts[i]![ci]!, base0), 0) + Math.max(0, t.length - 1) * letterGap(base0); });
  // big chunky letters: wrap the card by words onto balanced lines first, then shrink only what still doesn't fit
  const avail = box.width - 0.3 * base0;
  const span = (a: number, b: number) => wordW.slice(a, b).reduce((x, y) => x + y, 0) + Math.max(0, b - a - 1) * wordGap(base0);
  const split = (n: number): number[] => {
    // contiguous partition of the words into n lines minimising the widest line (tiny n and m: exhaustive DP)
    const m = all.length;
    const best: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity));
    const cut: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
    best[0]![0] = 0;
    for (let k = 1; k <= n; k++) for (let j = k; j <= m; j++) for (let i = k - 1; i < j; i++) {
      const v = Math.max(best[k - 1]![i]!, span(i, j));
      if (v < best[k]![j]!) { best[k]![j] = v; cut[k]![j] = i; }
    }
    const ends: number[] = [];
    for (let k = n, j = m; k > 0; k--) { ends.unshift(j); j = cut[k]![j]!; }
    return ends;
  };
  // up to 3 balanced lines; if even 3 lines are too wide, the 3-line layout shrinks to fit
  let ends = [all.length];
  for (let n = 1; n <= Math.min(3, all.length); n++) {
    ends = split(n);
    if (Math.max(...ends.map((e, i) => span(i ? ends[i - 1]! : 0, e))) <= avail) break;
  }
  const rows = ends.map((e, i) => all.slice(i ? ends[i - 1]! : 0, e));
  const rowStart = ends.map((_, i) => (i ? ends[i - 1]! : 0));
  const texts = rows.map((l) => l.map((w) => displayText(w, style)));
  const cuts = rows.map((l, li) => l.map((_, wi) => wordCuts[rowStart[li]! + wi]!));
  const widest = Math.max(1, ...ends.map((e, i) => span(rowStart[i]!, e)));
  const size = base0 * fitScale(widest, avail);
  const total = texts.flat().reduce((a, t) => a + [...t].length, 0);
  // letters pop one after another: the whole card is in by 0.95 s (1.0 s for the live one)
  const step = Math.min(30, ((live ? 1000 : 950) - 340) / Math.max(1, total - 1));
  const filter = dropFilter(style, sc);
  let n = 0;
  return (
    <div style={containerCss(box, style.rotation)}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", rowGap: (style.lineHeight - 1) * size * 0.5 + 0.12 * size, ...backgroundCss(style, sc), ...exitStyle(style, page.endMs - timeMs, settled, size) }}>
        {rows.map((line, li) => (
          <div key={li} style={{ display: "flex", flexWrap: "nowrap", justifyContent: "center", columnGap: wordGap(size) }}>
            {line.map((w, wi) => (
              <div key={w.id} style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", columnGap: letterGap(size), filter }}>
                {[...texts[li]![wi]!].map((ch, ci) => {
                  const start = page.startMs + n++ * step;
                  const pop = ransomPop(timeMs, start, k, settled);
                  // the live cut-outs flip to their next variant every 200 ms (5 per 1 s cycle), in step with their entrance
                  const shown = live ? Math.floor((((Math.max(0, timeMs - start) % 1000) + 1000) % 1000) / 200) : 0;
                  return (
                    <span key={ci} style={{ display: "inline-grid", placeItems: "center", ...pop.css }}>
                      {cuts[li]![wi]![ci]!.map((c, v) => (
                        <span key={v} style={{
                          ...stack, display: "inline-block", opacity: v === shown ? 1 : 0, backgroundColor: c.paper, color: c.ink, fontFamily: famCss(c.font), fontWeight: c.weight,
                          fontSize: size, lineHeight: 1, whiteSpace: "pre", padding: `${(c.pv * size).toFixed(2)}px ${(c.ph * size).toFixed(2)}px`, clipPath: c.clip,
                          transform: `rotate(${(c.rot + pop.rot).toFixed(2)}deg) scale(${(c.scale * pop.scale).toFixed(4)})`, ...strokeOf(style, sc),
                        }}>{ch}</span>
                      ))}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
