import React from "react";
import type { CaptionStyleV2, Word } from "@capseasy/shared";
import { withAlpha } from "@motion-ai/caption-engine/core";
import { activeEffect, combineMotion, effectiveIntensity, entranceStyle, exitStyle, progress, showAt, SPRINGS, springMs, staggerUnit } from "../motion";
import { fitSize } from "../measure";
import { backgroundCss, baseTextCss, containerCss, displayText, famCss, firstColor, layoutBox, lineWidth, scaleOf, wordGapCss } from "../text";
import type { PageRenderProps } from "../types";
import { WordSpan, staggerPlan } from "./WordSpan";

/** Font size that makes the widest line (separately-boxed words + gaps) fit the caption box. */
function fitLines(
  p: PageRenderProps, lines: string[][], sizeScale = 1, widthFor?: (boxWidth: number, sc: number) => number,
  effect?: CaptionStyleV2["active"]["effect"] | null,
) {
  const { style, canvas, measure } = p;
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, p.page.position);
  const base = style.fontSize * sc * sizeScale;
  const widest = Math.max(1, ...lines.map((t) => lineWidth(t, base, style, sc, measure, effect)));
  const avail = widthFor ? widthFor(box.width, sc) : box.width;
  return { sc, box, size: widest > avail ? base * (avail / widest) : base };
}

const justifyOf = (a: string) => (a === "left" ? "flex-start" : a === "right" ? "flex-end" : "center");

