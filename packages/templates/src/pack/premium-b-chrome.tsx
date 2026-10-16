/**
 * Chrome Sweep: polished chrome caps leaning forward. Each word is a five-layer build, bottom to top: a dark outline
 * with a stepped extrusion and a soft contact shadow; a dark rim offset down-right and a bright rim offset up-left
 * (the bevel); the chrome face (a multi-stop sky / horizon / ground ramp clipped to the glyphs); and a specular band
 * (a main band plus a thin trailing one) that sweeps across the face. Words land with weight (a short rise with a
 * small overshoot out of a blur) and the sweep crosses each one as it lands; the key word is gold chrome and the
 * light sweeps it again when it is spoken. The reflection is alive: the horizon in the chrome slides as a word rises
 * and drifts with the card's gentle float. The card leaves with a soft flare of the face, lifting out of a blur.
 *
 * Colour: a gradient fill IS the chrome ramp (recolour it in the Style panel); a solid fill is turned into a ramp of
 * that metal. The key word's metal is the highlight colour.
 */
import React from "react";
import type { CaptionStyleV2 } from "@capseasy/shared";
import type { PageRenderProps } from "../types";
import { displayText } from "../text";
import { bezier, keyWordIndex, shade, withAlpha } from "./kit";
import {
  AE, Frame, appearAt, bandGradient, blurCss, clamp, clamp01, ctxOf, exitWindow, fontCss, joinShadows, lerp, outlineCss, placeLines, px, smoothstep,
  specOf, styleShadows, tf,
} from "./premium-b-kit";

const GAP_EM = 0.3;
/** forward lean of the caps, deg */
const LEAN = -7;
const SWEEP_MS = 640;
const SWEEP_EASE = bezier(0.45, 0, 0.22, 1);
const LAND_MS = 560;

/** chrome ramp of one metal colour: bright sky, dark horizon line, reflective ground */
function metalStops(c: string): { color: string; at: number }[] {
  return [
    { color: shade(c, 0.9), at: 0 }, { color: shade(c, 0.55), at: 0.18 }, { color: shade(c, 0.12), at: 0.4 }, { color: shade(c, -0.12), at: 0.475 },
    { color: shade(c, -0.72), at: 0.49 }, { color: shade(c, -0.82), at: 0.53 }, { color: shade(c, -0.35), at: 0.6 }, { color: shade(c, 0.3), at: 0.8 }, { color: shade(c, 0.85), at: 1 },
  ];
}

/** the chrome face for a fill, with the reflected horizon shifted by `shift` (fraction of the height) */
function chromeFace(fill: CaptionStyleV2["fill"], shift: number): string {
  const angle = fill.type === "gradient" ? fill.angle : 180;
  const stops = fill.type === "gradient" ? fill.stops : metalStops(fill.color);
  const moved = stops.map((s, i) => ({ color: s.color, at: i === 0 || i === stops.length - 1 ? s.at : clamp(s.at + shift, 0.01, 0.99) }));
  return `linear-gradient(${angle.toFixed(1)}deg, ${moved.map((s) => `${s.color} ${(s.at * 100).toFixed(2)}%`).join(", ")})`;
}

