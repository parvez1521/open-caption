/**
 * Creator pack layouts: two/three-line creator styles (gradient/shine headlines with script or sub lines, glowing
 * middle lines, a boxed middle line). Each is a recipe of rows for ./creator-core's Stack.
 */
import React from "react";
import type { CaptionStyleV2, Word } from "@capseasy/shared";
import { showAt } from "../motion";
import type { PageRenderProps } from "../types";
import {
  type Ctx, type Item, type Paint, type Piece, type RowSpec, Stack, WS, alpha, contrastText, fillPaint, firstOf, hsl, itemsOf, joinF, joinS,
  makeCtx, same, shadowFilter, shadowText, splitAt, splitKey, stockEntrance, strokeOf, textsOf, userGlow, win, withEntrance,
} from "./creator-core";
import { EASE, bezier, hash, keyframes, rand, ringShadow, shade } from "./kit";

const opt = <T,>(style: CaptionStyleV2, key: string, fallback: T): T => (style.templateOptions[key] === undefined ? fallback : (style.templateOptions[key] as T));
const heroFont = (s: CaptionStyleV2) => s.hero.fontId ?? s.fontId;
const heroWeight = (s: CaptionStyleV2, d: number) => s.hero.fontWeight ?? d;
const heroCasing = (s: CaptionStyleV2) => s.hero.casing ?? s.casing;
const em = (n: number, size: number) => `${(n * size).toFixed(2)}px`;

/** glow colour at the style's intensity */
const glowA = (s: CaptionStyleV2, a: number) => alpha(s.glow.color, Math.min(1, a * s.glow.intensity));
/** body paint from the user's fill (solid or gradient) */
const fillBody = (s: CaptionStyleV2): Paint => {
  const f = fillPaint(s.fill);
  return f.image ? { layers: [{ image: f.image }], frame: "row" } : { color: f.color };
};

const words = (ctx: Ctx) => ctx.page.words;
const allTexts = (rows: RowSpec[]) => rows.flatMap((r) => r.items.map((i) => i.text));

/* ============================================================================ Creator (3.16)
 * Line 1: upright light caps with a soft white glow. Line 2: larger, tighter, skewed -7deg, filled with the ice ramp
 * white 0-12% -> light 34% -> colour 74% -> dark 98% of an ellipse 65% x 300% (radial in the catalogue; drawn here
 * as its horizontal profile, a linear gradient, because the exporter can't draw radial gradients). */
const mix = (a: string, b: string, t: number) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return a;
  const ch = (n: number, s: number) => (n >> s) & 255;
  return `#${[16, 8, 0].map((s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t).toString(16).padStart(2, "0")).join("")}`;
};
export function iceRamp(c: string): string {
  const light = hsl(c, 30);
  const dark = hsl(c, -50, 30, 8);
  // ellipse distance d = |x - 50%| / 65%: white to d .12 (x 42.2-57.8%), light .34 (27.9/72.1%), colour .74 (1.9/98.1%),
  // past the edge (d .77) a touch toward dark
  const edge = mix(c, dark, 0.125);
  return `linear-gradient(90deg, ${edge} 0%, ${c} 1.9%, ${light} 27.9%, #FFFFFF 42.2%, #FFFFFF 57.8%, ${light} 72.1%, ${c} 98.1%, ${edge} 100%)`;
}

export const CreatorSkewLayout: React.FC<PageRenderProps> = (p) => {
  const ctx = makeCtx(p);
  const { style: s, sc } = ctx;
  const ws = words(ctx);
  const n2 = Math.max(1, Math.floor(ws.length / 2));
  const [w1, w2] = splitAt(ws, ws.length - n2);
  const base = s.fontSize * sc;
  const stroke = strokeOf(s, sc);
  const rows: RowSpec[] = [
    {
      key: "l1", items: itemsOf(w1, textsOf(w1, s)), family: s.fontId, weight: s.fontWeight, italic: s.fontStyle === "italic", size: base, trackEm: 0.04, lh: 1.08,
      paint: () => ({
        ...fillBody(s), stroke,
        textShadow: joinS(s.glow.enabled ? `0 0 ${(s.glow.radius * sc).toFixed(2)}px ${glowA(s, 1)}` : undefined, ...shadowText(s, sc)),
      }),
    },
    {
      key: "l2", items: itemsOf(w2, textsOf(w2, s, heroCasing(s))), family: heroFont(s), weight: heroWeight(s, s.fontWeight), size: base * s.hero.scale, trackEm: -0.03, lh: 1.04, skew: -7,
      paint: () => ({ layers: [{ image: iceRamp(s.active.color) }], frame: "row", stroke, filter: joinF(shadowFilter(s, sc)) }),
    },
  ];
  return <Stack ctx={ctx} rows={withEntrance(rows, stockEntrance(ctx, allTexts(rows)))} />;
};

/* ============================================================================ Creator 2 (3.17) / Cyber (3.23)
 * A big title (first one or two words) over a small subtitle (the rest). */
const titleSplit = (ws: Word[]) => splitAt(ws, ws.length === 1 ? 1 : Math.min(2, Math.ceil(ws.length / 2)));

