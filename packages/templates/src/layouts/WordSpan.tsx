import React from "react";
import type { CaptionStyleV2, Word } from "@capseasy/shared";
import { activeEffect, combineMotion, entranceStyle, flapAt, isLetterAnimator, letterAmounts, letterCss, letterSpeed, letterTrackEm, progress, scrambleDurationMs, scrambledText, showAt, splitsLetters, staggerDelayMs, staggerUnit, wordReveal, writeOnTrail } from "../motion";
import { withAlpha } from "@motion-ai/caption-engine/core";
import type { Canvas } from "../types";
import { scaleOf, wordGapCss } from "../text";

export interface WordSpanProps {
  word: Word;
  display: string;
  timeMs: number;
  style: CaptionStyleV2;
  canvas: Canvas;
  intensity: number;
  /** typography css computed by the layout (font, size, fill, stroke, shadow) */
  baseCss: React.CSSProperties;
  /** not the last word on its line: keep a gap after it (see wordGapCss) */
  trailingSpace: boolean;
  settled?: boolean;
  /** override style.active.effect (null = never animate the active word) */
  effect?: CaptionStyleV2["active"]["effect"] | null;
  /** "progressive" (legacy): words appear when spoken. "all": every word is visible, inactive dimmed. */
  reveal?: "progressive" | "all";
  /** karaoke: colour of words that have already been spoken */
  pastColor?: string;
  /** staggered card entrance: this word (or each of its letters) enters on its own, offset by its position */
  /** (unit "none" = the card enters as one, but its letters are still drawn one by one for a letter exit) */
  stagger?: { unit: "none" | "word" | "char"; index: number; charOffset: number; pageStartMs: number; pageEndMs?: number; letterIndex?: number; letterTotal?: number };
}

