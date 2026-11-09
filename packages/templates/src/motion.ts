import type React from "react";
import { Easing, interpolate, spring } from "remotion";
import type { CaptionStyleV2, Emotion } from "@capseasy/shared";
import { withAlpha } from "@motion-ai/caption-engine/core";

export const SPRINGS = {
  snappy: { damping: 14, stiffness: 220, mass: 0.5 },
  bouncy: { damping: 9, stiffness: 180, mass: 0.5 },
  smooth: { damping: 26, stiffness: 120, mass: 0.6 },
  punch: { damping: 11, stiffness: 240, mass: 0.5 },
} as const;

const EASE_OUT_EXPO = Easing.bezier(0.16, 1, 0.3, 1);

export function easeFn(id: CaptionStyleV2["entrance"]["easing"]): (t: number) => number {
  switch (id) {
    case "linear": return (t) => t;
    case "outQuad": return Easing.out(Easing.quad);
    case "outCubic": return Easing.out(Easing.cubic);
    case "inOutCubic": return Easing.inOut(Easing.cubic);
    case "spring":
    case "outExpo":
    default: return EASE_OUT_EXPO;
  }
}

/** One-shot spring keyed to an absolute start time in ms. fps comes from the composition, never a constant. */
export function springMs(timeMs: number, startMs: number, fps: number, cfg: { damping: number; stiffness: number; mass?: number } = SPRINGS.snappy): number {
  const frame = Math.max(0, ((timeMs - startMs) / 1000) * fps);
  return spring({ frame, fps, config: cfg });
}

export function progress(localMs: number, durationMs: number, easing: (t: number) => number = EASE_OUT_EXPO): number {
  if (durationMs <= 0) return 1;
  return interpolate(localMs, [0, durationMs], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });
}

/** Emotion changes how strongly things move; templates may layer more on top (P8). */
const EMOTION_INTENSITY: Record<Emotion, number> = {
  neutral: 1, excited: 1.3, funny: 1.2, serious: 0.7, sad: 0.6, angry: 1.4, surprised: 1.35, question: 1, hype: 1.5, calm: 0.6,
};

export function effectiveIntensity(style: CaptionStyleV2, emotion: Emotion): number {
  const mult = 1 + (EMOTION_INTENSITY[emotion] - 1) * style.emotionReactivity;
  return style.motionIntensity * mult;
}

/**
 * Merge motion styles (container centring, entrance, exit, effects) without one wiping out another: transforms are
 * chained, opacities multiplied, filters chained. Spreading two styles that both set `transform` used to drop the
 * container's centring, so captions jumped sideways the moment an exit started.
 */
export function combineMotion(...xs: React.CSSProperties[]): React.CSSProperties {
  const out: Record<string, unknown> = {};
  for (const x of xs) {
    for (const [k, v] of Object.entries(x)) {
      if (v === undefined) continue;
      if (k === "transform" && out.transform) out.transform = `${out.transform as string} ${v as string}`;
      else if (k === "opacity" && out.opacity !== undefined) out.opacity = Number(out.opacity) * Number(v);
      else if (k === "filter" && out.filter) out.filter = `${out.filter as string} ${v as string}`;
      else out[k] = v;
    }
  }
  return out as React.CSSProperties;
}

/** default text size (px) for distance-based motion when a caller can't tell */
const DEFAULT_SIZE_PX = 60;

/**
 * Whole-card entrance. `localMs` = ms since the page started. Distances are in units of the text size (`sizePx`), so a
 * rise or slide reads the same on a 720p clip and a 4K one, and each entrance is clearly its own motion.
 */