/** Creator 2 title: a 65deg double white shine over a vertical light -> colour -> dark ramp, glowing in its colour */
export function shineTitle(c: string): string[] {
  const w = "rgba(255,255,255,0.9)";
  const o = "rgba(255,255,255,0)";
  // streaks centred on 25% and 70%, 4% wide, with a soft 2% edge
  return [
    `linear-gradient(65deg, ${o} 21%, ${w} 23.5%, ${w} 26.5%, ${o} 29%, ${o} 66%, ${w} 68.5%, ${w} 71.5%, ${o} 74%)`,
    `linear-gradient(180deg, ${shade(c, 0.5)} 0%, ${c} 45%, ${shade(c, -0.3)} 100%)`,
  ];
}

const TitleSubLayout = (mode: "shine" | "neon"): React.FC<PageRenderProps> => {
  const C: React.FC<PageRenderProps> = (p) => {
    const ctx = makeCtx(p);
    const { style: s, sc } = ctx;
    const [wt, wsub] = titleSplit(words(ctx));
    const base = s.fontSize * sc;
    const c = s.active.color;
    const stroke = strokeOf(s, sc);
    const R = s.glow.radius * sc;
    const titlePaint = (): Paint =>
      mode === "shine"
        ? {
            layers: shineTitle(c).map((image) => ({ image })), frame: "row", stroke,
            filter: joinF(s.glow.enabled && `drop-shadow(0 0 ${R.toFixed(2)}px ${glowA(s, 1)})`, shadowFilter(s, sc)),
          }
        : {
            layers: [{ image: `linear-gradient(60deg, ${c} 0%, ${hsl(c, 40)} 100%)` }], frame: "row", stroke,
            filter: joinF(
              s.glow.enabled && [0.25, 0.5, 1].map((f) => `drop-shadow(0 0 ${(R * f).toFixed(2)}px ${glowA(s, 1)})`).join(" "),
              shadowFilter(s, sc),
            ),
          };
    const sub = fillBody(s);
    const fc = firstOf(s.fill);
    const rows: RowSpec[] = [
      {
        key: "title", items: itemsOf(wt, textsOf(wt, s, heroCasing(s))), family: heroFont(s), weight: heroWeight(s, 700), italic: opt(s, "titleItalic", mode === "shine"),
        size: base * s.hero.scale, trackEm: 0.022, lh: 1.02, paint: titlePaint, z: 2,
      },
      {
        key: "sub", items: itemsOf(wsub, textsOf(wsub, s)), family: s.fontId, weight: s.fontWeight, italic: s.fontStyle === "italic", size: base,
        trackEm: mode === "neon" ? 0.027 : 0, lh: 1.15, mtEm: -0.05,
        paint: (z) => ({
          ...sub, stroke,
          textShadow: mode === "shine"
            ? `${em(0.054, z)} ${em(0.109, z)} ${em(0.163, z)} rgba(0,0,0,0.8)`
            : `0 0 ${em(0.22, z)} ${alpha(fc, 0.6)}, 0 0 ${em(0.43, z)} ${alpha(fc, 0.4)}, 0 0 ${em(0.87, z)} ${alpha(fc, 0.25)}, 0 ${em(0.06, z)} ${em(0.12, z)} rgba(0,0,0,0.55)`,
        }),
      },
    ];
    return <Stack ctx={ctx} rows={withEntrance(rows, stockEntrance(ctx, allTexts(rows)))} />;
  };
  C.displayName = `TitleSub(${mode})`;
  return C;
};
export const ShineTitleLayout = TitleSubLayout("shine");
export const NeonTitleLayout = TitleSubLayout("neon");

/* ============================================================================ Creator 3 (3.24)
 * One big glossy serif word (115deg double soft shine over a light -> colour -> dark ramp), a script line pulled
 * up under it (white -> grey). */
export function glossSerif(c: string): string[] {
  const w = "rgba(255,255,255,0.85)";
  const o = "rgba(255,255,255,0)";
  return [
    `linear-gradient(115deg, ${o} 15%, ${w} 25%, ${o} 35%, ${o} 57%, ${w} 67%, ${o} 77%)`,
    `linear-gradient(180deg, ${shade(c, 0.35)} 0%, ${c} 50%, ${shade(c, -0.3)} 100%)`,
  ];
}
export const SerifScriptLayout: React.FC<PageRenderProps> = (p) => {
  const ctx = makeCtx(p);
  const { style: s, sc } = ctx;
  const [wm, wsub] = splitAt(words(ctx), 1);
  const base = s.fontSize * sc;
  const c = s.active.color;
  const stroke = strokeOf(s, sc);
  const subFill = s.fill.type === "solid" ? `linear-gradient(180deg, #FFFFFF 0%, ${s.fill.color} 100%)` : fillPaint(s.fill).image!;
  const rows: RowSpec[] = [
    {
      key: "main", items: itemsOf(wm, textsOf(wm, s, heroCasing(s))), family: heroFont(s), weight: heroWeight(s, 900), size: base * s.hero.scale, lh: 1.0,
      paint: () => ({
        layers: glossSerif(c).map((image) => ({ image })), frame: "row", stroke,
        filter: joinF(s.glow.enabled && `drop-shadow(0 0 ${(s.glow.radius * sc).toFixed(2)}px ${glowA(s, 1)})`, shadowFilter(s, sc)),
      }),
    },
    {
      key: "sub", items: itemsOf(wsub, textsOf(wsub, s)), family: s.fontId, weight: s.fontWeight, italic: s.fontStyle === "italic", size: base, lh: 1.1, mtEm: -0.4, z: 2,
      paint: (z) => ({ layers: [{ image: subFill }], frame: "row", stroke, filter: `drop-shadow(${em(0.0145, z)} ${em(0.0145, z)} ${em(0.029, z)} rgba(0,0,0,0.8))` }),
    },
  ];
  return <Stack ctx={ctx} rows={withEntrance(rows, stockEntrance(ctx, allTexts(rows)))} />;
};

