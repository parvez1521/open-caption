/**
 * Trending layouts built on coloured labels: the whole card on one solid box, stacked line labels in alternating
 * colours, and left-aligned cream strips. Each has a "solo keyword" card every few cards (./trending-kit.tsx
 * soloSegments). Motion values are the catalogue's (30 fps frames → ms), scaled by the motion intensity.
 */
import React from "react";
import { showAt } from "../motion";
import { strokeCss } from "../text";
import type { PageRenderProps } from "../types";
import { EASE, bezier, rand } from "./kit";
import { type Cell, cellsOf, fitCells, gapPx, restFill, solid, typeCss } from "./lines-engine";
import {
  FRAME, TFrame, balancedLines, clamp01, fr, glowAt, joinLayers, lerp, linesOf, opt, ord, segmentAt, shadowsAt, showOpacity, soloSegments, wiggle,
} from "./trending-kit";

/** pad the first word of every line by `padEm` each side (fitCells counts it as the line's box padding) */
const padLines = (cells: Cell[][], padEm: number) => cells.map((line) => line.map((c, j) => (j === 0 ? { ...c, padEm } : c)));

/** row-bounce-in-pop: 0.9 → 1.05 (3 frames) → 1 (6 frames) */
const POP_UP = bezier(0.17, 0.17, 0.19, 1);
const POP_DOWN = bezier(0.19, 0, 0.35, 1);
export const popIn = (ms: number) => (ms <= fr(3) ? lerp(0.9, 1.05, POP_UP(clamp01(ms / fr(3)))) : lerp(1.05, 1, POP_DOWN(clamp01((ms - fr(3)) / fr(6)))));

/** row-bounce-in-elastic: 0.76 → 1.03 → 0.99 → 1, three equal steps (0.1 s each on the first row, 5 frames on the others) */
const EL_A = bezier(0, 0.03, 0.6, 1);
const EL_B = bezier(0.24, 0, 0.33, 1);
export function elasticIn(ms: number, row: number): number {
  const t = Math.max(0, ms) / 1000;
  const n = row === 0 ? 0.1 : 5 / 30;
  if (t <= n) return lerp(0.76, 1.03, EL_A(clamp01(t / n)));
  if (t <= 2 * n) return lerp(1.03, 0.99, EL_A(clamp01((t - n) / n)));
  return lerp(0.99, 1, EL_B(clamp01((t - 2 * n) / n)));
}

/** the snappy word slides (word-slide-up-in / -micro / -right-in): 8 frames, ease (0,0,0,1) */
const SNAP = bezier(0, 0, 0, 1);
const slideLeft = (timeMs: number, startMs: number, settled?: boolean) => (settled ? 0 : 1 - SNAP(clamp01((timeMs - startMs) / fr(8))));

/** the word being spoken: the last one whose start has passed (none before the first) */
const spokenIndex = (words: { startMs: number }[], timeMs: number) => {
  let cur = -1;
  words.forEach((w, i) => { if (timeMs >= w.startMs) cur = i; });
  return cur;
};

// ============================================================ one solid box behind the whole card

/** idle box wiggle on the solo card: 1.7 Hz, 26 px at the 81 px design size, ramped in over 13 frames */
const BOX_WIGGLE_EM = 26 / 81;

/**
 * Dark condensed caps on one solid colour box (radius 0.15 em) behind the whole card; the box colour cycles card to
 * card through the highlight colour and `boxColors`. The card pops 0.9 → 1.05 → 1. Every `soloEvery`-th card gives
 * its key word a card of its own at 1.5×: the word bounces 1.13 → 1 with a back-out and the box keeps wiggling.
 */