export function entranceStyle(style: CaptionStyleV2, localMs: number, fps: number, intensity: number, settled?: boolean, sizePx = DEFAULT_SIZE_PX): React.CSSProperties {
  const e = style.entrance;
  // letter animators move each letter themselves (WordSpan); the card as a whole stays put
  if (settled || e.type === "none" || isLetterAnimator(e.type)) return {};
  const p = progress(localMs, e.durationMs, easeFn(e.easing));
  const q = 1 - p;
  const k = intensity;
  const u = sizePx;
  switch (e.type) {
    case "fade": return { opacity: p };
    case "drop": return { opacity: Math.min(1, p * 1.6), transform: `translateY(${(-q * 0.9 * k * u).toFixed(2)}px)` };
    case "zoom": return { opacity: p, transform: `scale(${(1 + q * 0.55 * k).toFixed(4)})` };
    case "slide-left": return { opacity: Math.min(1, p * 1.4), transform: `translateX(${(-q * 2 * k * u).toFixed(2)}px)` };
    case "slide-right": return { opacity: Math.min(1, p * 1.4), transform: `translateX(${(q * 2 * k * u).toFixed(2)}px)` };
    case "blur-in": return { opacity: p, filter: `blur(${(q * 0.35 * k * u).toFixed(2)}px)`, transform: `scale(${(1 + q * 0.06 * k).toFixed(4)})` };
    case "flip": return { opacity: p, transform: `perspective(${(u * 10).toFixed(0)}px) rotateX(${(q * 80 * k).toFixed(2)}deg)` };
    case "mask-reveal": return { clipPath: `inset(-20% ${(q * 100).toFixed(2)}% -20% -5%)`, opacity: Math.min(1, p * 4) };
    case "pop": {
      // small to full size on a snappy spring with a little overshoot
      const s = springMs(localMs, 0, fps, { damping: 12, stiffness: 260, mass: 0.5 });
      return { opacity: Math.min(1, p * 2.5), transform: `scale(${(1 - 0.45 * k * (1 - s)).toFixed(4)})` };
    }
    case "elastic": {
      // from nothing, wobbling around full size
      const s = springMs(localMs, 0, fps, { damping: 7, stiffness: 170, mass: 0.6 });
      return { opacity: Math.min(1, p * 3), transform: `scale(${Math.max(0, s).toFixed(4)})` };
    }
    case "glitch": {
      // RGB-split jitter that settles (deterministic: derived from the frame number, never Math.random)
      const f = Math.floor((localMs / 1000) * fps);
      const j = q * 0.14 * k * u;
      const dx = ((f * 7919) % 5) - 2;
      return { opacity: Math.min(1, p * 3), transform: `translateX(${(dx * j * 0.6).toFixed(2)}px)`, filter: j > 0.4 ? `drop-shadow(${j.toFixed(2)}px 0 rgba(255,0,80,0.85)) drop-shadow(${(-j).toFixed(2)}px 0 rgba(0,240,255,0.85))` : undefined };
    }
    case "typewriter": {
      // Stepped reveal: the card is uncovered in discrete type-steps (like keys striking), not a smooth
      // wipe. Per-character staggering + the blinking caret live in WordSpan (staggerUnit is "char").
      const steps = 10;
      const stepped = p >= 1 ? 1 : Math.floor(p * steps) / steps;
      return { opacity: stepped <= 0 ? 0 : 1, clipPath: `inset(-20% ${((1 - stepped) * 100).toFixed(1)}% -20% -5%)` };
    }
    case "glitch-slice": {
      // Slice-and-settle: horizontal bands of the card jump sideways by frame-quantised amounts with an
      // RGB split, then snap clean. Distinct from "glitch" (whole-card jitter): here a clip window slices
      // the block and the offset is larger and banded. Deterministic from the frame number.
      const f = Math.floor((localMs / 1000) * fps);
      const j = q * 0.3 * k * u;
      const dx = (((f * 31) % 7) - 3) * j;
      const sliceTop = q > 0.04 ? ((f * 17) % 26) : 0;
      const sliceBottom = q > 0.04 ? Math.max(0, 22 - sliceTop * 0.5) : 0;
      return {
        opacity: Math.min(1, p * 3),
        transform: `translateX(${dx.toFixed(2)}px)`,
        clipPath: q > 0.04 ? `inset(${sliceTop.toFixed(1)}% -5% ${sliceBottom.toFixed(1)}% -5%)` : undefined,
        filter: j > 0.4 ? `drop-shadow(${j.toFixed(2)}px 0 rgba(255,0,80,0.9)) drop-shadow(${(-j).toFixed(2)}px 0 rgba(0,240,255,0.9))` : undefined,
      };
    }
    case "wave": return { opacity: p, transform: `translateY(${(q * 0.45 * k * u).toFixed(2)}px)` };
    case "rise":
    default: return { opacity: p, transform: `translateY(${(q * 0.7 * k * u).toFixed(2)}px)` };
  }
}