/* ============================================================================ Creator 4 (3.25)
 * A warm 135deg ramp headline with a yellow-left / orange-right glow, a big glowing white script line pulled up
 * under it. */
export const WarmScriptLayout: React.FC<PageRenderProps> = (p) => {
  const ctx = makeCtx(p);
  const { style: s, sc } = ctx;
  const ws = words(ctx);
  const [wh, wsc] = splitAt(ws, Math.ceil(ws.length / 2));
  const base = s.fontSize * sc;
  const stroke = strokeOf(s, sc);
  const f = s.glow.radius / 20;
  const yellow = s.fill.type === "gradient" ? (s.fill.stops[1] ?? s.fill.stops[0]!).color : s.fill.color;
  const orange = s.glow.color;
  const g = s.glow.enabled;
  const I = s.glow.intensity;
  const rows: RowSpec[] = [
    {
      key: "head", items: itemsOf(wh, textsOf(wh, s)), family: s.fontId, weight: s.fontWeight, italic: s.fontStyle === "italic", size: base, trackEm: -0.02, lh: 1.1,
      paint: (z) => ({
        ...fillBody(s), stroke,
        textShadow: joinS(
          g && `${em(-0.13, z)} 0 ${em(0.23 * f, z)} ${alpha(yellow, 0.55 * I)}`,
          g && `${em(-0.22, z)} 0 ${em(0.45 * f, z)} ${alpha(yellow, 0.35 * I)}`,
          g && `${em(0.07, z)} 0 ${em(0.24 * f, z)} ${alpha(orange, 0.6 * I)}`,
          g && `0 0 ${em(0.6 * f, z)} ${alpha(orange, 0.45 * I)}`,
          g && `0 0 ${em(0.95 * f, z)} ${alpha(orange, 0.3 * I)}`,
          ...shadowText(s, sc),
        ),
      }),
    },
    {
      key: "script", items: itemsOf(wsc, textsOf(wsc, s, heroCasing(s))), family: heroFont(s), weight: heroWeight(s, 400), size: base * s.hero.scale, lh: 1.1, mtEm: -0.2, z: 2,
      paint: (z) => {
        const w = s.active.color;
        return {
          color: w, stroke,
          textShadow: joinS(
            g && `0 0 ${em(0.13 * f, z)} ${alpha(w, 0.9 * I)}`,
            g && `0 0 ${em(0.3 * f, z)} ${alpha(w, 0.6 * I)}`,
            g && `0 0 ${em(0.6 * f, z)} ${alpha(w, 0.4 * I)}`,
            g && `0 0 ${em(1.08 * f, z)} ${alpha(w, 0.25 * I)}`,
            g && `0 0 ${em(0.6 * f, z)} ${alpha(orange, 0.5 * I)}`,
            ...shadowText(s, sc),
          ),
        };
      },
    },
  ];
  return <Stack ctx={ctx} rows={withEntrance(rows, stockEntrance(ctx, allTexts(rows)))} />;
};

/* ============================================================================ Crazy (3.26)
 * Italic white words above and below one huge orange word: a 4-stop vertical ramp under 60deg pale-yellow shine
 * bands, one band per three letters. */
