/**
 * "Difference": heavy white caps in DIFFERENCE blend over the video, so they invert whatever is behind them (light
 * footage gives dark letters, dark footage light ones, colours flip to their complements). A solid bar, also in
 * difference, sweeps through the line as the card lands and then rides the spoken word: where bar and letters
 * overlap they flip back, so the spoken word shows the original picture through inverted surroundings. Letters rise
 * one by one out of a line mask (1-frame stagger, AE "out" curve, velocity blur) and fall back into it as the card
 * leaves while the bar wipes off.
 *
 * How the blend renders everywhere:
 *  - Studio Player and server render (renderMedia / renderStill): Chrome paints the DOM itself, so the canvas that
 *    holds the bar and the letters gets CSS `mix-blend-mode: difference` against the video below it. The layout's
 *    outermost element is a direct child of the composition root, so nothing isolates the blend.
 *  - In-browser export (@remotion/web-renderer): it redraws the DOM element by element and ignores mix-blend-mode.
 *    There the same canvas computes the final pixels itself: it takes the frame the video layer just decoded (the
 *    VideoFrameBus that CaptionedVideo provides, see ../videoFrame.ts), draws it exactly where the video layer
 *    draws it, draws the plain layer (shadow/glow/outline), then the bar and letters with canvas
 *    globalCompositeOperation "difference". Canvas blend modes use the same formula as CSS, so it is the same image.
 *    Each frame holds a delayRender until the video frame has arrived. If a frame never arrives (past the end of the
 *    video) the letters are drawn plain white for that frame, and a warning is logged.
 * The drawing is one pure function of the spec below, shared by both paths.
 */
import React, { useContext, useLayoutEffect, useRef } from "react";
import { shadowColorOf } from "@capseasy/shared";
import { useDelayRender, useRemotionEnvironment } from "remotion";
import { exitStyle, showAt } from "../motion";
import { displayText, famCss } from "../text";
import type { PageRenderProps } from "../types";
import { VideoFrameContext, containRect, frameSourceSize, type VideoFrameBus } from "../videoFrame";
import { hash, rand, withAlpha } from "./kit";
import { AE, FRAME, clamp01, ctxOf, glyphsOf, lerp, linesOf, prog, springAt, spokenIndex, type Face } from "./premium-a-kit";

// ------------------------------------------------------------------------------------------------ spec

interface DGlyph {
  ch: string;
  /** left edge and baseline, px (canvas space, before the card transform) */
  x: number;
  y: number;
  li: number;
  /** solo advance (for the stretch pivot) */
  w: number;
  /** rise offset as a share of the line band (0 = at rest, 1 = just hidden below the mask) */
  dy: number;
  /** vertical stretch from speed */
  sy: number;
  blur: number;
  color: string;
  /** spoken-word scale and its pivot */
  s: number;
  ox: number;
  oy: number;
}
interface DLine {
  y: number;
  x0: number;
  x1: number;
  /** the line has lowercase ascenders / descenders (the band grows to fit them) */
  asc: boolean;
  desc: boolean;
}
interface DBar {
  li: number;
  x0: number;
  x1: number;
}
type DFill = { type: "solid"; color: string } | { type: "gradient"; stops: { color: string; at: number }[]; angle: number };
export interface DiffSpec {
  w: number;
  h: number;
  font: string;
  size: number;
  /** card pivot, rotation (deg), camera push and the creator's exit (CSS transform list), opacity, filter */
  cx: number;
  cy: number;
  rot: number;
  push: number;
  exitT: string;
  alpha: number;
  filter: string;
  /** padding of the bar around a word's caps, em */
  padY: number;
  lines: DLine[];
  glyphs: DGlyph[];
  bars: DBar[];
  barColor: string;
  /** the letters' fill when it is a gradient (solid fills are per glyph) */
  fill: DFill | null;
  /** the plain (normal blend) layer: the style's shadows, glow and outline */
  plain: { shadows: { x: number; y: number; blur: number; color: string }[]; glow: { r: number; color: string } | null; stroke: { w: number; color: string } | null } | null;
}

