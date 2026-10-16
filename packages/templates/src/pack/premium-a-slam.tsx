/**
 * "RGB Split Slam": heavy condensed caps hit the screen. The card falls in from 140 % scale, accelerating in log
 * space into the impact (so the last frames before the hit move fastest and carry the most motion blur), with a red
 * and a cyan channel copy offset sideways and in scale that converge exactly on the impact. The hit overshoots a
 * few percent and recovers, and a camera shake decays over 2-3 frames; then the type sits clean. Each word, as it is
 * spoken, gets a small re-split kick (its channels part and snap back, with a scale bump). Leaving, the card pushes
 * toward camera while its channels part and it fades. Cards alternate the tilt they fall in with. Pure in `timeMs`.
 */
import React from "react";
import { displayText, famCss } from "../text";
import type { PageRenderProps } from "../types";
import { hash } from "./kit";
import {
  AE, FRAME, Shell, ctxOf, decorFilters, linesOf, ordOf, prog, px, shake, shutterBlur, strokeCss, wordFillCss,
} from "./premium-a-kit";

const SLAM_MS = 150;
const RED = "#FF2A5C";
const CYAN = "#19E6FF";

export const SlamLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, measure, settled } = p;
  const { sc, box, k, base } = ctxOf(p);
  const kk = Math.min(1.8, k);
  const lines = linesOf(page);
  const texts = lines.map((l) => l.map((w) => displayText(w, style)));
  const spec = (size: number) => ({ fontFamily: famCss(style.fontId), fontWeight: style.fontWeight, fontStyle: style.fontStyle, fontSize: size, letterSpacing: style.letterSpacing * sc * (size / base) });
  const gapOf = (size: number) => 0.24 * size + style.wordSpacing * sc;
  const widthOf = (ts: string[], size: number) => ts.reduce((a, t) => a + measure(t, spec(size)), 0) + Math.max(0, ts.length - 1) * gapOf(size);
  const widest = Math.max(1, ...texts.map((t) => widthOf(t, base)));
  const size = widest > box.width ? base * (box.width / widest) : base;
  const halfW = Math.min(box.width, widest * (size / base)) / 2;
  const seed = hash(page.id);
  const side = ordOf(page) % 2 === 0 ? -1 : 1;

  const cardMs = page.endMs - page.startMs;
  const exitMs = Math.min(150, cardMs * 0.2);
  const exitAt = page.endMs - exitMs;

  // ---- the hit: log-space scale accelerating into the impact, then a damped overshoot
  const S0 = 1 + 0.4 * kk;
  const scaleAt = (ms: number) => {
    if (settled) return 1;
    const t = ms - page.startMs;
    if (t < SLAM_MS) return S0 ** (1 - prog(t, 0, SLAM_MS) ** 1.7);
    const a = t - SLAM_MS;
    // keeps shrinking through the hit (same direction as the fall), dips ~3 %, recovers with one small rebound
    const recoil = 1 - 0.06 * kk * Math.exp(-a / 55) * Math.sin((a / 210) * Math.PI * 2);
    const push = 1 + 0.08 * kk * AE.in(prog(ms, exitAt, exitMs));
    return recoil * push;
  };
  const s = scaleAt(timeMs);
  const u = settled ? 1 : prog(timeMs, page.startMs, SLAM_MS);
  const rot = settled ? 0 : side * 4 * kk * (1 - u ** 1.7);
  const hit = settled ? { x: 0, y: 0, r: 0 } : shake(timeMs, page.startMs + SLAM_MS, 0.05 * size * kk, 1.3 * kk, 42, seed);
  // motion blur from the scale's speed at the card's edge
  const blur = settled ? 0 : shutterBlur((scaleAt(timeMs + FRAME / 2) - scaleAt(timeMs - FRAME / 2)) * halfW * 0.6, 0.035 * size);
  const appear = settled ? 1 : AE.out(prog(timeMs, page.startMs, 45));
  const vanish = settled ? 1 : 1 - AE.in(prog(timeMs, exitAt + exitMs * 0.2, exitMs * 0.8));
  // the channel split: wide while falling, converged on the impact, parting again on the way out
  const cardSplit = settled ? 0 : 0.17 * kk * size * (1 - u) ** 1.2 + 0.07 * kk * size * AE.in(prog(timeMs, exitAt, exitMs));

  const filters = [...(blur > 0.3 ? [`blur(${px(blur)})`] : []), ...decorFilters(style, sc, size / base)];
  const motion: React.CSSProperties = {
    transform: `translate(${px(hit.x)}, ${px(hit.y)}) rotate(${(rot + hit.r).toFixed(3)}deg) scale(${s.toFixed(5)})`,
    opacity: +(appear * vanish).toFixed(4),
    ...(filters.length ? { filter: filters.join(" ") } : {}),
  };
  const type: React.CSSProperties = {
    fontFamily: famCss(style.fontId), fontWeight: style.fontWeight, fontStyle: style.fontStyle, fontSize: size, lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing * sc * (size / base), whiteSpace: "pre",
  };
  const ABS: React.CSSProperties = { position: "absolute", left: 0, top: 0 };
  let wi = 0;
  return (
    <Shell p={p} box={box} size={size} motion={motion}>
      {lines.map((line, li) => (
        <div key={li} style={{ display: "flex", flexWrap: "nowrap", alignItems: "baseline", columnGap: px(gapOf(size)) }}>
          {line.map((w, wj) => {
            const text = texts[li]![wj]!;
            const n = wi++;
            // the re-split kick when the word is spoken (the first word's is the slam itself)
            const tw = timeMs - w.startMs;
            const kicked = !settled && w.startMs > page.startMs + SLAM_MS * 0.5 && tw >= 0 && tw < 400;
            const kickSplit = kicked ? 0.065 * kk * size * Math.exp(-tw / 55) : 0;
            const bump = kicked ? 0.075 * kk * (tw / 38) * Math.exp(1 - tw / 38) : 0;
            const jolt = kicked && tw < FRAME ? (n % 2 === 0 ? -1 : 1) * 0.02 * size : 0;
            const dx = cardSplit + kickSplit;
            const show = dx > 0.25;
            return (
              <span key={w.id} style={{ position: "relative", display: "inline-block", transform: bump > 0.001 || jolt ? `translateY(${px(jolt)}) scale(${(1 + bump).toFixed(4)})` : undefined }}>
                {show ? (
                  <>
                    <span aria-hidden style={{ ...type, ...ABS, color: RED, opacity: 0.92, transform: `translate(${px(-dx)}, ${px(-dx * 0.18)}) scale(${(1 + (dx / size) * 0.5).toFixed(4)})` }}>{text}</span>
                    <span aria-hidden style={{ ...type, ...ABS, color: CYAN, opacity: 0.92, transform: `translate(${px(dx * 0.9)}, ${px(dx * 0.14)}) scale(${(1 - (dx / size) * 0.3).toFixed(4)})` }}>{text}</span>
                  </>
                ) : null}
                <span style={{ ...type, position: "relative", display: "inline-block", ...wordFillCss(w, style.fill), ...strokeCss(style, sc, size / base) }}>{text}</span>
              </span>
            );
          })}
        </div>
      ))}
    </Shell>
  );
};
