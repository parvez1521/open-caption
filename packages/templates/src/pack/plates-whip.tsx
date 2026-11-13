/**
 * Whole-line layouts from OpusClip's catalogue (section 3): the card is on screen as one frame.
 *  - BlurWhipLayout ("Blur switch"): the card whips in and out sideways: stretched to 143 % wide and motion-blurred
 *    (amount 56) easing to 100 % and sharp over 120 ms, mirrored over the card's last 120 ms. The spoken word turns cyan.
 *  - FatBarLayout ("Popline"): the spoken word grows to 1.3x and a fat rounded bar (20/56 em tall, fully rounded, its top
 *    5/56 em above the baseline) fades in under it over 200 ms.
 * The source's radial blur can't be drawn by the exporter (no motion-blur filter); it is rebuilt from a few stretched
 * ghost copies of the line spreading sideways from its centre plus a small gaussian blur.
 */
import React from "react";
import type { CaptionStyleV2, Word } from "@capseasy/shared";
import { effectiveIntensity, exitStyle } from "../motion";
import { backgroundCss, containerCss, displayText, layoutBox, lineWidth, scaleOf } from "../text";
import type { PageRenderProps } from "../types";
import { px } from "./graphic-common";
import { EASES, clamp, runCss, seg, wordFill } from "./plates-kit";

const WHIP_MS = 120;
/** ghost copies that make the sideways smear while the card whips */
const GHOSTS = 5;

/** how far through a whip the card is: 1 = fully stretched/blurred, 0 = at rest; plus its opacity */
function whipState(timeMs: number, startMs: number, endMs: number, settled?: boolean): { amount: number; alpha: number } {
  if (settled) return { amount: 0, alpha: 1 };
  if (timeMs < startMs) return { amount: 1, alpha: 0 };
  const tin = clamp((timeMs - startMs) / WHIP_MS, 0, 1);
  const tout = clamp((timeMs - (endMs - WHIP_MS)) / WHIP_MS, 0, 1);
  const amount = Math.max(1 - EASES.avMotion(tin), EASES.avMotion(tout));
  const alpha = Math.min(EASES.avFade(tin), 1 - EASES.avFade(tout));
  return { amount, alpha };
}

const isActive = (w: Word, timeMs: number) => timeMs >= w.startMs && timeMs < w.endMs;

export const BlurWhipLayout: React.FC<PageRenderProps> = ({ page, timeMs, style, canvas, measure, settled }) => {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const k = effectiveIntensity(style, page.emotion);
  const lines = page.lines.length ? page.lines : [page.words];
  const texts = lines.map((l) => l.map((w) => displayText(w, style)));
  const base = style.fontSize * sc;
  const gap = 0.3 * base + style.wordSpacing * sc + (style.stroke.enabled ? style.stroke.width * sc : 0);
  const widest = Math.max(1, ...texts.map((t) => lineWidth(t, base, style, sc, measure, "none")));
  const size = widest > box.width ? base * (box.width / widest) : base;
  const justify = style.align === "left" ? "flex-start" : style.align === "right" ? "flex-end" : "center";
  const { amount, alpha } = whipState(timeMs, page.startMs, page.endMs, settled);
  const a = amount * k;
  const sx = 1 + 0.43 * a;
  const colorWord = (w: Word): CaptionStyleV2["fill"] => {
    if (w.color) return { type: "solid", color: w.color };
    const key = w.emphasis === "strong" || w.emphasis === "hero";
    if (key || (style.active.effect === "color" && isActive(w, timeMs))) return { type: "solid", color: style.active.color };
    return style.fill;
  };
  const block = (decorate: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: justify, rowGap: (style.lineHeight - 1) * size * 0.5 }}>
      {lines.map((line, li) => (
        <div key={li} style={{ display: "flex", flexWrap: "nowrap", justifyContent: justify, columnGap: gap * (size / base) }}>
          {line.map((w, wi) => (
            <span key={w.id} style={{ display: "inline-block", ...runCss(style, sc, size, { fill: colorWord(w), decorate }) }}>{texts[li]![wi]}</span>
          ))}
        </div>
      ))}
    </div>
  );
  const ghosts: React.ReactNode[] = [];
  if (a > 0.004) {
    for (let j = 1; j <= GHOSTS; j++) {
      ghosts.push(
        <div key={`g${j}`} style={{ gridArea: "1 / 1", opacity: 0.38 * (1 - j / (GHOSTS + 1)), transform: `scaleX(${(sx * (1 + 0.16 * j * a)).toFixed(4)})`, filter: `blur(${px(0.05 * size * a * (1 + j * 0.4))})` }}>
          {block(false)}
        </div>,
      );
    }
  }
  return (
    <div style={containerCss(box, style.rotation)}>
      <div style={{ display: "grid", placeItems: "center", width: "100%", opacity: alpha, ...backgroundCss(style, sc), ...exitStyle(style, page.endMs - timeMs, settled, size) }}>
        {ghosts}
        <div style={{ gridArea: "1 / 1", transform: a > 0.004 ? `scaleX(${sx.toFixed(4)})` : undefined, filter: a > 0.004 ? `blur(${px(0.045 * size * a)})` : undefined }}>
          {block(true)}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------- fat bar (Popline)

/** baseline of a line box, from its top, in em at line height `lh` (typical sans metrics: ascent ~0.97, descent ~0.26) */
const baselineEm = (lh: number) => lh / 2 + 0.355;

export const FatBarLayout: React.FC<PageRenderProps> = ({ page, timeMs, style, canvas, measure, settled }) => {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const k = effectiveIntensity(style, page.emotion);
  const lines = page.lines.length ? page.lines : [page.words];
  const texts = lines.map((l) => l.map((w) => displayText(w, style)));
  const on = style.active.effect !== "none";
  const grow = on ? 1 + (style.active.scale - 1) * k : 1;
  const base0 = style.fontSize * sc;
  // fit the widest line at rest (the grown word pushes its neighbours apart, as in the source)
  const widest = Math.max(1, ...texts.map((t) => lineWidth(t, base0, style, sc, measure, "none")));
  const base = widest > box.width ? base0 * (box.width / widest) : base0;
  const gap = 0.3 * base + style.wordSpacing * sc + (style.stroke.enabled ? style.stroke.width * sc : 0);
  const justify = style.align === "left" ? "flex-start" : style.align === "right" ? "flex-end" : "center";
  const lh = style.lineHeight;
  const barH = (20 / 56) * base;
  return (
    <div style={containerCss(box, style.rotation)}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: justify, rowGap: (lh - 1) * base * 0.5, ...backgroundCss(style, sc), ...exitStyle(style, page.endMs - timeMs, settled, base) }}>
        {lines.map((line, li) => (
          <div key={li} style={{ display: "flex", flexWrap: "nowrap", justifyContent: justify, alignItems: "baseline", columnGap: gap }}>
            {line.map((w, wi) => {
              const live = on && isActive(w, timeMs);
              const size = live ? base * grow : base;
              const barTop = baselineEm(lh) * size - (5 / 56) * base;
              const fade = live ? seg(timeMs, w.startMs, 0, 200, EASES.avFade, settled) : 0;
              return (
                <span key={w.id} style={{ position: "relative", display: "inline-block" }}>
                  {live ? <span style={{ position: "absolute", left: 0, right: 0, top: barTop, height: barH, borderRadius: barH, backgroundColor: style.active.color, opacity: fade }} /> : null}
                  <span style={{ position: "relative", display: "inline-block", ...runCss(style, sc, size, { fill: wordFill(w, style.fill), lineHeight: lh }) }}>{texts[li]![wi]}</span>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