/** time a letter takes to rise / to fall */
const RISE_MS = 560;
const FALL_MS = 230;
/** bar moves: lead edge, trailing edge lag */
const MOVE_MS = 300;
const LAG_MS = 70;
const LEAD_MS = 50;

export function buildDiffSpec(p: PageRenderProps): DiffSpec {
  const { page, timeMs, style, canvas, measure, settled } = p;
  const { sc, box, k, base } = ctxOf(p);
  const lines = linesOf(page);
  const gapOf = (size: number) => 0.27 * size + style.wordSpacing * sc;
  const faceAt = (size: number): Face => ({ fontId: style.fontId, weight: style.fontWeight, italic: style.fontStyle === "italic", size, ls: style.letterSpacing * sc * (size / base) });
  const texts = lines.map((l) => l.map((w) => displayText(w, style)));
  const widthAt = (size: number) => Math.max(1, ...texts.map((ts) => ts.reduce((a, t) => a + measure(t, { fontFamily: famCss(style.fontId), fontWeight: style.fontWeight, fontStyle: style.fontStyle, fontSize: size, letterSpacing: style.letterSpacing * sc * (size / base) }), 0) + Math.max(0, ts.length - 1) * gapOf(size)));
  // fit the widest line (and the bar's side padding) into the caption box
  const w0 = widthAt(base) + 0.2 * base;
  const size = w0 > box.width ? base * (box.width / w0) : base;
  const face = faceAt(size);
  const adv = size * style.lineHeight;
  const capH = 0.72 * size;
  const n = lines.length;
  const index = new Map(page.words.map((w, i) => [w.id, i]));
  const spoken = settled ? Math.max(0, spokenIndex(page, timeMs)) : spokenIndex(page, timeMs);
  const effectOn = style.active.effect === "box";
  const seed = hash(page.id);

  // exit window: letters fall back into the mask, the bar wipes off
  const cardMs = page.endMs - page.startMs;
  const exitMs = Math.min(300, cardMs * 0.3);
  const exitAt = page.endMs - exitMs;
  const totalLetters = texts.reduce((a, ts) => a + ts.reduce((b, t) => b + t.length, 0), 0);
  const fallStep = Math.min(FRAME * 0.6, Math.max(0, exitMs - FALL_MS) / Math.max(1, totalLetters));

  const outLines: DLine[] = [];
  const glyphs: DGlyph[] = [];
  const wordBox: { li: number; x0: number; x1: number }[] = new Array(page.words.length);
  let letterNo = 0;
  lines.forEach((line, li) => {
    const ws = texts[li]!.map((t) => glyphsOf(t, face, measure));
    const lw = ws.reduce((a, g) => a + g.width, 0) + Math.max(0, ws.length - 1) * gapOf(size);
    const half = box.width / 2 - 0.1 * size;
    const x0 = style.align === "left" ? box.cx - half : style.align === "right" ? box.cx + half - lw : box.cx - lw / 2;
    const y = box.cy + (li - (n - 1) / 2) * adv + capH / 2;
    const all = texts[li]!.join("");
    outLines.push({ y, x0, x1: x0 + lw, asc: /[bdfhklt]/.test(all), desc: /[gjpqyQJ,]/.test(all) });
    let x = x0;
    line.forEach((w, wj) => {
      const wi = index.get(w.id) ?? 0;
      const g = ws[wj]!;
      wordBox[wi] = { li, x0: x, x1: x + g.width };
      const isSpoken = wi === spoken && effectOn;
      // ("fill" = the style's gradient fill, painted across the whole block)
      const color = isSpoken ? style.active.color : w.color ?? (style.fill.type === "solid" ? style.fill.color : "fill");
      // spoken-word scale (effect strength), springing in when the word is spoken
      const sp = isSpoken ? (settled ? 1 : springAt((timeMs - w.startMs) / 1000, { stiffness: 260, damping: 19, mass: 0.8 }).x) : 0;
      const s = 1 + (style.active.scale - 1) * sp;
      const t0 = settled ? -Infinity : showAt(w);
      g.glyphs.forEach((gl, gi) => {
        // 1-frame stagger with a little seeded jitter (no two letters start on the exact same beat)
        const ti = t0 + gi * FRAME * 0.9 + (rand(seed, letterNo * 7 + 1) - 0.5) * 10;
        const rise = (ms: number) => (settled ? 0 : (1 - AE.out(prog(ms, ti, RISE_MS))) * 1.04 * k);
        const te = exitAt + letterNo * fallStep;
        const fall = (ms: number) => (settled ? 0 : AE.in(prog(ms, te, FALL_MS)) * 1.04);
        const dyAt = (ms: number) => rise(ms) + fall(ms);
        const dy = dyAt(timeMs);
        // speed in px per frame (the band is ~1.1 em tall)
        const v = (dyAt(timeMs + FRAME / 2) - dyAt(timeMs - FRAME / 2)) * 1.1 * size;
        glyphs.push({
          ch: gl.ch, x: x + gl.x, y, li, w: gl.solo, dy, sy: 1 + Math.min(0.32, (Math.abs(v) / size) * 0.9), blur: Math.min(0.07 * size, Math.abs(v) * 0.28),
          color, s, ox: x + g.width / 2, oy: y - capH / 2,
        });
        letterNo++;
      });
      x += g.width + gapOf(size);
    });
  });

  // ---------------------------------------------------------------- the difference bar
  const padX = 0.1 * size;
  const wb = wordBox.map((b) => ({ li: b.li, L: b.x0 - padX, R: b.x1 + padX }));
  const lineL = (li: number) => outLines[li]!.x0 - padX;
  const lineR = (li: number) => outLines[li]!.x1 + padX;
  type Span = { li: number; L: number; R: number };
  // state of the bar right after the transition INTO word j, at time t (recursive: each move starts where the last one is)
  const stateAt = (j: number, t: number): Span[] => {
    const to = wb[j]!;
    if (j === 0) {
      // the card lands: the bar is born at the line's right end and its left edge sweeps across the line onto the
      // first word, the right edge following a beat later (the bar stretches over the whole line on the way)
      const a = AE.out(prog(t, page.startMs, 460));
      const b = AE.out(prog(t, page.startMs + 90, 520));
      const R0 = lineR(to.li);
      return [{ li: to.li, L: lerp(R0, to.L, a), R: lerp(R0, to.R, b) }];
    }
    // the move leads the voice by a hair (a move that lands exactly on the sound reads as late)
    const T = Math.max(page.startMs, page.words[j]!.startMs - LEAD_MS);
    const prev = stateAt(j - 1, T);
    const from = prev[prev.length - 1]!;
    // a bar still wiping off an earlier line keeps wiping (fast speech starts the next move before it is gone)
    const carry = prev.length > 1 ? stateAt(j - 1, t).slice(0, -1) : [];
    if (from.li === to.li) {
      const right = to.R >= from.R;
      const lead = AE.out(prog(t, T, MOVE_MS));
      const trail = AE.out(prog(t, T + LAG_MS, MOVE_MS));
      return [...carry, { li: to.li, L: lerp(from.L, to.L, right ? trail : lead), R: lerp(from.R, to.R, right ? lead : trail) }];
    }
    // new line: the old bar wipes off to the right, the new one wipes on from the left
    const off = AE.out(prog(t, T, MOVE_MS * 0.8));
    const on = AE.out(prog(t, T + LAG_MS, MOVE_MS));
    return [{ li: from.li, L: lerp(from.L, from.R, off), R: from.R }, { li: to.li, L: to.L, R: lerp(to.L, to.R, on) }];
  };
  let spans: Span[] = [];
  if (effectOn) {
    // the word the bar is heading for (it sets off LEAD_MS before the word is spoken)
    let target = 0;
    page.words.forEach((w, i) => {
      if (timeMs >= w.startMs - LEAD_MS) target = i;
    });
    spans = stateAt(settled ? Math.max(0, spoken) : target, settled ? Number.MAX_SAFE_INTEGER : timeMs);
  } else if (!settled) {
    // no word box: the bar only sweeps through the first line as the card lands, right to left, and is gone
    const li = wb[0]!.li;
    const a = AE.out(prog(timeMs, page.startMs, 520));
    const b = AE.out(prog(timeMs, page.startMs + 110, 540));
    spans = [{ li, L: lerp(lineR(li), lineL(li), a), R: lerp(lineR(li), lineL(li), b) }];
  }
  // leaving: the trailing edge catches the leading one
  if (!settled && timeMs >= exitAt) {
    const q = AE.in(prog(timeMs, exitAt, exitMs * 0.9));
    spans = spans.map((s) => ({ ...s, L: lerp(s.L, s.R, q) }));
  }
  const bars = spans.filter((s) => s.R - s.L > 0.5).map((s) => ({ li: s.li, x0: +s.L.toFixed(2), x1: +s.R.toFixed(2) }));

  // ---------------------------------------------------------------- the card: camera push + the creator's exit
  const life = settled ? 0 : clamp01((timeMs - page.startMs) / Math.max(1, cardMs));
  const push = 1 + 0.03 * Math.min(1.5, k) * AE.sine(life);
  const ex = exitStyle(style, page.endMs - timeMs, settled, size);
  const shadows = style.shadows.map((s) => ({ x: s.x * sc, y: s.y * sc, blur: s.blur * sc, color: shadowColorOf(s) }));
  const glow = style.glow.enabled ? { r: style.glow.radius * sc, color: withAlpha(style.glow.color, style.glow.intensity) } : null;
  const stroke = style.stroke.enabled && style.stroke.width > 0 ? { w: style.stroke.width * sc, color: style.stroke.color } : null;
  const fill: DFill | null = style.fill.type === "gradient" ? { type: "gradient", stops: style.fill.stops, angle: style.fill.angle } : null;

  return {
    w: Math.round(canvas.width), h: Math.round(canvas.height),
    font: `${style.fontStyle === "italic" ? "italic " : ""}${style.fontWeight} ${size.toFixed(2)}px ${famCss(style.fontId)}`,
    size: +size.toFixed(3), cx: +box.cx.toFixed(2), cy: +box.cy.toFixed(2), rot: style.rotation, push: +push.toFixed(5),
    exitT: typeof ex.transform === "string" ? ex.transform : "", alpha: ex.opacity === undefined ? 1 : +Number(ex.opacity).toFixed(4), filter: typeof ex.filter === "string" ? ex.filter : "",
    padY: 0.13, lines: outLines.map((l) => ({ ...l, y: +l.y.toFixed(2), x0: +l.x0.toFixed(2), x1: +l.x1.toFixed(2) })),
    glyphs: glyphs.map((g) => ({ ...g, x: +g.x.toFixed(2), y: +g.y.toFixed(2), dy: +g.dy.toFixed(4), sy: +g.sy.toFixed(4), blur: +g.blur.toFixed(2), s: +g.s.toFixed(4), ox: +g.ox.toFixed(2), oy: +g.oy.toFixed(2), w: +g.w.toFixed(2) })),
    bars, barColor: style.active.boxColor ?? "#FFFFFF", fill,
    plain: shadows.length || glow || stroke ? { shadows, glow, stroke } : null,
  };
}

