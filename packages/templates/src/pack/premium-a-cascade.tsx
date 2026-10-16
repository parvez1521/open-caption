/**
 * "Letter Cascade": each word pours in letter by letter as it appears, one frame apart (with a few ms of seeded
 * jitter so the rhythm never ticks like a metronome). Every letter rises on a damped spring that overshoots ~10 %
 * and settles softly; while it moves fast it is stretched along its path and blurred in proportion to its speed (a
 * 180° shutter), so the motion reads like AE motion blur rather than a slide. The spoken word lifts a touch and
 * brightens with a soft glow. Leaving, the letters fall away one after another: accelerating under gravity, tipping
 * to a seeded angle, stretching and blurring with their speed, fading as they go. Pure in `timeMs`.
 */
import React from "react";
import type { Word } from "@capseasy/shared";
import { showAt } from "../motion";
import { displayText } from "../text";
import type { PageRenderProps } from "../types";
import { hash, rand, withAlpha } from "./kit";
import {
  AE, FRAME, Ink, Shell, breakToFit, clamp01, ctxOf, decorFilters, faceCss, glyphsOf, gradientImage, linesOf, mixHex, perFrame, prog, px, shutterBlur, springAt, strokeCss, type Face,
} from "./premium-a-kit";

/** the rise: 0.85 em on a spring that overshoots ~10 % (ζ ≈ 0.59) */
const RISE_EM = 0.85;
const SPRING = { stiffness: 190, damping: 15.5, mass: 0.9 };

