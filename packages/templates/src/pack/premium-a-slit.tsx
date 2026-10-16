/**
 * "Light Slit Reveal": each line is uncovered by a moving mask edge (clip-path inset) with a slit of light riding
 * the edge: a hot white core, a tinted inner glow and a wide soft bloom (stacked gradient strips, blurred), tapered
 * at both ends. The letters the edge has just passed burn brighter and cool down behind it, and the text drifts a
 * fraction of an em with the light (parallax, so the reveal has depth). When the line is uncovered the light runs on
 * past it, thins and goes out. Lines start a beat apart. Cards alternate the side they open from (left to right, then
 * right to left). Leaving, a dimmer edge wipes the text away in the same direction. The spoken word warms up a touch.
 * Pure in `timeMs`.
 */
import React from "react";
import type { Word } from "@capseasy/shared";
import { displayText, famCss } from "../text";
import type { PageRenderProps } from "../types";
import { withAlpha } from "./kit";
import { AE, Ink, Shell, breakToFit, ctxOf, decorFilters, gradientImage, linesOf, mixHex, ordOf, prog, px, strokeCss } from "./premium-a-kit";

/** padding (em) around a line inside its clip box, so the clip never cuts shadows, glows or overshooting glyphs */
const PAD_EM = 0.6;
/** how far (em) the edge starts before the line and ends after it */
const OVER_EM = 0.3;

