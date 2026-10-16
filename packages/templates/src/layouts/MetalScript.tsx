import React from "react";
import { random } from "remotion";
import type { CaptionStyleV2, Word } from "@capseasy/shared";
import { applyCasing, withAlpha } from "@motion-ai/caption-engine/core";
import { combineMotion, easeFn, effectiveIntensity, exitStyle, progress, showAt } from "../motion";
import { containerCss, displayText, famCss, layoutBox, scaleOf } from "../text";
import type { MeasureFn, PageRenderProps } from "../types";
import { clipTextCss, innerFill } from "./Glow";

/*
 * "Metal + script" (the CaptionsEasy title lockup, as captions): heavy condensed caps in brushed metal SLAM in letter by
 * letter (2.3x -> 1 in log space, alternating +-30deg, dropping in, blur clearing, expo-out), a crack of light flashes
 * across each letter as it lands and every landing kicks the whole block; then the key word is WRITTEN ON in a green
 * script with a feathered left-to-right wipe, overlapping the caps from about a third of the way in. Behind it all,
 * a soft crescent of light slowly turns (the glow).
 * Like the glow looks: no blend modes, no masks, blur only per layer, so the in-browser export matches the preview.
 */

const LAND_MS = 340;
const FADE_MS = 70;
const CRACK_MS = 220;
/** ms between letters of a word (titles use 100 ms; speech needs words to land while they are said) */
const letterGap = (len: number) => Math.min(45, 260 / Math.max(1, len));
const LEAD_MS = 80;

interface Letter {
  ch: string;
  start: number;
  /** global index in the caps tier: rotation alternates left/right */
  n: number;
}
interface CapsWord {
  word: Word;
  letters: Letter[];
}

const capsWords = (words: Word[], style: CaptionStyleV2): CapsWord[] => {
  let n = 0;
  return words.map((w) => {
    const chars = [...displayText(w, style)];
    const gap = letterGap(chars.length);
    return { word: w, letters: chars.map((ch, i) => ({ ch, start: showAt(w) - LEAD_MS + i * gap, n: n++ })) };
  });
};

const scriptText = (w: Word, style: CaptionStyleV2) => applyCasing(displayText(w, style, "none"), style.hero.casing ?? "title");

const fontOf = (style: CaptionStyleV2, script: boolean, size: number, sc: number): React.CSSProperties => ({
  fontFamily: famCss(script ? style.hero.fontId ?? "Pacifico" : style.fontId),
  fontWeight: script ? style.hero.fontWeight ?? 400 : style.fontWeight,
  fontStyle: script ? "normal" : style.fontStyle,
  fontSize: size,
  lineHeight: style.lineHeight,
  letterSpacing: script ? 0 : style.letterSpacing * sc,
});

const gapOf = (style: CaptionStyleV2, size: number, sc: number) => size * 0.24 + style.wordSpacing * sc;

function rowWidth(texts: string[], style: CaptionStyleV2, script: boolean, size: number, sc: number, measure: MeasureFn) {
  const f = fontOf(style, script, size, sc);
  const spec = { fontFamily: f.fontFamily as string, fontWeight: f.fontWeight as number, fontStyle: f.fontStyle as string, fontSize: size, letterSpacing: (f.letterSpacing as number) || 0 };
  return texts.reduce((acc, t, i) => acc + measure(t, spec) + (i < texts.length - 1 ? gapOf(style, size, sc) : 0), 0);
}

const shadowOf = (style: CaptionStyleV2, sc: number) =>
  style.shadows.length ? style.shadows.map((s) => `${s.x * sc}px ${s.y * sc}px ${s.blur * sc}px ${s.color}`).join(", ") : undefined;

const ABS: React.CSSProperties = { position: "absolute", left: 0, top: 0, whiteSpace: "pre", pointerEvents: "none" };
const blurF = (px: number) => (px > 0.15 ? `blur(${px.toFixed(2)}px)` : undefined);

