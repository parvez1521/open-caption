/**
 * Typographic compositions, part A: Master (seeded big word with banded fill), Simple typography (8 rotating
 * templates), Podcast (left stack, ghost words light up), Discipline (huge word + red script), Kinetic (6 slots,
 * extruded metal hero).
 */
import React from "react";
import type { CaptionStyleV2 } from "@capseasy/shared";
import { showAt } from "../motion";
import type { PageRenderProps } from "../types";
import { EASE, cardOrdinal, keyWordIndex, keyframes, linear01, pageSeed, pick, rand, shade } from "./kit";
import { type Face, Frame, type Paint, type Row, RowsView, type Tok, alnumLen, fillPaint, fitRows, motionCss, shadowStack, strokeOf, textW, textsOf, typoCtx } from "./typo-kit";

const opt = <T,>(style: CaptionStyleV2, key: string, dflt: T): T => (style.templateOptions[key] as T | undefined) ?? dflt;

/* ------------------------------------------------------------------ Master */

/**
 * The big word's "radial bands": concentric rings around a seeded centre, alternating two colours with hard edges.
 * The exporter can't draw radial gradients, so the rings are sampled into thin horizontal slices, each a hard-stop
 * linear-gradient whose stops sit where the rings cross that slice (a stepped arc that reads as the curved split),
 * plus a dark vignette towards the bottom.
 */
export function ringBands(seed: number, W: number, H: number, a: string, b: string): Pick<Paint, "bg" | "bgSize" | "bgPos"> {
  const cx = (-0.3 + rand(seed, 21) * 1.6) * W;
  const cy = H / 2 + (rand(seed, 22) < 0.5 ? -1 : 1) * (0.7 + rand(seed, 23) * 2.3) * H;
  const dist = (x: number, y: number) => Math.hypot(x - cx, y - cy);
  const near = dist(Math.min(W, Math.max(0, cx)), Math.min(H, Math.max(0, cy)));
  const far = Math.max(dist(0, 0), dist(W, 0), dist(0, H), dist(W, H));
  const bands = 2 + pick(seed, 3, 24);
  const radii: number[] = [];
  for (let j = 1; j < bands; j++) radii.push(near + ((far - near) * (j + (rand(seed, 30 + j) - 0.5) * 0.6)) / bands);
  radii.sort((x, y) => x - y);
  const startA = pick(seed, 2, 25) === 0;
  const colorAt = (x: number, y: number) => {
    const d = dist(x, y);
    const band = radii.filter((r) => r < d).length;
    return (band % 2 === 0) === startA ? a : b;
  };
  const SL = 28;
  const layers: string[] = [];
  const sizes: string[] = [];
  const pos: string[] = [];
  // dark radial vignette under the word, approximated by a vertical fade
  layers.push("linear-gradient(180deg, rgba(0,0,0,0) 38%, rgba(0,0,0,0.42) 100%)");
  sizes.push("100% 100%");
  pos.push("0 0");
  for (let s = 0; s < SL; s++) {
    const y = ((s + 0.5) / SL) * H;
    const dy = y - cy;
    const xs = radii.filter((r) => r > Math.abs(dy)).flatMap((r) => { const h = Math.sqrt(r * r - dy * dy); return [cx - h, cx + h]; }).filter((x) => x > 0 && x < W).sort((p, q) => p - q);
    const pts = [0, ...xs, W];
    const stops: string[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const c = colorAt((pts[i]! + pts[i + 1]!) / 2, y);
      stops.push(`${c} ${((pts[i]! / W) * 100).toFixed(2)}%`, `${c} ${((pts[i + 1]! / W) * 100).toFixed(2)}%`);
    }
    layers.push(`linear-gradient(90deg, ${stops.join(", ")})`);
    // px rows (the browser snaps background tiles to whole pixels: each slice overlaps the next by 1.5 px so no seam opens)
    sizes.push(`100% ${(H / SL + 1.5).toFixed(2)}px`);
    pos.push(`0 ${((s * H) / SL).toFixed(2)}px`);
  }
  return { bg: layers.join(", "), bgSize: sizes.join(", "), bgPos: pos.join(", ") };
}

