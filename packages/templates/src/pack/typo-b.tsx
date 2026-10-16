/**
 * Typographic compositions, part B: Impact (neon caps over a soft white line), Clean (rotating big/small lines),
 * Red Wipe (italic serif on a wiping block), Punch (loud caps line between quiet italic lines, directional slides
 * and exits), Scatter (words fly in from random offsets onto a huge hero line).
 */
import React from "react";
import type { CaptionStyleV2 } from "@capseasy/shared";
import { showAt } from "../motion";
import type { PageRenderProps } from "../types";
import { EASE, bezier, cardOrdinal, keyWordIndex, keyframes, linear01, pageSeed, pick, rand, withAlpha } from "./kit";
import { type Face, Frame, Ink, type Row, RowsView, type Tok, fillPaint, fitRows, motionCss, rowWidth, scaleFace, shadowStack, strokeOf, textsOf, typoCtx } from "./typo-kit";

const opt = <T,>(style: CaptionStyleV2, key: string, dflt: T): T => (style.templateOptions[key] as T | undefined) ?? dflt;
const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a) }, (_, j) => a + j);
const px = (v: number) => `${v.toFixed(2)}px`;

/* ------------------------------------------------------------------ Impact */

export const ImpactLayout: React.FC<PageRenderProps> = (p) => {
  const { page, style, timeMs, measure, settled } = p;
  const c = typoCtx(p);
  const texts = textsOf(page, style);
  const n = texts.length;
  // line 1: up to 3 words of neon caps; then lines of up to 2 soft white words
  const groups: number[][] = [range(0, Math.min(3, n))];
  for (let i = 3; i < n; i += 2) groups.push(range(i, Math.min(n, i + 2)));
  const f1: Face = { font: style.fontId, weight: style.fontWeight, size: c.base, ls: 0.014 * c.base + c.ls, lh: style.lineHeight };
  const f2: Face = { font: opt(style, "font2", "Montserrat"), weight: opt(style, "weight2", 700), size: c.base * (5.5 / 9), ls: c.ls, lh: style.lineHeight };
  const planned: Row[] = groups.map((g, gi) => {
    const face = gi === 0 ? f1 : f2;
    return { mt: gi ? -0.035 * c.base : undefined, toks: g.map((i, j) => ({ key: page.words[i]!.id, i, text: texts[i]!, face, paint: {}, gap: j < g.length - 1 ? (0.174 + 0.2) * face.size + c.ws : 0 })) };
  });
  const { rows } = fitRows(planned, measure, c.box.width);
  const accent = style.active.color;
  const stroke = strokeOf(style, c.sc);
  const white = style.fill.type === "solid" ? style.fill.color : style.fill.stops[0]!.color;
  rows.forEach((r, ri) => {
    for (const t of r.toks) {
      const size = t.face.size;
      const u = Math.max(1 * c.sc, 0.01 * size);
      // neon: bevel (light top-left, dark bottom-right), then the 25 px @0.9 / 50 px @0.5 glow in the accent
      t.paint = ri === 0
        ? { color: accent, stroke, shadow: shadowStack(style, c.sc, [`${px(-u)} ${px(-u)} 0 ${withAlpha(accent, 0.53)}`, `${px(u)} ${px(u)} 0 rgba(0,0,0,0.6)`, `0 0 ${px(0.17 * size)} ${withAlpha(accent, 0.9)}`, `0 0 ${px(0.35 * size)} ${withAlpha(accent, 0.5)}`]) }
        : { ...fillPaint(style.fill), stroke, shadow: shadowStack(style, c.sc, [`0 0 ${px(0.28 * size)} ${withAlpha(white, 0.8)}`, `0 0 ${px(0.45 * size)} ${withAlpha(white, 0.4)}`]) };
      const start = showAt(page.words[t.i]!);
      if (!settled && timeMs < start) { t.css = { opacity: 0 }; continue; }
      // impactPop: scale 0.7, Y 0.14em -> 1.05 / -0.035em at 70 % -> 1; 0.35 s back-out
      const q = settled ? 1 : linear01(timeMs, start, 350);
      t.css = motionCss({
        o: keyframes(q, [[0, 0], [0.4, 1]]),
        s: 1 + (keyframes(q, [[0, 0.7], [0.7, 1.05], [1, 1]], EASE.backOut) - 1) * c.k,
        y: keyframes(q, [[0, 0.14], [0.7, -0.035], [1, 0]], EASE.backOut) * size * c.k,
      });
    }
  });
  return (
    <Frame p={p} sizePx={c.base}>
      <RowsView rows={rows} />
    </Frame>
  );
};

