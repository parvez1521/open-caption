/**
 * Trending layouts carried by card motion: tight rows that rise tilted, overshoot and settle (with a floating solo
 * keyword revealed letter by letter), and cards that whip in blurred, each pushed out by the next card's entrance.
 * Motion values are the catalogue's (30 fps frames → ms), scaled by the motion intensity. Pure in `timeMs`.
 */
import React from "react";
import { showAt } from "../motion";
import { strokeCss } from "../text";
import type { PageRenderProps } from "../types";
import { EASE, bezier } from "./kit";
import { cellsOf, fitCells, gapPx, restFill, solid, typeCss } from "./lines-engine";
import {
  FRAME, TFrame, clamp01, fr, glowAt, joinLayers, lerp, linesOf, opt, ord, segmentAt, shadowsAt, showOpacity, soloSegments,
} from "./trending-kit";

// ============================================================ tilted rows that rise, overshoot and settle

/** per-row tilt pairs (from → to) for the rise variants, and the fixed tilts of the flicker variant */
const TILTS: [number, number][] = [[-7, 3], [9.5, -3], [-9, 1]];
const FLICKER_TILTS = [3, -2.5];
/** flicker loop: six steps (s), alternating full and 0.85 opacity */
const FLICKER = [1 / 15, 0.1, 0.1, 1 / 15, 0.1, 1 / 15];
const FLICKER_SUM = FLICKER.reduce((a, b) => a + b, 0);

const TILT_EASE = bezier(0, 0.56, 0.46, 1);
const UP_EASE = bezier(0.17, 0.17, 0.19, 1);
const SETTLE_EASE = bezier(0.52, -0.01, 0.35, 1);
/** rise: from 0.635 em below, overshooting to 0.423 em above at 55 % of 2/3 s, then settling */
const RISE_S = 2 / 3;
const FROM_EM = 60 / 94.5;
const OVER_EM = -40 / 94.5;
/** blur-rise: 1.06 em over 0.5 s, blur 0.15 em → 0 over 1/3 s */
const BLUR_RISE_EM = 100 / 94.5;
/** each row sits 0.15 em higher than the one before (tight, overlapping rows) */
const ROW_TUCK_EM = 0.15;
/** the solo keyword's float: two summed sines (0.75 Hz and 1.618× that), ±0.21 em and ±3° */
const FLOAT_EM = 0.2116;

const float = (tSec: number, amp: number, phase: number) => {
  const a = 2 * Math.PI * 0.75 * tSec;
  return 0.5 * amp * (Math.sin(a + phase) + Math.sin(1.618 * a + 1.7 * phase));
};

type RowMotion = { y: number; rot: number; blur: number; opacity: number };

function riseRow(variant: "rise" | "blur" | "flicker", tSec: number, row: number, em: number, settled?: boolean): RowMotion {
  const tuck = -ROW_TUCK_EM * row * em;
  const [from, to] = TILTS[row % TILTS.length]!;
  if (variant === "flicker") {
    if (settled) return { y: tuck, rot: FLICKER_TILTS[row % 2]!, blur: 0, opacity: 1 };
    const u = ((Math.max(0, tSec) % FLICKER_SUM) + FLICKER_SUM) % FLICKER_SUM;
    let acc = 0;
    let op = 1;
    for (let i = 0; i < FLICKER.length; i++) {
      acc += FLICKER[i]!;
      if (u < acc - 1e-9) { op = i % 2 === 0 ? 1 : 0.85; break; }
    }
    return { y: tuck, rot: FLICKER_TILTS[row % 2]!, blur: 0, opacity: op };
  }
  if (settled) return { y: tuck, rot: to, blur: 0, opacity: 1 };
  if (variant === "blur") {
    const i = tSec - row * 0.5 * 0.1;
    const a = TILT_EASE(clamp01(i / 0.5));
    return { y: lerp(BLUR_RISE_EM * em, 0, a) + tuck, rot: lerp(from, to, a), blur: em * lerp(0.15, 0, TILT_EASE(clamp01(i / (1 / 3)))), opacity: i < 0 ? 0 : 1 };
  }
  const i = tSec - row * RISE_S * 0.1;
  const o = 0.55 * RISE_S;
  const y = i <= o ? lerp(FROM_EM * em, OVER_EM * em, UP_EASE(clamp01(i / o))) : lerp(OVER_EM * em, 0, SETTLE_EASE(clamp01((i - o) / (RISE_S - o))));
  return { y: y + tuck, rot: lerp(from, to, TILT_EASE(clamp01(i / RISE_S))), blur: 0, opacity: i < 0 ? 0 : 1 };
}