/**
 * Letter animators, transcribed from five After Effects text-animator presets. In AE each one is a single animator
 * (Scale 0%, Rotation 30°, Tracking 200 "before & after") whose amount per character comes from an Expression
 * Selector; the amount is 100% before a letter starts, 0% when it has landed and goes negative on the overshoot.
 * The expressions are reproduced line for line below. Their timing is in AE frames, pinned to 30 fps so a look
 * moves the same in every project. `index` counts from 1 and includes the space between words, like textIndex.
 */
export const LETTER_ANIMATORS = ["letter-spin", "letter-elastic", "letter-snap", "letter-burst", "letter-stretch"] as const;
export type LetterAnimator = (typeof LETTER_ANIMATORS)[number];
export const isLetterAnimator = (t: string): t is LetterAnimator => (LETTER_ANIMATORS as readonly string[]).includes(t);

const AE_FRAME = 1 / 30;
/** After Effects' ease(): zero velocity at both ends */
const aeEase = (t: number, t0: number, t1: number, v0: number, v1: number) => {
  const u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  return v0 + (v1 - v0) * u * u * (3 - 2 * u);
};

/** AE "decaying bounce" (presets 1 and Up): linear 100 -> 0 over 0.15 s, then a 2 Hz bounce damped by 9 */
function bounceAmount(t: number): number {
  const duration = 0.15, frequency = 2, damping = 9;
  if (t < duration) return t <= 0 ? 100 : 100 * (1 - t / duration);
  const delta = -100 / duration;
  const omega = frequency * Math.PI * 2;
  return (delta * Math.sin((t - duration) * omega) * Math.exp(-damping * (t - duration))) / omega;
}

/** Expression-selector amount in % as [x, y] (rotation and tracking follow x, like AE's 1-D properties). */
export function letterAmount(type: LetterAnimator, tSec: number, index: number, total: number): [number, number] {
  let a: number;
  switch (type) {
    case "letter-spin":
    case "letter-stretch": a = bounceAmount(tSec - index * AE_FRAME); break;
    case "letter-elastic": {
      const t = tSec - index * AE_FRAME * 2;
      a = t < 0 ? 100 : (100 * Math.cos(4 * t * 2 * Math.PI)) / Math.exp(10 * t);
      break;
    }
    case "letter-snap": {
      const duration = 0.25;
      const t = tSec - (index - 1) * 1.5 * AE_FRAME;
      if (t < 0) a = 100;
      else if (t < duration) a = 100 * (1 - (1 - Math.pow(1 - t / duration, 4)));
      else a = Math.exp(-(t - duration) * 14) * Math.sin((t - duration) * 22) * 6;
      break;
    }
    case "letter-burst": {
      const t = tSec - Math.abs(index - (total + 1) / 2) * 0.05;
      a = t < 0 ? 100 : aeEase(t, 0, 0.4, 100, 0) - Math.sin(t * 18) * 18 * Math.exp(-t * 7);
      break;
    }
  }
  a = Math.max(-100, Math.min(100, a));
  return type === "letter-stretch" ? [0, a] : [a, a];
}