/** One spoken word: reveals on its beat and carries the active-word effect while it is being said. */
export const WordSpan: React.FC<WordSpanProps> = ({
  word, display, timeMs, style, canvas, intensity, baseCss, trailingSpace, settled, effect, reveal = "progressive", pastColor, stagger,
}) => {
  const sc = scaleOf(canvas);
  const spoken = timeMs >= word.startMs;
  const isActive = spoken && timeMs < word.endMs;
  // letter animators bring the whole card in letter by letter (like the AE presets), not word by word as spoken
  const lettersIn = !settled && stagger?.unit === "char" && isLetterAnimator(style.entrance.type);
  // letter exits take the card out letter by letter, backwards from its end
  const lettersOut = !settled && !!stagger && stagger.pageEndMs !== undefined && isLetterAnimator(style.exit.type);
  const p = settled || lettersIn ? 1 : wordReveal(timeMs, showAt(word));

  const css: React.CSSProperties = {
    ...baseCss,
    display: "inline-block",
    whiteSpace: "pre",
    position: "relative",
    opacity: reveal === "all" ? (spoken ? 1 : style.inactiveOpacity) : p,
    transform: `translateY(${(1 - p) * 0.28}em) scale(${0.94 + p * 0.06})`,
  };
  if (word.color) Object.assign(css, { color: word.color, WebkitTextFillColor: word.color, backgroundImage: "none" });
  else if (word.emphasis === "strong" || word.emphasis === "hero") {
    // box looks: active.color is the text ON the box (often black), so an unboxed key word takes the box colour
    const key = style.active.effect === "box" ? style.active.boxColor ?? style.active.color : style.active.color;
    Object.assign(css, { color: key, WebkitTextFillColor: key, backgroundImage: "none" });
  }

  if (pastColor && timeMs >= word.endMs) Object.assign(css, { color: pastColor, WebkitTextFillColor: pastColor, backgroundImage: "none", opacity: 1 });

  let behind: React.ReactNode = null;
  let bar: React.ReactNode = null;
  let ring: React.ReactNode = null;
  const eff = effect === undefined ? style.active.effect : effect;
  let growRight = 0;
  if (isActive && eff) {
    const res = activeEffect({ ...style, active: { ...style.active, effect: eff } }, word, timeMs, canvas.fps, sc, intensity, settled);
    const { transform: activeTransform, ...rest } = res.css;
    Object.assign(css, rest);
    if (activeTransform) css.transform = `${css.transform} ${activeTransform}`;
    if (res.grow && res.grow > 1) {
      // a scaled word grows from its centre: give it matching side room so neighbours slide apart, not get covered
      const side = ((res.grow - 1) / 2) * Math.max(1, [...display].length) * 0.6;
      css.marginLeft = `${side.toFixed(3)}em`;
      growRight = side;
    }
    if (res.behind) behind = <span style={{ position: "absolute", pointerEvents: "none", ...res.behind.css }} />;
    if (res.bar) bar = <span style={{ position: "absolute", pointerEvents: "none", ...res.bar.css }} />;
    if (res.ring) {
      // Hand-drawn ellipse that draws itself around the spoken word: an SVG stroke whose dash offset is a
      // pure function of time, so the studio preview and the Remotion export rasterise the same frame.
      const rp = res.ring.progress;
      ring = (
        <svg aria-hidden viewBox="0 0 100 60" preserveAspectRatio="none" style={{ position: "absolute", left: "-9%", top: "-22%", width: "118%", height: "144%", overflow: "visible", pointerEvents: "none", transform: "rotate(-2deg)" }}>
          <ellipse cx="50" cy="30" rx="46" ry="24" fill="none" stroke={res.ring.color} strokeWidth="3.2" strokeLinecap="round" pathLength={100} strokeDasharray={100} strokeDashoffset={((1 - rp) * 100).toFixed(2)} vectorEffect="non-scaling-stroke" transform="rotate(-1.5 50 30)" />
        </svg>
      );
    }
  }

  const showEmoji = style.emoji.enabled && word.emoji && (word.emoji.position === "before" || word.emoji.position === "after");
  const emo = showEmoji ? <span style={{ fontFamily: "'Noto Color Emoji', sans-serif", WebkitTextStroke: "0px transparent", WebkitTextFillColor: "initial", color: "initial", backgroundImage: "none" }}>{word.emoji!.char}</span> : null;
  const emojiBefore = word.emoji?.position === "before" ? emo : null;
  const emojiAfter = word.emoji?.position === "after" ? emo : null;

  const local = timeMs - (stagger?.pageStartMs ?? 0);
  const sizePx = parseFloat(String(baseCss.fontSize ?? "")) || 60;
  const entranceSec = lettersIn ? (local / 1000) * letterSpeed(style.entrance.durationMs) : null;
  const msUntilEnd = lettersOut ? stagger!.pageEndMs! - timeMs : null;
  const amountsAt = (index: number) => (lettersIn || lettersOut ? letterAmounts(style, entranceSec, msUntilEnd, index, letterTotal) : null);
  // decode scramble: substitute glyphs for this word, resolving in reveal order from the word's own
  // reveal time (not the page start), so the effect rides speech timing word by word
  const shownText = !settled && style.entrance.type === "scramble"
    ? scrambledText(display, timeMs - showAt(word), Math.floor((timeMs / 1000) * canvas.fps), scrambleDurationMs(word))
    : display;
  const chars = [...shownText];
  const letterBase = stagger?.letterIndex ?? 1;
  const letterTotal = stagger?.letterTotal ?? chars.length;
  // the space after this word is a character too in AE: it carries tracking while the letters fly in
  const trackEm = typeof style.templateOptions.letterTrackEm === "number" ? style.templateOptions.letterTrackEm : undefined;
  const spaceAmount = trailingSpace ? amountsAt(letterBase + chars.length) : null;
  if (spaceAmount) growRight += letterTrackEm(spaceAmount[0], intensity, trackEm);
  if (trailingSpace || growRight) css.marginRight = trailingSpace ? `calc(${wordGapCss(style, sc, eff)} + ${growRight.toFixed(3)}em)` : `${growRight.toFixed(3)}em`;
  const baseline = lettersIn || lettersOut ? baselineEm(String(baseCss.fontFamily ?? ""), Number(baseCss.fontWeight ?? 400), Number(baseCss.lineHeight ?? style.lineHeight)) : 0;
  // split-flap: each char is a tile whose drum walks the ordered charset (flapAt) — the glyph shown
  // here, the fold transform in entranceStyle, both from the same pure function and the same local time
  const isFlap = !settled && style.entrance.type === "split-flap" && stagger?.unit === "char";
  const flapTileCss: React.CSSProperties = isFlap
    ? {
        // the tile's split: a 1px midline in a shade derived from the background colour (MUST-WIRE:
        // tile background = background.color, exactly as block-reveal's panel colour is wired)
        backgroundImage: `linear-gradient(to bottom, transparent 49%, ${withAlpha(style.background.color, 0.55)} 49%, ${withAlpha(style.background.color, 0.55)} 51%, transparent 51%)`,
        ...(style.background.type !== "none" ? { backgroundColor: withAlpha(style.background.color, style.background.opacity) } : {}),
      }
    : {};
  const text = !settled && stagger && (stagger.unit === "char" || lettersOut)
    ? chars.map((ch, ci) => {
        const amount = amountsAt(letterBase + ci);
        const flap = isFlap ? flapAt(ch, local - staggerDelayMs(style, stagger.charOffset + ci, "char"), Math.max(120, style.entrance.durationMs)) : null;
        return (
          <span key={ci} style={{
            display: "inline-block", whiteSpace: "pre",
            ...flapTileCss,
            ...combineMotion(
              stagger.unit === "char" && !lettersIn ? entranceStyle(style, local - staggerDelayMs(style, stagger.charOffset + ci, "char"), canvas.fps, intensity, false, sizePx) : {},
              amount ? letterCss(amount, intensity, baseline, trackEm) : {},
            ),
          }}>{flap ? flap.glyph : ch}</span>
        );
      })
    : shownText;
  // pen reveal: a thin trail line extends under the word at the pace its letters land, then fades —
  // the honest "pen" of the write-on entrance (no glyph-path tracing is claimed or faked)
  const trail = !settled && style.entrance.type === "write-on" ? writeOnTrail(timeMs - showAt(word), [...display].length) : null;
  const penTrail = trail && trail.opacity > 0.01 && trail.widthPct > 0 ? (
    <span aria-hidden style={{ position: "absolute", pointerEvents: "none", left: 0, bottom: "-0.10em", height: "0.055em", width: `${trail.widthPct.toFixed(1)}%`, backgroundColor: style.active.color, borderRadius: 4, opacity: trail.opacity }} />
  ) : null;
  // typewriter entrance: a blinking block caret rides the word currently being typed (frame math, not a
  // timer — on for 500 ms, off for 500 ms — so preview and export agree)
  const caret = !settled && style.entrance.type === "typewriter" && isActive ? (
    <span aria-hidden style={{ opacity: Math.floor(timeMs / 500) % 2 === 0 ? 1 : 0, color: style.active.color, WebkitTextFillColor: style.active.color, backgroundImage: "none" }}>▌</span>
  ) : null;
  const inner = (
    <span style={css}>
      {behind}
      {emojiBefore}
      {text}
      {caret}
      {emojiAfter}
      {bar}
      {penTrail}
      {ring}
    </span>
  );
  if (stagger?.unit !== "word" || settled) return inner;
  const enter = entranceStyle(style, local - staggerDelayMs(style, stagger.index, "word"), canvas.fps, intensity, false, sizePx);
  const { marginRight, ...innerCss } = css;
  return (
    <span style={{ display: "inline-block", marginRight, ...enter }}>
      <span style={innerCss}>
        {behind}
        {emojiBefore}
        {text}
        {caret}
        {emojiAfter}
        {bar}
        {penTrail}
        {ring}
      </span>
    </span>
  );
};