/* ------------------------------------------------------------------ Clean */

export const CleanLayout: React.FC<PageRenderProps> = (p) => {
  const { page, style, timeMs, measure, settled } = p;
  const c = typoCtx(p);
  const texts = textsOf(page, style);
  const n = texts.length;
  const fa: Face = { font: style.fontId, weight: style.fontWeight, size: c.base, ls: -0.042 * c.base + c.ls, lh: style.lineHeight };
  const fb: Face = { font: style.fontId, weight: opt(style, "weight2", 700), size: c.base * (4.3 / 9), ls: -0.029 * c.base * (4.3 / 9) + c.ls, lh: style.lineHeight };
  // four rotating big/small layouts: A over B, B over A, side by side, staggered
  const v = cardOrdinal(page) % 4;
  let A: number[];
  let B: number[];
  if (n === 1) { A = [0]; B = []; }
  else if (v === 1) { const a = Math.min(2, n - 1); B = range(0, n - a); A = range(n - a, n); }
  else { const a = Math.min(2, n - 1); A = range(0, a); B = range(a, n); }
  const mk = (ids: number[], face: Face): Tok[] => ids.map((i, j) => ({ key: page.words[i]!.id, i, text: texts[i]!, face, paint: {}, gap: j < ids.length - 1 ? (0.097 + 0.22) * face.size + c.ws : 0 }));
  const lineGap = -0.097 * c.base;
  let planned: Row[];
  if (v === 2 && B.length) {
    const ta = mk(A, fa);
    ta[ta.length - 1]!.gap = 0.18 * fa.size + c.ws;
    planned = [{ toks: [...ta, ...mk(B, fb)] }];
  } else if (v === 1) planned = [{ toks: mk(B, fb) }, { toks: mk(A, fa), mt: B.length ? lineGap : undefined }];
  else if (v === 3) planned = [{ toks: mk(A, fa), justify: "flex-end" }, { toks: mk(B, fb), justify: "flex-start", mt: lineGap }];
  else planned = [{ toks: mk(A, fa) }, { toks: mk(B, fb), mt: lineGap }];
  const { rows } = fitRows(planned, measure, c.box.width);
  const stroke = strokeOf(style, c.sc);
  for (const r of rows) {
    for (const t of r.toks) {
      t.paint = { ...fillPaint(style.fill), stroke, shadow: shadowStack(style, c.sc) };
      const start = showAt(page.words[t.i]!);
      if (!settled && timeMs < start) { t.css = { opacity: 0 }; continue; }
      // cleanRise: Y 0.18em, scale 0.96 -> rest; 0.3 s cubic-bezier(.16,1,.3,1)
      const q = settled ? 1 : linear01(timeMs, start, 300);
      const e = 1 - EASE.outExpo(q);
      t.css = motionCss({ o: Math.min(1, q / 0.3), y: e * 0.18 * t.face.size * c.k, s: 1 - e * 0.04 * c.k });
    }
  }
  return (
    <Frame p={p} sizePx={c.base}>
      <RowsView rows={rows} />
    </Frame>
  );
};

/* ------------------------------------------------------------------ Red Wipe */

