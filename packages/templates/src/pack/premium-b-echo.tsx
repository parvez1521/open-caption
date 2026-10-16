/**
 * Echo Zoom: every word is thrown in from the camera. It starts ~5.5x its size and comes down in log space
 * (s = S0^((1-t)^4.5): almost all the travel in the first frames, then a long soft settle), unwinding a seeded tilt,
 * blurred by its own speed. Behind it runs an After Effects "Echo" (4 echoes, -34 ms apart, decay 0.58, composite in
 * back): copies of the word at earlier moments, tinted with the accent, which trail outside it and collapse into
 * the settled word. Each word zooms about its own slot, nudged toward the card centre, so the line converges in
 * reading order. A spoken
 * word gives a small bump; the key word sends out three echo rings. The card leaves by zooming through the camera
 * (log-space, accelerating) with its echoes lagging behind, into the next card's fly-in.
 */
import React from "react";
import type { PageRenderProps } from "../types";
import { displayText } from "../text";
import { hash, keyWordIndex, rand } from "./kit";
import {
  AE, Frame, Glyphs, appearAt, blurCss, cardDur, clamp01, ctxOf, exitWindow, fillOf, fontCss, impulse, joinShadows, logZoom, outlineCss, placeLines, px, shutter,
  smoothstep, solid, specOf, styleShadows, tf, vel,
} from "./premium-b-kit";

const GAP_EM = 0.28;
const ENTER_MS = 440;
/** AE Echo: number of echoes, echo time, decay */
const ECHOES = 4;
const ECHO_MS = 34;
const DECAY = 0.58;
const RING_MS = 480;

/** how far a flying word's zoom origin sits toward the card centre (0 = its own centre): mostly in place, a hint of convergence */
const RADIAL = 0.22;

interface State {
  /** the word's own fly-in scale (about its slot) */
  s: number;
  /** the card's zoom-through scale (about the card centre, the camera axis) */
  c: number;
  r: number;
  op: number;
}