export const CascadeLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, measure, settled } = p;
  const { sc, box, k, base } = ctxOf(p);
  const kk = Math.min(1.8, k);
  const seed = hash(page.id);
  const index = new Map(page.words.map((x, i) => [x.id, i]));
  const faceAt = (size: number): Face => ({ fontId: style.fontId, weight: style.fontWeight, italic: style.fontStyle === "italic", size, ls: style.letterSpacing * sc * (size / base) });
  const gapOf = (size: number) => 0.28 * size + style.wordSpacing * sc;
  // a line that would have to shrink is split in two instead, so the letters keep their size
  const lineWidthAt = (l: Word[], size: number) => l.reduce((a, w) => a + glyphsOf(displayText(w, style), faceAt(size), measure).width, 0) + Math.max(0, l.length - 1) * gapOf(size);
  const lines = breakToFit(linesOf(page), (l) => lineWidthAt(l, base), box.width);
  const texts = lines.map((l) => l.map((w) => displayText(w, style)));
  const widthAt = (size: number) => Math.max(1, ...texts.map((ts) => ts.reduce((a, t) => a + glyphsOf(t, faceAt(size), measure).width, 0) + Math.max(0, ts.length - 1) * gapOf(size)));
  const w0 = widthAt(base);
  const size = w0 > box.width ? base * (box.width / w0) : base;
  const face = faceAt(size);
  const ratio = size / base;
  // the style's shadows/glow are cast by the whole card (a drop-shadow filter), never per letter: the in-browser
  // exporter redraws a glyph once per text-shadow, which would compound the letters' fade and blur
  const decor = decorFilters(style, sc, ratio);

  const cardMs = page.endMs - page.startMs;
  const exitMs = Math.min(380, cardMs * 0.35);
  const fallMs = Math.min(300, exitMs * 0.8);
  const exitAt = page.endMs - exitMs;
  const total = texts.reduce((a, ts) => a + ts.reduce((b, t) => b + t.length, 0), 0);
  const fallStep = Math.min(FRAME * 0.7, Math.max(0, exitMs - fallMs) / Math.max(1, total));
  const life = settled ? 1 : clamp01((timeMs - page.startMs) / Math.max(1, cardMs));
  const push = 1 + 0.015 * Math.min(1.5, k) * AE.sine(life);
  const rest = style.fill.type === "solid" ? style.fill.color : style.fill.stops[0]!.color;

  let letterNo = 0;
  return (
    <Shell p={p} box={box} size={size} motion={{ transform: `scale(${push.toFixed(5)})`, ...(decor.length ? { filter: decor.join(" ") } : {}) }} inner={{ rowGap: (style.lineHeight - 1) * size }}>
      {lines.map((line, li) => {
        // a gradient fill spans the whole line (each letter shows its own slice of it)
        const gs = texts[li]!.map((t) => glyphsOf(t, face, measure));
        const lineW = gs.reduce((a, g) => a + g.width, 0) + Math.max(0, gs.length - 1) * gapOf(size);
        let wordX = 0;
        return (
        <div key={li} style={{ display: "flex", flexWrap: "nowrap", alignItems: "baseline", whiteSpace: "pre", columnGap: px(gapOf(size)) }}>
          {line.map((w, wj) => {
            const g = gs[wj]!;
            const x0 = wordX;
            wordX += g.width + gapOf(size);
            // the spoken word lifts and brightens (eases in as it is spoken, back out when the next word starts)
            const next = page.words[(index.get(w.id) ?? 0) + 1];
            const on = style.active.effect === "none" ? 0 : settled ? (timeMs >= w.startMs && (!next || timeMs < next.startMs) ? 1 : 0) : AE.out(prog(timeMs, w.startMs, 200)) * (1 - AE.out(prog(timeMs, next ? next.startMs : Infinity, 240)));
            const color = mixHex(w.color ?? rest, style.active.color, on);
            // gradient fills stay gradients (the spoken word's lift and glow still show)
            const grad = w.color ? null : gradientImage(style.fill);
            const t0 = settled ? -Infinity : showAt(w);
            return (
              <span key={w.id} style={{ display: "inline-flex", alignItems: "baseline", transform: on > 0.001 ? `translateY(${px(-0.07 * size * on * Math.min(1.4, k))})` : undefined, ...(on > 0.01 ? { filter: `drop-shadow(0 0 ${px(0.22 * size)} ${withAlpha(style.active.color, 0.6 * on)})` } : {}) }}>
                {g.glyphs.map((gl, gi) => {
                  const n = letterNo++;
                  const ti = t0 + gi * FRAME + (rand(seed, n * 5) - 0.5) * 10;
                  const te = exitAt + n * fallStep;
                  const tilt = (rand(seed, n * 5 + 2) * 2 - 1) * 16;
                  const drift = (rand(seed, n * 5 + 3) * 2 - 1) * 0.12;
                  /** px below rest: the spring rise (overshooting above), plus the fall */
                  const yOf = (ms: number) => {
                    if (settled) return 0;
                    const rise = (1 - springAt((ms - ti) / 1000, SPRING).x) * RISE_EM * kk * size;
                    const before = ms < ti ? RISE_EM * kk * size : rise;
                    const f = prog(ms, te, fallMs);
                    return before + f * f * 1.15 * size * Math.max(0.6, kk);
                  };
                  const y = yOf(timeMs);
                  const v = Math.abs(perFrame(yOf, timeMs));
                  const sy = 1 + Math.min(0.6, (v / size) * 1.7);
                  const sx = 1 / Math.sqrt(sy);
                  const blur = shutterBlur(v, 0.07 * size);
                  const f = settled ? 0 : prog(timeMs, te, fallMs);
                  const alpha = settled ? 1 : AE.out(prog(timeMs, ti, 90)) * (1 - AE.in(prog(timeMs, te + fallMs * 0.25, fallMs * 0.75)));
                  const moving = Math.abs(y) > 0.05 || f > 0;
                  return (
                    <Ink
                      key={gi}
                      text={gl.ch}
                      color={color}
                      gradient={grad}
                      slice={{ w: lineW, h: size * style.lineHeight, x: x0 + gl.x }}
                      stroke={strokeCss(style, sc, ratio)}
                      css={{
                        ...faceCss(face, style.lineHeight), display: "inline-block", opacity: +alpha.toFixed(4),
                        marginRight: px(gl.adv - gl.solo),
                        transform: moving ? `translate(${px(drift * size * f)}, ${px(y)}) rotate(${(tilt * f).toFixed(2)}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})` : undefined,
                        transformOrigin: "50% 70%",
                        ...(blur > 0.3 ? { filter: `blur(${px(blur)})` } : {}),
                      }}
                    />
                  );
                })}
              </span>
            );
          })}
        </div>
        );
      })}
    </Shell>
  );
};