export const RedWipeLayout: React.FC<PageRenderProps> = (p) => {
  const { page, style, timeMs, measure, settled } = p;
  const c = typoCtx(p);
  const texts = textsOf(page, style);
  const n = texts.length;
  const m = n >= 2 ? Math.max(1, Math.floor(n / 2)) : 0;
  const L1 = range(0, n - m);
  const L2 = range(n - m, n);
  const f1: Face = { font: style.fontId, weight: style.fontWeight, size: c.base * (6.5 / 7.5), ls: -0.019 * c.base + c.ls, lh: style.lineHeight };
  const f2: Face = { font: opt(style, "serifFont", "Playfair Display"), weight: opt(style, "serifWeight", 700), italic: true, size: c.base, ls: c.ls, lh: style.lineHeight };
  const padX = 5 * c.sc;
  const mk = (ids: number[], face: Face): Tok[] => ids.map((i, j) => ({ key: page.words[i]!.id, i, text: texts[i]!, face, paint: {}, gap: j < ids.length - 1 ? 0.26 * face.size + c.ws : 0 }));
  const planned: Row[] = [{ toks: mk(L1, f1) }, { toks: mk(L2, f2), dx: 0 }];
  // the block's padding counts towards line 2's width
  const w2 = rowWidth(planned[1]!, measure) + 2 * padX;
  const f = Math.min(1, c.box.width / Math.max(1, rowWidth(planned[0]!, measure), w2));
  const rows = planned.map((r) => ({ ...r, toks: r.toks.map((t) => ({ ...t, face: scaleFace(t.face, f), gap: t.gap * f })) }));
  const stroke = strokeOf(style, c.sc);
  const lineStart = (ids: number[]) => (ids.length ? showAt(page.words[ids[0]!]!) : page.startMs);
  const rise = (ids: number[], size: number) => {
    const s = lineStart(ids);
    if (!settled && timeMs < s) return { opacity: 0 } as React.CSSProperties;
    const q = settled ? 1 : linear01(timeMs, s, 400);
    // redWipeRise: Y 0.38em -> 0, 0.4 s cubic-bezier(.16,1,.3,1)
    return motionCss({ o: Math.min(1, q / 0.3), y: (1 - EASE.outExpo(q)) * 0.38 * size * c.k });
  };
  const r1 = rows[0]!;
  const r2 = rows[1]!;
  for (const t of r1.toks) t.paint = { ...fillPaint(style.fill), stroke, shadow: shadowStack(style, c.sc) };
  for (const t of r2.toks) t.paint = { ...fillPaint(style.fill), stroke };
  // the block wipes in from the left 0.24 s after its line
  const wipe = settled ? 1 : L2.length ? EASE.outExpo(linear01(timeMs, lineStart(L2) + 240, 400)) : 0;
  return (
    <Frame p={p} sizePx={c.base}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {r1.toks.length ? (
          <div style={{ display: "flex", whiteSpace: "pre", alignItems: "baseline", ...rise(L1, r1.toks[0]!.face.size) }}>
            {r1.toks.map((t, j) => <Ink key={t.key} text={t.text} face={t.face} paint={t.paint} css={{ marginRight: j < r1.toks.length - 1 ? t.gap : undefined }} />)}
          </div>
        ) : null}
        {r2.toks.length ? (
          <div style={{ position: "relative", display: "flex", whiteSpace: "pre", alignItems: "baseline", padding: `0 ${px(padX * f)}`, ...rise(L2, r2.toks[0]!.face.size) }}>
            {wipe > 0.001 ? (
              <div aria-hidden style={{ position: "absolute", left: 0, top: "10%", bottom: "5%", width: `${(wipe * 100).toFixed(2)}%`, backgroundColor: style.active.color, borderRadius: 1 * c.sc }} />
            ) : null}
            {r2.toks.map((t, j) => <Ink key={t.key} text={t.text} face={t.face} paint={t.paint} css={{ marginRight: j < r2.toks.length - 1 ? t.gap : undefined }} />)}
          </div>
        ) : null}
      </div>
    </Frame>
  );
};

/* ------------------------------------------------------------------ Punch */

const PUNCH_OUT = bezier(0.7, 0, 0.84, 0);

