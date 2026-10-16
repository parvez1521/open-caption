/**
 * 3D Flip Type: every letter is a face on a drum. It rolls up out of depth (rotateX -90° -> 0, hinged on an axis
 * 0.42 em behind it, pushed back 1.1 em in z), lands with a ~6 % spring overshoot and a long soft settle, and is lit
 * by a key light above the camera: dark while it is edge-on, a specular glint as it tips past vertical. Letters
 * cascade 26 ms apart with seeded jitter; angular speed adds motion blur. A spoken word pops forward in z and its
 * letters nod back toward the light in a ripple. The card exits by rolling on over the top, left to right, so the
 * next card rolling up from below reads as one turning drum. The whole card rides a slow camera push.
 *
 * One shared camera: each letter's own transform carries the perspective, re-centred on the card centre
 * (translate(-d) perspective(P) translate(d)), so letters left of centre are seen from the right like in a real
 * 3D comp, and the exporter (which reads only `transform`) draws it exactly as the browser does.
 */
import React from "react";
import type { PageRenderProps } from "../types";
import { displayText } from "../text";
import { hash, keyWordIndex, rand, withAlpha } from "./kit";
import {
  AE, Frame, Glyphs, cardDur, clamp01, ctxOf, exitWindow, fillOf, fontCss, impulse, letterCenters, outlineCss, placeLines,
  appearAt, joinShadows, px, shutter, smoothstep, solid, specOf, spring, styleShadows, tf, vel,
} from "./premium-b-kit";

const GAP_EM = 0.3;
/** camera distance and drum radius, in em */
const PERSPECTIVE_EM = 7;
const DRUM_EM = 0.42;
/** padding that keeps a 3D letter's text-shadow inside the exporter's per-element crop, em */
const PAD_EM = 0.42;

// key light above and in front of the camera (unit vector), and its half-vector with the view direction
const lambert = (a: number) => 0.447 * Math.sin(a) + 0.894 * Math.cos(a);
const specular = (a: number) => Math.pow(Math.max(0, 0.23 * Math.sin(a) + 0.973 * Math.cos(a)), 40);
const L0 = lambert(0);
const S0 = specular(0);
/** brightness of a face tipped `aDeg` around x (1 at rest) and how much of the specular glint it shows (0..1) */
function shading(aDeg: number): { bright: number; glint: number } {
  const a = (aDeg * Math.PI) / 180;
  return { bright: Math.max(0.3, lambert(a) / L0), glint: clamp01((specular(a) - S0) / (1 - S0)) };
}