/** Every word visible; spoken words take the highlight colour, the current word fills left to right. */
export const KaraokeLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, canvas, settled } = p;
  const texts = page.lines.map((l) => l.map((w) => displayText(w, style)));
  const { sc, box, size } = fitLines(p, texts, 1, undefined, "fill-sweep");
  const intensity = effectiveIntensity(style, page.emotion);
  const baseCss = baseTextCss(style, sc, size);
  const stagger = staggerPlan(style, page, texts);
  return (
    <div style={containerCss(box, style.rotation)}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: justifyOf(style.align), rowGap: (style.lineHeight - 1) * size * 0.5, ...backgroundCss(style, sc), ...combineMotion(staggerUnit(style) === "none" ? entranceStyle(style, timeMs - page.startMs, canvas.fps, intensity, settled, size) : {}, exitStyle(style, page.endMs - timeMs, settled, size)) }}>
        {page.lines.map((line, li) => (
          <div key={li} style={{ display: "flex", whiteSpace: "pre", justifyContent: justifyOf(style.align) }}>
            {line.map((w, wi) => (
              <WordSpan key={w.id} word={w} display={texts[li]![wi]!} timeMs={timeMs} style={style} canvas={canvas} intensity={intensity} baseCss={baseCss} trailingSpace={wi < line.length - 1} settled={settled} reveal="all" effect="fill-sweep" pastColor={style.active.color} stagger={stagger?.(w.id)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

/** Characters are typed out as each word is spoken, with a blinking block cursor. */
export const TypewriterLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, canvas } = p;
  const texts = page.lines.map((l) => l.map((w) => displayText(w, style)));
  const { sc, box, size } = fitLines(p, texts, 1, undefined, null);
  const typed = (w: Word, text: string) => {
    const at = showAt(w);
    if (timeMs < at) return "";
    const span = Math.max(60, Math.min(w.endMs - w.startMs, text.length * 45));
    return text.slice(0, Math.ceil(text.length * Math.min(1, (timeMs - at) / span)));
  };
  // deterministic blink (frame math, not a timer): on for 500 ms, off for 500 ms
  const cursorOn = Math.floor(timeMs / 500) % 2 === 0;
  let cursorPlaced = false;
  const lastTypingLine = page.lines.findLastIndex((l) => l.some((w) => timeMs >= showAt(w)));
  const gap = wordGapCss(style, sc, null);
  return (
    <div style={containerCss(box, style.rotation)}>
      <div style={{ ...baseTextCss(style, sc, size), display: "flex", flexDirection: "column", alignItems: justifyOf(style.align), ...backgroundCss(style, sc), ...exitStyle(style, page.endMs - timeMs, false, size) }}>
        {page.lines.map((line, li) => {
          const parts = line.map((w, wi) => typed(w, texts[li]![wi]!)).filter(Boolean);
          const withCursor = !cursorPlaced && li === Math.max(0, lastTypingLine);
          if (withCursor) cursorPlaced = true;
          return (
            <div key={li} style={{ display: "flex", whiteSpace: "pre", minHeight: `${style.lineHeight}em` }}>
              {parts.map((t, i) => <span key={i} style={{ marginRight: i < parts.length - 1 ? gap : undefined }}>{t}</span>)}
              {withCursor ? <span style={{ opacity: cursorOn ? 1 : 0, color: style.active.color, WebkitTextFillColor: style.active.color }}>▌</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Classic subtitle: full-width translucent bar, two lines, no motion. Readable, broadcast/SDH style. */
export const BarLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, canvas, settled } = p;
  const texts = page.lines.map((l) => l.map((w) => displayText(w, style)));
  const b = style.background;
  const { sc, size } = fitLines(p, texts, 1, (_w, s) => canvas.width * style.maxWidth - 2 * b.padding * s);
  const pos = page.position ?? style.position;
  const intensity = effectiveIntensity(style, page.emotion);
  const baseCss = baseTextCss(style, sc, size);
  const stagger = staggerPlan(style, page, texts);
  return (
    <div style={{ position: "absolute", left: pos.x * canvas.width, top: pos.y * canvas.height, width: canvas.width, transform: `translate(-50%, -50%)${style.rotation ? ` rotate(${style.rotation}deg)` : ""}`, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          // entrance/exit animate the bar itself; the outer box keeps the centring transform
          ...combineMotion(
            staggerUnit(style) === "none" ? entranceStyle(style, timeMs - page.startMs, canvas.fps, intensity, settled, size) : {},
            exitStyle(style, page.endMs - timeMs, settled, size),
          ),
          width: `${style.maxWidth * 100}%`,
          boxSizing: "border-box",
          backgroundColor: withAlpha(b.color, b.opacity),
          padding: `${b.padding * sc * 0.6}px ${b.padding * sc}px`,
          borderRadius: b.radius * sc,
          borderLeft: style.templateOptions.accentStrip ? `${6 * sc}px solid ${style.active.color}` : undefined,
          display: "flex",
          flexDirection: "column",
          alignItems: justifyOf(style.align),
          rowGap: (style.lineHeight - 1) * size * 0.5,
        }}
      >
        {page.lines.map((line, li) => (
          <div key={li} style={{ display: "flex", whiteSpace: "pre" }}>
            {line.map((w, wi) => (
              <WordSpan key={w.id} word={w} display={texts[li]![wi]!} timeMs={timeMs} style={style} canvas={canvas} intensity={intensity} baseCss={baseCss} trailingSpace={wi < line.length - 1} settled={settled} reveal="all" stagger={stagger?.(w.id)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

/** Chat bubble with a tail; alternates sides per card (deterministic from the card id). */
export const BubbleLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, canvas, settled } = p;
  const texts = page.lines.map((l) => l.map((w) => displayText(w, style)));
  // text must fit INSIDE the bubble: 88% of the block minus the horizontal padding
  const { sc, box, size } = fitLines(p, texts, 0.92, (w, s) => w * 0.88 - 2 * style.background.padding * s * 1.1 - 4 * s);
  const intensity = effectiveIntensity(style, page.emotion);
  const side = [...page.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 2 === 0 ? "right" : "left";
  const pop = settled ? 1 : springMs(timeMs, page.startMs, canvas.fps, SPRINGS.bouncy);
  // motion intensity (and the card's emotion) sets how far the bubble springs from
  const from = Math.max(0, 1 - 0.4 * Math.min(2, intensity));
  const bg = style.background.color;
  const pad = style.background.padding * sc;
  const baseCss = baseTextCss(style, sc, size);
  return (
    <div style={containerCss(box, style.rotation)}>
      <div style={{ alignSelf: side === "right" ? "flex-end" : "flex-start", maxWidth: "88%", position: "relative", transformOrigin: side === "right" ? "bottom right" : "bottom left", ...combineMotion({ transform: `scale(${from + pop * (1 - from)})`, opacity: Math.min(1, pop * 1.5) }, exitStyle(style, page.endMs - timeMs, settled, style.fontSize * sc)) }}>
        <div style={{ backgroundColor: withAlpha(bg, style.background.opacity), borderRadius: style.background.radius * sc, padding: `${pad * 0.7}px ${pad * 1.1}px`, textAlign: "left", boxShadow: `0 ${6 * sc}px ${18 * sc}px rgba(0,0,0,0.25)`, display: "flex", flexDirection: "column", rowGap: (style.lineHeight - 1) * size * 0.5 }}>
          {page.lines.map((line, li) => (
            <div key={li} style={{ display: "flex", whiteSpace: "pre" }}>
              {line.map((w, wi) => (
                <WordSpan key={w.id} word={w} display={texts[li]![wi]!} timeMs={timeMs} style={style} canvas={canvas} intensity={intensity} baseCss={baseCss} trailingSpace={wi < line.length - 1} settled={settled} reveal="all" />
              ))}
            </div>
          ))}
        </div>
        <div style={{ position: "absolute", bottom: -6 * sc, [side]: 18 * sc, width: 22 * sc, height: 22 * sc, backgroundColor: withAlpha(bg, style.background.opacity), transform: "rotate(45deg)", borderRadius: 4 * sc, zIndex: -1 }} />
      </div>
    </div>
  );
};

/** Every word visible; a marker stroke swipes behind the spoken word and stays behind the hero word. */
export const HighlighterLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, canvas, settled } = p;
  const texts = page.lines.map((l) => l.map((w) => displayText(w, style)));
  const { sc, box, size } = fitLines(p, texts, 1, undefined, "marker");
  const intensity = effectiveIntensity(style, page.emotion);
  const hero = page.words[page.heroIndex];
  const markerStyle = { ...style, active: { ...style.active, effect: "marker" as const } };
  const gap = wordGapCss(style, sc, "marker");
  return (
    <div style={containerCss(box, style.rotation)}>
      <div style={{ ...baseTextCss(style, sc, size), display: "flex", flexDirection: "column", alignItems: justifyOf(style.align), rowGap: (style.lineHeight - 1) * size * 0.5, ...backgroundCss(style, sc), ...combineMotion(entranceStyle(style, timeMs - page.startMs, canvas.fps, intensity, settled, size), exitStyle(style, page.endMs - timeMs, settled, size)) }}>
        {page.lines.map((line, li) => (
          <div key={li} style={{ display: "flex", whiteSpace: "pre" }}>
            {line.map((w, wi) => {
              const keep = w.id === hero?.id || w.emphasis === "strong" || w.emphasis === "hero";
              const marked = timeMs >= w.startMs && (keep || timeMs < w.endMs);
              const fx = marked ? activeEffect(markerStyle, { startMs: w.startMs, endMs: w.endMs }, timeMs, canvas.fps, sc, intensity, settled) : null;
              return (
                <span key={w.id} style={{ position: "relative", display: "inline-block", zIndex: 0, marginRight: wi < line.length - 1 ? gap : undefined, opacity: timeMs >= w.startMs ? 1 : style.inactiveOpacity }}>
                  {fx?.behind ? <span style={{ position: "absolute", pointerEvents: "none", ...fx.behind.css }} /> : null}
                  {texts[li]![wi]}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

/** Kinetic typography: words stack in short lines, the hero word huge and tilted, each popping in on its beat. */
export const KineticLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, canvas, measure, settled } = p;
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const hero = page.words[page.heroIndex];
  const intensity = effectiveIntensity(style, page.emotion);
  const rows: Word[][] = [];
  for (const w of page.words) {
    const last = rows[rows.length - 1];
    if (w.id === hero?.id || !last || last.length >= 2 || last.some((x) => x.id === hero?.id)) rows.push([w]);
    else last.push(w);
  }
  const heroFont = style.hero.fontId ?? style.fontId;
  // how small a row starts before it springs in follows "Effect strength" x motion intensity (x emotion)
  const from = Math.max(0.15, 1 - Math.max(0, style.active.scale - 1) * 2.5 * Math.min(2, intensity));
  return (
    <div style={containerCss(box, style.rotation)}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", rowGap: (style.lineHeight - 1) * style.fontSize * sc * 0.5, ...backgroundCss(style, sc), ...exitStyle(style, page.endMs - timeMs, settled, style.fontSize * sc) }}>
        {rows.map((row, ri) => {
          const isHero = row[0]?.id === hero?.id;
          const texts = row.map((w) => displayText(w, style, isHero ? "upper" : style.casing));
          const font = isHero ? heroFont : style.fontId;
          const rowStyle = { ...style, fontId: font, fontWeight: isHero ? (style.hero.fontWeight ?? 900) : style.fontWeight };
          const target = style.fontSize * sc * (isHero ? style.hero.scale * 1.2 : 0.9);
          const w = lineWidth(texts, target, rowStyle, sc, measure, null);
          const size = w > box.width ? Math.max(10, target * (box.width / w)) : target;
          const start = isHero ? page.startMs : showAt(row[0]!);
          const pop = settled ? 1 : springMs(timeMs, start, canvas.fps, SPRINGS.punch);
          const visible = settled || timeMs >= start;
          const tilt = (isHero ? (style.hero.rotate || -5) : ri % 2 ? 2 : -2) * Math.min(2, intensity);
          const scale = settled ? 1 : from + (1 - from) * pop;
          const gap = wordGapCss(rowStyle, sc, null);
          return (
            <div
              key={ri}
              style={{
                ...baseTextCss(rowStyle, sc, size),
                display: "flex",
                whiteSpace: "pre",
                lineHeight: 1,
                opacity: visible ? 1 : 0,
                transform: `rotate(${tilt}deg) scale(${scale})`,
                ...(isHero ? { color: style.active.color, WebkitTextFillColor: style.active.color, backgroundImage: "none" } : {}),
              }}
            >
              {texts.map((t, i) => <span key={i} style={{ marginRight: i < texts.length - 1 ? gap : undefined }}>{t}</span>)}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Exposed for the emoji burst: where the caption block sits and how big its text is. */
export const blockAnchor = (p: PageRenderProps) => {
  const sc = scaleOf(p.canvas);
  const box = layoutBox(p.style, p.canvas, p.page.position);
  return { x: box.cx, y: box.cy, size: p.style.fontSize * sc, color: firstColor(p.style.fill), progress };
};

export { fitSize, famCss };
