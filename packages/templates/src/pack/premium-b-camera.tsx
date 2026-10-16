/**
 * Kinetic Camera: the card is set as a typographic lockup, and a virtual camera moves over it.
 *
 * The lockup: the key word huge and heavy; the word before it a small tracked-out kicker, flush with the key word's
 * left edge; the word after it a large italic serif in the accent, flush with its right edge; any others heavy caps.
 * Rows carry small opposing tilts. The lockup is fitted to ~80 % of the caption width so the camera has room to move
 * and never pushes type out of the safe area.
 *
 * The camera (one transform on the lockup: translate, rotate, scale) whips in from the right with the card, settles
 * on the first word, then eases (slow-whip-slow) to each word as it is spoken: zooming in on small words, levelling
 * the tilted ones by counter-rotating, with a rack focus (the other words soften and dim). After the last word it
 * pulls back to frame the whole lockup, and whips out to the left as the card ends, so consecutive cards read as one
 * continuous whip pan. Whips are smeared with trailing copies and a velocity blur; the camera never stops drifting.
 * Each role has its own entrance: the key word slams down out of a blur, the kicker tracks in, the serif rises out of
 * a mask, heavy words slide out of a mask; when the key word is spoken an accent rule draws under it.
 */
import React from "react";
import type { CaptionStyleV2, Word } from "@capseasy/shared";
import type { PageRenderProps } from "../types";
import { displayText, famCss } from "../text";
import { bezier, cardOrdinal, keyWordIndex, withAlpha } from "./kit";
import {
  AE, type FontSpec, Frame, Glyphs, appearAt, blurCss, clamp, clamp01, ctxOf, exitWindow, fillOf, fontCss, impulse, joinShadows, lerp, logZoom, outlineCss, px,
  shutter, smoothstep, solid, styleShadows, vel,
} from "./premium-b-kit";

export const SERIF_FONT = "Playfair Display";
type Role = "key" | "kicker" | "serif" | "heavy";

/** the camera's move between two focuses: slow, whip, slow (with a long settle) */
const CAM_EASE = bezier(0.76, 0, 0.18, 1);
const MOVE_MS = 380;
const PULLBACK_MS = 560;
const WHIP_IN_MS = 340;

interface Item {
  w: Word;
  i: number;
  role: Role;
  text: string;
  spec: FontSpec;
  size: number;
  lh: number;
  width: number;
  height: number;
  /** top-left in lockup coordinates, px */
  x: number;
  y: number;
  rot: number;
  fill: CaptionStyleV2["fill"];
}

interface Cam {
  x: number;
  y: number;
  z: number;
  r: number;
  /** how much each word is in focus (1 = sharp) */
  wt: number[];
}
const mixCam = (a: Cam, b: Cam, t: number): Cam => ({
  x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), t)), r: lerp(a.r, b.r, t), wt: a.wt.map((v, i) => lerp(v, b.wt[i]!, t)),
});