const clip = (bg: string): React.CSSProperties =>
  ({ backgroundImage: bg, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent" }) as React.CSSProperties;

export const ChromeSweepLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, measure, settled } = p;
  const { sc, box, k, base } = ctxOf(p);
  const texts = page.words.map((w) => displayText(w, style));
  const spec = specOf(style, sc);
  const gapPx = style.wordSpacing * sc + (style.stroke.enabled ? style.stroke.width * sc : 0);
  // the lean and the bevel make each word ~0.08 em wider than its glyphs
  const pl = placeLines(page, texts, spec, base, GAP_EM, gapPx, style.lineHeight, box.width, measure, 0.08);
  const size = pl.size;
  const mul = size / base;
  const keyI = keyWordIndex(page);
  const font = fontCss(spec, size, style.lineHeight);
  const under = joinShadows(styleShadows(style, sc, mul));
  const stroke = outlineCss(style, sc, mul);
  const rim = 0.018 * size;
  const tc = timeMs - page.startMs;

  // gentle float of the whole card (two slow sines), and the reflection drifting with it
  const fy = settled ? 0 : Math.sin((2 * Math.PI * tc) / 2600) * 0.035 * size * k;
  const fr = settled ? 0 : Math.sin((2 * Math.PI * tc) / 3400 + 1.3) * 0.45 * k;
  const floatShift = settled ? 0 : Math.sin((2 * Math.PI * tc) / 2600) * 0.025;

  const exitMs = exitWindow(page, 260);
  const exitStart = page.endMs - exitMs;

  return (
    <Frame p={p} size={size}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: tf({ y: fy, r: fr }) }}>
        {pl.lines.map((line, li) => (
          <div key={li} style={{ display: "flex", flexWrap: "nowrap", justifyContent: "center", alignItems: "baseline" }}>
            {line.map((pw, j) => {
              const key = pw.i === keyI;
              const metal: CaptionStyleV2["fill"] = pw.w.color ? { type: "solid", color: pw.w.color } : key ? { type: "solid", color: style.active.color } : style.fill;
              const t0 = appearAt(pw.w);
              const gap = j < line.length - 1 ? pl.gap : undefined;
              // landing: rise with a small overshoot out of a blur, scale settling in log space
              const land = settled ? 1 : clamp01((timeMs - t0) / LAND_MS);
              const rise = settled ? 0 : (1 - AE.outBack(land)) * 0.34 * size * k;
              const scl = settled ? 1 : Math.pow(1 + 0.08 * k, 1 - AE.out(land));
              const blur = settled ? 0 : 0.07 * size * (1 - AE.out(clamp01(land * 1.8)));
              const opIn = settled ? 1 : clamp01((timeMs - t0) / 110);
              // exit: lift out of a blur, staggered, with the face flaring white
              const ue = settled ? 0 : clamp01((timeMs - exitStart - pw.i * 26) / Math.max(1, exitMs - 26 * Math.max(0, page.words.length - 1)));
              const eOut = AE.in(ue);
              const op = opIn * (1 - smoothstep(0.25, 1, ue));
              if (op <= 0.001) {
                return <span key={pw.w.id} style={{ display: "inline-block", marginRight: gap, opacity: 0, ...font }}>{pw.text}</span>;
              }
              // the reflection: the horizon slides as the word rises, then drifts with the float
              const shift = floatShift - (settled ? 0 : 0.2 * (1 - AE.out(land)));
              // specular sweeps: on landing, and again when the key word is spoken
              const sweeps = [t0 + 140];
              if (key && pw.w.startMs > t0 + 140 + SWEEP_MS * 0.8) sweeps.push(pw.w.startMs + 30);
              let band = -1;
              for (const s of sweeps) {
                const q = (timeMs - s) / SWEEP_MS;
                if (!settled && q > 0 && q < 1) band = SWEEP_EASE(q);
              }
              const bands = band >= 0 ? [{ center: lerp(-30, 135, band), width: 22, peak: 0.95 }, { center: lerp(-30, 135, band) - 17, width: 6, peak: 0.55 }] : [];
              const flare = Math.sin(Math.PI * clamp01(ue * 1.4)) * 0.75;
              if (flare > 0.01) bands.push({ center: 50, width: 260, peak: flare });
              const bloom = band >= 0 ? Math.sin(Math.PI * band) : 0;
              const abs: React.CSSProperties = { position: "absolute", left: 0, top: 0, whiteSpace: "pre", pointerEvents: "none" };
              return (
                <span
                  key={pw.w.id}
                  style={{
                    position: "relative", display: "inline-block", marginRight: gap, ...font, opacity: op < 0.999 ? op : undefined,
                    transform: tf({ y: rise - eOut * 0.2 * size * k, s: scl * (1 + 0.05 * eOut), skew: LEAN }),
                    filter: blurCss(blur + eOut * 0.06 * size),
                  }}
                >
                  {/* outline, extrusion and contact shadow (plus a soft bloom while the light crosses) */}
                  <span aria-hidden style={{ ...abs, color: style.stroke.enabled ? style.stroke.color : "#0B0F15", ...stroke, textShadow: joinShadows([bloom > 0.01 ? `0 0 ${px(0.32 * size)} ${withAlpha("#FFFFFF", 0.3 * bloom)}` : null, under ?? null]) }}>{pw.text}</span>
                  {/* bevel: dark rim down-right, bright rim up-left */}
                  <span aria-hidden style={{ ...abs, color: "rgba(6,9,14,0.92)", transform: `translate(${px(rim)}, ${px(rim)})` }}>{pw.text}</span>
                  <span aria-hidden style={{ ...abs, color: "rgba(255,255,255,0.92)", transform: `translate(${px(-rim)}, ${px(-rim)})` }}>{pw.text}</span>
                  {/* the chrome face */}
                  <span style={{ position: "relative", whiteSpace: "pre", ...clip(chromeFace(metal, shift)) }}>{pw.text}</span>
                  {/* the specular sweep */}
                  {bands.length ? <span aria-hidden style={{ ...abs, ...clip(bandGradient(104, bands)) }}>{pw.text}</span> : null}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </Frame>
  );
};

/** default silver chrome ramp (top -> bottom): sky, horizon line, reflective ground */
export const SILVER: CaptionStyleV2["fill"] = {
  type: "gradient", angle: 180,
  stops: [
    { color: "#FFFFFF", at: 0 }, { color: "#EEF2F7", at: 0.16 }, { color: "#B7C1CD", at: 0.36 }, { color: "#8794A5", at: 0.47 }, { color: "#2A323D", at: 0.485 },
    { color: "#1A2029", at: 0.53 }, { color: "#4E5B6C", at: 0.6 }, { color: "#AAB6C4", at: 0.8 }, { color: "#F2F5F9", at: 1 },
  ],
};
