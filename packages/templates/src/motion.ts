import type React from "react";
import { Easing, interpolate, spring } from "remotion";
import type { CaptionStyleV2, Emotion } from "@capseasy/shared";
import { withAlpha } from "@motion-ai/caption-engine/core";

export const SPRINGS = {
  // damping 12.5 (was 14) + stiffness 250 (was 220): the settle overshoots ~8–10% and snaps back —
  // the spring "pop and settle" that makes spoken-word emphasis feel physical instead of flat
  snappy: { damping: 12.5, stiffness: 250, mass: 0.5 },
  bouncy: { damping: 9, stiffness: 180, mass: 0.5 },
  smooth: { damping: 26, stiffness: 120, mass: 0.6 },
  punch: { damping: 11, stiffness: 240, mass: 0.5 },
} as const;

/**
 * Ease-out with a settle overshoot (easeOutBack family): progress passes 1 by up to ~6% (s = 1.3)
 * around t ≈ 0.7, then decays back to exactly 1. Used for entrance transforms so elements land a
 * hair past their resting place and settle — the deceleration tail flat easings lack. Pure in t.
 */
export function overshootOut(t: number, s = 1.3): number {
  const u = Math.min(1, Math.max(0, t)) - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
}

/**
 * Anticipation for travel entrances (drop / slides): progress dips slightly NEGATIVE early (a small
 * counter-move away from the target, peaking ≈ −0.2% of travel around p = 0.1 with a gather through
 * p ≈ 0.2) before the sweep, and is exactly p again from p = 0.4 on, so the eased tail is untouched.
 */
export function withAnticipation(p: number): number {
  if (p <= 0 || p >= 0.4) return p;
  return p - 0.16 * Math.sin(Math.PI * (p / 0.4)) * (1 - p);
}

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

/** Deterministic integer hash -> [0,1). Never Math.random: the same frame must render the same in the
 *  picker, the studio preview and the Remotion export. */