export const KineticCameraLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, canvas, measure, settled } = p;
  const { sc, box, k, base } = ctxOf(p);
  const keyI = keyWordIndex(page);
  const n = page.words.length;
  const accent = style.active.color;
  const caseOr = (c: CaptionStyleV2["casing"]) => (style.casing === "none" ? c : style.casing);
  const sign = cardOrdinal(page) % 2 === 0 ? 1 : -1;
  const lsBase = style.letterSpacing * sc;

  // ---------------------------------------------------------------- the lockup
  const roleOf = (i: number): Role => (i === keyI ? "key" : i < keyI ? ((keyI - 1 - i) % 2 === 0 ? "kicker" : "heavy") : (i - keyI - 1) % 2 === 0 ? "serif" : "heavy");
  const raw = page.words.map((w, i) => {
    const role = roleOf(i);
    let spec: FontSpec;
    let size: number;
    let lh: number;
    let text: string;
    if (role === "key") {
      size = base * style.hero.scale;
      spec = { fontFamily: famCss(style.hero.fontId ?? style.fontId), fontWeight: style.hero.fontWeight ?? 900, fontStyle: "normal", letterSpacing: lsBase - 0.02 * size };
      lh = 0.95;
      text = displayText(w, style, style.hero.casing ?? caseOr("upper"));
    } else if (role === "kicker") {
      size = base * 0.8;
      spec = { fontFamily: famCss(style.fontId), fontWeight: 600, fontStyle: "normal", letterSpacing: lsBase + 0.14 * size };
      lh = 1.15;
      text = displayText(w, style, caseOr("upper"));
    } else if (role === "serif") {
      size = base * 1.4;
      spec = { fontFamily: famCss(SERIF_FONT), fontWeight: 700, fontStyle: "italic", letterSpacing: lsBase };
      lh = 1.05;
      text = displayText(w, style);
    } else {
      size = base * 0.86;
      spec = { fontFamily: famCss(style.fontId), fontWeight: 800, fontStyle: "normal", letterSpacing: lsBase - 0.01 * size };
      lh = 1.02;
      text = displayText(w, style, caseOr("upper"));
    }
    const width = measure(text, { ...spec, fontSize: size }) + (spec.fontStyle === "italic" ? 0.12 * size : 0);
    const fill = w.color ? solid(w.color) : role === "serif" ? solid(accent) : role === "key" ? style.hero.fill ?? style.fill : style.fill;
    return { w, i, role, text, spec, size, lh, width, height: size * lh, x: 0, y: 0, rot: 0, fill } as Item;
  });
  const key = raw[keyI]!;
  const vgap = Math.max(0, style.lineHeight - 0.85) * base * 0.6;
  const rowsOf = (idx: number[]): Item[][] => {
    const rows: Item[][] = [];
    let cur: Item[] = [];
    let wsum = 0;
    for (const i of idx) {
      const it = raw[i]!;
      const add = it.width + (cur.length ? 0.3 * it.size + style.wordSpacing * sc : 0);
      if (cur.length && wsum + add > Math.max(key.width * 1.25, base * 3)) {
        rows.push(cur);
        cur = [];
        wsum = 0;
      }
      wsum += cur.length ? add : it.width;
      cur.push(it);
    }
    if (cur.length) rows.push(cur);
    return rows;
  };
  const pre = rowsOf(page.words.map((_, i) => i).filter((i) => i < keyI));
  const post = rowsOf(page.words.map((_, i) => i).filter((i) => i > keyI));
  let y = 0;
  const place = (rows: Item[][], align: "left" | "right", rot: number) => {
    for (const row of rows) {
      const h = Math.max(...row.map((it) => it.height));
      const rowW = row.reduce((a, it, j) => a + it.width + (j ? 0.3 * it.size + style.wordSpacing * sc : 0), 0);
      let x = align === "left" ? 0 : key.width - rowW;
      row.forEach((it, j) => {
        if (j) x += 0.3 * it.size + style.wordSpacing * sc;
        it.x = x;
        it.y = y + (h - it.height);
        it.rot = rot;
        x += it.width;
      });
      y += h + vgap;
    }
  };
  place(pre, "left", 3 * sign);
  key.x = 0;
  key.y = y;
  key.rot = -2.5 * sign;
  y += key.height + vgap;
  place(post, "right", -3.5 * sign);
  const minX = Math.min(...raw.map((it) => it.x));
  const maxX = Math.max(...raw.map((it) => it.x + it.width));
  const rawW = Math.max(1, maxX - minX);
  const rawH = Math.max(1, y - vgap);
  const sb = style.safeBox;
  const safe = { l: canvas.width * sb.left, r: canvas.width * (1 - sb.right), t: canvas.height * sb.top, b: canvas.height * (1 - sb.bottom) };
  const f = Math.min(1, (0.8 * box.width) / rawW, ((safe.b - safe.t) * 0.42) / rawH);
  const items = raw.map((it) => ({ ...it, x: (it.x - minX) * f, y: it.y * f, size: it.size * f, width: it.width * f, height: it.height * f, spec: { ...it.spec, letterSpacing: (it.spec.letterSpacing ?? 0) * f } }));
  const W = rawW * f;
  const H = rawH * f;
  const order = items.map((it) => it.i);

  // ---------------------------------------------------------------- the camera
  const zMax = Math.max(1, Math.min(1 + 0.3 * Math.max(0.3, k), ((safe.r - safe.l) * 0.97) / W));
  const clampT = (tx: number, ty: number, z: number) => {
    const hw = (W * z) / 2;
    const hh = (H * z) / 2;
    const fit = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : clamp(v, lo, hi));
    return { x: fit(tx, safe.l - box.cx + hw, safe.r - box.cx - hw), y: fit(ty, safe.t - box.cy + hh, safe.b - box.cy - hh) };
  };
  const overview: Cam = { ...clampT(0, 0, 1), z: 1, r: 0, wt: items.map(() => 1) };
  const focus = (i: number): Cam => {
    const it = items[i]!;
    const z = clamp((0.46 * box.width) / Math.max(1, it.width), 1, zMax);
    const cx = it.x + it.width / 2 - W / 2;
    const cy = it.y + it.height / 2 - H / 2;
    return { ...clampT(-cx * z * 0.75, -cy * z * 0.75, z), z, r: -0.55 * it.rot * Math.min(1, k), wt: items.map((_, j) => (j === i ? 1 : 0)) };
  };
  const moves: { at: number; dur: number; to: Cam }[] = [];
  let prevEnd = page.startMs + WHIP_IN_MS * 0.6;
  for (let j = 1; j < order.length; j++) {
    const w = page.words[j]!;
    const at = Math.max(w.startMs - 200, prevEnd - 100);
    moves.push({ at, dur: MOVE_MS, to: focus(j) });
    prevEnd = at + MOVE_MS;
  }
  const exitMs = exitWindow(page, 240);
  const exitStart = page.endMs - exitMs;
  const lastEnd = page.words[n - 1]!.endMs;
  const pullAt = Math.max(lastEnd + 80, prevEnd - 100);
  if (n > 1 && pullAt + 200 < exitStart) moves.push({ at: pullAt, dur: PULLBACK_MS, to: overview });
  const whipW = canvas.width * 0.62 * k;
  const camAt = (t: number): Cam & { o: number } => {
    if (settled) return { ...overview, o: 1 };
    let c = n > 1 ? focus(0) : overview;
    for (const m of moves) if (t >= m.at) c = mixCam(c, m.to, CAM_EASE(clamp01((t - m.at) / m.dur)));
    const win = 1 - AE.out(clamp01((t - page.startMs) / WHIP_IN_MS));
    const wout = AE.in(clamp01((t - exitStart) / Math.max(1, exitMs)));
    const tc = t - page.startMs;
    return {
      ...c,
      x: c.x + whipW * win - whipW * wout,
      r: c.r + 6 * k * win * sign - 5 * k * wout * sign + 0.35 * k * Math.sin((2 * Math.PI * tc) / 4200),
      z: c.z * (1 + 0.1 * k * win + 0.08 * k * wout) * (1 + 0.012 * k * Math.sin((2 * Math.PI * tc) / 3100 + 0.7)),
      o: 1 - smoothstep(0.6, 1, clamp01((t - exitStart) / Math.max(1, exitMs))),
    };
  };
  const cam = camAt(timeMs);
  const vx = settled ? 0 : vel((t) => camAt(t).x, timeMs);
  const camCss = (c: Cam, dx = 0) => `translate(${px(c.x + dx)}, ${px(c.y)}) rotate(${c.r.toFixed(3)}deg) scale(${c.z.toFixed(4)})`;

  // ---------------------------------------------------------------- the words
  const stroke = (it: Item) => outlineCss(style, sc, it.size / base);
  const renderItem = (it: Item, idx: number, ghost: boolean) => {
    const t0 = appearAt(it.w);
    if (!settled && timeMs < t0) return null;
    const pin = settled ? 1 : clamp01((timeMs - t0) / (it.role === "key" ? 460 : it.role === "kicker" ? 620 : 560));
    const e = AE.out(pin);
    const font = fontCss(it.spec, it.size, it.lh);
    let inner: React.CSSProperties = {};
    let clipPath: string | undefined;
    if (it.role === "key") {
      const s = logZoom(1 + 0.3 * k, pin, 3);
      inner = { transform: s > 1.0002 ? `scale(${s.toFixed(4)})` : undefined, opacity: clamp01((timeMs - t0) / 80), filter: blurCss(0.05 * it.size * (1 - AE.out(clamp01(pin * 1.6)))) };
    } else if (it.role === "kicker") {
      font.letterSpacing = (it.spec.letterSpacing ?? 0) + 0.45 * it.size * k * (1 - e);
      inner = { opacity: smoothstep(0, 0.35, pin) };
    } else if (it.role === "serif") {
      if (pin < 1) clipPath = "inset(-60% -25% 0% -25%)";
      inner = { transform: pin < 1 ? `translateY(${px((1 - e) * 1.05 * it.height)})` : undefined };
    } else {
      if (pin < 1) clipPath = "inset(-30% -30% -30% 0%)";
      inner = { transform: pin < 1 ? `translateX(${px(-(1 - e) * 1.05 * it.width)})` : undefined };
    }
    // rack focus: words the camera is not on soften and dim; a spoken word gives a small bump
    const off = 1 - (cam.wt[idx] ?? 1);
    const bump = settled ? 1 : 1 + 0.035 * k * impulse(timeMs - it.w.startMs, 90);
    const shadow = joinShadows(styleShadows(style, sc, it.size / base));
    return (
      <div
        key={it.w.id}
        style={{
          position: "absolute", left: it.x, top: it.y, width: it.width, height: it.height, display: "flex", alignItems: "flex-end", justifyContent: "flex-start",
          transform: `rotate(${it.rot.toFixed(2)}deg)${Math.abs(bump - 1) > 0.0005 ? ` scale(${bump.toFixed(4)})` : ""}`, clipPath,
          opacity: ghost ? undefined : off > 0.01 ? 1 - 0.18 * off : undefined, filter: ghost ? undefined : blurCss(off * 0.01 * it.size),
        }}
      >
        <span style={{ display: "inline-block", ...inner }}>
          <Glyphs text={it.text} font={font} fill={ghost ? solid(it.fill.type === "solid" ? it.fill.color : it.fill.stops[0]!.color) : it.fill} shadow={ghost ? undefined : shadow} stroke={ghost ? undefined : stroke(it)} />
        </span>
      </div>
    );
  };
  // the accent rule drawn under the key word when it is spoken
  const ruleP = settled ? 1 : AE.out(clamp01((timeMs - key.w.startMs) / 420));
  const k2 = items[keyI]!;
  const rule =
    settled || timeMs >= key.w.startMs ? (
      <div
        style={{
          position: "absolute", left: k2.x, top: k2.y + k2.height + 0.03 * k2.size, width: k2.width, height: Math.max(2, 0.055 * k2.size), backgroundColor: accent, borderRadius: 2,
          transform: `rotate(${k2.rot.toFixed(2)}deg) scaleX(${ruleP.toFixed(4)})`, transformOrigin: "0% 50%", boxShadow: `0 ${px(0.02 * k2.size)} ${px(0.08 * k2.size)} ${withAlpha("#000000", 0.45)}`,
        }}
      />
    ) : null;

  // whip smear: trailing copies along the pan and a velocity blur
  const ghosts: React.ReactNode[] = [];
  if (Math.abs(vx) > 0.35) {
    for (let j = 1; j <= 3; j++) {
      ghosts.push(
        <div key={`g${j}`} aria-hidden style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transform: camCss(cam, -vx * 11 * j), opacity: 0.4 * Math.pow(0.6, j - 1) * cam.o }}>
          {items.map((it, idx) => renderItem(it, idx, true))}
        </div>,
      );
    }
  }
  return (
    <Frame p={p} size={base}>
      <div style={{ position: "relative", width: W, height: H }}>
        {ghosts}
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transform: camCss(cam), opacity: cam.o < 0.999 ? cam.o : undefined, filter: blurCss(shutter(vx, 0.02 * canvas.width) * 0.5) }}>
          {items.map((it, idx) => renderItem(it, idx, false))}
          {rule}
        </div>
      </div>
    </Frame>
  );
};