const RISE_VARIANTS = ["rise", "blur", "rise", "flicker"] as const;

/**
 * Tight sentence-case rows (tracking −0.05 em, line height 0.9, each row tucked 0.15 em up): the first row in the
 * highlight colour, the next in the text colour. Rows rise with their own tilt pair, overshoot and settle; cards cycle
 * through rise, blur-rise and a tilted flicker. Every `soloEvery`-th card gives its key word a card of its own at
 * 1.5×: revealed letter by letter, then floating on two summed sines.
 */
export const TiltRiseLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, settled } = p;
  const seg = segmentAt(soloSegments(page, opt(style, "soloEvery", 3)), timeMs);
  const sp = seg.page;
  const solo = seg.solo;
  const mult = solo ? opt<number>(style, "soloScale", 1.5) : 1;
  const lines = solo ? [sp.words] : linesOf(sp, true);
  const cells = cellsOf(sp, style, lines, () => ({ mult }));
  const fit = fitCells(p, cells);
  const { sc, size, intensity: k } = fit;
  const px = size * mult;
  const ratio = px / (style.fontSize * sc);
  const shadow = joinLayers([...shadowsAt(style, sc, ratio), ...glowAt(style, sc)]);
  const tSec = (timeMs - sp.startMs) / 1000;
  const variant = RISE_VARIANTS[ord(page) % RISE_VARIANTS.length]!;

  const rowPaint = (li: number, w: (typeof sp.words)[number]) => (w.color ? solid(w.color) : li % 2 === 0 ? solid(style.active.color) : restFill(w, style));

  if (solo) {
    const c = cells[0]![0]!;
    const letters = Array.from(c.text);
    // letters appear one by one from the spoken time: 2 frames each, squeezed into the first half of a short card
    const per = Math.min(fr(2), Math.max(FRAME / 4, (sp.endMs - showAt(c.w)) * 0.5 / Math.max(1, letters.length)));
    const t = settled ? 0 : Math.max(0, tSec);
    const fx = float(t, FLOAT_EM * size, 0) * k;
    const fy = float(t, FLOAT_EM * size, 0.9) * k;
    const fr3 = float(t, 3, 2.1) * k;
    return (
      <TFrame p={p} box={fit.box} size={size} motion={{ transform: `translate(${fx.toFixed(2)}px, ${fy.toFixed(2)}px) rotate(${fr3.toFixed(3)}deg)` }}>
        <span style={{ ...typeCss(style, sc, px), ...rowPaint(0, c.w), ...strokeCss(style.stroke, sc), textShadow: shadow }}>
          {letters.map((ch, i) => (
            <span key={i} style={{ opacity: settled || timeMs >= showAt(c.w) + i * per ? 1 : 0 }}>{ch}</span>
          ))}
        </span>
      </TFrame>
    );
  }

  return (
    <TFrame p={p} box={fit.box} size={size}>
      {cells.map((line, li) => {
        const m = riseRow(variant, tSec, li, size, settled);
        const tuck = -ROW_TUCK_EM * li * size;
        // intensity scales the travel and the tilt, never the row tuck
        const ty = tuck + (m.y - tuck) * k;
        return (
          <div
            key={li}
            style={{
              display: "flex", alignItems: "baseline", whiteSpace: "pre", position: "relative",
              transform: `translateY(${ty.toFixed(2)}px) rotate(${(m.rot * k).toFixed(3)}deg)`, opacity: m.opacity,
              ...(m.blur > 0.05 ? { filter: `blur(${(m.blur * k).toFixed(2)}px)` } : {}),
            }}
          >
            {line.map((c, wi) => (
              <span
                key={c.w.id}
                style={{
                  ...typeCss(style, sc, px), ...rowPaint(li, c.w), ...strokeCss(style.stroke, sc), textShadow: shadow,
                  opacity: showOpacity(c.w, timeMs, fr(6), EASE.ease, settled), marginRight: wi === line.length - 1 ? 0 : gapPx(style, sc, px),
                }}
              >
                {c.text}
              </span>
            ))}
          </div>
        );
      })}
    </TFrame>
  );
};