export const PunchLayout: React.FC<PageRenderProps> = (p) => {
  const { page, style, timeMs, measure, settled } = p;
  const c = typoCtx(p);
  const loudTexts = textsOf(page, style);
  const quietTexts = textsOf(page, style, opt(style, "quietCasing", "lower") as CaptionStyleV2["casing"]);
  const n = loudTexts.length;
  const h = keyWordIndex(page);
  const loud: Face = { font: style.fontId, weight: style.fontWeight, size: c.base, ls: 0.0156 * c.base + c.ls, lh: style.lineHeight };
  const quiet: Face = { font: opt(style, "quietFont", "Merriweather"), weight: opt(style, "quietWeight", 700), italic: true, size: c.base * (4.5 / 8), ls: c.ls, lh: style.lineHeight };
  const lines = [range(0, h), [h], range(h + 1, n)].filter((l) => l.length);
  const planned: Row[] = lines.map((ids) => {
    const isLoud = ids[0] === h;
    const face = isLoud ? loud : quiet;
    return { toks: ids.map((i, j) => ({ key: page.words[i]!.id, i, text: (isLoud ? loudTexts : quietTexts)[i]!, face, paint: {}, gap: j < ids.length - 1 ? 0.26 * face.size + c.ws : 0 })) };
  });
  const { rows } = fitRows(planned, measure, c.box.width);
  const seed = pageSeed(page);
  const exitOn = opt<unknown>(style, "punchExit", true) !== false;
  const sh = shadowStack(style, c.sc);
  const shQuiet = shadowStack(style, c.sc, [], 0.78);
  const quietStroke = style.stroke.enabled && style.stroke.width > 0 ? `${px(style.stroke.width * c.sc * 0.5)} #222222` : undefined;
  return (
    <Frame p={p} sizePx={c.base}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {rows.map((r, ri) => {
          const isLoud = r.toks[0]!.i === h;
          for (const t of r.toks) t.paint = isLoud ? { color: style.active.color, stroke: strokeOf(style, c.sc), shadow: sh } : { ...fillPaint(style.fill), stroke: quietStroke, shadow: shQuiet };
          const size = r.toks[0]!.face.size;
          // each line enters from its own seeded side: left / right (X -/+1.17em) or up (Y +0.78em), a 0.04em blur clearing
          const dir = pick(seed, 3, 40 + ri);
          const start = showAt(page.words[r.toks[0]!.i]!);
          let css: React.CSSProperties;
          if (!settled && timeMs < start) css = { opacity: 0 };
          else {
            const q = settled ? 1 : linear01(timeMs, start, 500);
            const e = 1 - EASE.outExpo(q);
            let x = dir === 0 ? -1.17 * size * e : dir === 1 ? 1.17 * size * e : 0;
            let y = dir === 2 ? 0.78 * size * e : 0;
            let o = Math.min(1, q / 0.3);
            let blur = e * 0.04 * size;
            // punchExit: out the same way (left / right / down), 0.4 s cubic-bezier(.7,0,.84,0), 0.4 s before the card ends
            if (exitOn && !settled && timeMs > page.endMs - 400) {
              const x01 = PUNCH_OUT(linear01(timeMs, page.endMs - 400, 400));
              x += dir === 0 ? -1.17 * size * x01 : dir === 1 ? 1.17 * size * x01 : 0;
              y += dir === 2 ? 0.78 * size * x01 : 0;
              o *= 1 - x01;
              blur += x01 * 0.04 * size;
            }
            css = motionCss({ o, x: x * c.k, y: y * c.k, blur });
          }
          return (
            <div key={ri} style={{ display: "flex", whiteSpace: "pre", alignItems: "baseline", ...css }}>
              {r.toks.map((t, j) => <Ink key={t.key} text={t.text} face={t.face} paint={t.paint} css={{ marginRight: j < r.toks.length - 1 ? t.gap : undefined }} />)}
            </div>
          );
        })}
      </div>
    </Frame>
  );
};

/* ------------------------------------------------------------------ Scatter */

type ScTier = "small" | "mid" | "big" | "huge";
const SC_SIZE: Record<ScTier, number> = { huge: 1, big: 0.78, mid: 0.6, small: 0.42 };