export const LabelBoxLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, settled } = p;
  const seg = segmentAt(soloSegments(page, opt(style, "soloEvery", 3)), timeMs);
  const sp = seg.page;
  const mult = seg.solo ? opt<number>(style, "soloScale", 1.5) : 1;
  const cells = padLines(cellsOf(sp, style, linesOf(sp), () => ({ mult })), 0.15);
  const fit = fitCells(p, cells);
  const { sc, size, intensity: k } = fit;
  const px = size * mult;
  const ratio = size / (style.fontSize * sc);
  const shadow = joinLayers([...shadowsAt(style, sc, ratio), ...glowAt(style, sc)]);
  const palette = [style.active.color, ...opt<string[]>(style, "boxColors", ["#FFFFFF", "#13FD00"])];
  const boxColor = palette[ord(page) % palette.length]!;

  const local = timeMs - sp.startMs;
  const s = settled ? 1 : popIn(local);
  let dx = 0;
  let dy = 0;
  if (seg.solo && !settled) {
    const tSec = Math.max(0, local) / 1000;
    const amp = BOX_WIGGLE_EM * size * clamp01(tSec / (13 / 30));
    const seed = ord(page) * 31 + 7;
    dx = wiggle(tSec, 1.7, amp, seed);
    dy = wiggle(tSec, 1.7, amp, seed + 1);
  }
  const motion = { transform: `translate(${(dx * k).toFixed(2)}px, ${(dy * k).toFixed(2)}px) scale(${(1 + (s - 1) * k).toFixed(4)})` };

  return (
    <TFrame p={p} box={fit.box} size={size} motion={motion}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: boxColor, borderRadius: opt<number>(style, "boxRadius", 0.15) * px, padding: `${(0.2 * px).toFixed(2)}px ${(0.15 * px).toFixed(2)}px` }}>
        {cells.map((line, li) => (
          <div key={li} style={{ display: "flex", justifyContent: "center", alignItems: "baseline", whiteSpace: "pre" }}>
            {line.map((c, wi) => {
              // the solo word bounces 1.7/1.5 → 1 over 13 frames (back-out) from its spoken time
              const bounce = seg.solo && !settled ? lerp(1.7 / 1.5, 1, EASE.outBack(clamp01((timeMs - showAt(c.w)) / fr(13)))) : 1;
              return (
                <span
                  key={c.w.id}
                  style={{
                    ...typeCss(style, sc, px), ...restFill(c.w, style), ...strokeCss(style.stroke, sc), textShadow: shadow,
                    opacity: showOpacity(c.w, timeMs, seg.solo ? FRAME : fr(6), seg.solo ? EASE.linear : EASE.ease, settled),
                    transform: bounce !== 1 ? `scale(${(1 + (bounce - 1) * k).toFixed(4)})` : undefined,
                    marginRight: wi === line.length - 1 ? 0 : gapPx(style, sc, px),
                  }}
                >
                  {c.text}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </TFrame>
  );
};

// ============================================================ stacked line labels, alternating colours

/**
 * Two balanced lines, each on its own rounded label (radius 0.24 em, padding 0.1 / 0.6 em). Odd lines: dark label,
 * text in the text colour. Even lines: a label in the highlight colour with dark text, tilted −2° and tucked 0.16 em
 * up under the line above. Each label bounces in elastically (0.76 → 1.03 → 0.99 → 1). Every `soloEvery`-th card
 * gives its key word a tilted highlight label at 1.2× that slides up 0.39 em.
 */
export const LabelStackLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, settled } = p;
  const seg = segmentAt(soloSegments(page, opt(style, "soloEvery", 3)), timeMs);
  const sp = seg.page;
  const mult = seg.solo ? opt<number>(style, "soloScale", 1.2) : 1;
  const lines = seg.solo ? [sp.words] : balancedLines(sp.words, 2);
  const cells = padLines(cellsOf(sp, style, lines, () => ({ mult })), 0.6);
  const fit = fitCells(p, cells);
  const { sc, size, intensity: k } = fit;
  const px = size * mult;
  const ratio = size / (style.fontSize * sc);
  const shadow = joinLayers([...shadowsAt(style, sc, ratio), ...glowAt(style, sc)]);
  const darkLabel = opt<string>(style, "labelColor", "#2A2A2E");
  // a hairline light edge so the dark label keeps its shape on black footage (and the black gallery tile)
  const darkEdge = opt<string>(style, "labelEdge", "rgba(255,255,255,0.22)");
  const accentText = opt<string>(style, "accentTextColor", "#000000");
  const tilt = opt<number>(style, "tilt", -2);
  const local = timeMs - sp.startMs;

  return (
    <TFrame p={p} box={fit.box} size={size}>
      {cells.map((line, li) => {
        const accent = seg.solo || li % 2 === 1;
        const s = settled ? 1 : elasticIn(local, li);
        return (
          <div
            key={li}
            style={{
              display: "flex", alignItems: "baseline", whiteSpace: "pre", position: "relative", zIndex: accent ? 1 : 0,
              backgroundColor: accent ? style.active.color : darkLabel, boxShadow: accent ? undefined : `inset 0 0 0 ${Math.max(1, 0.02 * px).toFixed(2)}px ${darkEdge}`, borderRadius: opt<number>(style, "labelRadius", 0.24) * px,
              padding: `${(0.1 * px).toFixed(2)}px ${(0.6 * px).toFixed(2)}px`, marginTop: li > 0 && accent ? -0.15873 * px : 0,
              transform: `${accent ? `rotate(${tilt}deg) ` : ""}scale(${(1 + (s - 1) * k).toFixed(4)})`,
            }}
          >
            {line.map((c, wi) => {
              const rise = seg.solo ? slideLeft(timeMs, showAt(c.w), settled) * 0.392 * px * k : 0;
              return (
                <span
                  key={c.w.id}
                  style={{
                    ...typeCss(style, sc, px), ...(accent && !c.w.color ? solid(accentText) : restFill(c.w, style)), ...strokeCss(style.stroke, sc), textShadow: shadow,
                    opacity: showOpacity(c.w, timeMs, seg.solo ? FRAME : fr(6), seg.solo ? EASE.linear : EASE.ease, settled),
                    transform: rise ? `translateY(${rise.toFixed(2)}px)` : undefined,
                    marginRight: wi === line.length - 1 ? 0 : gapPx(style, sc, px),
                  }}
                >
                  {c.text}
                </span>
              );
            })}
          </div>
        );
      })}
    </TFrame>
  );
};

// ============================================================ left-aligned cream strips

/** row-slide-right-in / word-slide-right-in distance (1.7 em) and the micro word rise (0.065 em) */
const STRIP_SLIDE_EM = 1.6993;
const MICRO_EM = 0.0654;
const SOLO_RISE_EM = 0.392;

/** row-rotate-idle-wiggle: alternating ±amp·(0.4..1) targets every 15 frames, eased in-out, from 0 */
function rockDeg(ms: number, seed: number, ampDeg: number): number {
  if (ms <= 0) return 0;
  const half = fr(15);
  const i = Math.floor(ms / half);
  const target = (j: number) => (j < 0 ? 0 : (j % 2 === 0 ? 1 : -1) * ampDeg * (0.4 + 0.6 * rand(seed, j)));
  return lerp(target(i - 1), target(i), EASE.easeInOut((ms - i * half) / half));
}

/**
 * Left-aligned lines, each on its own cream strip (square corners, padding 0.08 / 0.4 em, strips touching), dark text,
 * and the word being spoken in the highlight colour. Cards alternate between strips sliding in from the right (1.7 em,
 * 8 frames, words sliding after them) and strips appearing in place (words rising a hair). Every `soloEvery`-th card
 * gives its key word a centred card at 1.3×: strip-coloured text on a highlight-colour strip, rocking ±10°.
 */
export const CreamStripLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, settled } = p;
  const seg = segmentAt(soloSegments(page, opt(style, "soloEvery", 3)), timeMs);
  const sp = seg.page;
  const solo = seg.solo;
  const mult = solo ? opt<number>(style, "soloScale", 1.3) : 1;
  const lines = solo ? [sp.words] : balancedLines(sp.words, 2);
  const cells = padLines(cellsOf(sp, style, lines, () => ({ mult })), 0.4);
  const fit = fitCells(p, cells);
  const { sc, size, intensity: k } = fit;
  const px = size * mult;
  const ratio = size / (style.fontSize * sc);
  const shadow = joinLayers([...shadowsAt(style, sc, ratio), ...glowAt(style, sc)]);
  const strip = opt<string>(style, "stripColor", "#FFF5E3");
  const sliding = !solo && ord(page) % 3 === 0;
  const spoken = spokenIndex(sp.words, timeMs);
  const local = timeMs - sp.startMs;
  const rock = solo && !settled ? rockDeg(local, ord(page) * 17 + 3, opt<number>(style, "rockDeg", 10)) * k : 0;

  return (
    <TFrame p={p} box={fit.box} size={size} align={solo ? "center" : "flex-start"} inner={solo ? undefined : { width: "100%" }} motion={rock ? { transform: `rotate(${rock.toFixed(3)}deg)` } : undefined}>
      {cells.map((line, li) => {
        const lineStart = showAt(line[0]!.w);
        // the strip shows from the frame after its first word starts (the first strip of a card from its first frame)
        const shown = settled || timeMs >= (li === 0 ? sp.startMs : lineStart) + (sliding ? FRAME : 0);
        const rowX = sliding ? slideLeft(timeMs, lineStart, settled) * STRIP_SLIDE_EM * px * k : 0;
        return (
          <div
            key={li}
            style={{
              display: "flex", alignItems: "baseline", whiteSpace: "pre", position: "relative", clipPath: "inset(0)",
              backgroundColor: solo ? style.active.color : strip, borderRadius: opt<number>(style, "stripRadius", 0) * px,
              padding: `${(0.08 * px).toFixed(2)}px ${(0.4 * px).toFixed(2)}px ${(0.14 * px).toFixed(2)}px`, marginTop: li > 0 ? -0.0222 * px : 0,
              opacity: shown ? 1 : 0, transform: rowX ? `translateX(${rowX.toFixed(2)}px)` : undefined,
            }}
          >
            {line.map((c, wi) => {
              const t = slideLeft(timeMs, showAt(c.w), settled);
              const move = solo ? `translateY(${(t * SOLO_RISE_EM * px * k).toFixed(2)}px)` : sliding ? `translateX(${(t * STRIP_SLIDE_EM * px * k).toFixed(2)}px)` : `translateY(${(t * MICRO_EM * px * k).toFixed(2)}px)`;
              const on = c.i === spoken;
              const paint = c.w.color ? solid(c.w.color) : solo ? solid(strip) : on ? solid(style.active.color) : restFill(c.w, style);
              return (
                <span
                  key={c.w.id}
                  style={{
                    ...typeCss(style, sc, px), ...paint, ...strokeCss(style.stroke, sc), textShadow: shadow,
                    opacity: showOpacity(c.w, timeMs, FRAME, EASE.linear, settled), transform: t > 0 ? move : undefined,
                    marginRight: wi === line.length - 1 ? 0 : gapPx(style, sc, px),
                  }}
                >
                  {c.text}
                </span>
              );
            })}
          </div>
        );
      })}
    </TFrame>
  );
};