export const FlipTypeLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, measure, settled } = p;
  const { sc, box, k, base } = ctxOf(p);
  const texts = page.words.map((w) => displayText(w, style));
  const spec = specOf(style, sc);
  const gapPx = style.wordSpacing * sc + (style.stroke.enabled ? style.stroke.width * sc : 0);
  const pl = placeLines(page, texts, spec, base, GAP_EM, gapPx, style.lineHeight, box.width / (1 + 0.035 * k), measure);
  const size = pl.size;
  const P = PERSPECTIVE_EM * size;
  const R = DRUM_EM * size;
  const pad = PAD_EM * size;
  const keyI = keyWordIndex(page);
  const mul = size / base;
  const baseShadows = styleShadows(style, sc, mul);
  const stroke = outlineCss(style, sc, mul);
  const font = fontCss(spec, size, style.lineHeight);
  const seed = hash(page.id);

  // camera: a slow push-in across the card, still moving on its last frame
  const tc = timeMs - page.startMs;
  const push = settled ? 1 : 1 + 0.035 * k * AE.out(clamp01(tc / Math.max(1400, cardDur(page))));
  const driftY = settled ? 0 : -0.05 * size * k * clamp01(tc / cardDur(page));

  // exit: the letters keep rolling over the top of the drum, left to right, finishing exactly at the card's end
  const nLetters = pl.lines.reduce((a, l) => a + l.reduce((b, w) => b + Array.from(w.text).length, 0), 0);
  const exitMs = exitWindow(page, 320);
  const letDur = Math.max(1, Math.min(190, exitMs * 0.62));
  const per = nLetters > 1 ? Math.max(0, Math.min(16, (exitMs - letDur) / (nLetters - 1))) : 0;
  const exitStart = page.endMs - exitMs;

  let g = 0;
  return (
    <Frame p={p} size={size}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: tf({ y: driftY, s: push }) }}>
        {pl.lines.map((line, li) => (
          <div key={li} style={{ display: "flex", flexWrap: "nowrap", justifyContent: "center", alignItems: "baseline", height: pl.lineH }}>
            {line.map((pw, j) => {
              const key = pw.i === keyI;
              const fill = key && !pw.w.color ? solid(style.active.color) : fillOf(pw.w, style.fill);
              const glowRgb = fill.type === "solid" ? fill.color : "#FFFFFF";
              const t0 = appearAt(pw.w);
              // spoken: the word pops forward in z (drawn as its 2D perspective scale about the card centre, so a
              // resting word stays crisp), held while it is said, easing back after
              const ts = timeMs - pw.w.startMs;
              const popEnv = settled || ts <= 0 ? 0 : spring(ts, 3.4, 0.5) * (1 - AE.inOut(clamp01((timeMs - pw.w.endMs - 80) / 380)));
              const zPop = (key ? 0.2 : 0.14) * size * k * popEnv;
              const sPop = P / (P - zPop);
              const { chars, centers } = letterCenters(pw.text, spec, size, measure);
              const perIn = Math.min(26, 250 / Math.max(1, chars.length));
              return (
                <span
                  key={pw.w.id}
                  style={{
                    position: "relative", display: "inline-flex", alignItems: "baseline", whiteSpace: "pre", marginRight: j < line.length - 1 ? pl.gap : undefined,
                    transform: sPop > 1.0002 ? `translate(${px(pw.cx * (sPop - 1))}, ${px(pw.cy * (sPop - 1))}) scale(${sPop.toFixed(4)})` : undefined,
                  }}
                >
                  {chars.map((ch, ci) => {
                    const gi = g++;
                    if (settled) return <Glyphs key={ci} text={ch} font={font} fill={fill} shadow={joinShadows(baseShadows)} stroke={stroke} />;
                    const start = t0 + ci * perIn + (ci ? (rand(seed, gi) - 0.5) * 10 : 0);
                    const eStart = exitStart + gi * per;
                    const dx = pw.cx - pw.width / 2 + centers[ci]!;
                    const dy = pw.cy;
                    // entrance + exit roll (the nod is added on top, without motion blur: it is a light catch, not a move)
                    const rollAt = (t: number) => -90 * (1 - spring(t - start, 2.7, 0.66)) + 96 * AE.in(clamp01((t - eStart) / letDur));
                    const nod = (key ? 16 : 12) * k * impulse(timeMs - pw.w.startMs - ci * 18, 85);
                    const ue = clamp01((timeMs - eStart) / letDur);
                    // a face seen edge-on is a dark sliver: it fades in as it turns toward the camera (and out as it turns away)
                    const op0 = clamp01((timeMs - start) / 70) * (1 - smoothstep(0.5, 1, ue));
                    const a0 = rollAt(timeMs);
                    const op = op0 * smoothstep(-86, -48, a0) * (1 - smoothstep(48, 86, a0));
                    if (op <= 0.001) return <Glyphs key={ci} text={ch} font={font} fill={fill} css={{ opacity: 0 }} />;
                    const a = rollAt(timeMs) + nod;
                    const z = -1.1 * size * k * (1 - spring(timeMs - start, 2.2, 0.92)) - 0.45 * size * k * AE.in(ue);
                    // angular speed -> the letter's top edge speed on the drum -> 180° shutter blur
                    const blur = 0.6 * shutter(Math.abs(vel(rollAt, timeMs)) * (Math.PI / 180) * (R + 0.5 * size), 0.03 * size);
                    const { bright, glint } = shading(a);
                    const b = bright + 0.32 * glint;
                    const filter = [Math.abs(b - 1) > 0.004 ? `brightness(${b.toFixed(3)})` : "", blur > 0.15 ? `blur(${blur.toFixed(2)}px)` : ""].filter(Boolean).join(" ");
                    const is3d = Math.abs(a) > 0.04 || Math.abs(z) > 0.05;
                    const shadow = joinShadows([glint > 0.01 ? `0 0 ${px(0.16 * size)} ${withAlpha(glowRgb, 0.45 * glint)}` : null, ...baseShadows]);
                    return (
                      <span
                        key={ci}
                        style={{
                          display: "inline-block", padding: pad, margin: -pad, opacity: op < 0.999 ? op : undefined, filter: filter || undefined,
                          transform: is3d
                            ? `translate(${px(-dx)}, ${px(-dy)}) perspective(${px(P)}) translate(${px(dx)}, ${px(dy)}) translateZ(${px(z - R)}) rotateX(${a.toFixed(3)}deg) translateZ(${px(R)})`
                            : undefined,
                        }}
                      >
                        <Glyphs text={ch} font={font} fill={fill} shadow={shadow} stroke={stroke} />
                      </span>
                    );
                  })}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </Frame>
  );
};