// ------------------------------------------------------------------------------------------------ paint

interface Metrics {
  cap: number;
  asc: number;
  desc: number;
}
function metricsOf(ctx: CanvasRenderingContext2D): Metrics {
  const h = ctx.measureText("H");
  const a = ctx.measureText("bdfhkl");
  const d = ctx.measureText("gjpqy");
  return { cap: h.actualBoundingBoxAscent, asc: Math.max(h.actualBoundingBoxAscent, a.actualBoundingBoxAscent), desc: d.actualBoundingBoxDescent };
}

/** the line's band (bar extent and letter mask), px from the baseline */
function band(s: DiffSpec, l: DLine, m: Metrics) {
  const pad = s.padY * s.size;
  return { top: l.y - (l.asc ? m.asc : m.cap) - pad, bottom: l.y + (l.desc ? m.desc : 0) + pad };
}

/** the card transform: rotation + camera push about the card centre, then the creator's exit */
function cardMatrix(s: DiffSpec): DOMMatrix {
  let m = new DOMMatrix().translate(s.cx, s.cy).rotate(s.rot).scale(s.push);
  if (s.exitT) {
    try {
      m = m.multiply(new DOMMatrix(s.exitT));
    } catch {
      /* unparsable: no exit transform */
    }
  }
  return m.translate(-s.cx, -s.cy);
}