const CRAZY_ORANGE = ["#FFA726", "#FF8F00", "#E65100", "#D84315"];
export function crazyRamp(c: string): string {
  const [a, b, d, e] = same(c, "#FF8F00") ? CRAZY_ORANGE : [shade(c, 0.2), c, shade(c, -0.25), shade(c, -0.35)];
  return `linear-gradient(180deg, ${a} 0%, ${b} 45%, ${d} 85%, ${e} 100%)`;
}
export function shineBands(letters: number, centre: string, edge: string): string {
  const n = Math.max(1, Math.ceil(letters / 3));
  const P = 100 / n;
  const o = alpha(edge, 0);
  const stops: string[] = [];
  for (let i = 0; i < n; i++) {
    const c = (i + 0.5) * P;
    stops.push(`${o} ${(c - 0.24 * P).toFixed(2)}%`, `${alpha(edge, 0.65)} ${(c - 0.1 * P).toFixed(2)}%`, `${alpha(centre, 0.98)} ${c.toFixed(2)}%`, `${alpha(edge, 0.65)} ${(c + 0.1 * P).toFixed(2)}%`, `${o} ${(c + 0.24 * P).toFixed(2)}%`);
  }
  return `linear-gradient(60deg, ${stops.join(", ")})`;
}
export const CrazyShineLayout: React.FC<PageRenderProps> = (p) => {
  const ctx = makeCtx(p);
  const { style: s, sc } = ctx;
  const [a, key, b] = splitKey(ctx.page);
  const base = s.fontSize * sc;
  const stroke = strokeOf(s, sc);
  const side = (k: string, ws: Word[]): RowSpec => ({
    key: k, items: itemsOf(ws, textsOf(ws, s)), family: s.fontId, weight: s.fontWeight, italic: s.fontStyle === "italic", size: base, lh: 1.02,
    paint: (z) => ({ ...fillBody(s), stroke, textShadow: `0 ${em(0.047, z)} ${em(0.093, z)} rgba(0,0,0,0.95)` }),
  });
  const centre = opt(s, "shine", "#FFFFB4");
  const edge = opt(s, "shineEdge", "#FFF564");
  const R = s.glow.radius * sc;
  const keyTexts = textsOf(key, s, heroCasing(s));
  const rows: RowSpec[] = [
    side("top", a),
    {
      key: "mid", items: itemsOf(key, keyTexts), family: heroFont(s), weight: heroWeight(s, 800), size: base * s.hero.scale, trackEm: -0.055, lh: 0.95,
      paint: () => ({
        layers: [{ image: shineBands([...(keyTexts[0] ?? "")].length, centre, edge) }, { image: crazyRamp(s.active.color) }], frame: "row", stroke,
        filter: joinF(s.glow.enabled && `drop-shadow(0 ${(R * 0.375).toFixed(2)}px ${R.toFixed(2)}px ${glowA(s, 1)})`, shadowFilter(s, sc)),
      }),
    },
    side("bottom", b),
  ];
  return <Stack ctx={ctx} rows={withEntrance(rows, stockEntrance(ctx, allTexts(rows)))} />;
};

/* ============================================================================ Crazy 2 (3.27)
 * Three tight lowercase lines (one or two words each, words of <= 2 letters pair up); the middle line glows in
 * the colour. Every word glides in from 1.25em off to the side, 0.16em past its spot, and settles back:
 * glide 0-68% cubic-bezier(.18,.72,.35,1), return 68-100% cubic-bezier(.4,.02,.3,1), 0.9 s. Lines 1 and 3 travel
 * left-to-right, line 2 right-to-left; a second word on a line comes from the other side. */
export function glideLines<T extends { text: string }>(ws: T[]): T[][] {
  const letters = (w: T) => w.text.replace(/[^\p{L}\p{N}]/gu, "").length;
  // short words (<= 2 letters) pair with their neighbour
  const units: T[][] = [];
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]!;
    if (letters(w) <= 2 && i + 1 < ws.length && (units.length === 0 || units[units.length - 1]!.length > 1 || letters(units[units.length - 1]![0]!) > 2)) {
      units.push([w, ws[i + 1]!]);
      i++;
    } else if (letters(w) <= 2 && units.length && units[units.length - 1]!.length === 1) units[units.length - 1]!.push(w);
    else units.push([w]);
  }
  // more than three lines: merge the adjacent pair with the fewest letters (single words first)
  while (units.length > 3) {
    let best = 0;
    let cost = Infinity;
    for (let i = 0; i + 1 < units.length; i++) {
      const n = units[i]!.length + units[i + 1]!.length;
      const c = (n > 2 ? 1000 : 0) + [...units[i]!, ...units[i + 1]!].reduce((a, w) => a + letters(w), 0);
      if (c < cost) { cost = c; best = i; }
    }
    units.splice(best, 2, [...units[best]!, ...units[best + 1]!]);
  }
  return units;
}
const GLIDE = bezier(0.18, 0.72, 0.35, 1);
const SETTLE = bezier(0.4, 0.02, 0.3, 1);
/** glide offset in em along the travel direction at linear progress t (0..1) */
export const glideEm = (t: number, k = 1) => (t < 0.68 ? -1.25 * k + (1.25 * k + 0.16 * k) * GLIDE(t / 0.68) : 0.16 * k * (1 - SETTLE((t - 0.68) / 0.32)));

export const CrazyGlideLayout: React.FC<PageRenderProps> = (p) => {
  const ctx = makeCtx(p);
  const { style: s, sc, timeMs, page, settled, k } = ctx;
  const texts = textsOf(page.words, s);
  const lines = glideLines(page.words.map((w, i) => ({ w, text: texts[i]! })));
  const mid = lines.length >= 2 ? 1 : 0;
  const base = s.fontSize * sc;
  const stroke = strokeOf(s, sc);
  const R = s.glow.radius * sc;
  const lin = win(timeMs, page.startMs, 900, settled);
  const rows: RowSpec[] = lines.map((ln, r) => ({
    key: `l${r}`, items: ln.map((x) => ({ key: x.w.id, text: x.text })), family: s.fontId, weight: s.fontWeight, italic: s.fontStyle === "italic", size: base, trackEm: -0.03, lh: 0.68,
    paint: (z): Paint =>
      r === mid
        ? { color: s.active.color, stroke, textShadow: joinS(s.glow.enabled && `0 0 ${(R / 2).toFixed(2)}px ${glowA(s, 0.4)}`, s.glow.enabled && `0 0 ${R.toFixed(2)}px ${glowA(s, 0.27)}`, ...shadowText(s, sc)) }
        : { ...fillBody(s), stroke, textShadow: joinS(`0 0 ${em(0.25, z)} rgba(255,255,255,0.35)`, ...shadowText(s, sc)) },
    motion: (j, z) => {
      if (lin >= 1) return undefined;
      const dir = (r % 2 === 0 ? 1 : -1) * (j % 2 === 0 ? 1 : -1); // +1 travels left-to-right
      return { transform: `translateX(${(glideEm(lin, k) * dir * z).toFixed(2)}px)` };
    },
  }));
  return <Stack ctx={ctx} rows={rows} />;
};

