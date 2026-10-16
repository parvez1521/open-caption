import React from "react";
import type { CaptionStyleV2, Word } from "@capseasy/shared";
import { activeEffect, combineMotion, entranceStyle, isLetterAnimator, letterAmounts, letterCss, letterSpeed, letterTrackEm, progress, showAt, splitsLetters, staggerDelayMs, staggerUnit, wordReveal } from "../motion";
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
  const chars = [...display];
  const letterBase = stagger?.letterIndex ?? 1;
  const letterTotal = stagger?.letterTotal ?? chars.length;
  // the space after this word is a character too in AE: it carries tracking while the letters fly in
  const trackEm = typeof style.templateOptions.letterTrackEm === "number" ? style.templateOptions.letterTrackEm : undefined;
  const spaceAmount = trailingSpace ? amountsAt(letterBase + chars.length) : null;
  if (spaceAmount) growRight += letterTrackEm(spaceAmount[0], intensity, trackEm);
  if (trailingSpace || growRight) css.marginRight = trailingSpace ? `calc(${wordGapCss(style, sc, eff)} + ${growRight.toFixed(3)}em)` : `${growRight.toFixed(3)}em`;
  const baseline = lettersIn || lettersOut ? baselineEm(String(baseCss.fontFamily ?? ""), Number(baseCss.fontWeight ?? 400), Number(baseCss.lineHeight ?? style.lineHeight)) : 0;
  const text = !settled && stagger && (stagger.unit === "char" || lettersOut)
    ? chars.map((ch, ci) => {
        const amount = amountsAt(letterBase + ci);
        return (
          <span key={ci} style={{
            display: "inline-block", whiteSpace: "pre",
            ...combineMotion(
              stagger.unit === "char" && !lettersIn ? entranceStyle(style, local - staggerDelayMs(style, stagger.charOffset + ci, "char"), canvas.fps, intensity, false, sizePx) : {},
              amount ? letterCss(amount, intensity, baseline, trackEm) : {},
            ),
          }}>{ch}</span>
        );
      })
    : display;
  const inner = (
    <span style={css}>
      {behind}
      {emojiBefore}
      {text}
      {emojiAfter}
      {bar}
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
        {emojiAfter}
        {bar}
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