function gradientOf(ctx: CanvasRenderingContext2D, s: DiffSpec, f: Extract<DFill, { type: "gradient" }>, m: Metrics): CanvasGradient {
  const x0 = Math.min(...s.lines.map((l) => l.x0));
  const x1 = Math.max(...s.lines.map((l) => l.x1));
  const y0 = Math.min(...s.lines.map((l) => l.y - m.cap));
  const y1 = Math.max(...s.lines.map((l) => l.y));
  // CSS linear-gradient geometry: 0deg points up, 90deg right; the line spans the box's projection on that direction
  const a = (f.angle * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs((x1 - x0) * dx) + Math.abs((y1 - y0) * dy)) / 2;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const g = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
  for (const st of f.stops) g.addColorStop(clamp01(st.at), st.color);
  return g;
}

/** draw each glyph of a line through `draw` with its rise, stretch, blur and spoken-word scale */
function eachGlyph(ctx: CanvasRenderingContext2D, s: DiffSpec, m: Metrics, base: DOMMatrix, baseFilter: string, draw: (g: DGlyph) => void) {
  s.lines.forEach((l, li) => {
    const b = band(s, l, m);
    ctx.save();
    ctx.setTransform(base);
    // the line mask: letters rise out of it and fall back into it
    ctx.beginPath();
    ctx.rect(l.x0 - s.size, b.top, l.x1 - l.x0 + 2 * s.size, b.bottom - b.top);
    ctx.clip();
    for (const g of s.glyphs) {
      if (g.li !== li || g.dy >= 1.6) continue;
      const lift = g.dy * (b.bottom - b.top);
      ctx.save();
      ctx.setTransform(base.translate(g.ox, g.oy).scale(g.s).translate(-g.ox, -g.oy).translate(g.x + g.w / 2, g.y + lift).scale(1, g.sy).translate(-g.w / 2, 0));
      const f = [baseFilter, g.blur > 0.3 ? `blur(${g.blur.toFixed(2)}px)` : ""].filter(Boolean).join(" ");
      ctx.filter = f || "none";
      draw(g);
      ctx.restore();
    }
    ctx.restore();
  });
}

