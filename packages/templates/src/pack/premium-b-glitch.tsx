/**
 * Glitch Slice: words tear in. For five 30 fps frames a word is cut into 5-7 horizontal slices (stacked copies, each
 * clipped to a band with clip-path inset) that jump sideways on held keys, while a red and a cyan copy split off
 * behind it and the word flickers; then it snaps clean with a one-frame lock-in jolt. Words that land together on a
 * line share one slice pattern, so the tear runs across the line like a single signal. At rest every word keeps a
 * hairline red/cyan fringe (1.3 px at 1080, drawn between the shadow pass and the face so it stays crisp), and the
 * key word keeps a pulse: it re-tears for three frames when spoken, then every 1.2 s a scan band runs down it and the
 * signal hiccups for two frames. The card tears out over its last four frames into the next card's tear-in.
 * Holds are quantised to a 30 fps glitch clock, so the look steps identically at 24, 30 or 60 fps.
 */
import React from "react";
import type { PageRenderProps } from "../types";
import { displayText } from "../text";
import { hash, keyWordIndex, rand } from "./kit";
import { Frame, Glyphs, appearAt, bandGradient, cardDur, clamp01, ctxOf, fillOf, fontCss, joinShadows, outlineCss, placeLines, px, solid, specOf, styleShadows, tf } from "./premium-b-kit";

const GAP_EM = 0.3;
const STEP = 1000 / 30;
const RED = "#FF2A55";
const CYAN = "#19E6FF";

interface Burst {
  /** slice displacement per step (x 0.24 em) */
  amp: number[];
  /** RGB split per step, em */
  rgb: number[];
  /** opacity per step */
  flick: number[];
}
const TEAR_IN: Burst = { amp: [1, 0.55, 1.15, 0.35, 0.12], rgb: [0.11, 0.07, 0.13, 0.05, 0.02], flick: [0.85, 0.3, 1, 0.7, 1] };
const TEAR_KEY: Burst = { amp: [0.6, 1, 0.3], rgb: [0.09, 0.13, 0.04], flick: [1, 0.72, 1] };
const TEAR_OUT: Burst = { amp: [0.35, 0.8, 1.25, 1.7], rgb: [0.03, 0.08, 0.12, 0.17], flick: [1, 0.55, 0.85, 0.2] };
/** the key word's idle hiccup: two small frames every HICCUP_MS while it rests */
const TEAR_TICK: Burst = { amp: [0.42, 0.16], rgb: [0.05, 0.022], flick: [1, 0.9] };
const HICCUP_MS = 1200;
/** resting chromatic fringe, reference px at 1080 (the key word's is wider) */
const FRINGE = 1.3;
const KEY_FRINGE = 1.9;
/** the scan band that runs down the key word just before each hiccup */
const SCAN_MS = 380;

interface Band {
  top: number;
  bottom: number;
  off: number;
  /** the band that always jumps hard */
  hard: boolean;
}
/** 5-7 bands across the glyph height (the outer ones reach past it, for shadows); some jump, one always jumps hard */
function bandsFor(seed: number, step: number): Band[] {
  const s = step * 97;
  const n = 5 + Math.floor(rand(seed, s) * 3);
  const cuts = Array.from({ length: n - 1 }, (_, i) => 8 + rand(seed, s + 1 + i) * 84).sort((a, b) => a - b);
  const edges = [-45, ...cuts, 145];
  const hard = Math.floor(rand(seed, s + 60) * n);
  return edges.slice(0, -1).map((top, i) => {
    const moved = i === hard || rand(seed, s + 20 + i) > 0.42;
    const r = rand(seed, s + 40 + i) * 2 - 1;
    const off = i === hard ? (r < 0 ? -1 : 1) : moved ? r : 0;
    return { top, bottom: edges[i + 1]!, off, hard: i === hard };
  });
}

interface Tear {
  at: number;
  burst: Burst;
  seed: number;
}