/** One glyph run painted as: soft dark shadow copy underneath, gradient fill inside the glyphs (+ optional outline). */
const Painted: React.FC<{ text: string; fill: string; shadow?: string; stroke?: CaptionStyleV2["stroke"]; sc: number; blur?: number }> = ({ text, fill, shadow, stroke, sc, blur = 0 }) => (
  <span style={{ position: "relative", display: "inline-block", whiteSpace: "pre" }}>
    {shadow ? <span aria-hidden style={{ ...ABS, color: "#050706", textShadow: shadow, filter: blurF(blur) }}>{text}</span> : null}
    <span
      style={{
        position: "relative", whiteSpace: "pre", ...clipTextCss(fill), filter: blurF(blur),
        ...(stroke?.enabled && stroke.width > 0 ? ({ WebkitTextStroke: `${stroke.width * sc}px ${stroke.color}`, paintOrder: "stroke fill" } as React.CSSProperties) : {}),
      }}
    >
      {text}
    </span>
  </span>
);

/** A thin jagged flash of light across a letter that just landed (seeded, the same on every render). */
const Crack: React.FC<{ seed: string; color: string; opacity: number }> = ({ seed, color, opacity }) => {
  const pts = [0, 1, 2, 3].map((i) => ({ x: -0.06 + i * 0.2, y: 0.32 + i * 0.1 + (random(`${seed}-${i}`) - 0.5) * 0.16 }));
  return (
    <>
      {pts.slice(1).map((b, i) => {
        const a = pts[i]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        return (
          <span
            key={i}
            aria-hidden
            style={{
              position: "absolute", left: `${a.x}em`, top: `${a.y}em`, width: `${len.toFixed(3)}em`, height: "0.028em", borderRadius: "0.02em",
              backgroundColor: color, boxShadow: `0 0 0.06em ${color}, 0 0 0.16em ${withAlpha(color, 0.7)}`, opacity,
              transform: `rotate(${ang.toFixed(1)}deg)`, transformOrigin: "0 50%", pointerEvents: "none",
            }}
          />
        );
      })}
    </>
  );
};

interface CapsRowProps {
  words: CapsWord[];
  style: CaptionStyleV2;
  size: number;
  sc: number;
  timeMs: number;
  k: number;
  settled?: boolean;
}

const CapsRow: React.FC<CapsRowProps> = ({ words, style, size, sc, timeMs, k, settled }) => {
  const font = fontOf(style, false, size, sc);
  const fill = innerFill(style.fill, 0.45);
  const shadow = shadowOf(style, sc);
  const startScale = 1 + 1.3 * Math.min(1.6, k);
  return (
    <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "baseline", justifyContent: "center", whiteSpace: "pre", ...font }}>
      {words.map((cw, wi) => (
        <span key={cw.word.id} style={{ display: "inline-flex", whiteSpace: "pre", marginRight: wi < words.length - 1 ? gapOf(style, size, sc) : 0 }}>
          {cw.letters.map((l, li) => {
            const t = timeMs - l.start;
            // before its slam the letter keeps its place (invisible) so the word never shifts
            if (!settled && t < 0) return <span key={li} style={{ display: "inline-block", whiteSpace: "pre", opacity: 0 }}>{l.ch}</span>;
            const p = settled ? 1 : progress(t, LAND_MS);
            const q = 1 - p;
            const dir = l.n % 2 === 0 ? -1 : 1;
            const crackAge = t - LAND_MS;
            const crack = !settled && crackAge >= 0 && crackAge < CRACK_MS ? 1 - crackAge / CRACK_MS : 0;
            return (
              <span
                key={li}
                style={{
                  position: "relative", display: "inline-block", whiteSpace: "pre", opacity: settled ? 1 : Math.min(1, t / FADE_MS),
                  transform: q > 0.0005 ? `translateY(${(-q * 0.2 * k * size).toFixed(2)}px) rotate(${(dir * 30 * q * Math.min(1.4, k)).toFixed(2)}deg) scale(${Math.exp(Math.log(startScale) * q).toFixed(4)})` : undefined,
                  transformOrigin: "50% 60%",
                }}
              >
                <Painted text={l.ch} fill={fill} shadow={shadow} stroke={style.stroke} sc={sc} blur={q * 0.07 * size} />
                {crack > 0 ? <Crack seed={`${cw.word.id}-${li}`} color={style.active.color} opacity={crack} /> : null}
              </span>
            );
          })}
        </span>
      ))}
    </div>
  );
};

