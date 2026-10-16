/**
 * Typographic compositions, part C: Perfect (longest word huge, the rest small), Spotlight (giant hero with small
 * rows and vertical side accents), Gilded (huge display headline over a Bodoni line built word by word), Story
 * (editorial serif, italic accent, indented second line).
 */
import React from "react";
import { showAt } from "../motion";
import { displayText } from "../text";
import type { PageRenderProps } from "../types";
import { EASE, keyWordIndex, linear01, pageSeed, pick, shade, withAlpha } from "./kit";
import { type Face, Frame, Ink, type Row, RowsView, type Tok, alnumLen, fillPaint, fitK, fitRows, motionCss, scaleFace, shadowStack, strokeOf, textW, textsOf, typoCtx } from "./typo-kit";

const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a) }, (_, j) => a + j);
const opt = <T,>(o: Record<string, unknown>, key: string, dflt: T): T => (o[key] as T | undefined) ?? dflt;
const px = (v: number) => `${v.toFixed(2)}px`;
const heroColorOf = (fill: { type: "solid"; color: string } | { type: "gradient"; stops: { color: string }[] } | undefined, dflt: string) =>
  fill?.type === "solid" ? fill.color : fill ? fill.stops[0]!.color : dflt;

/* ------------------------------------------------------------------ Perfect */

export const PerfectLayout: React.FC<PageRenderProps> = (p) => {
  const { page, style, timeMs, measure, settled } = p;
  const c = typoCtx(p);
  const texts = textsOf(page, style);
  const n = texts.length;
  // the longest word renders big (the creator's own hero word wins)
  let L = page.words.findIndex((w) => w.emphasis === "hero");
  if (L < 0) L = texts.reduce((best, t, i) => (alnumLen(t) > alnumLen(texts[best]!) ? i : best), 0);
  const others = range(0, n).filter((i) => i !== L);
  const big: Face = { font: style.hero.fontId ?? style.fontId, weight: style.hero.fontWeight ?? style.fontWeight, size: c.base * style.hero.scale, ls: -0.0125 * c.base * style.hero.scale + c.ls, lh: style.lineHeight };
  const small: Face = { font: style.fontId, weight: opt(style.templateOptions, "smallWeight", 800), size: c.base, ls: -0.0125 * c.base + c.ls, lh: style.lineHeight };
  const bigRow: Row = { toks: [{ key: page.words[L]!.id, i: L, text: texts[L]!, face: big, paint: {}, gap: 0 }] };
  const smallRow: Row = { toks: others.map((i, j) => ({ key: page.words[i]!.id, i, text: texts[i]!, face: small, paint: {}, gap: j < others.length - 1 ? 0.26 * small.size + c.ws : 0 })) };
  // the small line sits on the side of the big word where most of the other words are
  const smallFirst = L >= n / 2;
  // (a little air between the lines so the small words dodge the big word's ascenders and descenders)
  const planned = others.length ? (smallFirst ? [smallRow, { ...bigRow, mt: 0.04 * big.size }] : [bigRow, { ...smallRow, mt: 0.06 * big.size }]) : [bigRow];
  const { rows } = fitRows(planned, measure, c.box.width);
  const sh = shadowStack(style, c.sc);
  const stroke = strokeOf(style, c.sc);
  for (const r of rows) {
    for (const t of r.toks) {
      const isBig = t.i === L;
      t.paint = isBig ? { color: style.active.color, shadow: sh, stroke } : { ...fillPaint(style.fill), shadow: sh, stroke };
      const start = showAt(page.words[t.i]!);
      if (!settled && timeMs < start) { t.css = { opacity: 0 }; continue; }
      // perfectPopUp: Y 18px, scale 0.92 -> rest; 0.28 s back-out
      const q = settled ? 1 : linear01(timeMs, start, 280);
      const e = 1 - EASE.backOut(q);
      t.css = motionCss({ o: (isBig ? 1 : 0.95) * Math.min(1, q / 0.35), y: e * 0.45 * c.base * c.k, s: 1 - e * 0.08 * c.k });
    }
  }
  return (
    <Frame p={p} sizePx={c.base}>
      <RowsView rows={rows} />
    </Frame>
  );
};

/* ------------------------------------------------------------------ Spotlight */

