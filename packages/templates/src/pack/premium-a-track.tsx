/**
 * "Cinematic Track-In": a title-sequence tracking animator. The card's letters start far apart, defocused and
 * transparent and close up to their resting tracking on a long exponential ease (AE Tracking "before & after"
 * from +90 % to 0 with ~90 % influence), so the centred line condenses out of light. Letters further from the centre
 * travel further, so they carry more motion blur; they fade in centre-first with a little seeded jitter. A thin face
 * carries the line and the key word sits in a heavier weight. Once the line has settled a glint of light travels
 * across it, and the tracking keeps closing by a hair for the rest of the card (it never stops dead). Unspoken words
 * wait at reduced opacity. Leaving, the tracking opens again on an accelerating curve while the letters defocus and
 * fade. Pure in `timeMs`.
 */
import React from "react";
import type { Word } from "@capseasy/shared";
import { displayText } from "../text";
import type { PageRenderProps } from "../types";
import { hash, keyWordIndex, rand, withAlpha } from "./kit";
import {
  AE, FRAME, Ink, Shell, breakToFit, clamp01, ctxOf, decorFilters, faceCss, glyphsOf, gradientImage, linesOf, mixHex, prog, px, shutterBlur, strokeCss, type Face,
} from "./premium-a-kit";

/** extra tracking at the start of the move, em (each side of a letter gets half) */
const OPEN_EM = 0.9;
/** the collapse */
const IN_MS = 1150;
/** the glint: starts after the line has mostly settled */
const GLINT_AT = 380;
const GLINT_MS = 760;