export const EchoZoomLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, measure, settled } = p;
  const { sc, box, k, base } = ctxOf(p);
  const texts = page.words.map((w) => displayText(w, style));
  const spec = specOf(style, sc);
  const gapPx = style.wordSpacing * sc + (style.stroke.enabled ? style.stroke.width * sc : 0);
  const pl = placeLines(page, texts, spec, base, GAP_EM, gapPx, style.lineHeight, box.width / (1 + 0.025 * k), measure);
  const size = pl.size;
  const mul = size / base;
  const keyI = keyWordIndex(page);
  const font = fontCss(spec, size, style.lineHeight);
  const shadow = joinShadows(styleShadows(style, sc, mul));
  const stroke = outlineCss(style, sc, mul);
  const accent = style.active.color;
  const seed = hash(page.id);
  const tc = timeMs - page.startMs;
  const push = settled ? 1 : 1 + 0.025 * k * clamp01(tc / Math.max(1400, cardDur(page)));
  const exitMs = exitWindow(page, 300);
  const exitStart = page.endMs - exitMs;
  const sIn0 = 1 + 4.5 * k;
  const sOut1 = 1 + 5 * k;

  return (
    <Frame p={p} size={size}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: tf({ s: push }) }}>
        {pl.lines.map((line, li) => (
          <div key={li} style={{ display: "flex", flexWrap: "nowrap", justifyContent: "center", alignItems: "baseline" }}>
            {line.map((pw, j) => {
              const key = pw.i === keyI;
              const fill = key && !pw.w.color ? solid(accent) : fillOf(pw.w, style.fill);
              const gap = j < line.length - 1 ? pl.gap : undefined;
              const clean = <Glyphs text={pw.text} font={font} fill={fill} shadow={shadow} stroke={stroke} />;
              if (settled) return <span key={pw.w.id} style={{ display: "inline-block", marginRight: gap }}>{clean}</span>;
              const t0 = appearAt(pw.w);
              const rot0 = (rand(seed, pw.i) < 0.5 ? -1 : 1) * (4 + rand(seed, pw.i + 50) * 5) * k;
              const state = (t: number): State => {
                const pin = clamp01((t - t0) / ENTER_MS);
                const ue = exitMs > 0 ? clamp01((t - exitStart) / exitMs) : 0;
                const bump = 1 + (key ? 0.07 : 0.035) * k * impulse(t - pw.w.startMs, 95);
                return {
                  s: logZoom(sIn0, pin, 4.5) * bump,
                  c: Math.pow(sOut1, Math.pow(ue, 2.6)),
                  r: rot0 * (1 - AE.out(pin)),
                  // the first, biggest frames of the throw stay transparent: only the echoes hint at them
                  op: (t < t0 ? 0 : smoothstep(0.1, 0.32, pin)) * (1 - smoothstep(0.3, 1, ue)),
                };
              };
              const now = state(timeMs);
              // the card zooms about its centre (the camera axis); inside it the word zooms about its own slot, nudged
              // toward the centre by RADIAL
              const place = (st: State) =>
                `translate(${px(pw.cx * (st.c - 1))}, ${px(pw.cy * (st.c - 1))}) scale(${st.c.toFixed(4)}) translate(${px(pw.cx * (st.s - 1) * RADIAL)}, ${px(pw.cy * (st.s - 1) * RADIAL)}) scale(${st.s.toFixed(4)}) rotate(${st.r.toFixed(3)}deg)`;
              const dist = Math.hypot(pw.cx, pw.cy);
              const speed = Math.abs(vel((t) => state(t).s, timeMs)) * (pw.width / 2 + RADIAL * dist) * now.c + Math.abs(vel((t) => state(t).c, timeMs)) * (dist + pw.width / 2);
              const blurScreen = shutter(speed, 0.07 * size);
              const ghosts: React.ReactNode[] = [];
              for (let e = 1; e <= ECHOES; e++) {
                const g = state(timeMs - e * ECHO_MS);
                if (g.op <= 0.002 || (Math.abs(g.s * g.c - now.s * now.c) < 0.003 && Math.abs(g.r - now.r) < 0.05)) continue;
                const a = g.op * 0.62 * Math.pow(DECAY, e - 1);
                ghosts.push(
                  <span key={`e${e}`} aria-hidden style={{ position: "absolute", left: 0, top: 0, ...font, color: accent, opacity: a, transform: place(g), filter: blurCss((blurScreen * (1 + 0.35 * e)) / (g.s * g.c)) }}>
                    {pw.text}
                  </span>,
                );
              }
              // the key word's spoken echo: three rings leaving it, each later, bigger and fainter
              if (key) {
                for (let e = 1; e <= 3; e++) {
                  const u = (timeMs - pw.w.startMs - (e - 1) * 55) / RING_MS;
                  if (u <= 0 || u >= 1 || now.op < 0.5) continue;
                  const g = { ...now, s: now.s * (1 + (0.08 + 0.09 * e) * k * AE.out(u)) };
                  ghosts.push(
                    <span key={`r${e}`} aria-hidden style={{ position: "absolute", left: 0, top: 0, ...font, color: accent, opacity: Math.pow(1 - u, 1.5) * 0.55 * Math.pow(DECAY, e - 1), transform: place(g), filter: blurCss(0.012 * size * e) }}>
                      {pw.text}
                    </span>,
                  );
                }
              }
              // a landing word makes room: the line opens by its overshoot (capped) and closes as it settles, so it never
              // lands on its neighbours (the re-flow is part of the motion)
              const room = timeMs >= t0 && now.s > 1.0005 ? ((Math.min(now.s - 1, 0.22) * pw.width) / 2) * smoothstep(0, 0.15, (timeMs - t0) / ENTER_MS) : 0;
              const moving = Math.abs(now.s - 1) > 0.0005 || Math.abs(now.c - 1) > 0.0005 || Math.abs(now.r) > 0.01;
              return (
                <span key={pw.w.id} style={{ position: "relative", display: "inline-block", marginLeft: room || undefined, marginRight: (gap ?? 0) + room || undefined }}>
                  {ghosts}
                  <span style={{ position: "relative", display: "inline-block", opacity: now.op < 0.999 ? now.op : undefined, transform: moving ? place(now) : undefined, filter: blurCss(blurScreen / (now.s * now.c)) }}>{clean}</span>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </Frame>
  );
};