/* ============================================================================ Spark (3.28)
 * Small white glowing sans lines around a big flat-colour serif word; a white shine sweeps across it on a 2 s loop
 * (background-position -180% -> 280% of a 260% wide layer, linear, computed from time). Lines overlap (lh 0.72). */
export const SPARK_SWEEP = "linear-gradient(105deg, rgba(255,255,255,0) 40%, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0) 60%)";
/** x offset of the 260% sweep layer as a fraction of the frame width at loop time t (0..1) */
export const sparkShift = (t: number) => -1.6 * (-1.8 + 4.6 * t);
export const SparkLayout: React.FC<PageRenderProps> = (p) => {
  const ctx = makeCtx(p);
  const { style: s, sc, timeMs, page } = ctx;
  const [a, key, b] = splitKey(page);
  const base = s.fontSize * sc;
  const stroke = strokeOf(s, sc);
  const loop = (((timeMs - page.startMs) % 2000) + 2000) % 2000 / 2000;
  const c = s.active.color;
  const side = (k: string, ws: Word[]): RowSpec => ({
    key: k, items: itemsOf(ws, textsOf(ws, s)), family: s.fontId, weight: s.fontWeight, italic: s.fontStyle === "italic", size: base, lh: 0.72,
    paint: (z) => ({ ...fillBody(s), stroke, filter: `drop-shadow(0 0 ${em(0.235, z)} rgba(255,255,255,0.65)) drop-shadow(0 ${em(0.04, z)} ${em(0.118, z)} rgba(0,0,0,0.85))` }),
  });
  const rows: RowSpec[] = [
    side("top", a),
    {
      key: "mid", items: itemsOf(key, textsOf(key, s, heroCasing(s))), family: heroFont(s), weight: heroWeight(s, 900), size: base * s.hero.scale, trackEm: -0.02, lh: 0.72, z: 2,
      paint: () => ({
        layers: [{ image: SPARK_SWEEP, widthMul: 2.6, shiftFrac: sparkShift(loop) }, { image: `linear-gradient(${c}, ${c})` }], frame: "row", stroke,
        filter: joinF(s.glow.enabled && `drop-shadow(0 0 ${(s.glow.radius * sc).toFixed(2)}px ${glowA(s, 1)})`, shadowFilter(s, sc)),
      }),
    },
    side("bottom", b),
  ];
  return <Stack ctx={ctx} rows={withEntrance(rows, stockEntrance(ctx, allTexts(rows)))} />;
};

/* ============================================================================ Gamer (3.29)
 * One line of rounded words in a vertical 3-stop gradient over two thick stroked under-layers (black 0.158em
 * dropped 0.05em, #040711 0.117em). Each word door-opens as it is spoken (gamerDoorOpen, 0.52 s
 * cubic-bezier(.16,1,.3,1): scaleX 0 / scaleY .85 -> 1.12 at 22% -> 1 at 40%), and the line drops out at the end
 * (+25px at 85%, +140px and faded at 100%). */