export const TrackInLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, measure, settled } = p;
  const { sc, box, k, base } = ctxOf(p);
  const kk = Math.min(1.8, k);
  const keyIdx = keyWordIndex(page);
  const index = new Map(page.words.map((w, i) => [w.id, i]));
  const seed = hash(page.id);

  // faces: the thin body and the heavier key word (the hero font/scale controls drive it)
  const bodyFace = (size: number): Face => ({ fontId: style.fontId, weight: style.fontWeight, italic: style.fontStyle === "italic", size, ls: style.letterSpacing * sc * (size / base) });
  const keyFace = (size: number): Face => ({ fontId: style.hero.fontId ?? style.fontId, weight: style.hero.fontWeight ?? 600, italic: style.fontStyle === "italic", size: size * style.hero.scale, ls: style.letterSpacing * sc * (size / base) * style.hero.scale });
  const faceOf = (w: Word, size: number) => (index.get(w.id) === keyIdx ? keyFace(size) : bodyFace(size));
  const gapOf = (size: number) => 0.32 * size + style.wordSpacing * sc;
  const lineWidth = (line: Word[], size: number) => line.reduce((a, w) => a + glyphsOf(displayText(w, style), faceOf(w, size), measure).width, 0) + Math.max(0, line.length - 1) * gapOf(size);
  // a line that would have to shrink is split in two instead, so the title keeps its size
  const lines = breakToFit(linesOf(page), (l) => lineWidth(l, base), box.width);
  const widest = Math.max(1, ...lines.map((l) => lineWidth(l, base)));
  const size = widest > box.width ? base * (box.width / widest) : base;

  const cardMs = page.endMs - page.startMs;
  const exitMs = Math.min(420, cardMs * 0.35);
  const exitAt = page.endMs - exitMs;
  const life = settled ? 1 : clamp01((timeMs - page.startMs) / Math.max(1, cardMs));

  /** extra tracking (em) for line `li` at time `ms`: the collapse, a slow drift tighter, the opening exit */
  const trackAt = (ms: number, li: number) => {
    if (settled) return 0;
    const t0 = page.startMs + li * 90;
    const collapse = OPEN_EM * kk * (1 - AE.glide(prog(ms, t0, IN_MS)));
    const drift = -0.035 * kk * AE.sine(clamp01((ms - page.startMs) / Math.max(1, cardMs)));
    const open = 0.9 * kk * AE.in(prog(ms, exitAt, exitMs));
    return collapse + drift + open;
  };
  // the line's focus pull (a lens racking in), on top of the per-letter motion blur
  const focusAt = (ms: number) => (settled ? 0 : 0.11 * (1 - AE.out(prog(ms, page.startMs, 760))) + 0.12 * AE.in(prog(ms, exitAt, exitMs)));
  const fadeOut = settled ? 1 : 1 - AE.in(prog(timeMs, exitAt + exitMs * 0.15, exitMs * 0.85));
  // the camera: a slow push for the whole card
  const push = 1 + 0.02 * Math.min(1.5, k) * AE.sine(life);

  const ratio = size / base;
  // the style's shadows/glow are cast by the whole card (a drop-shadow filter), never per letter: the in-browser
  // exporter redraws a glyph once per text-shadow, which would compound the letters' fade and blur
  const decor = decorFilters(style, sc, ratio);
  const restColor = style.fill.type === "solid" ? style.fill.color : style.fill.stops[0]!.color;
  const keyColor = style.hero.fill ? (style.hero.fill.type === "solid" ? style.hero.fill.color : style.hero.fill.stops[0]!.color) : "#FFFFFF";
  // the glint's travel (0..1 across the line), eased like a hand-keyed light pass
  const glintPos = settled ? -1 : lerpGlint(prog(timeMs, page.startMs + GLINT_AT, GLINT_MS));

  let letterNo = 0;
  return (
    <Shell p={p} box={box} size={size} motion={{ transform: `scale(${push.toFixed(5)})`, ...(decor.length ? { filter: decor.join(" ") } : {}) }} inner={{ rowGap: (style.lineHeight - 1) * size }}>
      {lines.map((line, li) => {
        const extra = trackAt(timeMs, li);
        const extraPrev = trackAt(timeMs - FRAME / 2, li);
        const extraNext = trackAt(timeMs + FRAME / 2, li);
        // letters laid out at rest to know where each one sits (for the centre-out fade and the glint)
        const glyphLine = line.map((w) => ({ w, face: faceOf(w, size), g: glyphsOf(displayText(w, style), faceOf(w, size), measure) }));
        const count = glyphLine.reduce((a, x) => a + x.g.glyphs.length, 0) + Math.max(0, line.length - 1);
        // a gradient fill spans the whole line at rest (each letter shows its own slice of it)
        const restW = glyphLine.reduce((a, x) => a + x.g.width, 0) + Math.max(0, line.length - 1) * gapOf(size);
        let ci = 0;
        let wordX = 0;
        return (
          <div key={li} style={{ display: "flex", flexWrap: "nowrap", alignItems: "baseline", whiteSpace: "pre", columnGap: px(gapOf(size) + extra * size) }}>
            {glyphLine.map(({ w, face, g }, wj) => {
              const wi = index.get(w.id) ?? 0;
              const isKey = wi === keyIdx;
              // unspoken words wait dimmed; they come up as they are spoken
              const said = settled ? (timeMs >= w.startMs ? 1 : 0) : AE.out(prog(timeMs, w.startMs, 160));
              const wordAlpha = 0.72 + 0.28 * said;
              if (wj > 0) ci++; // the space between words counts as a character (as in AE)
              // spoken words warm up to the highlight colour (the key word keeps its own)
              const color = w.color ?? (isKey ? keyColor : mixHex(restColor, style.active.color, said));
              const grad = w.color ? null : isKey ? (style.hero.fill ? gradientImage(style.hero.fill) : null) : gradientImage(style.fill);
              const x0 = wordX;
              wordX += g.width + gapOf(size);
              return (
                <span key={w.id} style={{ display: "inline-flex", alignItems: "baseline", opacity: wordAlpha }}>
                  {g.glyphs.map((gl, gi) => {
                    // centred tracking: a letter's offset grows with its distance from the line's centre
                    const c = (ci - (count - 1) / 2) / Math.max(1, count);
                    const dist = Math.abs(c) * 2; // 0 at the centre, 1 at the ends
                    const speed = Math.abs(extraNext - extraPrev) * size * Math.abs(ci - (count - 1) / 2);
                    const blur = settled ? 0 : shutterBlur(speed, 0.14 * size) + focusAt(timeMs) * size;
                    const delay = li * 90 + (0.65 * dist + 0.35 * rand(seed, letterNo)) * 190;
                    const alpha = settled ? 1 : AE.out(prog(timeMs, page.startMs + delay, 300)) * fadeOut;
                    // the glint: a soft band of light at glintPos (positions in units of the line's character count)
                    const gl01 = (ci + 0.5) / Math.max(1, count);
                    const shine = glintPos < -0.5 ? 0 : Math.exp(-(((gl01 - glintPos) / 0.09) ** 2));
                    const half = (extra * size) / 2;
                    const kern = gl.adv - gl.solo;
                    ci++;
                    letterNo++;
                    const filters = [
                      ...(blur > 0.25 ? [`blur(${px(blur)})`] : []),
                      ...(shine > 0.02 ? [`drop-shadow(0 0 ${px(0.14 * size)} ${withAlpha("#FFFFFF", 0.8 * shine)})`, `drop-shadow(0 0 ${px(0.45 * size)} ${withAlpha("#FFE9C4", 0.55 * shine)})`] : []),
                    ];
                    return (
                      <Ink
                        key={gi}
                        text={gl.ch}
                        color={shine > 0.02 ? mixHex(color, "#FFFFFF", shine) : color}
                        gradient={grad}
                        slice={{ w: restW, h: size * style.lineHeight, x: x0 + gl.x }}
                        stroke={strokeCss(style, sc, ratio)}
                        css={{
                          ...faceCss(face, style.lineHeight), display: "inline-block",
                          marginLeft: px(half), marginRight: px(half + kern), opacity: +alpha.toFixed(4),
                          ...(filters.length ? { filter: filters.join(" ") } : {}),
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

/** the glint crosses from just before the line to just after it, quick in the middle */
const lerpGlint = (u: number) => (u <= 0 || u >= 1 ? -1 : -0.25 + 1.5 * AE.inOut(u));
