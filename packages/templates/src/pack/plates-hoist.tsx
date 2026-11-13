/**
 * Hoisted key word layouts: the card's key word leaves the caption line and gets a line of its own, drawn huge on a
 * coloured plate.
 *  - StampHoistLayout (VEED "Asphalt"): condensed caps rise in; the key word is stamped ABOVE them as dark Anton on
 *    an orange plate, tilted -3.5deg / +2.8deg on alternate cards, landing with a squash.
 *  - BlockCutInLayout (VEED "Interrupt"): mono caps rise in; the key word cuts in on its own line as huge dark Anton
 *    on a colour block that opens sideways. Cards alternate red + left-aligned / cyan + right-aligned.
 */
import React from "react";
import type { Word } from "@capseasy/shared";
import { effectiveIntensity, exitStyle, showAt } from "../motion";
import { backgroundCss, containerCss, displayText, layoutBox, scaleOf } from "../text";
import type { PageRenderProps } from "../types";
import { optStr, px, specOf } from "./graphic-common";
import { EASES, clamp, keyIndex, letterCount, ord, riseIn, runCss, seg, solidOf, wordFill } from "./plates-kit";

/** a flowing row of body words (wraps like the source's text box), each entering on its own beat */
const BodyFlow: React.FC<{
  words: Word[]; texts: string[]; justify: string; size: number; columnGap: number; rowGap: number; css: (w: Word) => React.CSSProperties; motion: (w: Word) => React.CSSProperties;
}> = ({ words, texts, justify, size, columnGap, rowGap, css, motion }) =>
  words.length ? (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: justify, alignItems: "baseline", columnGap, rowGap, width: "100%", fontSize: size }}>
      {words.map((w, i) => (
        <span key={w.id} style={{ display: "inline-block", ...motion(w) }}>
          <span style={css(w)}>{texts[i]}</span>
        </span>
      ))}
    </div>
  ) : null;

// ---------------------------------------------------------------------------------------------- stamp (Asphalt)

/**
 * Stamp squash (source keyframe stHit): scale (1.14, 1.3) -> (1.03, 0.93) at 120 ms (cubicOut) -> (0.99, 1.02) at
 * 179 ms (quadOut) -> (1, 1) at 230 ms (quadOut); alpha 0 -> 1 over 80 ms (cubicOut). `k` scales the deformation.
 */
function stampHit(timeMs: number, startMs: number, k: number, settled?: boolean): { sx: number; sy: number; alpha: number } {
  if (settled) return { sx: 1, sy: 1, alpha: 1 };
  if (timeMs < startMs) return { sx: 1, sy: 1, alpha: 0 };
  const ms = timeMs - startMs;
  const alpha = seg(timeMs, startMs, 0, 80, EASES.cubicOut);
  if (ms >= 230) return { sx: 1, sy: 1, alpha };
  let sx: number, sy: number;
  if (ms < 120) {
    const e = EASES.cubicOut(ms / 120);
    sx = 1.14 + (1.03 - 1.14) * e; sy = 1.3 + (0.93 - 1.3) * e;
  } else if (ms < 179) {
    const e = EASES.quadOut((ms - 120) / 59);
    sx = 1.03 + (0.99 - 1.03) * e; sy = 0.93 + (1.02 - 0.93) * e;
  } else {
    const e = EASES.quadOut((ms - 179) / 51);
    sx = 0.99 + (1 - 0.99) * e; sy = 1.02 + (1 - 1.02) * e;
  }
  return { sx: 1 + (sx - 1) * k, sy: 1 + (sy - 1) * k, alpha };
}

/** Anton-style display caps: cap top / baseline inside a line box of 1, in em (plates hug the capitals) */
const CAP_TOP = 0.19;
const CAP_BOTTOM = 0.08;