export const GAMER_PALETTES: Record<string, [string, string, string]> = {
  blue: ["#005ce6", "#28c4ff", "#005ce6"],
  yellow: ["#bd5300", "#ffea2d", "#bd5300"],
  purple: ["#5b027d", "#ff13f0", "#5b027d"],
  green: ["#13702d", "#52ff6e", "#13702d"],
  white: ["#9aa0a6", "#ffffff", "#9aa0a6"],
};
const DOOR_MS = 520;
/** the drop-out runs over the last 30% of the door keyframes (hold to 70%, +25px at 85%, +140px at 100%) */
const DROP_MS = DOOR_MS * 0.3;
export const GamerLayout: React.FC<PageRenderProps> = (p) => {
  const ctx = makeCtx(p);
  const { style: s, sc, timeMs, page, settled, k } = ctx;
  const ws = page.words;
  const texts = textsOf(ws, s);
  const base = s.fontSize * sc;
  const st = strokeOf(s, sc);
  const dynamic = opt(s, "dynamicColor", false);
  const names = Object.keys(GAMER_PALETTES);
  const ease = EASE.outExpo;
  const items: Item[] = ws.map((w, i) => {
    const t = settled ? 1 : (timeMs - showAt(w)) / DOOR_MS;
    let motion: React.CSSProperties | undefined;
    if (t < 0) motion = { opacity: 0 };
    else if (t < 0.4) {
      const over = 1 + 0.12 * k;
      const sx = keyframes(t, [[0, 0], [0.22, over], [0.4, 1]], ease);
      const sy = keyframes(t, [[0, 1 - 0.15 * k], [0.22, over], [0.4, 1]], ease);
      motion = { transform: `scale(${sx.toFixed(4)}, ${sy.toFixed(4)})` };
    }
    return { key: w.id, text: texts[i]!, motion };
  });
  // drop out at the end of the card
  let rowMotion: React.CSSProperties | undefined;
  const left = page.endMs - timeMs;
  if (!settled && left < DROP_MS) {
    const u = Math.max(0, Math.min(1, 1 - left / DROP_MS));
    const y = keyframes(u, [[0, 0], [0.5, 25], [1, 140]], ease) * WS * sc * k;
    rowMotion = { transform: `translateY(${y.toFixed(2)}px)`, opacity: keyframes(u, [[0, 1], [0.5, 1], [1, 0]], ease) };
  }
  const paintFor = (fill: CaptionStyleV2["fill"]) => (z: number): Paint => {
    const f = fillPaint(fill);
    return {
      ...(f.image ? { layers: [{ image: f.image }], frame: "word" as const } : { color: f.color }),
      under: st ? [
        { color: "#000000", stroke: { width: st.width * (0.158 / 0.117), color: "#000000" }, dy: 0.05 * z },
        { color: st.color, stroke: st },
      ] : [],
      filter: joinF(shadowFilter(s, sc), userGlow(s, sc)),
    };
  };
  const palFill = (id: string): CaptionStyleV2["fill"] => {
    const pal = GAMER_PALETTES[names[hash(id) % names.length]!]!;
    return { type: "gradient", angle: 180, stops: [{ color: pal[0], at: 0 }, { color: pal[1], at: 0.5 }, { color: pal[2], at: 1 }] };
  };
  const rows: RowSpec[] = [{
    key: "line", items: dynamic ? items.map((it) => ({ ...it, paint: paintFor(palFill(it.key)) })) : items,
    family: s.fontId, weight: s.fontWeight, italic: s.fontStyle === "italic", size: base, lh: 1.1, gapEm: 0.3, paint: paintFor(s.fill), rowMotion: () => rowMotion,
  }];
  return <Stack ctx={ctx} rows={rows} />;
};

/* ============================================================================ Triple (3.47)
 * Small white caps line, the key word set solid on a colour block (auto black/white text), small caps line. */
export const TripleBlockLayout: React.FC<PageRenderProps> = (p) => {
  const ctx = makeCtx(p);
  const { style: s, sc } = ctx;
  const [a, key, b] = splitKey(ctx.page);
  const base = s.fontSize * sc;
  const stroke = strokeOf(s, sc);
  const side = (k: string, ws: Word[]): RowSpec => ({
    key: k, items: itemsOf(ws, textsOf(ws, s)), family: s.fontId, weight: s.fontWeight, italic: s.fontStyle === "italic", size: base, lh: 1.08,
    paint: () => ({ ...fillBody(s), stroke, textShadow: joinS(...shadowText(s, sc)), filter: userGlow(s, sc) }),
  });
  const bg = s.active.color;
  const rows: RowSpec[] = [
    side("top", a),
    {
      key: "mid", items: itemsOf(key, textsOf(key, s, heroCasing(s))), family: heroFont(s), weight: heroWeight(s, 900), size: base * s.hero.scale, lh: 1.02, mtEm: 0.04, z: 2,
      paint: () => ({ color: opt(s, "blockText", contrastText(bg)), stroke }),
      box: (z) => ({
        backgroundColor: bg, padding: `${em(0.02, z)} ${em(0.22, z)}`, borderRadius: em(0.07, z),
        boxShadow: joinS(...shadowText(s, sc).map((x) => x), s.glow.enabled && `0 0 ${(s.glow.radius * sc).toFixed(2)}px ${glowA(s, 1)}`),
      }),
    },
    { ...side("bottom", b), mtEm: 0.06 },
  ];
  const plan = stockEntrance(ctx, allTexts(rows), true);
  // the whole block runs the transition as one element (WhiteStair: styles that paint one element per block)
  return plan.char ? <Stack ctx={ctx} rows={withEntrance(rows, plan)} /> : <Stack ctx={ctx} rows={rows} wrap={plan.word(0)} />;
};

/* ============================================================================ Smooth (3.48) / Smooth Fusion (3.49)
 * Small left-aligned line, a big centred key word, small right-aligned line. Smooth: glowing colour word, three-part
 * entrance (line 1 slides from the left 0.4 s, the word pops up 0.5 s back-out after 0.2 s, line 3 slides from the
 * right 0.4 s after 0.4 s). Smooth Fusion: the word in the centre-peak dual-tone gradient, everything types in. */