export const SlitLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, measure, settled } = p;
  const { sc, box, k, base } = ctxOf(p);
  const kk = Math.min(1.8, k);

  const spec = (size: number) => ({ fontFamily: famCss(style.fontId), fontWeight: style.fontWeight, fontStyle: style.fontStyle, fontSize: size, letterSpacing: style.letterSpacing * sc * (size / base) });
  const gapOf = (size: number) => 0.27 * size + style.wordSpacing * sc;
  const widthOf = (ts: string[], size: number) => ts.reduce((a, t) => a + measure(t, spec(size)), 0) + Math.max(0, ts.length - 1) * gapOf(size);
  // a line that would have to shrink is split in two instead, so the type keeps its size
  const lines = breakToFit(linesOf(page), (l) => widthOf(l.map((w) => displayText(w, style)), base), box.width);
  const texts = lines.map((l) => l.map((w) => displayText(w, style)));
  const widest = Math.max(1, ...texts.map((t) => widthOf(t, base)));
  const size = widest > box.width ? base * (box.width / widest) : base;
  const ratio = size / base;
  const pad = PAD_EM * size;
  const over = OVER_EM * size;
  const lineH = size * style.lineHeight;
  const dir = ordOf(page) % 2 === 0 ? 1 : -1; // 1: left to right
  const light = typeof style.templateOptions.lightColor === "string" ? (style.templateOptions.lightColor as string) : "#9FD4FF";
  const rest = style.fill.type === "solid" ? style.fill.color : style.fill.stops[0]!.color;
  // shadows and glows are drop-shadow filters on the row / word, never text-shadows: the in-browser exporter redraws a
  // glyph once per text-shadow, which would compound any fade
  const decor = decorFilters(style, sc, ratio);

  const cardMs = page.endMs - page.startMs;
  const revealMs = Math.min(640, Math.max(300, cardMs * 0.42)) / Math.sqrt(Math.max(0.5, kk));
  const exitMs = Math.min(260, cardMs * 0.28);
  const exitAt = page.endMs - exitMs;

  const type: React.CSSProperties = { fontFamily: famCss(style.fontId), fontWeight: style.fontWeight, fontStyle: style.fontStyle, fontSize: size, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing * sc * ratio, whiteSpace: "pre" };
  const spokenAt = (w: Word) => (style.active.effect === "none" ? 0 : settled ? (timeMs >= w.startMs ? 1 : 0) : AE.out(prog(timeMs, w.startMs, 220)));

  interface Paint { color: string; gradient?: string | null; filter?: string; stroke?: React.CSSProperties }
  const row = (line: Word[], li: number, paint: (w: Word) => Paint, filter?: string) => {
    // a gradient fill spans the whole line (each word shows its own slice of it)
    const W = widthOf(texts[li]!, size);
    let x = 0;
    return (
      <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "baseline", columnGap: px(gapOf(size)), padding: px(pad), ...(filter ? { filter } : {}) }}>
        {line.map((w, wj) => {
          const x0 = x;
          x += measure(texts[li]![wj]!, spec(size)) + gapOf(size);
          const pt = paint(w);
          return <Ink key={w.id} text={texts[li]![wj]!} css={{ ...type, display: "inline-block", ...(pt.filter ? { filter: pt.filter } : {}) }} color={pt.color} gradient={pt.gradient} slice={{ w: W, h: lineH, x: x0 }} stroke={pt.stroke} />;
        })}
      </div>
    );
  };

  return (
    <Shell p={p} box={box} size={size} inner={{ rowGap: (style.lineHeight - 1) * size }}>
      {lines.map((line, li) => {
        const W = widthOf(texts[li]!, size);
        const t0 = page.startMs + li * 110;
        const u = settled ? 1 : prog(timeMs, t0, revealMs);
        const e = AE.out(u);
        // the edge, as a distance travelled from the opening side (px, from the line's own start)
        const travelled = -over + (W + 2 * over) * e;
        // after the reveal the light runs on past the line, thins and goes out
        const after = settled ? 1 : prog(timeMs, t0 + revealMs * 0.82, 300);
        const edge = travelled + 0.8 * size * AE.out(after);
        const lightA = settled ? 0 : AE.out(prog(timeMs, t0, 70)) * (1 - AE.in(after));
        const lightSy = 1 - 0.7 * AE.in(after);
        // the exit: a dim edge wipes the text away from the same side
        const x = settled ? 0 : AE.in(prog(timeMs, exitAt + li * 40, exitMs * 0.85));
        const gone = -pad + (W + pad + over) * x;
        const exitLight = settled || x <= 0 || x >= 1 ? 0 : 0.38 * Math.sin(Math.PI * x);
        // the clip, in the padded box: visible from `gone` to `edge` along the travel direction
        const boxW = W + 2 * pad;
        const a = pad + Math.max(-pad, Math.min(W + pad, gone));
        const b = pad + Math.max(-pad, Math.min(W + pad, travelled));
        const clip = dir === 1 ? `inset(0px ${px(Math.max(0, boxW - b))} 0px ${px(Math.max(0, x > 0 ? a : 0))})` : `inset(0px ${px(Math.max(0, x > 0 ? a : 0))} 0px ${px(Math.max(0, boxW - b))})`;
        const along = (d: number) => (dir === 1 ? pad + d : pad + W - d); // px from the padded box's left
        // the text rides in with the light by a fraction of an em
        const slide = settled ? 0 : -dir * 0.14 * size * kk * (1 - e);
        // hot letters just behind the edge
        const hotW = 0.9 * size;
        const hot = !settled && u > 0 && u < 1 ? 1 - u ** 3 : 0;
        const hotClip = (from: number, to: number) => {
          const l = Math.max(0, Math.min(boxW, Math.min(along(from), along(to))));
          const r = Math.max(0, Math.min(boxW, Math.max(along(from), along(to))));
          return `inset(0px ${px(boxW - r)} 0px ${px(l)})`;
        };
        const lightX = (d: number) => along(d);
        const strip = (w: number, h: number, color: string, blur: number, alpha: number, key: string) => (
          <div
            key={key}
            style={{
              position: "absolute", left: 0, top: "50%", width: px(w), height: px(h),
              transform: `translate(${px(lightX(edge) - w / 2)}, -50%) scaleY(${lightSy.toFixed(4)})`,
              backgroundImage: `linear-gradient(180deg, ${withAlpha(color, 0)} 0%, ${withAlpha(color, 1)} 22%, ${withAlpha(color, 1)} 78%, ${withAlpha(color, 0)} 100%)`,
              opacity: +alpha.toFixed(4), ...(blur > 0 ? { filter: `blur(${px(blur)})` } : {}), pointerEvents: "none",
            }}
          />
        );
        const paint = (w: Word): Paint => {
          const on = spokenAt(w);
          const c = w.color ?? (on > 0 ? mixHex(rest, style.active.color, on) : rest);
          return { color: c, gradient: w.color ? null : gradientImage(style.fill), filter: on > 0.01 ? `drop-shadow(0 0 ${px(0.24 * size)} ${withAlpha(light, 0.45 * on)})` : undefined, stroke: strokeCss(style, sc, ratio) };
        };
        return (
          <div key={li} style={{ position: "relative", margin: px(-pad), transform: slide ? `translateX(${px(slide)})` : undefined }}>
            <div style={{ clipPath: clip }}>{row(line, li, paint, decor.length ? decor.join(" ") : undefined)}</div>
            {hot > 0.01 ? (
              <>
                <div style={{ position: "absolute", left: 0, top: 0, clipPath: hotClip(travelled - hotW, travelled), opacity: +(0.75 * hot).toFixed(4) }}>
                  {row(line, li, () => ({ color: "#FFFFFF" }), `drop-shadow(0 0 ${px(0.2 * size)} ${withAlpha(light, 0.9)}) drop-shadow(0 0 ${px(0.5 * size)} ${withAlpha(light, 0.5)})`)}
                </div>
                <div style={{ position: "absolute", left: 0, top: 0, clipPath: hotClip(travelled - hotW * 0.3, travelled), opacity: +hot.toFixed(4) }}>
                  {row(line, li, () => ({ color: "#FFFFFF" }), `drop-shadow(0 0 ${px(0.08 * size)} #FFFFFF) drop-shadow(0 0 ${px(0.26 * size)} ${withAlpha(light, 0.9)})`)}
                </div>
              </>
            ) : null}
            {lightA > 0.005 ? (
              <>
                {/* light spilling back over what the edge has just uncovered */}
                <div
                  style={{
                    position: "absolute", left: 0, top: "50%", width: px(2.6 * size), height: px(lineH * 1.05),
                    transform: `translate(${px(dir === 1 ? lightX(edge) - 2.6 * size : lightX(edge))}, -50%)`,
                    backgroundImage: `linear-gradient(${dir === 1 ? 90 : 270}deg, ${withAlpha(light, 0)} 0%, ${withAlpha(light, 0.22)} 100%)`,
                    filter: `blur(${px(0.2 * size)})`, opacity: +lightA.toFixed(4), pointerEvents: "none",
                  }}
                />
                {strip(1.7 * size, lineH * 1.9, light, 0.42 * size, 0.55 * lightA, "bloom")}
                {strip(0.34 * size, lineH * 1.6, light, 0.09 * size, lightA, "glow")}
                {strip(0.12 * size, lineH * 1.5, "#FFFFFF", 0.035 * size, 0.9 * lightA, "halo")}
                {strip(Math.max(2.5, 0.042 * size), lineH * 1.45, "#FFFFFF", 0, lightA, "core")}
              </>
            ) : null}
            {exitLight > 0.005 ? (
              <div
                style={{
                  position: "absolute", left: 0, top: "50%", width: px(Math.max(2, 0.03 * size)), height: px(lineH * 1.2),
                  transform: `translate(${px(lightX(gone))}, -50%)`, opacity: +exitLight.toFixed(4),
                  backgroundImage: `linear-gradient(180deg, ${withAlpha(light, 0)} 0%, ${withAlpha("#FFFFFF", 1)} 30%, ${withAlpha("#FFFFFF", 1)} 70%, ${withAlpha(light, 0)} 100%)`,
                  boxShadow: `0 0 ${px(0.25 * size)} ${withAlpha(light, 0.8)}`,
                }}
              />
            ) : null}
          </div>
        );
      })}
    </Shell>
  );
};