// ============================================================ blurred whip-in cards, pushed out by the next card

/** whip-in: 10 frames, ease (0,.74,0,1); blur 6 px → 0 over 4 frames (linear); slides are 100 px at the 85.5 px design size */
const WHIP = bezier(0, 0.74, 0, 1);
const SLIDE_EM = 100 / 85.5;
const BLUR_EM = 6 / 85.5;
interface Whip { scale?: number; rot?: number; x?: number }
/** the card variants, in order: scale + tilt, from the left, from the right, plain scale-in */
const WHIPS: Whip[] = [{ scale: 0.5, rot: -5 }, { x: -1 }, { x: 1 }, { scale: 0.5 }];

/**
 * Bold caps on two lines, a different blurred whip-in per card (scale 0.5 → 1 with a −5° turn, a slide from the left,
 * a slide from the right, a scale-in). In its last 2 frames a card is pushed out the way the next card comes in: a
 * slide from the left pushes it right, a slide from the right pushes it left, a scale-in grows it to 1.1.
 */
export const WhipCardsLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, settled } = p;
  const cells = cellsOf(page, style, linesOf(page, true));
  const fit = fitCells(p, cells);
  const { sc, size, intensity: k } = fit;
  const ratio = size / (style.fontSize * sc);
  const shadow = joinLayers([...shadowsAt(style, sc, ratio), ...glowAt(style, sc)]);
  const n = WHIPS.length;
  const v = WHIPS[ord(page) % n]!;
  const next = WHIPS[(ord(page) + 1) % n]!;

  const local = timeMs - page.startMs;
  const e = settled ? 1 : WHIP(clamp01(local / fr(10)));
  const b = settled ? 0 : 1 - clamp01(local / fr(4));
  let x = (v.x ?? 0) * SLIDE_EM * size * (1 - e);
  let scale = lerp(v.scale ?? 1, 1, e);
  const rot = lerp(v.rot ?? 0, 0, e);
  // the push-out: the next card's entrance direction, over the card's last 2 frames
  const left = page.endMs - timeMs;
  if (!settled && left < fr(2) && local > fr(10)) {
    const q = clamp01(1 - left / fr(2));
    if (next.x) x += -next.x * SLIDE_EM * size * q;
    else scale *= lerp(1, 1.1, q);
  }
  const motion: React.CSSProperties = {
    transform: `translateX(${(x * k).toFixed(2)}px) scale(${(1 + (scale - 1) * k).toFixed(4)}) rotate(${(rot * k).toFixed(3)}deg)`,
    ...(b > 0 ? { filter: `blur(${(b * BLUR_EM * size * Math.min(1, k)).toFixed(2)}px)` } : {}),
  };

  return (
    <TFrame p={p} box={fit.box} size={size} motion={motion}>
      {cells.map((line, li) => (
        <div key={li} style={{ display: "flex", justifyContent: "center", alignItems: "baseline", whiteSpace: "pre" }}>
          {line.map((c, wi) => (
            <span
              key={c.w.id}
              style={{
                ...typeCss(style, sc, size), ...restFill(c.w, style), ...strokeCss(style.stroke, sc), textShadow: shadow,
                opacity: showOpacity(c.w, timeMs, FRAME, EASE.linear, settled), marginRight: wi === line.length - 1 ? 0 : gapPx(style, sc, size),
              }}
            >
              {c.text}
            </span>
          ))}
        </div>
      ))}
    </TFrame>
  );
};