/**
 * CSS for one letter. Scale and rotation pivot on the letter's baseline centre (AE's per-character anchor);
 * tracking is split before and after the letter, so the centred line spreads out and closes up like in AE.
 * `baselineEm` = distance from the top of the letter's line box to its baseline.
 */
/** em of extra space a fully-out letter gets on EACH side. AE tracking 200 "before & after" spreads letters far more
 *  than 0.2 em: this value was fitted frame by frame to After Effects renders of the presets (2026-10-05). */
export const LETTER_TRACK_EM = 0.58;

export function letterAnimatorCss(type: LetterAnimator, tSec: number, index: number, total: number, intensity: number, baselineEm: number, trackEm = LETTER_TRACK_EM): React.CSSProperties {
  return letterCss(letterAmount(type, tSec, index, total), intensity, baselineEm, trackEm);
}

/** CSS for a letter at a given animator amount (% as [x, y]); amounts below 0.05% count as at rest. */
export function letterCss([ax, ay]: [number, number], intensity: number, baselineEm: number, trackEm = LETTER_TRACK_EM): React.CSSProperties {
  if (Math.abs(ax) < 0.05 && Math.abs(ay) < 0.05) return {};
  const track = (trackEm * ax * intensity) / 100;
  return {
    transform: `rotate(${(30 * ax * intensity) / 100}deg) scale(${1 - ax / 100}, ${1 - ay / 100})`,
    transformOrigin: `50% ${baselineEm.toFixed(3)}em`,
    marginLeft: `${track.toFixed(4)}em`,
    marginRight: `${track.toFixed(4)}em`,
  };
}

/**
 * Playback speed of a letter animator. The presets' own timing (AE, 30 fps) is slow for captions, so the default entrance
 * duration (300 ms) plays them 2.2x faster; the Entrance speed slider scales from there. LETTER_AE_MS = AE's real speed.
 */
export const LETTER_AE_MS = 660;
export const LETTER_DEFAULT_MS = 300;
export const letterSpeed = (durationMs: number) => LETTER_AE_MS / Math.max(80, durationMs || LETTER_DEFAULT_MS);

/** Tracking a space between words gets from the same animator (AE counts the space as a character). */
export function letterSpaceTrackEm(type: LetterAnimator, tSec: number, index: number, total: number, intensity: number, trackEm = LETTER_TRACK_EM): number {
  return letterTrackEm(letterAmount(type, tSec, index, total)[0], intensity, trackEm);
}
export const letterTrackEm = (ax: number, intensity: number, trackEm = LETTER_TRACK_EM) => (2 * trackEm * ax * intensity) / 100;

/**
 * Letter exits: the same AE animators played backwards from the card's end, so the letters that landed last leave
 * first and the card is empty exactly when it ends. `msUntilEnd` = time left on the card.
 */
export function letterExitAmount(type: LetterAnimator, msUntilEnd: number, durationMs: number, index: number, total: number): [number, number] {
  if (msUntilEnd <= 0) return type === "letter-stretch" ? [0, 100] : [100, 100];
  return letterAmount(type, (msUntilEnd / 1000) * letterSpeed(durationMs), index, total);
}

/** Amount for one letter from the entrance and the exit together (each is ~0 while the other plays); null = neither. */
export function letterAmounts(style: CaptionStyleV2, entranceSec: number | null, msUntilEnd: number | null, index: number, total: number): [number, number] | null {
  const a = entranceSec !== null && isLetterAnimator(style.entrance.type) ? letterAmount(style.entrance.type, entranceSec, index, total) : null;
  const b = msUntilEnd !== null && isLetterAnimator(style.exit.type) ? letterExitAmount(style.exit.type, msUntilEnd, style.exit.durationMs, index, total) : null;
  if (!a && !b) return null;
  const x = (a?.[0] ?? 0) + (b?.[0] ?? 0);
  const y = (a?.[1] ?? 0) + (b?.[1] ?? 0);
  return [Math.max(-100, Math.min(100, x)), Math.max(-100, Math.min(100, y))];
}