export const StampHoistLayout: React.FC<PageRenderProps> = ({ page, timeMs, style, canvas, measure, settled }) => {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const k = effectiveIntensity(style, page.emotion);
  const ki = keyIndex(page);
  // the stamp needs a real word: emphasis always qualifies, otherwise 3+ letters (short function words stay in the line)
  const key = ki >= 0 && (page.words[ki]!.emphasis === "hero" || page.words[ki]!.emphasis === "strong" || letterCount(page.words[ki]!) >= 3) ? ki : -1;
  const body = page.words.filter((_, i) => i !== key);
  const bodyTexts = body.map((w) => displayText(w, style));
  const base0 = style.fontSize * sc;
  const spec = specOf(style, sc);
  const widestBody = Math.max(0, ...bodyTexts.map((t) => measure(t, { ...spec, fontSize: base0 })));
  const base = widestBody > box.width ? base0 * (box.width / widestBody) : base0;

  // stamp: Anton scaled to fill 86 % of the wrap width, between 2x and 2.6x the body (hero scale = the upper bound)
  const heroFont = style.hero.fontId ?? "Anton";
  const heroWeight = style.hero.fontWeight ?? 400;
  const heroText = key >= 0 ? displayText(page.words[key]!, style, style.hero.casing ?? style.casing) : "";
  const hiScale = style.hero.scale;
  const loScale = hiScale * (2 / 2.6);
  const w1 = key >= 0 ? Math.max(1, measure(heroText, { fontFamily: specOf(style, sc, { fontId: heroFont }).fontFamily, fontWeight: heroWeight, fontSize: base })) : 1;
  const padX = 0.21;
  let heroSize = base * clamp((0.86 * box.width) / w1, loScale, hiScale);
  // never wider than the frame's safe area (a long word at 2x can't overflow the video)
  const safeW = canvas.width * (1 - style.safeBox.left - style.safeBox.right) * 0.96;
  const stampW = (s: number) => (w1 / base) * s + 2 * padX * s;
  if (stampW(heroSize) > safeW) heroSize *= safeW / stampW(heroSize);

  const plate = style.active.color;
  const ink = solidOf(style.hero.fill, "#16130F");
  const tilt = ord(page) % 2 === 0 ? -3.5 : 2.8;
  const hit = key >= 0 ? stampHit(timeMs, showAt(page.words[key]!), k, settled) : null;
  const lh = style.lineHeight;

  return (
    <div style={containerCss(box, style.rotation)}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", ...backgroundCss(style, sc), ...exitStyle(style, page.endMs - timeMs, settled, base) }}>
        {key >= 0 && hit ? (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 0.32 * base }}>
            {/* the whole lockup (plate + letters) tilts and squashes as one, about its centre */}
            <div style={{
              display: "inline-block", backgroundColor: plate, opacity: hit.alpha, transformOrigin: "50% 50%",
              padding: `${px((0.36 * 0.72 - CAP_TOP + 0.07) * heroSize)} ${px(padX * heroSize)} ${px((0.34 * 0.72 - CAP_BOTTOM + 0.05) * heroSize)}`,
              transform: `rotate(${tilt.toFixed(2)}deg) scale(${hit.sx.toFixed(4)}, ${hit.sy.toFixed(4)})`,
            }}>
              <span style={{ display: "block", ...runCss(style, sc, heroSize, { fontId: heroFont, fontWeight: heroWeight, fontStyle: "normal", fill: wordFill(page.words[key]!, { type: "solid", color: ink }), letterSpacing: 0, lineHeight: 1, decorate: false }) }}>{heroText}</span>
            </div>
          </div>
        ) : null}
        <BodyFlow
          words={body} texts={bodyTexts} justify="center" size={base} columnGap={0.28 * base + style.wordSpacing * sc} rowGap={(lh - 1) * base}
          css={(w) => ({ ...runCss(style, sc, base, { fill: wordFill(w, style.fill), lineHeight: 1 }) })}
          // words rise 0.333 em and fade in over 150 ms (cubicOut) from their start
          motion={(w) => riseIn(timeMs, showAt(w), 0, 150, 0.333, base, k, EASES.cubicOut, settled)}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------- block cut-in (Interrupt)

/** Block opening: scaleX 0 -> 1 from start-80 ms to start+120 ms (expoOut), alpha 0 -> 1 from start-80 ms to start (quadOut). */
function blockOpen(timeMs: number, startMs: number, settled?: boolean): { open: number; alpha: number } {
  if (settled) return { open: 1, alpha: 1 };
  return { open: seg(timeMs, startMs, -80, 120, EASES.expoOut), alpha: seg(timeMs, startMs, -80, 0, EASES.quadOut) };
}

