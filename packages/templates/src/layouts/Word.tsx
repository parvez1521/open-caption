import React from "react";
import { activeEffect, combineMotion, effectiveIntensity, entranceStyle, exitStyle, flapText, rollAt, scrambleDurationMs, scrambledText, SPRINGS, springMs } from "../motion";
import { BlockRevealBlock, PanelsRevealPanels } from "./BlockReveal";
import { fitSize } from "../measure";
import { backgroundCss, baseTextCss, containerCss, displayText, famCss, layoutBox, scaleOf } from "../text";
import type { PageRenderProps } from "../types";

/** One word owns the frame; each word pops in on its own beat. */
export const WordLayout: React.FC<PageRenderProps> = ({ page, timeMs, style, canvas, measure, settled }) => {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas, page.position);
  const intensity = effectiveIntensity(style, page.emotion);

  let idx = page.words.findIndex((w) => timeMs >= w.startMs && timeMs < w.endMs);
  if (idx === -1) {
    idx = 0;
    page.words.forEach((w, i) => {
      if (w.startMs <= timeMs) idx = i;
    });
  }
  const word = page.words[idx];
  if (!word) return null;

  const casing = style.casing === "none" ? "upper" : style.casing;
  const rawDisplay = displayText(word, style, casing);
  // decode scramble on the single word (same pure function as WordSpan)
  const display = !settled && style.entrance.type === "scramble"
    ? scrambledText(rawDisplay, timeMs - word.startMs, Math.floor((timeMs / 1000) * canvas.fps), scrambleDurationMs(word))
    : !settled && style.entrance.type === "split-flap"
      ? flapText(rawDisplay, timeMs - word.startMs, Math.max(120, style.entrance.durationMs))
      : rawDisplay;
  // word roll: during the first entrance window the outgoing word rolls up out of a clipped box
  // while this word rolls in from below (rollAt is the shared pure timing function)
  const isRoll = !settled && style.entrance.type === "roll";
  const roll = isRoll ? rollAt(timeMs - word.startMs, style.entrance.durationMs) : null;
  const rolling = !!roll && !roll.done;
  const prevWord = rolling && idx > 0 ? page.words[idx - 1] : undefined;
  const prevDisplay = prevWord ? displayText(prevWord, style, casing) : "";
  const scale = typeof style.templateOptions.sizeScale === "number" ? style.templateOptions.sizeScale : 1.35;
  // leave room for the spoken-word growth and any 3D extrusion/shadow so the word never touches the edges
  const size = fitSize(display, style.fontSize * scale * sc, box.width / (1 + Math.max(0, style.active.scale - 1) * Math.min(2, effectiveIntensity(style, page.emotion))) * 0.94, {
    fontFamily: famCss(style.fontId), fontWeight: style.fontWeight, fontStyle: style.fontStyle, letterSpacing: style.letterSpacing * sc,
  }, measure);

  // the beat pop: how far it springs follows motion intensity (x emotion)
  const pop = settled ? 1 : springMs(timeMs, word.startMs, canvas.fps, SPRINGS.punch);
  const from = Math.max(0.3, 1 - 0.1 * intensity);
  const rot = typeof style.templateOptions.tilt === "number" ? (idx % 2 === 0 ? -1 : 1) * style.templateOptions.tilt * pop : 0;
  // the shown word is always the one being spoken, so the chosen spoken-word effect applies to it
  const fx = timeMs < word.endMs ? activeEffect(style, word, timeMs, canvas.fps, sc, intensity, settled) : { css: {} };
  const { transform: fxTransform, ...fxCss } = fx.css;
  const emphasised = word.emphasis === "strong" || word.emphasis === "hero";
  const css: React.CSSProperties = {
    ...baseTextCss(style, sc, size),
    position: "relative",
    display: "inline-block",
    transform: `scale(${from + pop * (1 - from)}) rotate(${rot}deg)${fxTransform ? ` ${fxTransform}` : ""}`,
    ...(word.color ? { color: word.color, WebkitTextFillColor: word.color, backgroundImage: "none" } : {}),
    ...(emphasised ? { color: style.active.color, WebkitTextFillColor: style.active.color, backgroundImage: "none" } : {}),
    ...fxCss,
  };

  const prevSize = prevWord ? fitSize(prevDisplay, style.fontSize * scale * sc, box.width * 0.94, {
    fontFamily: famCss(style.fontId), fontWeight: style.fontWeight, fontStyle: style.fontStyle, letterSpacing: style.letterSpacing * sc,
  }, measure) : size;
  const rollCss: React.CSSProperties | null = rolling && roll ? {
    ...css,
    transform: `translateY(${roll.incomingPct.toFixed(2)}%)${fxTransform ? ` ${fxTransform}` : ""}`,
  } : null;

  return (
    <div style={containerCss(box, style.rotation)}>
      <BlockRevealBlock style={style} localMs={timeMs - page.startMs} settled={settled} />
      <PanelsRevealPanels style={style} localMs={timeMs - page.startMs} settled={settled} />
      <div style={{
        ...backgroundCss(style, sc),
        ...(rolling ? { position: "relative" as const, overflow: "hidden" as const, height: `${(size * style.lineHeight * 1.05).toFixed(1)}px`, width: "100%" } : {}),
        // Floor Hero looks (templateOptions.floorTilt): a SUSTAINED perspective plane held for the
        // word's whole life (entrance/exit transforms chain after it via combineMotion) — not a
        // transient flip. Angle 38° / perspective 900px are FIXED feel constants of the look.
        ...combineMotion(
          style.templateOptions.floorTilt === true ? { transform: "perspective(900px) rotateX(38deg)", transformOrigin: "50% 100%" } : {},
          isRoll ? {} : entranceStyle(style, timeMs - word.startMs, canvas.fps, intensity, settled, size), exitStyle(style, page.endMs - timeMs, settled, size)),
      }}>
        {prevWord && roll ? (
          <div aria-hidden style={{ ...baseTextCss(style, sc, prevSize), position: "absolute", left: 0, right: 0, top: 0, textAlign: "center", transform: `translateY(${roll.outgoingPct.toFixed(2)}%)` }}>
            {prevDisplay}
          </div>
        ) : null}
        <div key={word.id} style={rollCss ?? css}>
          {fx.behind ? <span style={{ position: "absolute", pointerEvents: "none", ...fx.behind.css }} /> : null}
          {display}
          {fx.bar ? <span style={{ position: "absolute", pointerEvents: "none", ...fx.bar.css }} /> : null}
          {fx.ring ? (
            <svg aria-hidden viewBox="0 0 100 60" preserveAspectRatio="none" style={{ position: "absolute", left: "-9%", top: "-22%", width: "118%", height: "144%", overflow: "visible", pointerEvents: "none", transform: "rotate(-2deg)" }}>
              <ellipse cx="50" cy="30" rx="46" ry="24" fill="none" stroke={fx.ring.color} strokeWidth="3.2" strokeLinecap="round" pathLength={100} strokeDasharray={100} strokeDashoffset={((1 - fx.ring.progress) * 100).toFixed(2)} vectorEffect="non-scaling-stroke" transform="rotate(-1.5 50 30)" />
            </svg>
          ) : null}
        </div>
      </div>
    </div>
  );
};