/** Per-item delay for staggered entrances: words ~70 ms apart, letters ~28 ms apart (scaled by entrance speed). */
export function staggerDelayMs(style: CaptionStyleV2, index: number, unit: "word" | "char"): number {
  const base = unit === "word" ? 70 : 28;
  return index * base * Math.max(0.4, style.entrance.durationMs / 220);
}

/** Letters must be drawn one by one: a letter entrance, a letter exit, or a "wave"/letter stagger. */
export const splitsLetters = (style: CaptionStyleV2) => staggerUnit(style) === "char" || isLetterAnimator(style.exit.type);

/** Which unit a layout should stagger by ("wave" always animates letter by letter). */
export function staggerUnit(style: CaptionStyleV2): "none" | "word" | "char" {
  if (style.entrance.type === "none") return "none";
  if (style.entrance.type === "wave" || style.entrance.type === "typewriter" || isLetterAnimator(style.entrance.type)) return "char";
  return style.entrance.stagger;
}

/** Whole-card exit. Letter exits are drawn per letter (WordSpan), so the card itself stays put for them. */
export function exitStyle(style: CaptionStyleV2, msUntilEnd: number, settled?: boolean, sizePx = DEFAULT_SIZE_PX): React.CSSProperties {
  const x = style.exit;
  if (settled || x.type === "none" || isLetterAnimator(x.type) || x.durationMs <= 0 || msUntilEnd >= x.durationMs) return {};
  const p = progress(x.durationMs - Math.max(0, msUntilEnd), x.durationMs, Easing.in(Easing.cubic)); // 0 -> 1 as the card ends
  const u = sizePx;
  switch (x.type) {
    case "fade": return { opacity: 1 - p };
    case "fall": return { opacity: 1 - p, transform: `translateY(${(p * 0.9 * u).toFixed(2)}px) rotate(${(p * 4).toFixed(2)}deg)` };
    case "zoom-out": return { opacity: 1 - p, transform: `scale(${(1 - p * 0.45).toFixed(4)})` };
    case "blur-out": return { opacity: 1 - p, filter: `blur(${(p * 0.35 * u).toFixed(2)}px)`, transform: `scale(${(1 + p * 0.06).toFixed(4)})` };
    case "slide-up": return { opacity: 1 - p, transform: `translateY(${(-p * 0.9 * u).toFixed(2)}px)` };
    default: return {};
  }
}

/** When a word appears on its card: derivePages schedules it a little ahead of speech (overlapping its neighbours). */
export const showAt = (w: { startMs: number; revealMs?: number }) => w.revealMs ?? w.startMs;

/** Progressive per-word reveal used by "progressive" reveal mode (legacy behaviour). */
export const wordReveal = (timeMs: number, startMs: number) => progress(timeMs - startMs, 130);

export interface ActiveResult {
  css: React.CSSProperties;
  /** absolutely-positioned decoration rendered behind the word */
  behind?: { css: React.CSSProperties };
  /** thin bar under the word (underline/marker) */
  bar?: { css: React.CSSProperties };
  /** hand-drawn ring around the word (scribble-ring): layouts render it as an SVG ellipse that draws
   *  itself on — `progress` is 0..1 of the stroke drawn, so preview and export rasterise identically */
  ring?: { progress: number; color: string };
  /** how much the effect enlarges the word (1 = not at all); layouts push neighbours apart by this */
  grow?: number;
}