export const BlockCutInLayout: React.FC<PageRenderProps> = ({ page, timeMs, style, canvas, measure, settled }) => {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const k = effectiveIntensity(style, page.emotion);
  const ki = keyIndex(page);
  const key = ki >= 0 && (page.words[ki]!.emphasis === "hero" || page.words[ki]!.emphasis === "strong" || letterCount(page.words[ki]!) >= 2) ? ki : -1;
  const before = key >= 0 ? page.words.slice(0, key) : page.words;
  const after = key >= 0 ? page.words.slice(key + 1) : [];
  const base0 = style.fontSize * sc;
  const spec = specOf(style, sc);
  const textsOf = (ws: Word[]) => ws.map((w) => displayText(w, style));
  const widestBody = Math.max(0, ...[...before, ...after].map((w) => measure(displayText(w, style), { ...spec, fontSize: base0 })));
  const base = widestBody > box.width ? base0 * (box.width / widestBody) : base0;

  // odd cards (1st, 3rd, ...) red and left-aligned, even cards cyan and right-aligned
  const even = ord(page) % 2 === 0;
  const justify = even ? "flex-start" : "flex-end";
  const block = even ? style.active.color : optStr(style, "altBlock", "#00E5FF");
  const ink = solidOf(style.hero.fill, "#0B0B0E");

  // key word: Anton sized to fill the wrap width, between 3x and 6.3x the body (hero scale = the lower bound; the
  // style schema caps it at 4, so the upper bound is 2.1x it)
  const heroFont = style.hero.fontId ?? "Anton";
  const heroWeight = style.hero.fontWeight ?? 400;
  const heroText = key >= 0 ? displayText(page.words[key]!, style, style.hero.casing ?? style.casing) : "";
  const track = 0.01;
  const padX = 0.09;
  const w1 = key >= 0 ? Math.max(1, measure(heroText, { fontFamily: specOf(style, sc, { fontId: heroFont }).fontFamily, fontWeight: heroWeight, fontSize: base, letterSpacing: track * base })) : 1;
  const loScale = style.hero.scale;
  const hiScale = loScale * 2.1;
  const unit = w1 / base + 2 * padX; // block width per px of hero size
  let heroSize = base * clamp(box.width / (unit * base), loScale, hiScale);
  if (heroSize * unit > box.width) heroSize = box.width / unit; // a long word shrinks to the wrap width instead of overflowing
  const open = key >= 0 ? blockOpen(timeMs, showAt(page.words[key]!), settled) : null;
  const lh = style.lineHeight;
  const rowGap = (lh - 1) * base;

  const flow = (ws: Word[]) => (
    <BodyFlow
      words={ws} texts={textsOf(ws)} justify={justify} size={base} columnGap={0.6 * base + style.wordSpacing * sc} rowGap={rowGap}
      css={(w) => runCss(style, sc, base, { fill: wordFill(w, style.fill), lineHeight: 1 })}
      // words rise 0.5 em and fade in from start-80 ms to start+160 ms (expoOut)
      motion={(w) => riseIn(timeMs, showAt(w), -80, 160, 0.5, base, k, EASES.expoOut, settled)}
    />
  );

  return (
    <div style={containerCss(box, style.rotation)}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: justify, rowGap, width: "100%", ...backgroundCss(style, sc), ...exitStyle(style, page.endMs - timeMs, settled, base) }}>
        {flow(before)}
        {key >= 0 && open ? (
          <div style={{ display: "flex", justifyContent: justify, width: "100%" }}>
            <div style={{ position: "relative", display: "inline-block", padding: `${px(0.035 * heroSize)} ${px(padX * heroSize)} ${px(0.06 * heroSize)}`, ...riseIn(timeMs, showAt(page.words[key]!), -80, 160, 0.5, base, k, EASES.expoOut, settled) }}>
              {/* the block opens sideways from the side the card is aligned to */}
              <span style={{ position: "absolute", inset: 0, backgroundColor: block, opacity: open.alpha, transform: `scaleX(${(1 - (1 - open.open) * Math.min(1, k)).toFixed(4)})`, transformOrigin: even ? "0% 50%" : "100% 50%" }} />
              <span style={{ position: "relative", display: "block", ...runCss(style, sc, heroSize, { fontId: heroFont, fontWeight: heroWeight, fontStyle: "normal", fill: wordFill(page.words[key]!, { type: "solid", color: ink }), letterSpacing: track * heroSize, lineHeight: 0.92, decorate: false }) }}>{heroText}</span>
            </div>
          </div>
        ) : null}
        {flow(after)}
      </div>
    </div>
  );
};