export const MasterLayout: React.FC<PageRenderProps> = (p) => {
  const { page, style, timeMs, measure, settled } = p;
  const c = typoCtx(p);
  const texts = textsOf(page, style);
  const n = texts.length;
  const seed = pageSeed(page);
  const all = texts.map((_, i) => i);
  // a word is "big" material with >= 4 letters; the key word wins, otherwise a seeded one
  const qual = all.filter((i) => alnumLen(texts[i]!) >= 4);
  const kw = keyWordIndex(page);
  const big = qual.length ? (qual.includes(kw) ? kw : qual[pick(seed, qual.length, 7)]!) : -1;
  // four compositions: plain line / one line with a big word / line 2 starts with it / it stays on line 1, the last 1-2 words drop
  let comp = big < 0 ? 0 : pick(seed, 4);
  // a word the creator marked as the hero is always drawn big
  if (comp === 0 && page.words[big]?.emphasis === "hero") comp = 1;
  if (comp === 2 && big === 0) comp = 3;
  let groups: number[][] = [all];
  if (comp === 2) groups = [all.slice(0, big), all.slice(big)];
  if (comp === 3) {
    const after = n - 1 - big;
    const m = after >= 2 ? 1 + pick(seed, 2, 3) : after;
    if (m > 0) groups = [all.slice(0, n - m), all.slice(n - m)];
  }
  const isBig = (i: number) => comp !== 0 && i === big;
  const small: Face = { font: style.fontId, weight: style.fontWeight, size: c.base, ls: c.ls, lh: style.lineHeight };
  const bigF: Face = { font: style.hero.fontId ?? style.fontId, weight: style.hero.fontWeight ?? style.fontWeight, size: c.base * style.hero.scale, ls: c.ls * style.hero.scale, lh: style.lineHeight };
  const gap = c.base * 0.26 + c.ws;
  const plan: Row[] = groups.map((g) => ({ toks: g.map((i, j) => ({ key: page.words[i]!.id, i, text: texts[i]!, face: isBig(i) ? bigF : small, paint: {}, gap: j < g.length - 1 ? gap : 0 })) }));
  const { rows } = fitRows(plan, measure, c.box.width);
  const sh = shadowStack(style, c.sc);
  const stroke = strokeOf(style, c.sc);
  const fill = fillPaint(style.fill);
  const cream = opt(style, "bandColor", "#f1ebd9");
  for (const r of rows) {
    for (const t of r.toks) {
      const w = page.words[t.i]!;
      const order = t.i;
      const start = page.startMs + order * 90;
      const lt = settled ? 1 : linear01(timeMs, start, 300);
      const size = t.face.size;
      if (isBig(t.i)) {
        const W = textW(measure, t.text, t.face);
        t.paint = { ...ringBands(hashWord(w.id, seed), W, size * t.face.lh, cream, style.active.color), under: cream, shadow: sh, stroke };
      } else t.paint = { ...fill, shadow: sh, stroke };
      t.css = !settled && timeMs < start
        ? { opacity: 0 }
        : motionCss({
            o: keyframes(lt, [[0, 0], [0.6, 1]]),
            s: 1 + (keyframes(lt, [[0, 0.85], [0.6, 1.05], [1, 1]], EASE.backOut) - 1) * c.k,
            y: keyframes(lt, [[0, 0.18], [0.6, -0.03], [1, 0]], EASE.backOut) * size * c.k,
          });
    }
  }
  return (
    <Frame p={p} sizePx={c.base}>
      <RowsView rows={rows} />
    </Frame>
  );
};

const hashWord = (id: string, seed: number) => {
  let h = seed;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return h;
};

/* ------------------------------------------------------------------ Simple typography */

type Tier = "s" | "b" | "h";
const TIER: Record<Tier, number> = { s: 0.58, b: 1, h: 1.45 };
interface Cell { i: number; tier: Tier; accent?: boolean }
interface Plan { rows: { cells: Cell[]; justify?: Row["justify"] }[] }