function reset(ctx: CanvasRenderingContext2D, s: DiffSpec) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.shadowColor = "transparent";
  ctx.clearRect(0, 0, s.w, s.h);
  ctx.font = s.font;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";
}

/** the difference layer: the bar, then the letters in difference over it (so where they overlap, they flip back) */
export function paintGroup(ctx: CanvasRenderingContext2D, s: DiffSpec) {
  reset(ctx, s);
  const m = metricsOf(ctx);
  const base = cardMatrix(s);
  ctx.globalAlpha = clamp01(s.alpha);
  const baseFilter = s.filter;
  ctx.save();
  ctx.setTransform(base);
  ctx.filter = baseFilter || "none";
  ctx.fillStyle = s.barColor;
  for (const bar of s.bars) {
    const b = band(s, s.lines[bar.li]!, m);
    ctx.fillRect(bar.x0, b.top, bar.x1 - bar.x0, b.bottom - b.top);
  }
  ctx.restore();
  ctx.globalCompositeOperation = "difference";
  const grad = s.fill?.type === "gradient" ? gradientOf(ctx, s, s.fill, m) : null;
  eachGlyph(ctx, s, m, base, baseFilter, (g) => {
    ctx.fillStyle = g.color === "fill" ? grad ?? "#FFFFFF" : g.color;
    ctx.fillText(g.ch, 0, 0);
  });
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}