export { progress };

/** Stagger bookkeeping for a card: each word's position and first-letter offset (null = the card enters as one). */
export function staggerPlan(style: CaptionStyleV2, page: { startMs: number; endMs: number; lines: Word[][] }, texts: string[][]) {
  const unit = staggerUnit(style);
  if (!splitsLetters(style)) {
    if (unit === "none") return null;
  }
  const at = new Map<string, { index: number; charOffset: number; letterIndex: number }>();
  let i = 0;
  let c = 0;
  page.lines.forEach((l, li) => l.forEach((w, wi) => {
    // letterIndex is AE's textIndex: 1-based, with one space counted between consecutive words
    at.set(w.id, { index: i, charOffset: c, letterIndex: c + i + 1 });
    i++;
    c += [...(texts[li]?.[wi] ?? "")].length;
  }));
  const letterTotal = c + Math.max(0, i - 1);
  return (id: string) => ({ unit, pageStartMs: page.startMs, pageEndMs: page.endMs, letterTotal, ...(at.get(id) ?? { index: 0, charOffset: 0, letterIndex: 1 }) });
}

const baselineCache = new Map<string, number>();
/** Top of a letter's line box to its baseline, in em: half the leading plus the font's ascent. */
function baselineEm(fontFamily: string, weight: number, lineHeight: number): number {
  const key = `${fontFamily}|${weight}|${lineHeight}`;
  const hit = baselineCache.get(key);
  if (hit !== undefined) return hit;
  let ascent = 0.9;
  let descent = 0.22;
  if (typeof document !== "undefined") {
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      ctx.font = `${weight} 100px ${fontFamily}`;
      const m = ctx.measureText("Hg");
      if (m.fontBoundingBoxAscent) { ascent = m.fontBoundingBoxAscent / 100; descent = m.fontBoundingBoxDescent / 100; }
    }
  }
  const v = (lineHeight - ascent - descent) / 2 + ascent;
  // only cache once the font is measurable (fonts load before the first rendered frame)
  if (typeof document !== "undefined" && document.fonts?.check?.(`${weight} 100px ${fontFamily}`)) baselineCache.set(key, v);
  return v;
}
