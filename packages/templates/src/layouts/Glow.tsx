import React from "react";
import type { CaptionStyleV2, Word } from "@capseasy/shared";
import { shadowColorOf } from "@capseasy/shared";
import { applyCasing, darken, lighten, withAlpha } from "@motion-ai/caption-engine/core";
import { combineMotion, effectiveIntensity, exitStyle, progress, showAt, SPRINGS, springMs } from "../motion";
import { containerCss, displayText, famCss, layoutBox, scaleOf } from "../text";
import type { MeasureFn, PageRenderProps } from "../types";

/*
 * "Lit from within" captions. Every word is a stack of copies of its own text, never a blend mode (the in-browser
 * exporter paints the DOM itself and supports filters, gradient-clipped text and shadows, not blending):
 *   1. wide bloom   - glow colour, heavy blur
 *   2. tight bloom  - glow colour, light blur (the hot edge)
 *   3. shadow       - the look's drop shadows, under the glyphs
 *   4. body         - a light-to-deep gradient INSIDE the letters (+ outline)
 *   5. glare        - white fading down from the cap height, plus a moving sheen while the word is spoken
 * Blur is applied per layer (not on a parent) so the exported video matches the preview frame for frame.
 */

type Fill = CaptionStyleV2["fill"];

export const clipTextCss = (backgroundImage: string): React.CSSProperties =>
  ({ backgroundImage, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent" }) as React.CSSProperties;

/** The gradient inside the glyphs: lighter at the top, the colour itself mid-way, deeper at the baseline. */
export function innerFill(fill: Fill, depth: number): string {
  if (fill.type === "gradient") return `linear-gradient(${fill.angle}deg, ${fill.stops.map((s) => `${s.color} ${Math.round(s.at * 100)}%`).join(", ")})`;
  return `linear-gradient(180deg, ${lighten(fill.color, 0.38)} 0%, ${fill.color} 55%, ${darken(fill.color, depth)} 100%)`;
}

const deepOf = (fill: Fill, depth: number) => darken(fill.type === "solid" ? fill.color : fill.stops[fill.stops.length - 1]!.color, depth);

export interface GlowLook {
  fill: Fill;
  /** 0..1 how much darker the bottom of the letters gets */
  depth: number;
  glow: { enabled: boolean; color: string; radius: number; intensity: number };
  stroke: { enabled: boolean; width: number; color: string };
  /** css text-shadow drawn under the glyphs (already scaled) */
  shadow?: string;
  /** strength of the white glare at the top of the letters (0 = none) */
  glare: number;
}

interface GlowTextProps {
  text: string;
  font: React.CSSProperties;
  look: GlowLook;
  sc: number;
  /** 0..1 extra glow while the word is spoken */
  boost?: number;
  /** colour of the extra glow (the highlight colour) */
  boostColor?: string;
  /** -0.3..1.3 position of the light sweep across the word, null = no sweep */
  sheen?: number | null;
  /** entrance / exit blur in px, applied to every layer */
  blur?: number;
  /** outer wrapper style (transform, opacity, margins) */
  wrap?: React.CSSProperties;
  children?: React.ReactNode;
}

const ABS: React.CSSProperties = { position: "absolute", left: 0, top: 0, whiteSpace: "pre", pointerEvents: "none" };
const blurF = (px: number) => (px > 0.15 ? `blur(${px.toFixed(2)}px)` : undefined);

export const GlowText: React.FC<GlowTextProps> = ({ text, font, look, sc, boost = 0, boostColor, sheen = null, blur = 0, wrap, children }) => {
  const g = look.glow;
  const r = g.radius * sc;
  const glowColor = boost > 0 && boostColor ? boostColor : g.color;
  const hot = 1 + boost * 0.9;
  const layers: string[] = [];
  if (sheen !== null) {
    const p = sheen * 100;
    layers.push(`linear-gradient(105deg, rgba(255,255,255,0) ${(p - 16).toFixed(1)}%, rgba(255,255,255,0.85) ${p.toFixed(1)}%, rgba(255,255,255,0) ${(p + 16).toFixed(1)}%)`);
  }
  if (look.glare > 0) layers.push(`linear-gradient(180deg, rgba(255,255,255,${look.glare.toFixed(3)}) 0%, rgba(255,255,255,0) 46%)`);
  return (
    <span style={{ position: "relative", display: "inline-block", whiteSpace: "pre", ...font, ...wrap }}>
      {g.enabled && g.intensity > 0 ? (
        <>
          <span aria-hidden style={{ ...ABS, color: glowColor, opacity: Math.min(1, 0.55 * g.intensity * hot), filter: blurF(r * 2.6 + blur) }}>{text}</span>
          <span aria-hidden style={{ ...ABS, color: glowColor, opacity: Math.min(1, 0.8 * g.intensity * hot), filter: blurF(r * 1.1 + blur) }}>{text}</span>
          <span aria-hidden style={{ ...ABS, color: glowColor, opacity: Math.min(1, 0.9 * g.intensity * hot), filter: blurF(r * 0.32 + blur) }}>{text}</span>
        </>
      ) : null}
      {look.shadow ? <span aria-hidden style={{ ...ABS, color: deepOf(look.fill, look.depth), textShadow: look.shadow, filter: blurF(blur) }}>{text}</span> : null}
      <span
        style={{
          position: "relative", whiteSpace: "pre", ...clipTextCss(innerFill(look.fill, look.depth)), filter: blurF(blur),
          ...(look.stroke.enabled && look.stroke.width > 0 ? ({ WebkitTextStroke: `${look.stroke.width * sc}px ${look.stroke.color}`, paintOrder: "stroke fill" } as React.CSSProperties) : {}),
        }}
      >
        {text}
      </span>
      {layers.length ? <span aria-hidden style={{ ...ABS, ...clipTextCss(layers.join(", ")), filter: blurF(blur) }}>{text}</span> : null}
      {children}
    </span>
  );
};

/** Look of the caption's main text, from the style. */
export function bodyLook(style: CaptionStyleV2, sc: number): GlowLook {
  return {
    fill: style.fill,
    depth: typeof style.templateOptions.depth === "number" ? (style.templateOptions.depth as number) : 0.35,
    glow: style.glow,
    stroke: style.stroke,
    shadow: style.shadows.length ? style.shadows.map((s) => `${s.x * sc}px ${s.y * sc}px ${s.blur * sc}px ${shadowColorOf(s)}`).join(", ") : undefined,
    glare: typeof style.templateOptions.glare === "number" ? (style.templateOptions.glare as number) : 0.35,
  };
}

/** Look of the accent text (the hero word / second tier): its own fill and outline, a soft dark lift, a faint glow. */
export function accentLook(style: CaptionStyleV2, sc: number): GlowLook {
  const fill = style.hero.fill ?? { type: "solid" as const, color: "#FFFFFF" };
  const lift = typeof style.templateOptions.accentShadow === "number" ? (style.templateOptions.accentShadow as number) : 0.55;
  return {
    fill,
    depth: typeof style.templateOptions.accentDepth === "number" ? (style.templateOptions.accentDepth as number) : 0.12,
    glow: { ...style.glow, color: fill.type === "solid" ? fill.color : fill.stops[0]!.color, intensity: style.glow.intensity * 0.45 },
    stroke: style.hero.stroke ?? { enabled: false, width: 0, color: "#000000" },
    shadow: lift > 0 ? `0 ${3 * sc}px ${18 * sc}px ${withAlpha("#000000", lift)}` : undefined,
    glare: 0.2,
  };
}

/** Word entrance: rises out of a blur, slightly larger, tracking in. Pure function of time. */
export function riseIn(localMs: number, intensity: number, sizePx: number, settled?: boolean, durationMs = 560) {
  const p = settled ? 1 : progress(localMs, durationMs);
  const k = intensity;
  return {
    p,
    blur: (1 - p) * 11 * k * (sizePx / 60),
    opacity: Math.min(1, p * 1.7),
    transform: `translateY(${((1 - p) * 0.42 * k * sizePx).toFixed(2)}px) scale(${(1 + (1 - p) * 0.08 * k).toFixed(4)})`,
    tracking: (1 - p) * 0.07 * k * sizePx,
  };
}

/** How strongly a word glows extra while it is being spoken (springs in, eases back once said). */
export function boostOf(w: Word, timeMs: number, fps: number, settled?: boolean): number {
  if (settled || timeMs < w.startMs) return 0;
  if (timeMs < w.endMs) return springMs(timeMs, w.startMs, fps, SPRINGS.smooth);
  return Math.max(0, 1 - (timeMs - w.endMs) / 260);
}

const sheenOf = (w: Word, timeMs: number) => {
  if (timeMs < w.startMs || timeMs > w.endMs + 120) return null;
  return -0.3 + 1.6 * Math.min(1, (timeMs - w.startMs) / Math.max(240, w.endMs - w.startMs + 120));
};

interface Piece {
  word: Word;
  text: string;
  accent: boolean;
}

function fontCss(style: CaptionStyleV2, accent: boolean, sizePx: number, sc: number): React.CSSProperties {
  return {
    fontFamily: famCss(accent ? style.hero.fontId ?? style.fontId : style.fontId),
    fontWeight: accent ? style.hero.fontWeight ?? style.fontWeight : style.fontWeight,
    fontStyle: accent ? (style.templateOptions.accentItalic === false ? "normal" : "italic") : style.fontStyle,
    fontSize: sizePx,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing * sc,
  };
}

const pieceText = (w: Word, style: CaptionStyleV2, accent: boolean) => {
  const raw = displayText(w, style, "none");
  return applyCasing(raw, accent ? style.hero.casing ?? (style.casing === "upper" ? "lower" : style.casing) : style.casing);
};

function rowWidth(pieces: Piece[], style: CaptionStyleV2, size: number, accentSize: number, sc: number, measure: MeasureFn): number {
  let w = 0;
  pieces.forEach((pc, i) => {
    const s = pc.accent ? accentSize : size;
    const f = fontCss(style, pc.accent, s, sc);
    w += measure(pc.text, { fontFamily: f.fontFamily as string, fontWeight: f.fontWeight as number, fontStyle: f.fontStyle as string, fontSize: s, letterSpacing: style.letterSpacing * sc });
    if (i < pieces.length - 1) w += gapPx(style, s, sc);
  });
  return w;
}

const gapPx = (style: CaptionStyleV2, size: number, sc: number) => size * 0.27 + style.wordSpacing * sc + (style.stroke.enabled ? style.stroke.width * sc : 0);

interface WordProps {
  piece: Piece;
  style: CaptionStyleV2;
  look: GlowLook;
  size: number;
  sc: number;
  timeMs: number;
  fps: number;
  intensity: number;
  settled?: boolean;
  last: boolean;
  /** ms before the word's start that it begins to rise (anticipation) */
  lead?: number;
  /** when the word appears (default: its scheduled reveal) */
  at?: number;
}

const GlowWord: React.FC<WordProps> = ({ piece, style, look, size, sc, timeMs, fps, intensity, settled, last, lead = 70, at }) => {
  const w = piece.word;
  const from = (at ?? showAt(w)) - lead;
  const font = fontCss(style, piece.accent, size, sc);
  const gap = last ? 0 : gapPx(style, size, sc);
  // before it is spoken the word keeps its place (invisible) so the line never shifts as words arrive
  if (!settled && timeMs < from) return <span style={{ display: "inline-block", whiteSpace: "pre", opacity: 0, marginRight: gap, ...font }}>{piece.text}</span>;
  const enter = riseIn(timeMs - from, intensity, size, settled);
  const rot = piece.accent && style.hero.rotate ? ` rotate(${style.hero.rotate}deg)` : "";
  // letters track in from wider spacing; the extra width is taken back from the margins so neighbours stay put
  const spread = enter.tracking * [...piece.text].length;
  return (
    <GlowText
      text={piece.text}
      font={{ ...font, letterSpacing: style.letterSpacing * sc + enter.tracking }}
      look={look}
      sc={sc}
      boost={boostOf(w, timeMs, fps, settled) * Math.min(1.5, intensity)}
      boostColor={style.active.color}
      sheen={settled ? null : sheenOf(w, timeMs)}
      blur={enter.blur}
      wrap={{ opacity: enter.opacity, transform: `${enter.transform}${rot}`, marginLeft: -spread / 2, marginRight: gap - spread / 2, zIndex: piece.accent ? 2 : 1 }}
    />
  );
};

/** Soft halo behind the block (a blurred ellipse, not a radial gradient, so exports match). */
const Halo: React.FC<{ width: number; height: number; color: string; strength: number; sc: number }> = ({ width, height, color, strength, sc }) => (
  <div
    aria-hidden
    style={{
      position: "absolute", left: "50%", top: "50%", width, height, transform: "translate(-50%, -50%)", borderRadius: "50%",
      backgroundColor: withAlpha(color, 0.13 * strength), filter: `blur(${(70 * sc).toFixed(1)}px)`, pointerEvents: "none",
    }}
  />
);

/** Lines of glowing words; the key word can switch to the accent face (italic serif) at its own scale. */
export const GlowFlowLayout: React.FC<PageRenderProps> = ({ page, timeMs, style, canvas, measure, settled }) => {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const intensity = effectiveIntensity(style, page.emotion);
  const accentHero = style.templateOptions.accentHero === true;
  const heroId = page.words[Math.min(page.heroIndex, page.words.length - 1)]?.id;
  const lines: Piece[][] = page.lines.map((l) => l.map((w) => {
    const accent = accentHero && w.id === heroId;
    return { word: w, accent, text: pieceText(w, style, accent) };
  }));
  const base = style.fontSize * sc;
  const accentScale = accentHero ? style.hero.scale : 1;
  const widest = Math.max(1, ...lines.map((l) => rowWidth(l, style, base, base * accentScale, sc, measure)));
  const size = widest > box.width ? base * (box.width / widest) : base;
  const body = bodyLook(style, sc);
  const accent = accentLook(style, sc);
  const halo = typeof style.templateOptions.halo === "number" ? (style.templateOptions.halo as number) : 0;
  const haloIn = settled ? 1 : progress(timeMs - page.startMs, 700);

  return (
    <div style={combineMotion(containerCss(box, style.rotation), exitStyle(style, page.endMs - timeMs, settled, style.fontSize * sc))}>
      {halo > 0 ? <Halo width={Math.min(box.width, widest * (size / base)) * 0.95} height={size * (lines.length + 2) * style.lineHeight} color={style.glow.color} strength={halo * haloIn} sc={sc} /> : null}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", rowGap: (style.lineHeight - 1) * size * 0.6 }}>
        {lines.map((l, li) => (
          <div key={li} style={{ display: "flex", alignItems: "baseline", justifyContent: "center", whiteSpace: "pre" }}>
            {l.map((pc, i) => (
              <GlowWord key={pc.word.id} piece={pc} style={style} look={pc.accent ? accent : body} size={pc.accent ? size * accentScale : size} sc={sc} timeMs={timeMs} fps={canvas.fps} intensity={intensity} settled={settled} last={i === l.length - 1} at={pc.accent ? page.startMs : undefined} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Two tiers that overlap: glowing caps (the main font) and an italic accent line (the key word's font).
 * "caps-first": caps up to the key word, accent from it ("THIS IS THE NEXT / big thing").
 * "accent-first": accent before the key word, caps from it ("forget / STATUS").
 */
export const GlowDuoLayout: React.FC<PageRenderProps> = ({ page, timeMs, style, canvas, measure, settled }) => {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const intensity = effectiveIntensity(style, page.emotion);
  const words = page.words;
  const accentFirst = style.templateOptions.duoOrder === "accent-first";
  const hero = Math.min(page.heroIndex, words.length - 1);
  let split = hero;
  if (split <= 0 || split >= words.length) split = accentFirst ? 1 : Math.max(1, Math.ceil(words.length * 0.6));
  if (words.length === 1) split = accentFirst ? 0 : 1;
  const a = words.slice(0, split);
  const b = words.slice(split);
  const capsWords = accentFirst ? b : a;
  const accentWords = accentFirst ? a : b;
  const caps: Piece[] = capsWords.map((w) => ({ word: w, accent: false, text: pieceText(w, style, false) }));
  const acc: Piece[] = accentWords.map((w) => ({ word: w, accent: true, text: pieceText(w, style, true) }));

  const base = style.fontSize * sc;
  const fit = (pieces: Piece[], size: number, accent: boolean) => {
    if (!pieces.length) return size;
    const w = rowWidth(pieces, style, accent ? 0 : size, accent ? size : 0, sc, measure);
    return w > box.width ? size * (box.width / w) : size;
  };
  const capsSize = fit(caps, base, false);
  const accSize = fit(acc, base * style.hero.scale, true);
  const overlap = (typeof style.templateOptions.overlap === "number" ? (style.templateOptions.overlap as number) : 0.32) * Math.min(capsSize, accSize);

  const row = (pieces: Piece[], size: number, look: GlowLook, key: string, z: number, mt: number) =>
    pieces.length ? (
      <div key={key} style={{ position: "relative", zIndex: z, display: "flex", alignItems: "baseline", justifyContent: "center", whiteSpace: "pre", marginTop: mt, lineHeight: style.lineHeight }}>
        {pieces.map((pc, i) => (
          <GlowWord key={pc.word.id} piece={pc} style={style} look={look} size={size} sc={sc} timeMs={timeMs} fps={canvas.fps} intensity={intensity} settled={settled} last={i === pieces.length - 1} at={pc.word.id === words[hero]?.id ? page.startMs : undefined} />
        ))}
      </div>
    ) : null;

  const capsRow = (mt: number) => row(caps, capsSize, bodyLook(style, sc), "caps", 1, mt);
  const accRow = (mt: number) => row(acc, accSize, accentLook(style, sc), "accent", 2, mt);
  return (
    <div style={combineMotion(containerCss(box, style.rotation), exitStyle(style, page.endMs - timeMs, settled, style.fontSize * sc))}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {accentFirst ? [accRow(0), capsRow(-overlap)] : [capsRow(0), accRow(-overlap)]}
      </div>
    </div>
  );
};

/**
 * The key word becomes a giant glowing backdrop behind the rest of the line ("SECOND" behind "the quick fox").
 * It lands with a slow cinematic settle (tracking in, blur clearing) when it is spoken.
 */
export const GlowBehindLayout: React.FC<PageRenderProps> = ({ page, timeMs, style, canvas, measure, settled }) => {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const intensity = effectiveIntensity(style, page.emotion);
  const words = page.words;
  const heroIdx = Math.min(page.heroIndex, words.length - 1);
  const heroWord = words[heroIdx]!;
  const others = words.filter((_, i) => i !== heroIdx);
  const heroText = applyCasing(displayText(heroWord, style, "none"), style.hero.casing ?? "upper");

  const heroFont = fontCss(style, true, 10, sc);
  const heroItalic = style.templateOptions.accentItalic === true ? "italic" : "normal";
  const heroSpec = { fontFamily: heroFont.fontFamily as string, fontWeight: heroFont.fontWeight as number, fontStyle: heroItalic, letterSpacing: style.letterSpacing * sc };
  const heroBase = style.fontSize * style.hero.scale * sc;
  const heroW = measure(heroText, { ...heroSpec, fontSize: heroBase });
  const heroSize = heroW > box.width * 1.02 ? heroBase * ((box.width * 1.02) / heroW) : heroBase;

  const small: Piece[] = others.map((w) => ({ word: w, accent: false, text: pieceText(w, style, false) }));
  const smallBase = style.fontSize * sc;
  const sw = rowWidth(small, style, smallBase, smallBase, sc, measure);
  const smallSize = sw > box.width ? smallBase * (box.width / sw) : smallBase;

  // the giant word lands with the card, alongside the line in front of it
  const local = timeMs - page.startMs;
  const land = settled ? 1 : progress(local, 900);
  const pre = settled ? 1 : progress(timeMs - page.startMs, 600);
  const spoken = settled || timeMs >= page.startMs;
  const k = intensity;
  const heroOpacity = spoken ? 0.35 + 0.65 * land : 0.22 * pre;
  const heroScale = spoken ? 1 + (1 - land) * 0.16 * k : 1.16 + (1 - pre) * 0.06;
  const heroBlur = spoken ? (1 - land) * 16 * k * sc : 14 * sc;
  const heroTracking = (spoken ? 1 - land : 1) * 0.12 * heroSize;
  const heroLook: GlowLook = { ...bodyLook(style, sc), fill: style.hero.fill ?? style.fill, stroke: style.hero.stroke ?? { enabled: false, width: 0, color: "#000000" } };

  return (
    <div style={combineMotion(containerCss(box, style.rotation), exitStyle(style, page.endMs - timeMs, settled, style.fontSize * sc))}>
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: heroSize * 1.02 }}>
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%, -50%) scale(${heroScale.toFixed(4)})`, opacity: heroOpacity, whiteSpace: "pre" }}>
          <GlowText
            text={heroText}
            font={{ ...heroFont, fontStyle: heroItalic, fontSize: heroSize, lineHeight: 1, letterSpacing: style.letterSpacing * sc + heroTracking }}
            look={heroLook}
            sc={sc}
            boost={boostOf(heroWord, timeMs, canvas.fps, settled)}
            boostColor={style.active.color}
            sheen={settled ? null : sheenOf(heroWord, timeMs)}
            blur={heroBlur}
          />
        </div>
        <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "baseline", justifyContent: "center", whiteSpace: "pre", transform: `translateY(${(heroSize * 0.08).toFixed(2)}px)` }}>
          {small.map((pc, i) => (
            <GlowWord key={pc.word.id} piece={pc} style={style} look={accentLook({ ...style, hero: { ...style.hero, fill: style.fill } }, sc)} size={smallSize} sc={sc} timeMs={timeMs} fps={canvas.fps} intensity={intensity} settled={settled} last={i === small.length - 1} />
          ))}
        </div>
      </div>
    </div>
  );
};