/** the 8 typographic templates; each returns null when it doesn't suit the card's word count */
const SIMPLE: ((n: number) => Plan | null)[] = [
  // 1. big word over the small words
  (n) => (n >= 2 ? { rows: [{ cells: [{ i: 0, tier: "b" }] }, { cells: range(1, n).map((i) => ({ i, tier: "s", accent: true })) }] } : null),
  // 2. the words in a row, the middle one accent
  (n) => (n >= 2 && n <= 4 ? { rows: [{ cells: range(0, n).map((i) => ({ i, tier: "b", accent: i === Math.floor(n / 2) })) }] } : null),
  // 3. small accent word top-right, huge base word(s), small accent word bottom-left
  (n) => (n >= 3 && n <= 4 ? { rows: [{ cells: [{ i: 0, tier: "s", accent: true }], justify: "flex-end" }, { cells: range(1, n - 1).map((i) => ({ i, tier: "h" })) }, { cells: [{ i: n - 1, tier: "s", accent: true }], justify: "flex-start" }] } : null),
  // 4. a single big word
  (n) => (n === 1 ? { rows: [{ cells: [{ i: 0, tier: "h" }] }] } : null),
  // 5. two lines, line 2 accent
  (n) => {
    if (n < 2) return null;
    const a = Math.ceil(n / 2);
    return { rows: [{ cells: range(0, a).map((i) => ({ i, tier: "b" })) }, { cells: range(a, n).map((i) => ({ i, tier: "b", accent: true })) }] };
  },
  // 6. small word + huge accent word, the small words below
  (n) => (n >= 3 ? { rows: [{ cells: [{ i: 0, tier: "s" }, { i: 1, tier: "h", accent: true }] }, { cells: range(2, n).map((i) => ({ i, tier: "s" })) }] } : null),
  // 7. a small line, then "a BIG of", then a small line
  (n) => {
    if (n < 4) return null;
    const a = Math.floor((n - 3) / 2);
    return { rows: [{ cells: range(0, a).map((i) => ({ i, tier: "s" })) }, { cells: [{ i: a, tier: "s" }, { i: a + 1, tier: "h", accent: true }, { i: a + 2, tier: "s" }] }, { cells: range(a + 3, n).map((i) => ({ i, tier: "s" })) }] };
  },
  // 8. a 2x2 grid with offset alignment
  (n) => (n >= 4 && n <= 5 ? { rows: [{ cells: [{ i: 0, tier: "b" }, { i: 1, tier: "b" }], justify: "flex-start" }, { cells: range(2, n).map((i) => ({ i, tier: "b", accent: i === 2 })), justify: "flex-end" }] } : null),
];
const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a) }, (_, j) => a + j);

export const SimpleTypoLayout: React.FC<PageRenderProps> = (p) => {
  const { page, style, timeMs, measure, settled } = p;
  const c = typoCtx(p);
  const texts = textsOf(page, style);
  const n = texts.length;
  // the templates take turns card by card (skipping any that don't suit this card's word count)
  const from = cardOrdinal(page) % SIMPLE.length;
  let plan: Plan | null = null;
  for (let j = 0; j < SIMPLE.length && !plan; j++) plan = SIMPLE[(from + j) % SIMPLE.length]!(n);
  plan ??= SIMPLE[4]!(Math.max(2, n)) ?? { rows: [{ cells: [{ i: 0, tier: "h" }] }] };
  const faceOf = (tier: Tier): Face => ({ font: style.fontId, weight: style.fontWeight, size: c.base * TIER[tier], ls: c.ls, lh: style.lineHeight });
  const planned: Row[] = plan.rows.map((r) => ({
    justify: r.justify,
    toks: r.cells.map((cell, j) => {
      const next = r.cells[j + 1];
      const gap = next ? c.base * 0.24 * Math.min(TIER[cell.tier], TIER[next.tier]) * 1.6 + c.ws : 0;
      return { key: page.words[cell.i]!.id, i: cell.i, text: texts[cell.i]!, face: faceOf(cell.tier), paint: {}, gap };
    }),
  }));
  const { rows } = fitRows(planned, measure, c.box.width);
  const sh = shadowStack(style, c.sc);
  const stroke = strokeOf(style, c.sc);
  const accentOf = new Map(plan.rows.flatMap((r) => r.cells.map((x) => [x.i, x] as const)));
  for (const r of rows) {
    for (const t of r.toks) {
      const cell = accentOf.get(t.i)!;
      t.paint = cell.accent ? { color: style.active.color, shadow: sh, stroke } : { ...fillPaint(style.fill), shadow: sh, stroke };
      const start = showAt(page.words[t.i]!);
      if (!settled && timeMs < start) { t.css = { opacity: 0 }; continue; }
      if (cell.tier === "s") {
        // typoPopUp: Y +20px -> 0, 0.3 s back-out
        const q = settled ? 1 : linear01(timeMs, start, 300);
        t.css = motionCss({ o: Math.min(1, q / 0.4), y: (1 - EASE.backOut(q)) * 0.5 * c.base * c.k });
      } else {
        // typoPopScale: scale 0.5 -> 1, 0.25 s back-out
        const q = settled ? 1 : linear01(timeMs, start, 250);
        t.css = motionCss({ o: Math.min(1, q / 0.4), s: 1 - (1 - EASE.backOut(q)) * 0.5 * Math.min(1.8, c.k) });
      }
    }
  }
  return (
    <Frame p={p} sizePx={c.base}>
      <RowsView rows={rows} />
    </Frame>
  );
};