export const SpotlightLayout: React.FC<PageRenderProps> = (p) => {
  const { page, style, timeMs, measure, settled } = p;
  const c = typoCtx(p);
  const texts = textsOf(page, style);
  const n = texts.length;
  const h = keyWordIndex(page);
  const seed = pageSeed(page);
  const before = range(0, h);
  const after = range(h + 1, n);
  // side accents: the word just before the hero runs up its left side, the word just after down its right side
  // (when there are enough words for a row above/below as well; seeded which side goes first on short cards)
  let left = -1;
  let right = -1;
  if (before.length >= 2) left = before.pop()!;
  if (after.length >= 2) right = after.shift()!;
  if (left < 0 && right < 0 && before.length + after.length >= 2) {
    if (pick(seed, 2, 80) === 0 && before.length) left = before.pop()!;
    else if (after.length) right = after.shift()!;
  }
  const hero = style.hero;
  const heroF: Face = { font: hero.fontId ?? style.fontId, weight: hero.fontWeight ?? style.fontWeight, size: c.base * hero.scale, ls: -0.0134 * c.base * hero.scale + c.ls, lh: style.lineHeight };
  // small rows are the base size (~0.26 of the default hero)
  const smallF: Face = { font: style.fontId, weight: opt(style.templateOptions, "smallWeight", 800), size: c.base * opt(style.templateOptions, "smallScale", 0.66), ls: c.ls, lh: 1.05 };
  const gapS = 0.26 * smallF.size + c.ws;
  // nominal geometry, then one fit factor for everything
  const heroW = textW(measure, texts[h]!, heroF);
  const heroH = heroF.size * 0.85;
  const sideSize = (i: number) => Math.min(smallF.size, smallF.size * (heroH / Math.max(1, textW(measure, texts[i]!, smallF))));
  const sideBox = (i: number) => (i < 0 ? 0 : sideSize(i) * 1.15 + heroF.size * 0.07);
  const rowW = (ids: number[]) => ids.reduce((a, i, j) => a + textW(measure, texts[i]!, smallF) + (j < ids.length - 1 ? gapS : 0), 0);
  const f = fitK([heroW + sideBox(left) + sideBox(right), rowW(before), rowW(after)], c.box.width);
  const H = scaleFace(heroF, f);
  const S = scaleFace(smallF, f);
  const sh = shadowStack(style, c.sc);
  const stroke = strokeOf(style, c.sc);
  const ctxPaint = { ...fillPaint(style.fill), shadow: sh, stroke };
  const tuck = { color: style.active.color, shadow: sh, stroke };
  const pop = (i: number, size: number): React.CSSProperties | null => {
    const start = showAt(page.words[i]!);
    if (!settled && timeMs < start) return null;
    // spotlightPop: scale 0.4, Y 0.2em -> rest; 0.45 s back-out
    const q = settled ? 1 : linear01(timeMs, start, 450);
    const e = 1 - EASE.backOut(q);
    return motionCss({ o: Math.min(1, q / 0.3), s: 1 - e * 0.6 * Math.min(1.5, c.k), y: e * 0.2 * size * c.k });
  };
  const smallRow = (ids: number[]) =>
    ids.length ? (
      <div style={{ display: "flex", whiteSpace: "pre", justifyContent: "center", alignItems: "baseline" }}>
        {ids.map((i, j) => <Ink key={page.words[i]!.id} text={texts[i]!} face={S} paint={ctxPaint} css={{ ...(pop(i, S.size) ?? { opacity: 0 }), marginRight: j < ids.length - 1 ? gapS * f : undefined }} />)}
      </div>
    ) : null;
  const side = (i: number, rot: number) => {
    if (i < 0) return null;
    const face = { ...S, size: sideSize(i) * f, lh: 1 };
    const len = textW(measure, texts[i]!, face);
    const m = pop(i, face.size);
    const motion = m?.transform ? ` ${m.transform as string}` : "";
    return (
      <span style={{ position: "relative", display: "inline-block", width: face.size * 1.15, height: len, margin: `0 ${px(heroF.size * 0.035 * f)}` }}>
        <Ink text={texts[i]!} face={face} paint={tuck} css={{ position: "absolute", left: "50%", top: "50%", ...(m ?? { opacity: 0 }), transform: `translate(-50%, -50%) rotate(${rot}deg)${motion}` }} />
      </span>
    );
  };
  const heroPop = pop(h, H.size);
  return (
    <Frame p={p} sizePx={c.base}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {smallRow(before)}
        <div style={{ display: "flex", alignItems: "center", whiteSpace: "pre", margin: `${px(0.05 * H.size)} 0` }}>
          {side(left, -90)}
          <Ink text={texts[h]!} face={H} paint={{ color: style.active.color, shadow: sh, stroke }} css={heroPop ?? { opacity: 0 }} />
          {side(right, 90)}
        </div>
        {smallRow(after)}
      </div>
    </Frame>
  );
};

/* ------------------------------------------------------------------ Gilded */