/** the plain layer under it: the style's drop shadows, glow and outline, in normal blend */
export function paintPlain(ctx: CanvasRenderingContext2D, s: DiffSpec) {
  reset(ctx, s);
  if (!s.plain) return;
  const m = metricsOf(ctx);
  const base = cardMatrix(s);
  ctx.globalAlpha = clamp01(s.alpha);
  const { shadows, glow, stroke } = s.plain;
  // shadow-only passes: the glyph is drawn far off canvas and only its shadow is thrown back into place
  const FAR = 20000;
  const shadowPass = (dx: number, dy: number, blur: number, color: string) => {
    eachGlyph(ctx, s, m, base, s.filter, (g) => {
      const t = ctx.getTransform();
      // shadow offsets are in device px: undo the glyph transform's scale for the far offset
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      ctx.shadowOffsetX = dx + FAR * t.a;
      ctx.shadowOffsetY = dy + FAR * t.b;
      ctx.fillStyle = "#000000";
      ctx.fillText(g.ch, -FAR, 0);
      ctx.shadowColor = "transparent";
    });
  };
  for (let i = shadows.length - 1; i >= 0; i--) {
    const sh = shadows[i]!;
    shadowPass(sh.x, sh.y, sh.blur, sh.color);
  }
  if (glow) {
    shadowPass(0, 0, glow.r, glow.color);
    shadowPass(0, 0, glow.r * 2, glow.color);
  }
  if (stroke) {
    eachGlyph(ctx, s, m, base, s.filter, (g) => {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.w * 2;
      ctx.lineJoin = "round";
      ctx.strokeText(g.ch, 0, 0);
    });
  }
  ctx.globalAlpha = 1;
}

/** in-browser export: the final pixels (video frame, plain layer, difference layer), drawn where they show */
function compose(ctx: CanvasRenderingContext2D, s: DiffSpec, video: HTMLCanvasElement | null, plain: HTMLCanvasElement | null, group: HTMLCanvasElement) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, s.w, s.h);
  if (!video) {
    // no picture to blend with: the letters as they would show on black
    ctx.drawImage(group, 0, 0);
    return;
  }
  // the video layer: black frame, the picture contain-fitted
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, s.w, s.h);
  const r = containRect(video.width, video.height, s.w, s.h);
  ctx.drawImage(video, r.x, r.y, r.w, r.h);
  if (plain && s.plain) ctx.drawImage(plain, 0, 0);
  ctx.globalCompositeOperation = "difference";
  ctx.drawImage(group, 0, 0);
  ctx.globalCompositeOperation = "source-over";
}

// ------------------------------------------------------------------------------------------------ surface

/** buses whose video stopped handing over frames (past its end): later frames don't wait the full timeout */
const stalled = new WeakMap<VideoFrameBus, number>();

const fontReady = (font: string) => typeof document === "undefined" || !document.fonts || document.fonts.check(font, "AZ");