/** Written on: a left-to-right wipe with a soft feathered edge (stacked clip copies, no masks), drifting in from the left. */
const ScriptWord: React.FC<{ word: Word; text: string; style: CaptionStyleV2; size: number; width: number; sc: number; timeMs: number; k: number; settled?: boolean; last: boolean }> = ({
  word, text, style, size, width, sc, timeMs, k, settled, last,
}) => {
  const font = fontOf(style, true, size, sc);
  const gap = last ? 0 : gapOf(style, size, sc);
  const padX = 0.4 * size;
  const padY = 0.35 * size;
  const box: React.CSSProperties = { display: "inline-block", position: "relative", whiteSpace: "pre", padding: `${padY}px ${padX}px`, margin: `${-padY}px ${gap - padX}px ${-padY}px ${-padX}px`, ...font };
  const start = showAt(word) - 60;
  if (!settled && timeMs < start) return <span style={{ ...box, opacity: 0 }}>{text}</span>;
  const dur = Math.min(650, Math.max(380, word.endMs - word.startMs + 220));
  const p = settled ? 1 : progress(timeMs - start, dur, easeFn("inOutCubic"));
  const fill = style.hero.fill ? innerFill(style.hero.fill, 0.3) : innerFill({ type: "solid", color: "#3FAF84" }, 0.3);
  const fw = ((0.35 * size) / (width + padX * 2)) * 100; // feather width, % of the padded word
  const edge = p * (100 + fw); // leading edge of the reveal
  const shadow = shadowOf(style, sc);
  const layer = (e: number, opacity: number, withShadow: boolean) =>
    e <= 0 ? null : (
      <span key={`${e}-${opacity}`} aria-hidden style={{ ...ABS, padding: `${padY}px ${padX}px`, opacity, clipPath: `inset(0 ${Math.max(0, Math.min(100, 100 - e)).toFixed(2)}% 0 0)` }}>
        <Painted text={text} fill={fill} shadow={withShadow ? shadow : undefined} sc={sc} />
      </span>
    );
  const drift = settled ? 0 : -(1 - p) * 0.14 * k * size;
  return (
    <span style={{ ...box, transform: drift ? `translateX(${drift.toFixed(2)}px)` : undefined }}>
      <span style={{ visibility: "hidden" }}>{text}</span>
      {p >= 1 ? layer(100, 1, true) : [layer(edge - fw, 1, true), layer(edge - (fw * 2) / 3, 0.5, false), layer(edge - fw / 3, 0.5, false), layer(edge, 0.4, false)]}
    </span>
  );
};

/** The crescent of light behind the lockup: the top border of a blurred circle, slowly turning. */
const Crescent: React.FC<{ style: CaptionStyleV2; diameter: number; sc: number; timeMs: number; fadeIn: number }> = ({ style, diameter, sc, timeMs, fadeIn }) => {
  const g = style.glow;
  if (!g.enabled || g.intensity <= 0) return null;
  const angle = -12 + 16 * Math.sin((timeMs / 1000) * 0.32);
  const ring = (d: number, thick: number, opacity: number, dx: number, dy: number, rot: number, key: string) => (
    <div
      key={key}
      aria-hidden
      style={{
        position: "absolute", left: "50%", top: "50%", width: d, height: d, borderRadius: "50%", boxSizing: "border-box",
        borderStyle: "solid", borderWidth: thick, borderColor: `${g.color} transparent transparent transparent`,
        transform: `translate(-50%, -50%) translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`,
        filter: blurF(thick * 1.5), opacity: opacity * fadeIn, pointerEvents: "none",
      }}
    />
  );
  const thick = g.radius * sc * 0.85;
  return (
    <>
      {ring(diameter, thick, Math.min(1, 0.95 * g.intensity), 0, diameter * 0.32, angle, "a")}
      {ring(diameter * 0.92, thick * 0.6, Math.min(1, 0.45 * g.intensity), diameter * 0.04, diameter * 0.36, angle + 14, "b")}
    </>
  );
};