/** The word currently being spoken. Pure function of time. */
export function activeEffect(
  style: CaptionStyleV2, word: { startMs: number; endMs: number }, timeMs: number, fps: number, sc: number, intensity: number, settled?: boolean,
): ActiveResult {
  const a = style.active;
  const color = a.color;
  const sp = settled ? 1 : springMs(timeMs, word.startMs, fps, SPRINGS.snappy);
  const dur = Math.max(1, word.endMs - word.startMs);
  const t = Math.min(1, Math.max(0, (timeMs - word.startMs) / dur));
  switch (a.effect) {
    case "none": return { css: {} };
    case "color": return { css: { color, WebkitTextFillColor: color, backgroundImage: "none" } };
    case "pop": {
      const k = 1 + (a.scale - 1) * sp * intensity;
      return { css: { color, WebkitTextFillColor: color, backgroundImage: "none", transform: `scale(${k})` }, grow: k };
    }
    case "scale-up": {
      const k = 1 + (a.scale - 1) * sp * intensity;
      return { css: { transform: `scale(${k})` }, grow: k };
    }
    case "bounce": return { css: { color, WebkitTextFillColor: color, transform: `translateY(${-Math.sin(Math.PI * Math.min(1, ((timeMs - word.startMs) / 260))) * 14 * sc * intensity}px)` } };
    case "shake": {
      const k = settled ? 0 : Math.sin(((timeMs - word.startMs) / 1000) * 60) * 3 * sc * intensity;
      return { css: { color, WebkitTextFillColor: color, transform: `translateX(${k}px)` } };
    }
    case "glow": return { css: { color, WebkitTextFillColor: color, textShadow: `0 0 ${(12 + sp * 10) * sc}px ${color}, 0 0 ${(24 + sp * 16) * sc}px ${withAlpha(color, 0.6)}` } };
    case "underline": {
      const w = settled ? 100 : progress(timeMs - word.startMs, 180) * 100;
      return { css: { color, WebkitTextFillColor: color }, bar: { css: { left: 0, bottom: "-0.08em", height: "0.09em", width: `${w}%`, backgroundColor: color, borderRadius: 4 } } };
    }
    case "marker": {
      const w = settled ? 100 : progress(timeMs - word.startMs, 200) * 100;
      return { css: {}, behind: { css: { left: "-0.12em", top: "12%", height: "78%", width: `calc(${w}% + 0.24em)`, backgroundColor: withAlpha(color, 0.85), borderRadius: "0.12em", zIndex: -1 } } };
    }
    // active.color is the text ON the box
    case "box": return { grow: 1 + (a.scale - 1) * sp, css: { color, WebkitTextFillColor: color, backgroundImage: "none", transform: `scale(${1 + (a.scale - 1) * sp})` }, behind: { css: { left: "-0.22em", right: "-0.22em", top: "6%", bottom: "2%", backgroundColor: a.boxColor ?? color, borderRadius: a.boxRadius * sc, zIndex: -1 } } };
    case "fill-sweep": {
      const p = settled ? 100 : t * 100;
      return { css: { backgroundImage: `linear-gradient(90deg, ${color} ${p}%, currentColor ${p}%)`, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" } };
    }
    case "outline-fill": return { css: { color, WebkitTextFillColor: color } };
    case "box-sweep": {
      // a full-height highlight box whose width sweeps across the word as it is spoken (the "box" effect
      // jumps word to word at full width; this one grows). Text takes active.color, the box boxColor.
      const w = settled ? 100 : t * 100;
      return { css: { color, WebkitTextFillColor: color, backgroundImage: "none" }, behind: { css: { left: "-0.18em", top: "4%", height: "92%", width: `calc(${w.toFixed(1)}% + 0.36em)`, backgroundColor: a.boxColor ?? color, borderRadius: a.boxRadius * sc, zIndex: -1 } } };
    }
    case "scribble-ring": {
      // the ring itself is drawn by the layout (SVG stroke-dashoffset); here we only carry its progress
      const rp = settled ? 1 : Math.min(1, Math.max(0, (timeMs - word.startMs) / Math.min(dur, 320)));
      return { css: { color, WebkitTextFillColor: color, backgroundImage: "none" }, ring: { progress: rp, color } };
    }
    default: return { css: {} };
  }
}