const SMOOTH_EASE = bezier(0.25, 0.46, 0.45, 0.94);
export const FUSION_GREEN = { peak: "#fdf955", mid: "#9cd843", dark: "#387320" };
export function fusionRamp(c: string, preset?: { peak: string; mid: string; dark: string }): string {
  const { peak, dark } = preset && same(c, preset.mid) ? preset : { peak: shade(c, 0.6), dark: shade(c, -0.6) };
  return `linear-gradient(90deg, ${dark} 0%, ${c} 35%, ${peak} 50%, ${c} 65%, ${dark} 100%)`;
}
const SmoothBase = (fusion: boolean): React.FC<PageRenderProps> => {
  const C: React.FC<PageRenderProps> = (p) => {
    const ctx = makeCtx(p);
    const { style: s, sc, timeMs, page, settled, k } = ctx;
    const [a, key, b] = splitKey(page);
    const base = s.fontSize * sc;
    const stroke = strokeOf(s, sc);
    const c = s.active.color;
    const R = s.glow.radius * sc;
    const t0 = page.startMs;
    const D = (px: number) => px * WS * sc * k;
    const slide = (dir: number, delay: number) => (): React.CSSProperties | undefined => {
      if (fusion) return undefined;
      const lin = win(timeMs, t0 + delay, 400, settled);
      if (lin >= 1) return undefined;
      const e = SMOOTH_EASE(lin);
      return { opacity: e, transform: `translateX(${(dir * D(30) * (1 - e)).toFixed(2)}px)` };
    };
    const side = (key2: string, ws: Word[], align: "left" | "right", delay: number): RowSpec => ({
      key: key2, items: itemsOf(ws, textsOf(ws, s)), family: s.fontId, weight: s.fontWeight, italic: s.fontStyle === "italic", size: base, trackEm: 0.05, lh: 1.1, align,
      paint: () => ({ ...fillBody(s), stroke, textShadow: joinS(...shadowText(s, sc)), filter: fusion ? userGlow(s, sc) : undefined }),
      rowMotion: slide(align === "left" ? -1 : 1, delay),
    });
    const rows: RowSpec[] = [
      side("top", a, "left", 0),
      {
        key: "mid", items: itemsOf(key, textsOf(key, s, heroCasing(s))), family: heroFont(s), weight: heroWeight(s, 900), size: base * s.hero.scale, lh: 1.0, z: 2,
        paint: (): Paint => fusion
          ? { layers: [{ image: fusionRamp(c, opt(s, "fusion", FUSION_GREEN)) }], frame: "row", stroke, filter: joinF(userGlow(s, sc), shadowFilter(s, sc)) }
          : { color: c, stroke, textShadow: joinS(s.glow.enabled && `0 0 ${(R * 4 / 9).toFixed(2)}px ${glowA(s, 0.6)}`, s.glow.enabled && `0 0 ${R.toFixed(2)}px ${glowA(s, 0.33)}`, ...shadowText(s, sc)) },
        rowMotion: () => {
          if (fusion) return undefined;
          const lin = win(timeMs, t0 + 200, 500, settled);
          if (lin >= 1) return undefined;
          const y = (1 - EASE.backOut(lin)) * D(26);
          const sc2 = keyframes(lin, [[0, 1 - 0.2 * k], [0.7, 1 + 0.08 * k], [1, 1]], EASE.backOut);
          return { opacity: keyframes(lin, [[0, 0], [0.4, 1]]), transform: `translateY(${y.toFixed(2)}px) scale(${sc2.toFixed(4)})` };
        },
      },
      side("bottom", b, "right", 400),
    ];
    return <Stack ctx={ctx} rows={fusion ? withEntrance(rows, stockEntrance(ctx, allTexts(rows))) : rows} />;
  };
  C.displayName = fusion ? "SmoothFusion" : "Smooth";
  return C;
};
export const SmoothLayout = SmoothBase(false);
export const SmoothFusionLayout = SmoothBase(true);

/* ============================================================================ Girly (3.50)
 * A small serif lead-in over one big flowing script word, blush; every "i" dotted with a 4-point sparkle star
 * (0.28-0.45em, seeded) instead of its own dot. girlyPopIn: scale .85 -> 1.05 at 60% -> 1, 0.35 s
 * cubic-bezier(.25,1,.5,1). */
/** where an "i" sits in a font (em): ascent/descent of the content box, the dot centre above the baseline, the cut
 *  line (above the stem top, below the dot) above the baseline, and the dot's x as a fraction of the glyph's width */
interface IMetrics { asc: number; desc: number; dotY: number; cutY: number; dotX: number }
const I_METRICS: Record<string, IMetrics> = {
  "DM Serif Display": { asc: 1.05, desc: 0.29, dotY: 0.66, cutY: 0.56, dotX: 0.5 },
  "Great Vibes": { asc: 0.82, desc: 0.4, dotY: 0.44, cutY: 0.36, dotX: 0.78 },
};
const I_DEFAULT: IMetrics = { asc: 0.95, desc: 0.25, dotY: 0.7, cutY: 0.58, dotX: 0.5 };