export const GildedLayout: React.FC<PageRenderProps> = (p) => {
  const { page, style, timeMs, measure, settled } = p;
  const c = typoCtx(p);
  const texts = textsOf(page, style);
  const n = texts.length;
  const h = keyWordIndex(page);
  const hero = style.hero;
  const headText = displayText(page.words[h]!, style, hero.casing ?? "upper");
  const rest = range(0, n).filter((i) => i !== h);
  const headF: Face = { font: hero.fontId ?? style.fontId, weight: hero.fontWeight ?? 900, size: c.base * hero.scale, ls: 0.02 * c.base * hero.scale + c.ls, lh: 1 };
  const lineF: Face = { font: style.fontId, weight: style.fontWeight, size: c.base, ls: c.ls, lh: style.lineHeight };
  const planned: Row[] = [
    { toks: [{ key: page.words[h]!.id, i: h, text: headText, face: headF, paint: {}, gap: 0 }] },
    { toks: rest.map((i, j) => ({ key: page.words[i]!.id, i, text: texts[i]!, face: lineF, paint: {}, gap: j < rest.length - 1 ? 0.28 * lineF.size + c.ws : 0 })), mt: opt(style.templateOptions, "gap", 0.9) * c.base },
  ];
  const { rows } = fitRows(planned, measure, c.box.width);
  const sh = shadowStack(style, c.sc);
  const fillC = style.fill.type === "solid" ? style.fill.color : style.fill.stops[0]!.color;
  const userStroke = strokeOf(style, c.sc);
  for (const r of rows) {
    for (const t of r.toks) {
      const isHead = t.i === h;
      const size = t.face.size;
      // the line text carries a 0.018em stroke in its own colour (the user's outline replaces it)
      // the headline is gilded: a subtle gold ramp (lighter crown, deeper base) with a soft warm glow
      const gold = style.active.color;
      t.paint = isHead
        ? {
            bg: `linear-gradient(180deg, ${shade(gold, 0.55)} 0%, ${shade(gold, 0.15)} 38%, ${gold} 55%, ${shade(gold, -0.28)} 100%)`,
            under: shade(gold, -0.35), stroke: userStroke,
            shadow: shadowStack(style, c.sc, [`0 0 ${px(0.12 * size)} ${withAlpha(gold, 0.45)}`, `0 0 ${px(0.32 * size)} ${withAlpha(gold, 0.22)}`]),
          }
        : { ...fillPaint(style.fill), shadow: sh, stroke: userStroke ?? `${px(0.018 * size)} ${fillC}` };
      const start = showAt(page.words[t.i]!);
      if (!settled && timeMs < start) { t.css = { opacity: 0 }; continue; }
      if (isHead) {
        // gildedDropIn: Y -0.45em -> 0, 0.45 s cubic-bezier(.2,.8,.2,1)
        const q = settled ? 1 : linear01(timeMs, start, 450);
        t.css = motionCss({ o: Math.min(1, q / 0.3), y: -(1 - EASE.outSoft(q)) * 0.45 * size * c.k });
      } else {
        // slide-up fade: Y 30px -> 0, 0.4 s ease-out
        const q = settled ? 1 : linear01(timeMs, start, 400);
        const e = EASE.easeOut(q);
        t.css = motionCss({ o: e, y: (1 - e) * 0.5 * size * c.k });
      }
    }
  }
  return (
    <Frame p={p} sizePx={c.base}>
      <RowsView rows={rows} />
    </Frame>
  );
};

/* ------------------------------------------------------------------ Story */

export const StoryLayout: React.FC<PageRenderProps> = (p) => {
  const { page, style, timeMs, measure, settled } = p;
  const c = typoCtx(p);
  const texts = textsOf(page, style);
  const n = texts.length;
  const a = Math.ceil(n / 2);
  const L1 = range(0, a);
  const L2 = range(a, n);
  const accent = a - 1;
  const face: Face = { font: style.fontId, weight: style.fontWeight, size: c.base, ls: c.ls, lh: style.lineHeight };
  const it: Face = { ...face, italic: true };
  const gap = 0.24 * c.base + c.ws;
  const mk = (ids: number[]): Tok[] => ids.map((i, j) => ({ key: page.words[i]!.id, i, text: texts[i]!, face: i === accent ? it : face, paint: {}, gap: j < ids.length - 1 ? gap : 0 }));
  // line 2 "steps in" by the width of line 1's first word
  const indent = L2.length ? textW(measure, texts[0]!, L1[0] === accent ? it : face) + gap : 0;
  const planned: Row[] = [{ toks: mk(L1), justify: "flex-start" }, { toks: mk(L2), justify: "flex-start", ml: indent }];
  const { rows } = fitRows(planned, measure, c.box.width);
  const sh = shadowStack(style, c.sc);
  const stroke = strokeOf(style, c.sc);
  for (const r of rows) {
    for (const t of r.toks) {
      t.paint = t.i === accent ? { color: style.active.color, shadow: sh, stroke } : { ...fillPaint(style.fill), shadow: sh, stroke };
      // slide-up fade: Y 30px -> 0 + fade, 0.4 s ease-out, words 0.1 s apart
      const start = page.startMs + t.i * 100;
      if (!settled && timeMs < start) { t.css = { opacity: 0 }; continue; }
      const q = settled ? 1 : linear01(timeMs, start, 400);
      const e = EASE.easeOut(q);
      t.css = motionCss({ o: e, y: (1 - e) * 0.71 * t.face.size * c.k });
    }
  }
  return (
    <Frame p={p} sizePx={c.base}>
      <RowsView rows={rows} />
    </Frame>
  );
};