/* ------------------------------------------------------------------ Podcast */

/** row sizes (em), cycling: the stack reads big / small / bigger / big */
const POD_SIZES = [1, 0.65, 1.2, 1];

export const PodcastLayout: React.FC<PageRenderProps> = (p) => {
  const { page, style, timeMs, measure, settled } = p;
  const c = typoCtx(p);
  const texts = textsOf(page, style);
  // "dynamic": the size contrast between rows follows the motion intensity (and the card's emotion)
  const contrast = Math.min(2, c.k);
  const sizeAt = (r: number) => Math.max(0.3, 1 + (POD_SIZES[r % POD_SIZES.length]! - 1) * contrast);
  const budget = opt(style, "rowChars", 11);
  const groups: number[][] = [];
  let chars = 0;
  texts.forEach((t, i) => {
    const cur = groups[groups.length - 1];
    const cap = budget / sizeAt(groups.length - 1);
    if (cur && (groups.length >= 4 || chars + 1 + t.length <= cap)) {
      cur.push(i);
      chars += 1 + t.length;
    } else {
      groups.push([i]);
      chars = t.length;
    }
  });
  const justify: Row["justify"] = style.align === "left" ? "flex-start" : style.align === "right" ? "flex-end" : "center";
  const planned: Row[] = groups.map((g, r) => {
    const face: Face = { font: style.fontId, weight: style.fontWeight, size: c.base * sizeAt(r), ls: c.ls, lh: style.lineHeight };
    return { justify, toks: g.map((i, j) => ({ key: page.words[i]!.id, i, text: texts[i]!, face, paint: {}, gap: j < g.length - 1 ? face.size * 0.28 + c.ws : 0 })) };
  });
  const { rows } = fitRows(planned, measure, c.box.width);
  const sh = shadowStack(style, c.sc);
  const stroke = strokeOf(style, c.sc);
  const ghost = opt(style, "ghostOpacity", 0.32);
  for (const r of rows) {
    for (const t of r.toks) {
      // unspoken words wait as ghosts and brighten to full colour as spoken (0.2 s linear)
      const lit = settled ? 1 : linear01(timeMs, page.words[t.i]!.startMs, 200);
      t.paint = { ...fillPaint(style.fill), shadow: sh, stroke };
      t.css = motionCss({ o: ghost + (1 - ghost) * lit });
    }
  }
  return (
    <Frame p={p} sizePx={c.base} align={justify}>
      <RowsView rows={rows} />
    </Frame>
  );
};

/* ------------------------------------------------------------------ Discipline */