export const GlitchSliceLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, measure, settled } = p;
  const { sc, box, k, base } = ctxOf(p);
  const texts = page.words.map((w) => displayText(w, style));
  const spec = specOf(style, sc);
  const gapPx = style.wordSpacing * sc + (style.stroke.enabled ? style.stroke.width * sc : 0);
  // a little extra width for the RGB split so a torn word never crowds its neighbour
  const pl = placeLines(page, texts, spec, base, GAP_EM, gapPx, style.lineHeight, box.width / (1 + 0.025 * k), measure, 0.04);
  const size = pl.size;
  const mul = size / base;
  const keyI = keyWordIndex(page);
  const font = fontCss(spec, size, style.lineHeight);
  const shadow = joinShadows(styleShadows(style, sc, mul));
  const stroke = outlineCss(style, sc, mul);
  const tc = timeMs - page.startMs;
  // camera: a slow push, still moving on the last frame
  const push = settled ? 1 : 1 + 0.025 * k * clamp01(tc / Math.max(1200, cardDur(page)));
  const outAt = page.endMs - TEAR_OUT.amp.length * STEP;

  return (
    <Frame p={p} size={size}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: tf({ s: push }) }}>
        {pl.lines.map((line, li) => (
          <div key={li} style={{ display: "flex", flexWrap: "nowrap", justifyContent: "center", alignItems: "baseline" }}>
            {line.map((pw, j) => {
              const key = pw.i === keyI;
              const fill = key && !pw.w.color ? solid(style.active.color) : fillOf(pw.w, style.fill);
              const t0 = appearAt(pw.w);
              const tears: Tear[] = [{ at: t0, burst: TEAR_IN, seed: hash(`${page.id}|${li}|${Math.round(t0)}`) }];
              const inEnd = t0 + TEAR_IN.amp.length * STEP;
              if (key && pw.w.startMs > inEnd + 60) tears.push({ at: pw.w.startMs, burst: TEAR_KEY, seed: hash(`${page.id}|key|${pw.w.id}`) });
              if (outAt > inEnd + 60) tears.push({ at: outAt, burst: TEAR_OUT, seed: hash(`${page.id}|${li}|out`) });
              // at rest the key word keeps a pulse: a scan band runs down it and the signal hiccups, every 1.2 s
              let scan = -1;
              if (key && !settled) {
                const restAt = Math.max(inEnd, pw.w.startMs + TEAR_KEY.amp.length * STEP) + 520;
                const n = Math.floor((timeMs - restAt) / HICCUP_MS);
                const at = restAt + Math.max(0, n) * HICCUP_MS;
                if (n >= 0 && at + TEAR_TICK.amp.length * STEP < outAt) tears.push({ at, burst: TEAR_TICK, seed: hash(`${page.id}|tick|${n}`) });
                const q = (timeMs - (at - 190)) / SCAN_MS;
                if (n >= 0 && q > 0 && q < 1 && at < outAt) scan = q;
              }
              const gap = j < line.length - 1 ? pl.gap : undefined;
              const clean = <Glyphs text={pw.text} font={font} fill={fill} shadow={shadow} stroke={stroke} />;
              const abs: React.CSSProperties = { position: "absolute", left: 0, top: 0, ...font };
              // the resting signature: a hairline red/cyan fringe between the shadow pass and the face, plus the key
              // word's scan band
              const fringe = (key ? KEY_FRINGE : FRINGE) * sc;
              const rest = (jolt: number) => (
                <span key={pw.w.id} style={{ position: "relative", display: "inline-block", marginRight: gap, transform: tf({ x: jolt }) }}>
                  {clean}
                  <span aria-hidden style={{ ...abs, color: RED, opacity: 0.85, transform: `translateX(${px(-fringe)})` }}>{pw.text}</span>
                  <span aria-hidden style={{ ...abs, color: CYAN, opacity: 0.85, transform: `translateX(${px(fringe)})` }}>{pw.text}</span>
                  <span aria-hidden style={{ position: "absolute", left: 0, top: 0 }}>
                    <Glyphs text={pw.text} font={font} fill={fill} stroke={stroke} />
                  </span>
                  {scan >= 0 ? (
                    <span aria-hidden style={{ ...abs, backgroundImage: bandGradient(180, [{ center: -25 + 150 * scan, width: 16, peak: 0.75 }]), WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent" } as React.CSSProperties}>{pw.text}</span>
                  ) : null}
                </span>
              );
              if (settled) return rest(0);
              if (timeMs < t0) return <span key={pw.w.id} style={{ display: "inline-block", marginRight: gap, opacity: 0 }}>{clean}</span>;

              let active: { tear: Tear; step: number } | null = null;
              for (const tear of tears) {
                const s = Math.floor((timeMs - tear.at) / STEP);
                if (s >= 0 && s < tear.burst.amp.length) active = { tear, step: s };
              }
              if (!active) {
                // snapped clean, with a one-frame lock-in jolt that dies in ~70 ms
                const dt = timeMs - inEnd;
                const dir = rand(tears[0]!.seed, 999) < 0.5 ? -1 : 1;
                const jolt = dt >= 0 && dt < 160 ? dir * 0.03 * size * k * Math.exp(-dt / 28) : 0;
                return rest(jolt);
              }
              const { tear, step } = active;
              const amp = tear.burst.amp[step]! * k;
              const split = tear.burst.rgb[step]! * size * k;
              const flick = tear.burst.flick[step]!;
              const shift = (rand(tear.seed, step * 97 + 70) * 2 - 1) * amp * 0.06 * size;
              const skew = (rand(tear.seed, step * 97 + 71) - 0.5) * 7 * amp;
              const bands = bandsFor(tear.seed, step);
              return (
                <span key={pw.w.id} style={{ position: "relative", display: "inline-block", marginRight: gap, opacity: flick < 0.999 ? flick : undefined, transform: tf({ x: shift, skew }) }}>
                  {/* in-flow spacer keeps the word's box while every visible layer is a positioned copy */}
                  <span style={{ display: "inline-block", ...font, opacity: 0 }}>{pw.text}</span>
                  <span style={{ ...abs, color: RED, opacity: 0.9, transform: `translateX(${px(-split)})` }}>{pw.text}</span>
                  <span style={{ ...abs, color: CYAN, opacity: 0.9, transform: `translateX(${px(split)})` }}>{pw.text}</span>
                  {bands.map((b, bi) => (
                    <span
                      key={bi}
                      style={{ position: "absolute", left: 0, top: 0, clipPath: `inset(${b.top.toFixed(2)}% -40% ${(100 - b.bottom).toFixed(2)}% -40%)`, transform: tf({ x: b.off * amp * 0.24 * size }) }}
                    >
                      {/* on the hardest frames the torn band slips into the accent (white on the key word): one colour channel off */}
                      {b.hard && amp >= 0.9 ? <Glyphs text={pw.text} font={font} fill={solid(key ? "#FFFFFF" : style.active.color)} stroke={stroke} /> : clean}
                    </span>
                  ))}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </Frame>
  );
};