const DiffSurface: React.FC<{ spec: DiffSpec; timeMs: number }> = ({ spec, timeMs }) => {
  const env = useRemotionEnvironment();
  const bus = useContext(VideoFrameContext);
  // only the in-browser exporter needs the computed blend (it ignores mix-blend-mode); everything else blends natively
  const exportPath = env.isClientSideRendering && bus !== null;
  const { delayRender, continueRender } = useDelayRender();
  const groupRef = useRef<HTMLCanvasElement>(null);
  const plainRef = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<{ group: HTMLCanvasElement; video: HTMLCanvasElement } | null>(null);
  const key = JSON.stringify(spec);

  useLayoutEffect(() => {
    const groupEl = groupRef.current;
    if (!groupEl) return;
    const paintNative = () => {
      const g = groupEl.getContext("2d");
      if (g) paintGroup(g, spec);
      const pl = plainRef.current?.getContext("2d");
      if (pl) paintPlain(pl, spec);
    };
    const whenFonts = (fn: () => void, done: () => void) => {
      if (fontReady(spec.font)) {
        fn();
        done();
        return;
      }
      document.fonts.load(spec.font, "AZ").catch(() => undefined).then(() => {
        fn();
        done();
      });
    };

    if (!exportPath || !bus) {
      if (fontReady(spec.font)) {
        paintNative();
        return;
      }
      const h = delayRender(`difference caption font ${spec.font}`);
      whenFonts(paintNative, () => continueRender(h));
      return;
    }

    // ---- in-browser export: wait for this frame's picture, then compute the blend
    const off = (offRef.current ??= { group: document.createElement("canvas"), video: document.createElement("canvas") });
    off.group.width = spec.w;
    off.group.height = spec.h;
    const handle = delayRender(`difference caption, video frame at ${timeMs.toFixed(0)} ms`);
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsub: () => void = () => undefined;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      unsub();
      continueRender(handle);
    };
    const render = (video: HTMLCanvasElement | null) => {
      const g = off.group.getContext("2d");
      const out = groupEl.getContext("2d");
      if (!g || !out) return;
      paintGroup(g, spec);
      const pl = plainRef.current;
      const plCtx = pl?.getContext("2d");
      if (plCtx) paintPlain(plCtx, spec);
      compose(out, spec, video, pl ?? null, off.group);
    };
    unsub = bus.subscribe((src) => {
      // the frame is an ImageBitmap that is closed right after this callback: copy it now
      const size = frameSourceSize(src);
      if (size) {
        off.video.width = size.w;
        off.video.height = size.h;
        const v = off.video.getContext("2d");
        try {
          v?.drawImage(src, 0, 0);
        } catch {
          /* closed / undecodable frame */
        }
      }
      stalled.delete(bus);
      unsub();
      whenFonts(() => render(size ? off.video : null), finish);
    });
    // a frame that never comes (past the end of the video): draw the letters plain rather than stall the export
    const waitMs = stalled.get(bus) === bus.count ? 300 : 20_000;
    timer = setTimeout(() => {
      if (finished) return;
      console.warn(`[capseasy] difference caption: no video frame at ${timeMs.toFixed(0)} ms; drawing the letters without the blend`);
      stalled.set(bus, bus.count);
      whenFonts(() => render(null), finish);
    }, waitMs);
    return () => finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, exportPath, timeMs]);

  const layer: React.CSSProperties = { position: "absolute", left: spec.w / 2, top: spec.h / 2, width: spec.w, height: spec.h, transform: "translate(-50%, -50%)", pointerEvents: "none" };
  const fill: React.CSSProperties = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" };
  return (
    <>
      {spec.plain ? (
        <div style={layer}>
          <canvas ref={plainRef} width={spec.w} height={spec.h} style={fill} />
        </div>
      ) : null}
      {/* the blend: CSS difference against everything painted before it (the video), or the computed composite */}
      <div style={exportPath ? layer : { ...layer, mixBlendMode: "difference" }}>
        <canvas ref={groupRef} width={spec.w} height={spec.h} data-difference={key} style={fill} />
      </div>
    </>
  );
};

export const DifferenceLayout: React.FC<PageRenderProps> = (p) => <DiffSurface spec={buildDiffSpec(p)} timeMs={p.timeMs} />;