export function seededUnit(seed: number): number {
  let h = Math.floor(Math.abs(seed)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Neon strike-on: opacity of one letter `localMs` into its strike window. The window is cut into ~26 ms
 * buckets; a seeded hash of the bucket decides whether the tube is lit in that bucket, giving 2–4 short
 * dark gaps before the letter holds steady at 1. Pure function of (localMs, seed, durationMs).
 */
export function flickerOpacity(localMs: number, seed = 0, durationMs = 300): number {
  if (localMs <= 0) return 0;
  if (localMs >= durationMs) return 1;
  const bucket = Math.floor(localMs / 26);
  return seededUnit(seed * 131 + bucket * 17 + 7) < 0.38 ? 0.08 : 1;
}

/** Breathing multiplier for a settled neon glow: ±15% on a ~1.5 s sine, frame-derived. */
export const glowBreath = (localMs: number): number => 1 + 0.15 * Math.sin(localMs / 240);

export const SCRAMBLE_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/";

/** One scrambled glyph for `ch` at a given frame; spaces and punctuation never scramble. */
export function scrambleGlyph(ch: string, frame: number, index: number): string {
  if (!/[a-zA-Z0-9]/.test(ch)) return ch;
  const upper = ch.toUpperCase();
  let pick = SCRAMBLE_GLYPHS[Math.floor(seededUnit(frame * 409 + index * 97 + 13) * SCRAMBLE_GLYPHS.length)]!;
  if (pick === upper) pick = SCRAMBLE_GLYPHS[(SCRAMBLE_GLYPHS.indexOf(pick) + 7) % SCRAMBLE_GLYPHS.length]!;
  return ch === ch.toLowerCase() && /[a-z]/.test(ch) ? pick.toLowerCase() : pick;
}

/**
 * Decode resolve: characters resolve in reveal order over `durationMs`; a character is real once
 * elapsed/duration passes its (index+1)/length threshold, otherwise it shows a seeded substitute
 * glyph for that frame. Deterministic in (text, elapsedMs, frame, durationMs).
 */
export function scrambledText(text: string, elapsedMs: number, frame: number, durationMs = 300): string {
  const chars = [...text];
  if (durationMs <= 0 || elapsedMs >= durationMs || chars.length === 0) return text;
  const r = Math.max(0, elapsedMs / durationMs);
  return chars.map((ch, i) => (r >= (i + 1) / chars.length ? ch : scrambleGlyph(ch, frame, i))).join("");
}

/** How long a word's decode resolve runs: ~300 ms, capped before its spoken midpoint. */
export const scrambleDurationMs = (word: { startMs: number; endMs: number }): number =>
  Math.min(300, Math.max(90, (word.endMs - word.startMs) * 0.5));

/**
 * Block reveal geometry: a solid block (16% of the box wide) travels left→right across the page while
 * the text clip follows its wake; in the final 60 ms the block collapses vertically (scaleY → 0).
 */
export function blockRevealAt(localMs: number, durationMs = 260) {
  const dur = Math.max(1, durationMs);
  const p = progress(localMs, dur, EASE_OUT_EXPO);
  const widthPct = 16;
  const collapseStart = dur - 60;
  const scaleY = localMs <= collapseStart ? 1 : 1 - progress(localMs - collapseStart, 60);
  return {
    p,
    clipRightPct: (1 - p) * 100,
    blockLeftPct: -widthPct + p * (100 + widthPct),
    blockWidthPct: widthPct,
    blockScaleY: Math.max(0, scaleY),
    done: localMs >= dur,
  };
}

/** Vertical word roll: outgoing word rolls up out of the box while the incoming rolls in from below. */
export function rollAt(localMs: number, durationMs = 180) {
  const p = progress(localMs, Math.max(1, durationMs), Easing.inOut(Easing.cubic));
  return { p, incomingPct: (1 - p) * 100, outgoingPct: p === 0 ? 0 : -p * 100, done: localMs >= durationMs };
}

/**
 * Pen-trail underline for write-on: the trail extends under a word at the pace its letters appear
 * (~32 ms/char), holds at full width, then fades over 300 ms. Pure function of time.
 */
export function writeOnTrail(elapsedMs: number, charCount: number, msPerChar = 32) {
  if (elapsedMs < 0) return { widthPct: 0, opacity: 0 };
  const typing = Math.max(1, charCount) * msPerChar;
  if (elapsedMs < typing) return { widthPct: (elapsedMs / typing) * 100, opacity: 1 };
  return { widthPct: 100, opacity: 1 - progress(elapsedMs - typing, 300) };
}

/**
 * Jelly settle: squash-and-stretch on a heavy bouncy spring — scaleY follows the spring while scaleX
 * moves opposite-sign (a shape distortion, unlike "elastic"'s uniform scale) — plus a skew that
 * decays exponentially to zero. Deterministic in (localMs, fps, intensity).
 */
export function jellyTransform(localMs: number, fps: number, intensity = 1) {
  const s = springMs(localMs, 0, fps, { damping: 8, stiffness: 180, mass: 0.9 });
  const scaleY = Math.max(0, s);
  const scaleX = Math.max(0.05, 1 - (s - 1) * 0.55);
  const skewDeg = intensity * 1.5 * Math.sin(localMs / 38) * Math.exp(-Math.max(0, localMs) / 170);
  return { scaleX, scaleY, skewDeg, spring: s };
}

/* --------------------------------------------------------------------------------------------------
 * Animation-expansion wave (2026-11-10): split-flap, curtain panels, shimmer sweep, weight wave.
 * All pure functions of time/index — deterministic, no Math.random / Date.now in any render path.
 * ----------------------------------------------------------------------------------------------- */

/** Ordered drum of the split-flap board: a cell walks FORWARD through this set (never random, never
 *  backwards) from the blank at index 0 until it lands on its target glyph. */
export const FLAP_CHARSET = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:;!?'’-+";

export interface FlapState {
  glyph: string;
  /** eased drum progress 0..1 (decelerating, like a real Solari drum) */
  p: number;
  /** how many drum steps have been taken from the blank */
  steps: number;
  /** total forward steps from the blank to the target */
  totalSteps: number;
  done: boolean;
  /** rotateX (deg) of the tile fold: a settle pulse in the final flip window, 0 at rest */
  foldDeg: number;
}

/**
 * Split-Flap Resolve state for one character `localMs` into its flip. Characters outside the charset
 * (and spaces) never flip. Case is preserved for letters (the drum itself is upper-case; a lower-case
 * target shows lower-case glyphs on the way). Pure in (ch, localMs, durationMs).
 */
export function flapAt(ch: string, localMs: number, durationMs = 300): FlapState {
  const target = ch.toUpperCase();
  const totalSteps = FLAP_CHARSET.indexOf(target);
  if (totalSteps <= 0) return { glyph: ch, p: 1, steps: Math.max(0, totalSteps), totalSteps: Math.max(0, totalSteps), done: true, foldDeg: 0 };
  const dur = Math.max(1, durationMs);
  if (localMs <= 0) return { glyph: " ", p: 0, steps: 0, totalSteps, done: false, foldDeg: 14 };
  if (localMs >= dur) return { glyph: ch, p: 1, steps: totalSteps, totalSteps, done: true, foldDeg: 0 };
  const raw = localMs / dur;
  const p = 1 - Math.pow(1 - raw, 3); // easeOutCubic: the drum decelerates onto its target
  const steps = Math.min(totalSteps, Math.floor(p * totalSteps));
  let glyph = FLAP_CHARSET[steps]!;
  if (/[a-z]/.test(ch)) glyph = glyph.toLowerCase();
  // the split-tile fold: a rotateX pulse over the last 120 ms as the final flap falls
  const foldWindow = Math.min(120, dur * 0.4);
  const foldT = (localMs - (dur - foldWindow)) / foldWindow;
  const foldDeg = foldT > 0 ? Math.sin(foldT * Math.PI) * 32 : (1 - p) * 14;
  return { glyph, p, steps, totalSteps, done: false, foldDeg };
}

/** A whole string flapping in: char i starts ~30 ms after char i-1 (the board's cascade). */
export function flapText(text: string, elapsedMs: number, durationMs = 300, staggerMs = 30): string {
  return [...text].map((ch, i) => flapAt(ch, elapsedMs - i * staggerMs, durationMs).glyph).join("");
}

/**
 * Curtain Panels: blockRevealAt generalised to N staggered panels. Panel i retracts upward over
 * `panelDur` starting at i*staggerMs; beneath them the text was already there. `wake` is the slowest
 * panel's progress (the card-level clip fallback for layouts that don't draw the panels themselves).
 */
export function panelsRevealAt(localMs: number, durationMs = 420, panels = 4) {
  const count = Math.max(1, Math.floor(panels));
  const staggerMs = 45;
  const panelDur = Math.max(1, durationMs - staggerMs * (count - 1));
  const list = Array.from({ length: count }, (_, i) => {
    const p = progress(localMs - i * staggerMs, panelDur, EASE_OUT_EXPO);
    return { index: i, p, topPct: -p * 100, done: p >= 1 };
  });
  return { panels: list, wake: Math.min(...list.map((x) => x.p)), done: localMs >= durationMs, staggerMs, panelDur };
}

/**
 * Shimmer Sweep: the position (% across the word) of a bright band travelling over the spoken word.
 * The sweep runs once over min(word duration, 500 ms), then rests OFF the word (pos > 100 + band), so
 * the word returns to its normal fill — unlike fill-sweep, whose colour fill stays. Band ≈18% wide.
 */
export function shimmerAt(localMs: number, wordDurationMs: number) {
  const sweepMs = Math.max(1, Math.min(Math.max(1, wordDurationMs), 500));
  const p = progress(localMs, sweepMs, Easing.out(Easing.cubic));
  return { posPct: -20 + 140 * p, bandPct: 18, p, done: localMs >= sweepMs };
}

/** The discrete weights our font loader actually serves (see fonts.ts: @remotion/google-fonts exposes
 *  one FontFace per weight key — there is NO variable-axis / fontVariationSettings path in that loader). */
export const LOADED_WEIGHT_STEPS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

/**
 * Weight Wave — HONEST capability note: continuous variable-font interpolation is NOT available through
 * our @remotion/google-fonts loading (loadFont takes discrete weight keys; fonts.ts loads each as its
 * own FontFace, and nothing exposes a wght axis to vary). So the swell ships STEPPED: the ideal
 * continuous weight (base + up to +300 on a sine over the word's spoken duration) is quantised to the
 * nearest loaded 100-step weight. On fonts serving the full 100–900 range (the wave looks use Outfit,
 * whose module meta lists every step 100–900) that is up to 3 visible steps up and back; on a font with
 * fewer loaded weights it degrades to fewer steps — never to a fake scale (that would duplicate "pop").
 */
export function weightWaveAt(localMs: number, wordDurationMs: number, baseWeight: number) {
  const dur = Math.max(1, wordDurationMs);
  const t = Math.min(1, Math.max(0, localMs / dur));
  const swell = Math.sin(Math.PI * t);
  const ideal = baseWeight + 300 * swell;
  const weight = LOADED_WEIGHT_STEPS.reduce((best, w) => (Math.abs(w - ideal) < Math.abs(best - ideal) ? w : best), LOADED_WEIGHT_STEPS[0]);
  return { swell, idealWeight: ideal, weight: Math.max(100, Math.min(900, weight)) };
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
    case "drop": {
      // anticipation: a small counter-move up before the drop sweeps down (transform only; opacity plain)
      const tp = withAnticipation(p);
      return { opacity: Math.min(1, p * 1.6), transform: `translateY(${(-(1 - tp) * 0.9 * k * u).toFixed(2)}px)` };
    }
    case "zoom": {
      // settle overshoot: the scale dips a hair below 1 as it lands, instead of stopping dead
      const s = overshootOut(p);
      return { opacity: p, transform: `scale(${(1 + (1 - s) * 0.55 * k).toFixed(4)})` };
    }
    case "slide-left": {
      const tp = withAnticipation(p);
      return { opacity: Math.min(1, p * 1.4), transform: `translateX(${(-(1 - tp) * 2 * k * u).toFixed(2)}px)` };
    }
    case "slide-right": {
      const tp = withAnticipation(p);
      return { opacity: Math.min(1, p * 1.4), transform: `translateX(${((1 - tp) * 2 * k * u).toFixed(2)}px)` };
    }
    case "blur-in": return { opacity: p, filter: `blur(${(q * 0.35 * k * u).toFixed(2)}px)`, transform: `scale(${(1 + q * 0.06 * k).toFixed(4)})` };
    case "flip": return { opacity: p, transform: `perspective(${(u * 10).toFixed(0)}px) rotateX(${(q * 80 * k).toFixed(2)}deg)` };
    case "mask-reveal": return { clipPath: `inset(-20% ${(q * 100).toFixed(2)}% -20% -5%)`, opacity: Math.min(1, p * 4) };
    case "pop": {
      // small to full size on a spring tuned for a clear overshoot (~1.12) and a fast settle
      const s = springMs(localMs, 0, fps, { damping: 11, stiffness: 280, mass: 0.5 });
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
    case "flicker": {
      // Neon strike: per letter (staggerUnit is "char", so each letter's local time is offset) the tube
      // flickers on via flickerOpacity, then holds with a breathing glow in the glow/active colour.
      const dur = Math.max(120, e.durationMs);
      const op = flickerOpacity(localMs, 0, dur);
      const glowColor = style.glow.enabled ? style.glow.color : style.active.color;
      const breath = localMs >= dur ? glowBreath(localMs) : 1;
      const r = Math.max(4, style.glow.radius || 12) * breath * (u / 60) * Math.max(0.4, k);
      return { opacity: op, filter: op > 0 ? `drop-shadow(0 0 ${r.toFixed(2)}px ${glowColor})` : undefined };
    }
    case "scramble": {
      // the glyph substitution itself lives in the layouts (WordSpan / Word); here the word simply
      // appears (no transform) so the resolving glyphs are the whole motion
      return { opacity: localMs < 0 ? 0 : 1 };
    }
    case "block-reveal": {
      // mask-reveal composition: the text clip follows the travelling block's wake (blockRevealAt);
      // the block itself is drawn by the layouts from the same pure function, so they never desync
      const b = blockRevealAt(localMs, e.durationMs);
      return { clipPath: `inset(-20% ${b.clipRightPct.toFixed(2)}% -20% -5%)`, opacity: localMs < 0 ? 0 : Math.min(1, b.p * 4) };
    }
    case "roll": {
      // incoming word rolls up a full word-height into its clipped box (the one-word layout also
      // rolls the outgoing word out — see Word.tsx, same rollAt function)
      const r = rollAt(localMs, e.durationMs);
      return { opacity: localMs < 0 ? 0 : Math.min(1, r.p * 3 + 0.2), transform: `translateY(${r.incomingPct.toFixed(2)}%)` };
    }
    case "write-on": {
      // per letter (staggerUnit is "char"): each letter fades in rising 0.12em with a 2° rotate settle,
      // reading as pen strokes landing in sequence; the pen-trail underline lives in WordSpan
      const wp = progress(localMs, Math.max(60, e.durationMs * 0.6), Easing.out(Easing.cubic));
      const wq = 1 - wp;
      return { opacity: localMs < 0 ? 0 : wp, transform: `translateY(${(wq * 0.12 * u).toFixed(2)}px) rotate(${(-wq * 2 * k).toFixed(2)}deg)` };
    }
    case "jelly": {
      const j = jellyTransform(localMs, fps, k);
      return { opacity: localMs <= 0 ? 0 : Math.min(1, 0.25 + localMs / 80), transform: `scale(${j.scaleX.toFixed(4)}, ${j.scaleY.toFixed(4)}) skewX(${j.skewDeg.toFixed(3)}deg)` };
    }
    case "split-flap": {
      // per char (staggerUnit is "char"): each tile folds on its drum's final flip (flapAt) while the
      // glyph itself cycles in WordSpan / Word. At card level (layouts without per-char spans) the
      // whole card folds gently instead. The drum curve is FIXED (decelerating) — the Easing control
      // is hidden for this entrance in controls.ts, like the letter animators.
      const f = flapAt("A", localMs, Math.max(120, e.durationMs));
      return { opacity: localMs < 0 ? 0 : 1, transform: `perspective(${(u * 10).toFixed(0)}px) rotateX(${f.foldDeg.toFixed(2)}deg)` };
    }
    case "panels-reveal": {
      // the 4 retracting panels are drawn by the layouts from panelsRevealAt (same fn, no desync);
      // here the card's clip follows the slowest panel's wake so layouts without panel drawing
      // still reveal in step
      const pr = panelsRevealAt(localMs, e.durationMs);
      return { opacity: localMs < 0 ? 0 : Math.min(1, pr.wake * 4 + 0.15), clipPath: `inset(-20% ${((1 - pr.wake) * 100).toFixed(2)}% -20% -5%)` };
    }
    case "wave": return { opacity: p, transform: `translateY(${((1 - overshootOut(p)) * 0.45 * k * u).toFixed(2)}px)` };
    case "rise":
    // settle overshoot on the way up: the card lands a hair past its rest position and eases back
    default: return { opacity: p, transform: `translateY(${((1 - overshootOut(p)) * 0.7 * k * u).toFixed(2)}px)` };
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

/** Per-item delay for staggered entrances: words ~56 ms apart, letters ~22 ms apart (scaled by entrance
 *  speed). Tightened from 70/28 (2026-11-10): word-by-word builds read snappier when the cascade
 *  outruns speech slightly instead of trailing it. */
export function staggerDelayMs(style: CaptionStyleV2, index: number, unit: "word" | "char"): number {
  const base = unit === "word" ? 56 : 22;
  return index * base * Math.max(0.4, style.entrance.durationMs / 220);
}

/** Letters must be drawn one by one: a letter entrance, a letter exit, or a "wave"/letter stagger. */
export const splitsLetters = (style: CaptionStyleV2) => staggerUnit(style) === "char" || isLetterAnimator(style.exit.type);

/** Which unit a layout should stagger by ("wave" always animates letter by letter). */
export function staggerUnit(style: CaptionStyleV2): "none" | "word" | "char" {
  if (style.entrance.type === "none") return "none";
  // per-letter entrances: wave, typewriter, neon flicker, decode scramble, pen write-on, split-flap drum, letter animators
  if (style.entrance.type === "wave" || style.entrance.type === "typewriter" || style.entrance.type === "flicker" || style.entrance.type === "scramble" || style.entrance.type === "write-on" || style.entrance.type === "split-flap" || isLetterAnimator(style.entrance.type)) return "char";
  // word roll swaps word by word; block reveal, curtain panels and jelly are whole-page compositions
  if (style.entrance.type === "roll") return "word";
  if (style.entrance.type === "block-reveal" || style.entrance.type === "panels-reveal" || style.entrance.type === "jelly") return "none";
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
      // the spoken word's pop rides the punchier spring: fast attack, ~10% overshoot, quick settle
      const pp = settled ? 1 : springMs(timeMs, word.startMs, fps, SPRINGS.punch);
      const k = 1 + (a.scale - 1) * pp * intensity;
      return { css: { color, WebkitTextFillColor: color, backgroundImage: "none", transform: `scale(${k})` }, grow: k };
    }
    case "scale-up": {
      const pp = settled ? 1 : springMs(timeMs, word.startMs, fps, SPRINGS.punch);
      const k = 1 + (a.scale - 1) * pp * intensity;
      return { css: { transform: `scale(${k})` }, grow: k };
    }
    case "bounce": return { css: { color, WebkitTextFillColor: color, transform: `translateY(${-Math.sin(Math.PI * Math.min(1, ((timeMs - word.startMs) / 260))) * 14 * sc * intensity}px)` } };
    case "shake": {
      const k = settled ? 0 : Math.sin(((timeMs - word.startMs) / 1000) * 60) * 3 * sc * intensity;
      return { css: { color, WebkitTextFillColor: color, transform: `translateX(${k}px)` } };
    }
    case "glow": return { css: { color, WebkitTextFillColor: color, textShadow: `0 0 ${(12 + sp * 10) * sc}px ${color}, 0 0 ${(24 + sp * 16) * sc}px ${withAlpha(color, 0.6)}` } };
    case "underline": {
      const w = settled ? 100 : progress(timeMs - word.startMs, 160) * 100;
      return { css: { color, WebkitTextFillColor: color }, bar: { css: { left: 0, bottom: "-0.08em", height: "0.09em", width: `${w}%`, backgroundColor: color, borderRadius: 4 } } };
    }
    case "marker": {
      const w = settled ? 100 : progress(timeMs - word.startMs, 170) * 100;
      return { css: {}, behind: { css: { left: "-0.12em", top: "12%", height: "78%", width: `calc(${w}% + 0.24em)`, backgroundColor: withAlpha(color, 0.85), borderRadius: "0.12em", zIndex: -1 } } };
    }
    // active.color is the text ON the box
    case "box": return { grow: 1 + (a.scale - 1) * sp, css: { color, WebkitTextFillColor: color, backgroundImage: "none", transform: `scale(${1 + (a.scale - 1) * sp})` }, behind: { css: { left: "-0.22em", right: "-0.22em", top: "6%", bottom: "2%", backgroundColor: a.boxColor ?? color, borderRadius: a.boxRadius * sc, zIndex: -1 } } };
    case "fill-sweep": {
      // eased sweep (was linear in the spoken fraction): fast fill that decelerates into the word's
      // end, so karaoke reads as a brush stroke settling rather than a progress bar
      const p = settled ? 100 : progress(timeMs - word.startMs, dur) * 100;
      return { css: { backgroundImage: `linear-gradient(90deg, ${color} ${p}%, currentColor ${p}%)`, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" } };
    }
    case "outline-fill": return { css: { color, WebkitTextFillColor: color } };
    case "box-sweep": {
      // a full-height highlight box whose width sweeps across the word as it is spoken (the "box" effect
      // jumps word to word at full width; this one grows). Text takes active.color, the box boxColor.
      // The sweep is eased (expo) and completes at ~85% of the word, so the box lands and settles
      // before the next word starts instead of tracking speech linearly like a progress bar.
      const w = settled ? 100 : progress(timeMs - word.startMs, dur * 0.85) * 100;
      return { css: { color, WebkitTextFillColor: color, backgroundImage: "none" }, behind: { css: { left: "-0.18em", top: "4%", height: "92%", width: `calc(${w.toFixed(1)}% + 0.36em)`, backgroundColor: a.boxColor ?? color, borderRadius: a.boxRadius * sc, zIndex: -1 } } };
    }
    case "shimmer": {
      // a bright band in the highlight colour (active.color — MUST-WIRE) sweeps across the spoken word
      // over its normal fill, then leaves it at rest. Reuses fill-sweep's background-clip:text machinery,
      // driven by shimmerAt instead of speech progress. For a gradient fill the band travels over the
      // gradient's own end stops (first -> last), so the Gradient controls still own the base.
      const sh = settled ? { posPct: 120, bandPct: 18 } : shimmerAt(timeMs - word.startMs, dur);
      const base = style.fill.type === "solid" ? style.fill.color : style.fill.stops[0]!.color;
      const baseEnd = style.fill.type === "solid" ? style.fill.color : style.fill.stops[style.fill.stops.length - 1]!.color;
      const lo = Math.max(0, sh.posPct - sh.bandPct);
      const hi = Math.min(100, sh.posPct + sh.bandPct);
      return {
        css: {
          backgroundImage: `linear-gradient(100deg, ${base} 0%, ${base} ${lo.toFixed(1)}%, ${color} ${sh.posPct.toFixed(1)}%, ${baseEnd} ${hi.toFixed(1)}%, ${baseEnd} 100%)`,
          WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent",
        },
      };
    }
    case "weight-wave": {
      // the spoken word literally gets bolder as it is said: weight swells base -> base+300 -> base on a
      // sine over the word's duration, STEPPED to the loaded discrete weights (see weightWaveAt's note:
      // no variable axis exists in our font loader, so continuous interpolation would be a lie)
      const ww = settled ? { weight: style.fontWeight } : weightWaveAt(timeMs - word.startMs, dur, style.fontWeight);
      return { css: { color, WebkitTextFillColor: color, backgroundImage: "none", fontWeight: ww.weight } };
    }
    case "scribble-ring": {
      // the ring itself is drawn by the layout (SVG stroke-dashoffset); here we only carry its progress.
      // Eased draw (was linear): the stroke races around the first half of the ellipse and decelerates
      // into the close, like a hand finishing a circle; completes within ~300 ms.
      const rp = settled ? 1 : progress(timeMs - word.startMs, Math.min(dur, 300), Easing.out(Easing.cubic));
      return { css: { color, WebkitTextFillColor: color, backgroundImage: "none" }, ring: { progress: rp, color } };
    }
    default: return { css: {} };
  }
}