const STAR = "M0,-1 C0.1,-0.18 0.18,-0.1 1,0 C0.18,0.1 0.1,0.18 0,1 C-0.1,0.18 -0.18,0.1 -1,0 C-0.18,-0.1 -0.1,-0.18 0,-1Z";
function sparklePieces(text: string, family: string, lhEm: number, color: string, seed: string): Piece[] {
  const m = I_METRICS[family] ?? I_DEFAULT;
  // baseline in the line box (half-leading model)
  const baseline = lhEm / 2 + (m.asc - m.desc) / 2;
  const out: Piece[] = [];
  let buf = "";
  let n = 0;
  for (const ch of text) {
    if (ch !== "i") { buf += ch; continue; }
    if (buf) out.push({ text: buf });
    buf = "";
    const starEm = 0.28 + rand(hash(seed), n++) * 0.17;
    out.push({
      text: "i",
      clip: `inset(calc(${(PAD_Y_EM + baseline - m.cutY).toFixed(3)}em) -50% -50% -50%)`,
      extra: ({ padX, padY, width, size }) => {
        const d = starEm * size;
        return (
          <svg aria-hidden width={d} height={d} viewBox="-1 -1 2 2"
            style={{ position: "absolute", left: padX + width * m.dotX - d / 2, top: padY + (baseline - m.dotY) * size - d / 2, overflow: "visible", pointerEvents: "none" }}>
            <path d={STAR} fill={color} />
          </svg>
        );
      },
    });
  }
  if (buf) out.push({ text: buf });
  return out;
}
const PAD_Y_EM = 0.4; // creator-core's PAD_Y
export const GirlyLayout: React.FC<PageRenderProps> = (p) => {
  const ctx = makeCtx(p);
  const { style: s, sc, timeMs, page, settled, k } = ctx;
  const ws = page.words;
  const kw = Math.min(ws.length - 1, Math.max(0, splitKey(page)[0].length));
  const split = ws.length === 1 ? 0 : kw > 0 ? kw : ws.length - 1;
  const [wl, wsc] = splitAt(ws, split);
  const base = s.fontSize * sc;
  const stroke = strokeOf(s, sc);
  const rowFilter = joinF(shadowFilter(s, sc), userGlow(s, sc));
  const star = s.active.color;
  const lhLead = 1.1 * s.lineHeight;
  const lhScript = 1.0 * s.lineHeight;
  const lead = textsOf(wl, s);
  const scr = textsOf(wsc, s, heroCasing(s));
  const rows: RowSpec[] = [
    {
      key: "lead", items: wl.map((w, i) => ({ key: w.id, text: lead[i]!, pieces: sparklePieces(lead[i]!, s.fontId, lhLead, star, w.id) })),
      family: s.fontId, weight: s.fontWeight, italic: s.fontStyle === "italic", size: base, lh: 1.1, rowFilter, paint: () => ({ ...fillBody(s), stroke }),
    },
    {
      key: "script", items: wsc.map((w, i) => ({ key: w.id, text: scr[i]!, pieces: sparklePieces(scr[i]!, heroFont(s), lhScript, star, w.id) })),
      family: heroFont(s), weight: heroWeight(s, 400), size: base * s.hero.scale, lh: 1.0, mtEm: -0.12, rowFilter, z: 2, paint: () => ({ ...fillBody(s), stroke }),
    },
  ];
  const lin = win(timeMs, page.startMs, 350, settled);
  const e = bezier(0.25, 1, 0.5, 1);
  const wrap: React.CSSProperties | undefined = lin >= 1 ? undefined : {
    opacity: keyframes(lin, [[0, 0], [0.6, 1]], e),
    transform: `scale(${keyframes(lin, [[0, 1 - 0.15 * k], [0.6, 1 + 0.05 * k], [1, 1]], e).toFixed(4)})`,
  };
  return <Stack ctx={ctx} rows={rows} wrap={wrap} />;
};

/* ============================================================================ Bubble (3.51)
 * Two rounded pastel lines with a thick round outline made of 16 offset copies (ring radius 0.045em, #594c52) and a
 * hard drop-shadow copy of the outlined word offset (0.07em, 0.09em). */
export const BubbleLayout: React.FC<PageRenderProps> = (p) => {
  const ctx = makeCtx(p);
  const { style: s, sc } = ctx;
  const ws = words(ctx);
  const [w1, w2] = splitAt(ws, Math.ceil(ws.length / 2));
  const base = s.fontSize * sc;
  const r = s.stroke.enabled ? s.stroke.width * sc : 0;
  const ring = r > 0 ? ringShadow(r, s.stroke.color, 16) : [];
  const drop = s.shadows.flatMap((x) => [...(r > 0 ? ringShadow(r, x.color, 16, x.x * sc, x.y * sc) : []), `${(x.x * sc).toFixed(2)}px ${(x.y * sc).toFixed(2)}px ${(x.blur * sc).toFixed(2)}px ${x.color}`]);
  const paint = (): Paint => {
    const b = fillBody(s);
    return { ...b, textShadow: joinS(...ring, ...drop), filter: userGlow(s, sc) };
  };
  const row = (k: string, w: Word[]): RowSpec => ({ key: k, items: itemsOf(w, textsOf(w, s)), family: s.fontId, weight: s.fontWeight, italic: s.fontStyle === "italic", size: base, trackEm: 0.02, lh: 1.08, paint });
  const rows = [row("l1", w1), row("l2", w2)];
  return <Stack ctx={ctx} rows={withEntrance(rows, stockEntrance(ctx, allTexts(rows)))} />;
};