export const ScatterLayout: React.FC<PageRenderProps> = (p) => {
  const { page, style, timeMs, measure, settled } = p;
  const c = typoCtx(p);
  const texts = textsOf(page, style);
  const n = texts.length;
  const seed = pageSeed(page);
  const h = keyWordIndex(page);
  // cells of 1-3 words (seeded), the hero alone in its own
  const cellsOf = (ids: number[], salt: number) => {
    const out: number[][] = [];
    let i = 0;
    let k = 0;
    while (i < ids.length) {
      const len = Math.min(ids.length - i, 1 + pick(seed, 3, salt + k++));
      out.push(ids.slice(i, i + len));
      i += len;
    }
    return out;
  };
  const pre = cellsOf(range(0, h), 50);
  const post = cellsOf(range(h + 1, n), 70);
  // the cell right before the hero joins its line (mid, highlight); the others sit above as small lines,
  // one "wide" row (cells pushed 1.1em apart) or two rows (seeded)
  const join = pre.length ? pre.pop()! : null;
  const rowsOfCells: { cells: { ids: number[]; tier: ScTier }[]; wide: boolean }[] = [];
  if (pre.length) {
    if (pre.length >= 2 && pick(seed, 2, 60) === 1) {
      const a = Math.ceil(pre.length / 2);
      rowsOfCells.push({ cells: pre.slice(0, a).map((ids) => ({ ids, tier: "small" as ScTier })), wide: false });
      rowsOfCells.push({ cells: pre.slice(a).map((ids) => ({ ids, tier: "small" as ScTier })), wide: false });
    } else rowsOfCells.push({ cells: pre.map((ids) => ({ ids, tier: "small" as ScTier })), wide: pre.length > 1 });
  }
  rowsOfCells.push({ cells: [...(join ? [{ ids: join, tier: (pick(seed, 2, 61) ? "mid" : "big") as ScTier }] : []), { ids: [h], tier: "huge" }], wide: false });
  if (post.length) rowsOfCells.push({ cells: post.map((ids) => ({ ids, tier: "small" as ScTier })), wide: post.length > 1 && pick(seed, 2, 62) === 1 });
  const hero = style.hero;
  const tierOf = new Map<number, ScTier>();
  const planned: Row[] = rowsOfCells.map((r, ri) => {
    const toks: Tok[] = [];
    r.cells.forEach((cell, ci) => {
      const isHuge = cell.tier === "huge";
      // tiers are fractions of the nominal hero size (2x the base); the hero itself follows the hero scale
      const size = isHuge ? c.base * hero.scale : c.base * 2 * SC_SIZE[cell.tier];
      const face: Face = { font: isHuge ? hero.fontId ?? style.fontId : style.fontId, weight: isHuge ? hero.fontWeight ?? style.fontWeight : style.fontWeight, size, ls: c.ls, lh: style.lineHeight };
      cell.ids.forEach((i, j) => {
        tierOf.set(i, cell.tier);
        const lastInCell = j === cell.ids.length - 1;
        const lastInRow = lastInCell && ci === r.cells.length - 1;
        const gap = lastInRow ? 0 : lastInCell ? (r.wide ? 1.1 : 0.32) * c.base * 2 * SC_SIZE.small + c.ws : 0.25 * size + c.ws;
        toks.push({ key: page.words[i]!.id, i, text: texts[i]!, face, paint: {}, gap });
      });
    });
    return { toks, mt: ri ? 0.12 * c.base : undefined };
  });
  const { rows } = fitRows(planned, measure, c.box.width);
  const stroke = strokeOf(style, c.sc);
  const heroColor = hero.fill?.type === "solid" ? hero.fill.color : hero.fill ? hero.fill.stops[0]!.color : "#fef08a";
  for (const r of rows) {
    for (const t of r.toks) {
      const tier = tierOf.get(t.i)!;
      const size = t.face.size;
      const drop = [`${px(0.035 * size)} ${px(0.035 * size)} ${px(0.06 * size)} rgba(0,0,0,0.85)`, `0 0 ${px(0.18 * size)} rgba(0,0,0,0.55)`];
      const base = tier === "huge" ? { color: heroColor } : tier === "small" ? fillPaint(style.fill) : { color: style.active.color };
      t.paint = { ...base, stroke, shadow: shadowStack(style, c.sc, drop) };
      const start = showAt(page.words[t.i]!);
      if (!settled && timeMs < start) { t.css = { opacity: 0 }; continue; }
      // scatterFly: from a random offset (+-2.2em), scale 2-4, rotation +-20deg, blur 0.18em; opaque by 40 %; 0.6 s cubic-bezier(.2,.8,.2,1)
      const q = settled ? 1 : linear01(timeMs, start, 600);
      const e = 1 - EASE.outSoft(q);
      const sid = seed ^ (t.i * 7919);
      const kk = Math.min(1.6, c.k);
      t.css = motionCss({
        o: Math.min(1, q / 0.4),
        x: (rand(sid, 1) * 2 - 1) * 2.2 * size * e * kk,
        y: (rand(sid, 2) * 2 - 1) * 2.2 * size * e * kk,
        s: 1 + (1 + rand(sid, 3) * 2) * e * kk,
        r: (rand(sid, 4) * 2 - 1) * 20 * e * kk,
        blur: 0.18 * size * e,
      });
    }
  }
  return (
    <Frame p={p} sizePx={c.base}>
      <RowsView rows={rows} />
    </Frame>
  );
};