export const DisciplineLayout: React.FC<PageRenderProps> = (p) => {
  const { page, style, timeMs, measure, settled } = p;
  const c = typoCtx(p);
  const texts = textsOf(page, style);
  const scriptTexts = textsOf(page, style, "none");
  const n = texts.length;
  const d = keyWordIndex(page);
  const s = n < 2 ? -1 : d + 1 < n ? d + 1 : d - 1;
  const lo = s < 0 ? d : Math.min(d, s);
  const hi = s < 0 ? d : Math.max(d, s);
  const variant = cardOrdinal(page) % 3;
  // the tiny words are the base size; the dominant word is the hero (about 3x: the tiny line is ~0.33 of it)
  const hugeSize = c.base * style.hero.scale;
  const tinyF: Face = { font: style.fontId, weight: style.fontWeight, size: c.base, ls: c.ls, lh: 1.1 };
  const hugeF: Face = { font: style.hero.fontId ?? style.fontId, weight: style.hero.fontWeight ?? style.fontWeight, size: hugeSize, ls: -0.05 * hugeSize + c.ls, lh: style.lineHeight };
  const scriptF: Face = { font: opt(style, "scriptFont", "Alex Brush"), weight: 400, size: hugeSize * opt(style, "scriptScale", 0.85), ls: 0, lh: 1 };
  const tinyGap = tinyF.size * 0.28 + c.ws;
  const tok = (i: number, face: Face, gap: number, text = texts[i]!): Tok => ({ key: page.words[i]!.id, i, text, face, paint: {}, gap });
  const top = range(0, lo).map((i, j, a) => tok(i, tinyF, j < a.length - 1 ? tinyGap : 0));
  const tail = range(hi + 1, n).map((i, j, a) => tok(i, tinyF, j < a.length - 1 ? tinyGap : 0));
  const huge: Row = { toks: [tok(d, hugeF, 0)], z: 1 };
  const overlap = -0.28 * hugeSize;
  // the script word overlaps the huge word, a tiny word beside it; three rotating arrangements
  const J: Row["justify"][][] = [["flex-start", "flex-end"], ["center", "flex-start"], ["flex-end", "center"]];
  const [topJ, scriptJ] = J[variant]!;
  const scriptRow: Row | null = s < 0 ? null : { toks: [tok(s, scriptF, tail.length ? scriptF.size * 0.3 : 0, scriptTexts[s]), ...(s > d ? tail : [])], justify: scriptJ, items: "baseline", z: 2, dx: (scriptJ === "flex-start" ? 0.12 : scriptJ === "flex-end" ? -0.12 : 0) * hugeSize };
  const planned: Row[] = [];
  if (top.length) planned.push({ toks: top, justify: topJ });
  if (scriptRow && s < d) {
    planned.push(scriptRow);
    planned.push({ ...huge, mt: overlap });
    if (tail.length) planned.push({ toks: tail, justify: scriptJ === "flex-end" ? "flex-start" : "flex-end" });
  } else {
    planned.push(huge);
    if (scriptRow) planned.push({ ...scriptRow, mt: overlap });
  }
  const { rows } = fitRows(planned, measure, c.box.width);
  const sh = shadowStack(style, c.sc);
  const stroke = strokeOf(style, c.sc);
  for (const r of rows) {
    for (const t of r.toks) {
      const isScript = t.i === s;
      const start = showAt(page.words[t.i]!);
      t.paint = isScript
        ? { color: style.active.color, shadow: `${(1 * c.sc).toFixed(2)}px ${(1 * c.sc).toFixed(2)}px ${(2 * c.sc).toFixed(2)}px rgba(0,0,0,0.8)` }
        : { ...fillPaint(style.fill), shadow: sh, stroke };
      if (!settled && timeMs < start) { t.css = { opacity: 0 }; continue; }
      if (isScript) {
        // disciplineScriptIn: scale 0.5 -> 1, 0.22 s back-out
        const q = settled ? 1 : linear01(timeMs, start, 220);
        t.css = motionCss({ o: Math.min(1, q / 0.35), s: 1 - (1 - EASE.backOut(q)) * 0.5 * Math.min(1.8, c.k) });
      } else {
        // disciplineWordIn: Y 6px, scale 0.92 -> rest, 0.18 s cubic-bezier(.2,.8,.2,1)
        const q = settled ? 1 : linear01(timeMs, start, 180);
        const e = 1 - EASE.outSoft(q);
        t.css = motionCss({ o: Math.min(1, q / 0.5), y: e * 6 * c.sc * c.k, s: 1 - e * 0.08 * c.k });
      }
    }
  }
  return (
    <Frame p={p} sizePx={c.base}>
      <RowsView rows={rows} />
    </Frame>
  );
};

/* ------------------------------------------------------------------ Kinetic */

interface Slot { rem: number; weight: number; casing?: CaptionStyleV2["casing"]; kind: "rise" | "left" | "right"; role: "base" | "accent" | "hero" }
/** the six slots (sizes relative to a 7.5 rem S1); S4 (the metal hero) sits over S3 */
const SLOTS: Record<string, Slot> = {
  S1: { rem: 7.5, weight: 700, kind: "rise", role: "base" },
  S2: { rem: 4.5, weight: 300, casing: "lower", kind: "rise", role: "base" },
  S3: { rem: 10, weight: 900, casing: "upper", kind: "left", role: "accent" },
  S4: { rem: 11, weight: 900, kind: "right", role: "hero" },
  S5: { rem: 5, weight: 400, kind: "rise", role: "base" },
  S6: { rem: 7.5, weight: 700, kind: "rise", role: "base" },
};