/** Metal caps up to the key word, the key word (and anything after it) written on in script below. */
export const MetalScriptLayout: React.FC<PageRenderProps> = ({ page, timeMs, style, canvas, measure, settled }) => {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const k = effectiveIntensity(style, page.emotion);
  const words = page.words;
  const n = words.length;
  const hero = Math.min(page.heroIndex, n - 1);
  const split = n === 1 ? 1 : hero > 0 && hero < n ? hero : n - 1;
  const caps = capsWords(words.slice(0, split), style);
  const script = words.slice(split).map((w) => ({ word: w, text: scriptText(w, style) }));

  const base = style.fontSize * sc;
  const capsW0 = rowWidth(caps.map((c) => c.letters.map((l) => l.ch).join("")), style, false, base, sc, measure);
  const capsSize = capsW0 > box.width ? base * (box.width / capsW0) : base;
  const capsW = capsW0 * (capsSize / base);
  const sBase = (caps.length ? capsSize : base) * style.hero.scale;
  const scriptWidths = script.map((s) => rowWidth([s.text], style, true, sBase, sc, measure));
  const sW0 = scriptWidths.reduce((a, b) => a + b, 0) + Math.max(0, script.length - 1) * gapOf(style, sBase, sc);
  const sFit = sW0 > box.width ? box.width / sW0 : 1;
  const sSize = sBase * sFit;
  const sW = sW0 * sFit;
  const overlap = (typeof style.templateOptions.overlap === "number" ? (style.templateOptions.overlap as number) : 0.3) * Math.min(capsSize, sSize);
  // the script starts about a third of the way into the caps (kept inside the frame)
  // (only when it is the shorter tier: a long script line stays centred under the caps)
  const dx = caps.length && script.length && sW < capsW
    ? Math.min(capsW * 0.33 + sW / 2 - capsW / 2, (capsW - sW) / 2 + capsW * 0.08, (box.width - sW) / 2)
    : 0;

  // every landing kicks the whole lockup a little, decaying fast
  let kick = 0;
  if (!settled) {
    for (const cw of caps) for (const l of cw.letters) {
      const dt = (timeMs - (l.start + LAND_MS)) / 1000;
      if (dt >= 0 && dt < 0.4) kick += 0.012 * k * Math.exp(-16 * dt);
    }
  }
  const fadeIn = settled ? 1 : progress(timeMs - page.startMs, 900);

  return (
    <div style={combineMotion(containerCss(box, style.rotation), exitStyle(style, page.endMs - timeMs, settled, style.fontSize * sc))}>
      <Crescent style={style} diameter={Math.max(capsW, sW) * 1.25 + capsSize} sc={sc} timeMs={timeMs} fadeIn={fadeIn} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", transform: kick > 0.0002 ? `scale(${(1 + kick).toFixed(4)})` : undefined }}>
        {caps.length ? <CapsRow words={caps} style={style} size={capsSize} sc={sc} timeMs={timeMs} k={k} settled={settled} /> : null}
        {script.length ? (
          <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "baseline", justifyContent: "center", whiteSpace: "pre", marginTop: caps.length ? -overlap : 0, transform: dx ? `translateX(${dx.toFixed(2)}px)` : undefined }}>
            {script.map((s, i) => (
              <ScriptWord key={s.word.id} word={s.word} text={s.text} style={style} size={sSize} width={scriptWidths[i]! * sFit} sc={sc} timeMs={timeMs} k={k} settled={settled} last={i === script.length - 1} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