/** the hero's extrusion: 5 offset copies darkening with depth, plus a white top-left highlight */
export function extrusion(color: string, unit: number): string[] {
  const dark = [0.755, 0.64, 0.56, 0.48, 0.4];
  const out = [`${(-unit).toFixed(2)}px ${(-unit).toFixed(2)}px 0 rgba(255,255,255,0.85)`];
  for (let o = 1; o <= 5; o++) out.push(`${(o * unit).toFixed(2)}px ${(o * unit).toFixed(2)}px 0 ${shade(color, -(1 - dark[o - 1]!))}`);
  return out;
}

export const KineticSlotsLayout: React.FC<PageRenderProps> = (p) => {
  const { page, style, timeMs, measure, settled } = p;
  const c = typoCtx(p);
  const n = page.words.length;
  const h = keyWordIndex(page);
  // reading order: S1, S2 (before the hero), S4 hero, S3 accent (the word after it), S5, S6
  const slots: Record<string, number[]> = { S1: [], S2: [], S3: [], S4: [h], S5: [], S6: [] };
  const before = range(0, h);
  if (before.length === 1) slots.S1 = before;
  else if (before.length > 1) { slots.S1 = before.slice(0, before.length - 1); slots.S2 = before.slice(-1); }
  const after = range(h + 1, n);
  if (after.length) slots.S3 = [after[0]!];
  const rest = after.slice(1);
  if (rest.length === 1) slots.S6 = rest;
  else if (rest.length > 1) { slots.S5 = [rest[0]!]; slots.S6 = rest.slice(1); }
  const order = ["S1", "S2", "S4", "S3", "S5", "S6"] as const;
  const hero = style.hero;
  const used = order.filter((id) => slots[id]!.length);
  const planned: Row[] = used.map((id) => {
    const sl = SLOTS[id]!;
    const isHero = sl.role === "hero";
    const size = c.base * (isHero ? hero.scale : sl.rem / 7.5);
    const face: Face = { font: isHero ? hero.fontId ?? style.fontId : style.fontId, weight: isHero ? hero.fontWeight ?? sl.weight : sl.weight, size, ls: c.ls, lh: style.lineHeight };
    const ids = slots[id]!;
    return {
      toks: ids.map((i, j) => ({ key: page.words[i]!.id, i, text: textsOf(page, style, isHero ? hero.casing ?? style.casing : sl.casing ?? style.casing)[i]!, face, paint: {}, gap: j < ids.length - 1 ? size * 0.26 + c.ws : 0 })),
    };
  });
  const { rows } = fitRows(planned, measure, c.box.width);
  const sh = shadowStack(style, c.sc);
  const stroke = strokeOf(style, c.sc);
  const heroColor = hero.fill?.type === "solid" ? hero.fill.color : hero.fill ? hero.fill.stops[0]!.color : "#00C7FC";
  rows.forEach((r, ri) => {
    const sl = SLOTS[used[ri]!]!;
    const start = showAt(page.words[r.toks[0]!.i]!);
    const q = settled ? 1 : linear01(timeMs, start, 700);
    const e = 1 - EASE.outExpo(q);
    for (const t of r.toks) {
      const size = t.face.size;
      if (sl.role === "hero") {
        const unit = size * 0.012;
        // metal face: the hero colour with a light sheen at the top, extruded below-right
        t.paint = {
          bg: `linear-gradient(180deg, ${shade(heroColor, 0.55)} 0%, ${shade(heroColor, 0.12)} 42%, ${heroColor} 58%, ${shade(heroColor, -0.12)} 100%)`,
          under: shade(heroColor, -0.25), shadow: [...extrusion(heroColor, unit), shadowStack(style, c.sc)].filter(Boolean).join(", "), stroke,
        };
      } else if (sl.role === "accent") t.paint = { color: style.active.color, shadow: sh, stroke };
      else t.paint = { ...fillPaint(style.fill), shadow: sh, stroke };
      if (!settled && timeMs < start) { t.css = { opacity: 0 }; continue; }
      // kineticRise: Y 0.4em -> 0; kineticFromLeft/Right: X -/+0.57em -> 0; 0.7 s cubic-bezier(.16,1,.3,1)
      t.css = motionCss({
        o: Math.min(1, q / 0.25),
        y: sl.kind === "rise" ? e * 0.4 * size * c.k : 0,
        x: sl.kind === "left" ? -e * 0.57 * size * c.k : sl.kind === "right" ? e * 0.57 * size * c.k : 0,
      });
    }
  });
  return (
    <Frame p={p} sizePx={c.base}>
      <RowsView rows={rows} />
    </Frame>
  );
};

