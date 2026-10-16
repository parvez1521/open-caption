/**
 * Layouts for the single-line / word-level pack looks (./lines.tsx). Each one re-creates a catalogued caption style:
 * its paint, which words show when, and its motion (exact durations, easings and keyframes, scaled by the motion
 * intensity, which is 1 at the defaults on a neutral card). Every value is a pure function of `timeMs`.
 */
import React from "react";
import type { CaptionStyleV2, Page, Word } from "@capseasy/shared";
import { displayText, fillCss, strokeCss } from "../text";
import type { PageRenderProps } from "../types";
import { EASE, hash, keyframes, keyWordIndex, linear01, pageSeed, pick, tween } from "./kit";
import {
  type Cell, Frame, Row, alphaMul, cellsOf, currentWordIndex, fitCells, gapPx, joinShadows, mix, restColor, restFill, sameColor,
  shadowFilters, shadowLayers, solid, stateAmount, stdGlow, typeCss,
} from "./lines-engine";

const opt = <T,>(style: CaptionStyleV2, key: string, fallback: T): T => {
  const v = style.templateOptions[key];
  return (v === undefined || v === null ? fallback : v) as T;
};
const letters = (w: Word) => w.text.replace(/[^\p{L}\p{N}]/gu, "").length;
const marginAfter = (style: CaptionStyleV2, sc: number, size: number, last: boolean, gapEm = 0.3) => (last ? 0 : gapPx(style, sc, size, gapEm));
const paint = (style: CaptionStyleV2, sc: number, glow = true): React.CSSProperties => ({
  ...strokeCss(style.stroke, sc),
  textShadow: joinShadows([...shadowLayers(style, sc), ...(glow ? stdGlow(style, sc) : [])]),
});
/** hero (key-word) font, falling back to the body font */
const heroFont = (style: CaptionStyleV2, fallbackId?: string, italic?: boolean) => ({
  fontId: style.hero.fontId ?? fallbackId ?? style.fontId,
  fontWeight: style.hero.fontWeight ?? style.fontWeight,
  fontStyle: (italic ? "italic" : "normal") as "italic" | "normal",
});

// ============================================================ plain line (whole card at once, motion = card entrance)

/** Plain words, the whole card at once. Any motion is the card entrance the user picks (default: a cut). */
export const PlainLineLayout: React.FC<PageRenderProps> = (p) => {
  const { page, style } = p;
  const cells = cellsOf(page, style);
  const fit = fitCells(p, cells);
  return (
    <Frame p={p} fit={fit}>
      {cells.map((line, li) => (
        <Row key={li} style={style}>
          {line.map((c, wi) => (
            <span key={c.w.id} style={{ ...typeCss(style, fit.sc, fit.size), ...restFill(c.w, style), ...paint(style, fit.sc), marginRight: marginAfter(style, fit.sc, fit.size, wi === line.length - 1) }}>{c.text}</span>
          ))}
        </Row>
      ))}
    </Frame>
  );
};

// ============================================================ solo: each word fades in at its spoken time

/**
 * Each word fades in at its own spoken time (opacity only, `fadeMs` ease: no transform). A word the creator marks as
 * the key word is set larger in italic, in the highlight colour, with a soft shadow.
 */
export const SoloLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, settled } = p;
  const fadeMs = opt(style, "fadeMs", 250);
  const cells = cellsOf(page, style, page.lines, (w) =>
    w.emphasis === "hero" ? { mult: style.hero.scale, font: heroFont(style, undefined, true), text: displayText(w, style, style.hero.casing ?? style.casing) } : {});
  const fit = fitCells(p, cells);
  const { sc, size } = fit;
  return (
    <Frame p={p} fit={fit}>
      {cells.map((line, li) => (
        <Row key={li} style={style}>
          {line.map((c, wi) => {
            const hero = c.w.emphasis === "hero";
            const o = tween(timeMs, c.w.startMs, fadeMs, EASE.ease, 0, settled);
            const css: React.CSSProperties = hero
              ? { ...typeCss(style, sc, size * c.mult, c.font), ...solid(c.w.color ?? style.active.color), ...strokeCss(style.stroke, sc), textShadow: joinShadows([`0 ${(1.5 * sc).toFixed(2)}px ${(4.5 * sc).toFixed(2)}px rgba(0,0,0,0.6)`, ...stdGlow(style, sc)]) }
              : { ...typeCss(style, sc, size), ...restFill(c.w, style), ...paint(style, sc) };
            return <span key={c.w.id} style={{ ...css, opacity: o, marginRight: marginAfter(style, sc, size, wi === line.length - 1) }}>{c.text}</span>;
          })}
        </Row>
      ))}
    </Frame>
  );
};

// ============================================================ slam: one word per line, each slams in as spoken

/**
 * One word per line, each sized to its length (base × clamp(5 / letters, 0.36, 1)). Each word slams in as it is
 * spoken: from scale 2.5, Y −0.57em, blur 0.14em to rest in 0.25 s ease-in.
 */
export const SlamLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, settled } = p;
  const durMs = opt(style, "slamMs", 250);
  const cells = cellsOf(page, style, page.words.map((w) => [w]), (w) => ({ mult: Math.min(1, Math.max(0.36, 5 / Math.max(1, letters(w)))) }));
  const fit = fitCells(p, cells);
  const { sc, size, intensity: k } = fit;
  return (
    <Frame p={p} fit={fit} rowGapPx={0}>
      {cells.map((line) => {
        const c = line[0]!;
        const px = size * c.mult;
        const shown = settled || timeMs >= c.w.startMs;
        const q = 1 - EASE.easeIn(linear01(timeMs, c.w.startMs, durMs, settled));
        return (
          <Row key={c.w.id} style={style}>
            <span style={{
              ...typeCss(style, sc, px), ...restFill(c.w, style), ...paint(style, sc), opacity: shown ? 1 : 0,
              transform: `translateY(${(-0.57 * q * k * px).toFixed(2)}px) scale(${(1 + 1.5 * q * k).toFixed(4)})`,
              ...(q > 0.001 ? { filter: `blur(${(0.14 * q * k * px).toFixed(2)}px)` } : {}),
            }}>{c.text}</span>
          </Row>
        );
      })}
    </Frame>
  );
};

// ============================================================ accent line: one word in a script / italic serif

/** the card's accent word: the creator's key word, else a seeded pick among words of 4+ letters, else the longest */
function accentIndex(page: Page): number {
  const hero = page.words.findIndex((w) => w.emphasis === "hero");
  if (hero >= 0) return hero;
  const cands = page.words.map((w, i) => (letters(w) >= 4 ? i : -1)).filter((i) => i >= 0);
  if (cands.length) return cands[pick(pageSeed(page), cands.length, 7)]!;
  return keyWordIndex(page, 1);
}

/** a soft white-hot halo around a word (3 layers off the glow colour) */
const halo = (style: CaptionStyleV2, sc: number) => {
  const r = style.glow.radius * sc;
  const c = style.glow.color;
  const i = style.glow.intensity;
  return [`0 0 ${(r * 0.35).toFixed(2)}px ${alphaMul(c, i)}`, `0 0 ${r.toFixed(2)}px ${alphaMul(c, 0.85 * i)}`, `0 0 ${(r * 2.6).toFixed(2)}px ${alphaMul(c, 0.55 * i)}`].join(", ");
};

/**
 * One clean line; one word (seeded pick) is set in the hero font at hero-scale (script, or italic serif) in the
 * highlight colour. Words arrive with the "slide up" transition: Y 1em → 0 + fade, 0.4 s ease-out, 0.1 s apart.
 * `spokenGlow`: the accent word lights up when spoken (glow layer opacity 0 → 1 at 40 % → 0.85, 0.6 s ease-out).
 */
export const AccentLineLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, settled } = p;
  const spokenGlow = opt(style, "spokenGlow", false);
  const slideEm = opt(style, "slideEm", 1);
  const slideMs = opt(style, "slideMs", 400);
  const staggerMs = opt(style, "staggerMs", 100);
  const acc = accentIndex(page);
  const accentFont = style.hero.fontId ?? "Dancing Script";
  const italic = opt(style, "accentItalic", false) || accentFont === "Playfair Display";
  const cells = cellsOf(page, style, page.lines, (w, i) =>
    i === acc ? { mult: style.hero.scale, font: heroFont(style, accentFont, italic), text: displayText(w, style, style.hero.casing ?? style.casing) } : {});
  const fit = fitCells(p, cells);
  const { sc, size, intensity: k } = fit;
  return (
    <Frame p={p} fit={fit}>
      {cells.map((line, li) => (
        <Row key={li} style={style}>
          {line.map((c, wi) => {
            const e = tween(timeMs, page.startMs, slideMs, EASE.easeOut, c.i * staggerMs, settled);
            const move: React.CSSProperties = { opacity: e, transform: `translateY(${((1 - e) * slideEm * k * size).toFixed(2)}px)` };
            const gap = marginAfter(style, sc, size, wi === line.length - 1);
            if (c.i !== acc) return <span key={c.w.id} style={{ ...typeCss(style, sc, size), ...restFill(c.w, style), ...paint(style, sc, !spokenGlow), ...move, marginRight: gap }}>{c.text}</span>;
            const color = c.w.color ?? style.active.color;
            let glow = 0;
            if (spokenGlow && style.glow.enabled && timeMs >= c.w.startMs) glow = settled ? 0.85 : keyframes(linear01(timeMs, c.w.startMs, 600), [[0, 0], [0.4, 1], [1, 0.85]], EASE.easeOut);
            return (
              <span key={c.w.id} style={{ ...typeCss(style, sc, size * c.mult, c.font), ...solid(color), ...paint(style, sc, !spokenGlow), ...move, marginRight: gap }}>
                {glow > 0 ? <span aria-hidden style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", opacity: glow, textShadow: halo(style, sc) }}>{c.text}</span> : null}
                <span style={{ position: "relative" }}>{c.text}</span>
              </span>
            );
          })}
        </Row>
      ))}
    </Frame>
  );
};

// ============================================================ hind: two glowing lines + a big italic serif word

/** split a one-line card of 3+ words into two lines balanced by length */
function twoLines(page: Page): Word[][] {
  if (page.lines.length > 1 || page.words.length < 3) return page.lines;
  const ws = page.words;
  const len = (a: Word[]) => a.reduce((n, w) => n + w.text.length + 1, -1);
  let best = 1;
  let score = Infinity;
  for (let s = 1; s < ws.length; s++) {
    const m = Math.max(len(ws.slice(0, s)), len(ws.slice(s)));
    if (m < score) { score = m; best = s; }
  }
  return [ws.slice(0, best), ws.slice(best)];
}

/** Hind's accent: the creator's key word, else the first or last word of a line (4+ letters, longer line preferred) */
function hindAccent(page: Page, lines: Word[][]): string {
  const hero = page.words.find((w) => w.emphasis === "hero");
  if (hero) return hero.id;
  const seed = pageSeed(page);
  let best = lines[0]![0]!.id;
  let score = -Infinity;
  lines.forEach((l, li) => {
    const lineLen = l.reduce((n, w) => n + w.text.length, 0);
    [l[0]!, l[l.length - 1]!].forEach((w, end) => {
      const s = (letters(w) >= 4 ? 1000 : 0) + lineLen * 10 + ((seed >> (li * 2 + end)) & 1);
      if (s > score) { score = s; best = w.id; }
    });
  });
  return best;
}

/**
 * Two lines of white words in a soft white glow; one word per card (first/last word of a line) pops in a big italic
 * serif in an accent colour with its own glow. Accent colours rotate per card (seeded) while the highlight colour is
 * the default first accent; any other highlight colour is used for every card. Words show at their spoken time:
 * Y 20px (0.59em) → 0 + fade, 0.2 s ease.
 */
export const HindLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, settled } = p;
  const lines = twoLines(page);
  const accId = hindAccent(page, lines);
  const accents = opt<string[]>(style, "accents", []);
  const rotating = accents.length > 1 && sameColor(style.active.color, accents[0]);
  const accent = rotating ? accents[page.index === undefined ? 0 : pick(hash(`hind|${page.index}`), accents.length)]! : style.active.color;
  const cells = cellsOf(page, style, lines, (w) =>
    w.id === accId ? { mult: style.hero.scale, font: heroFont(style, "Playfair Display", true), text: displayText(w, style, style.hero.casing ?? style.casing) } : {});
  const fit = fitCells(p, cells);
  const { sc, size, intensity: k } = fit;
  const r = style.glow.radius * sc;
  const g = style.glow;
  const baseGlow = g.enabled ? [`0 0 ${r.toFixed(2)}px ${alphaMul(g.color, g.intensity)}`, `0 0 ${((r * 14) / 6).toFixed(2)}px ${alphaMul(g.color, (g.intensity * 2) / 3)}`] : [];
  return (
    <Frame p={p} fit={fit}>
      {cells.map((line, li) => (
        <Row key={li} style={style}>
          {line.map((c, wi) => {
            const e = tween(timeMs, c.w.startMs, opt(style, "showMs", 200), EASE.ease, 0, settled);
            const move: React.CSSProperties = { opacity: e, transform: `translateY(${((1 - e) * 0.59 * k * size).toFixed(2)}px)` };
            const gap = marginAfter(style, sc, size, wi === line.length - 1);
            if (c.w.id !== accId) return <span key={c.w.id} style={{ ...typeCss(style, sc, size), ...restFill(c.w, style), ...strokeCss(style.stroke, sc), textShadow: joinShadows([...baseGlow, ...shadowLayers(style, sc)]), ...move, marginRight: gap }}>{c.text}</span>;
            const color = c.w.color ?? accent;
            const accGlow = g.enabled ? [`0 0 ${((r * 7) / 6).toFixed(2)}px ${color}`, `0 0 ${((r * 16) / 6).toFixed(2)}px ${color}`] : [];
            return <span key={c.w.id} style={{ ...typeCss(style, sc, size * c.mult, c.font), ...solid(color), ...strokeCss(style.stroke, sc), textShadow: joinShadows([...accGlow, ...shadowLayers(style, sc)]), ...move, marginRight: gap }}>{c.text}</span>;
          })}
        </Row>
      ))}
    </Frame>
  );
};

// ============================================================ active word: colour + scale while spoken

/** the spoken word's colour: the palette rotates while the highlight colour is the palette's first colour */
function activeColorOf(style: CaptionStyleV2, page: Page, i: number): string {
  const palette = opt<string[]>(style, "palette", []);
  if (palette.length > 1 && sameColor(style.active.color, palette[0])) return palette[(((page.index ?? 0) * 3 + i) % palette.length + palette.length) % palette.length]!;
  return style.active.color;
}

/** horizontal room a word scaled from its centre needs on each side so it pushes its neighbours instead of covering them */
const growMargin = (scale: number, widthPx: number) => (Math.max(0, scale - 1) / 2) * widthPx;

/**
 * Every word on screen; the spoken word turns the highlight colour (or the next colour of a cycling palette) and
 * scales up, both with a 0.2 s ease transition on and off.
 */
export const ColorPopLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, settled } = p;
  const durMs = opt(style, "transitionMs", 200);
  const cells = cellsOf(page, style);
  const fit = fitCells(p, cells);
  const { sc, size, intensity: k } = fit;
  return (
    <Frame p={p} fit={fit}>
      {cells.map((line, li) => (
        <Row key={li} style={style}>
          {line.map((c, wi) => {
            const a = stateAmount(timeMs, c.w.startMs, c.w.endMs, durMs, EASE.ease, settled);
            const scale = 1 + (style.active.scale - 1) * a * k;
            const m = growMargin(scale, fit.widths[li]![wi]!);
            const fill = a > 0 ? solid(mix(restColor(c.w, style), activeColorOf(style, page, c.i), a)) : restFill(c.w, style);
            return <span key={c.w.id} style={{ ...typeCss(style, sc, size), ...fill, ...paint(style, sc), transform: `scale(${scale.toFixed(4)})`, marginLeft: m, marginRight: m + marginAfter(style, sc, size, wi === line.length - 1) }}>{c.text}</span>;
          })}
        </Row>
      ))}
    </Frame>
  );
};

/** Every word on screen; the spoken word punches: scale 1 → `punchScale` → 1 over 0.2 s, back-out per keyframe segment. */
export const PunchPopLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, settled } = p;
  const durMs = opt(style, "punchMs", 200);
  const punch = opt(style, "punchScale", 1.35);
  const cells = cellsOf(page, style);
  const fit = fitCells(p, cells);
  const { sc, size, intensity: k } = fit;
  return (
    <Frame p={p} fit={fit}>
      {cells.map((line, li) => (
        <Row key={li} style={style}>
          {line.map((c, wi) => {
            const live = !settled && timeMs >= c.w.startMs && timeMs < c.w.startMs + durMs;
            const scale = live ? 1 + (punch - 1) * k * keyframes(linear01(timeMs, c.w.startMs, durMs), [[0, 0], [0.5, 1], [1, 0]], EASE.backOut) : 1;
            const m = growMargin(scale, fit.widths[li]![wi]!);
            return <span key={c.w.id} style={{ ...typeCss(style, sc, size), ...restFill(c.w, style), ...paint(style, sc), transform: `scale(${scale.toFixed(4)})`, marginLeft: m, marginRight: m + marginAfter(style, sc, size, wi === line.length - 1) }}>{c.text}</span>;
          })}
        </Row>
      ))}
    </Frame>
  );
};

// ============================================================ focus: a coloured box jumps to the spoken word

/**
 * Every word carries the box padding (≈ 2px 6px at the catalogue's 38px: 0.053em × 0.158em); only the spoken word's
 * box is filled. Box colour and text colour change with a 0.1 s ease; the boxed word drops its shadow.
 */
export const FocusBoxLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, settled } = p;
  const durMs = opt(style, "transitionMs", 100);
  const padY = 0.053;
  const padX = 0.158;
  const cells = cellsOf(page, style, page.lines, () => ({ padEm: padX }));
  const fit = fitCells(p, cells);
  const { sc, size } = fit;
  const boxColor = style.active.boxColor ?? "#FFE600";
  return (
    <Frame p={p} fit={fit} rowGapPx={(style.lineHeight - 1) * size * 0.5}>
      {cells.map((line, li) => (
        <Row key={li} style={style}>
          {line.map((c, wi) => {
            const a = stateAmount(timeMs, c.w.startMs, c.w.endMs, durMs, EASE.ease, settled);
            const scale = 1 + (style.active.scale - 1) * a;
            const fill = a > 0 ? solid(mix(restColor(c.w, style), style.active.color, a)) : restFill(c.w, style);
            return (
              <span key={c.w.id} style={{
                ...typeCss(style, sc, size), ...fill, ...strokeCss(style.stroke, sc),
                textShadow: joinShadows([...shadowLayers(style, sc, 1 - a), ...stdGlow(style, sc)]),
                padding: `${padY}em ${padX}em`, transform: `scale(${scale.toFixed(4)})`, zIndex: a > 0 ? 1 : 0,
                marginLeft: growMargin(scale, fit.widths[li]![wi]!), marginRight: growMargin(scale, fit.widths[li]![wi]!) + marginAfter(style, sc, size, wi === line.length - 1),
              }}>
                {a > 0 ? <span aria-hidden style={{ position: "absolute", inset: 0, backgroundColor: alphaMul(boxColor, a), borderRadius: style.active.boxRadius * sc, zIndex: -1 }} /> : null}
                {c.text}
              </span>
            );
          })}
        </Row>
      ))}
    </Frame>
  );
};

// ============================================================ hollow: outlined words fill in as spoken

/** Not-yet-spoken words are transparent with a thin outline; each fills solid when spoken (0.1 s ease) and takes the shadow. */
export const HollowFillLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, settled } = p;
  const durMs = opt(style, "fillMs", 100);
  const cells = cellsOf(page, style);
  const fit = fitCells(p, cells);
  const { sc, size } = fit;
  return (
    <Frame p={p} fit={fit}>
      {cells.map((line, li) => (
        <Row key={li} style={style}>
          {line.map((c, wi) => {
            const f = timeMs < c.w.startMs ? 0 : tween(timeMs, c.w.startMs, durMs, EASE.ease, 0, settled);
            const fill = style.fill.type === "gradient" && !c.w.color ? (f >= 0.5 ? fillCss(style.fill) : solid("transparent")) : solid(alphaMul(restColor(c.w, style), f));
            return <span key={c.w.id} style={{ ...typeCss(style, sc, size), ...fill, ...strokeCss(style.stroke, sc), textShadow: joinShadows([...shadowLayers(style, sc, f), ...(f >= 0.5 ? stdGlow(style, sc) : [])]), marginRight: marginAfter(style, sc, size, wi === line.length - 1) }}>{c.text}</span>;
          })}
        </Row>
      ))}
    </Frame>
  );
};

// ============================================================ karaoke pill: dim upcoming words on a pill

/** The card sits on a pill (the background); upcoming words are the text colour at `upcomingAlpha`, spoken words full. */
export const KaraokePillLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, settled } = p;
  const durMs = opt(style, "fadeMs", 150);
  const dim = opt(style, "upcomingAlpha", 0x55 / 255);
  const cells = cellsOf(page, style);
  const fit = fitCells(p, cells, { reservePx: style.background.type === "none" ? 0 : style.background.padding * scaleOfFit(p) * 2.8 });
  const { sc, size } = fit;
  // a pill round at the ends of ONE line: on a 2-line card a full stadium would cut into the words' corners
  const pillRadius = style.background.type === "pill" && cells.length > 1 ? { borderRadius: (size * style.lineHeight) / 2 + style.background.padding * sc * 0.6 } : {};
  return (
    <Frame p={p} fit={fit} inner={pillRadius}>
      {cells.map((line, li) => (
        <Row key={li} style={style}>
          {line.map((c, wi) => {
            const f = timeMs < c.w.startMs ? 0 : tween(timeMs, c.w.startMs, durMs, EASE.ease, 0, settled);
            const a = dim + (1 - dim) * f;
            const gradient = style.fill.type === "gradient" && !c.w.color;
            const fill = gradient ? { ...fillCss(style.fill), opacity: a } : solid(alphaMul(restColor(c.w, style), a));
            return <span key={c.w.id} style={{ ...typeCss(style, sc, size), ...fill, ...paint(style, sc), marginRight: marginAfter(style, sc, size, wi === line.length - 1) }}>{c.text}</span>;
          })}
        </Row>
      ))}
    </Frame>
  );
};
const scaleOfFit = (p: PageRenderProps) => Math.min(p.canvas.width, p.canvas.height) / 1080;

// ============================================================ selection highlight: a bracketed box expands behind the line

/**
 * A translucent highlight (15 %–88 % of the line height) with a 2px border on each side ending in a dot, like a text
 * selection, expands behind each line at the card start: scaleX 0 + Y 15px (0.375em) → rest, opaque by 20 %, 1 s
 * cubic-bezier(.16,1,.3,1) after 0.05 s, from the centre bottom. Border = highlight colour; fill = the default
 * gold, or the chosen highlight colour at 35 %.
 */
export const SelectHighlightLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style, settled } = p;
  const cells = cellsOf(page, style);
  const padX = 0.14;
  const fit = fitCells(p, cells, { reservePx: 0 });
  const { sc, size, intensity: k } = fit;
  const t = linear01(timeMs, page.startMs + opt(style, "delayMs", 50), opt(style, "expandMs", 1000), settled);
  const sx = EASE.outExpo(t);
  const ty = (1 - sx) * 0.375 * k * size;
  const o = keyframes(t, [[0, 0], [0.2, 1], [1, 1]], EASE.outExpo);
  const border = style.active.color;
  const defaultBorder = opt(style, "defaultBorder", "#F5C451");
  const fillColor = sameColor(border, defaultBorder) ? opt(style, "defaultFill", "rgba(247,213,137,0.35)") : alphaMul(border, 0.35);
  const lh = style.lineHeight * size;
  const top = 0.15 * lh;
  const h = 0.73 * lh;
  const bw = Math.max(1, 3 * sc);
  const dot = 0.17 * size;
  const ext = 0.2 * size;
  return (
    <Frame p={p} fit={fit} background={false}>
      {cells.map((line, li) => {
        const half = fit.lineWidths[li]! / 2 + padX * size;
        const slide = (1 - sx) * half;
        const handle = (side: "left" | "right"): React.CSSProperties => ({
          position: "absolute", [side]: -padX * size - bw / 2, width: bw, top: side === "left" ? top - ext : top, height: h + ext,
          backgroundColor: border, opacity: o, transform: `translateX(${side === "left" ? slide : -slide}px) translateY(${ty}px)`,
        });
        const dotCss = (at: "top" | "bottom"): React.CSSProperties => ({ position: "absolute", left: bw / 2 - dot / 2, [at]: -dot / 2, width: dot, height: dot, borderRadius: "50%", backgroundColor: border });
        return (
          <Row key={li} style={style}>
            <span style={{ position: "relative", display: "inline-flex", alignItems: "baseline", whiteSpace: "pre" }}>
              <span aria-hidden style={{ position: "absolute", left: -padX * size, right: -padX * size, top, height: h, backgroundColor: fillColor, opacity: o, transform: `translateY(${ty}px) scaleX(${sx.toFixed(4)})`, transformOrigin: "50% 100%" }} />
              <span aria-hidden style={handle("left")}><span style={dotCss("top")} /></span>
              <span aria-hidden style={handle("right")}><span style={dotCss("bottom")} /></span>
              {line.map((c, wi) => (
                <span key={c.w.id} style={{ ...typeCss(style, sc, size), ...restFill(c.w, style), ...paint(style, sc), marginRight: marginAfter(style, sc, size, wi === line.length - 1) }}>{c.text}</span>
              ))}
            </span>
          </Row>
        );
      })}
    </Frame>
  );
};

// ============================================================ bloom: soft layered glow in the text colour

/** Words in a soft layered bloom: 0 0 r/4 (60 %), 0 0 5r/8 (40 %), 0 0 r (10 %) of the glow colour. */
export const BloomLayout: React.FC<PageRenderProps> = (p) => {
  const { page, style } = p;
  const cells = cellsOf(page, style);
  const fit = fitCells(p, cells);
  const { sc, size } = fit;
  const g = style.glow;
  const r = g.radius * sc;
  const bloom = g.enabled ? [`0 0 ${(r / 4).toFixed(2)}px ${alphaMul(g.color, 0.6 * g.intensity)}`, `0 0 ${((r * 5) / 8).toFixed(2)}px ${alphaMul(g.color, 0.4 * g.intensity)}`, `0 0 ${r.toFixed(2)}px ${alphaMul(g.color, 0.1 * g.intensity)}`] : [];
  return (
    <Frame p={p} fit={fit}>
      {cells.map((line, li) => (
        <Row key={li} style={style}>
          {line.map((c, wi) => (
            <span key={c.w.id} style={{ ...typeCss(style, sc, size), ...restFill(c.w, style), ...strokeCss(style.stroke, sc), textShadow: joinShadows([...bloom, ...shadowLayers(style, sc)]), marginRight: marginAfter(style, sc, size, wi === line.length - 1) }}>{c.text}</span>
          ))}
        </Row>
      ))}
    </Frame>
  );
};

// ============================================================ block gradient: one gradient painted across each line

/**
 * Each line is ONE text run painted with the fill (a slanted shine band, or a centre-peak dual tone), so the
 * gradient spans the line rather than repeating per word. Shadows and the glow are filter drop-shadows (a
 * text-shadow would paint over gradient-clipped text).
 */
export const BlockGradientLayout: React.FC<PageRenderProps> = (p) => {
  const { page, style } = p;
  const lines = page.lines.map((l) => l.map((w) => displayText(w, style)).join(" "));
  const cells: Cell[][] = page.lines.map((l, li) => [{ w: l[0]!, i: 0, text: lines[li]!, mult: 1 }]);
  const fit = fitCells(p, cells);
  const { sc, size } = fit;
  const g = style.glow;
  const filters = [...shadowFilters(style, sc), ...(g.enabled ? [`drop-shadow(0 0 ${(g.radius * sc * 0.5).toFixed(2)}px ${alphaMul(g.color, g.intensity)})`] : [])];
  return (
    <Frame p={p} fit={fit}>
      {lines.map((text, li) => (
        <Row key={li} style={style}>
          <span style={{ ...typeCss(style, sc, size), ...fillCss(style.fill), ...strokeCss(style.stroke, sc), ...(filters.length ? { filter: filters.join(" ") } : {}) }}>{text}</span>
        </Row>
      ))}
    </Frame>
  );
};

// ============================================================ pill word: one word at a time on a pill badge

/**
 * One word at a time (the word being spoken) on a rounded badge: padding ≈ 2px × 28px at the catalogue's 52px,
 * a 1px border of white at 8 %, a soft glow in the text colour. The card entrance replays for each word.
 */
export const PillWordLayout: React.FC<PageRenderProps> = (p) => {
  const { page, timeMs, style } = p;
  const cur = currentWordIndex(page, timeMs);
  const w = page.words[cur]!;
  const bg = style.background;
  const sc0 = scaleOfFit(p);
  const padX = bg.type === "none" ? 0 : bg.padding * sc0;
  const cells: Cell[][] = [[{ w, i: cur, text: displayText(w, style), mult: 1 }]];
  const fit = fitCells(p, cells, { reservePx: padX * 2 });
  const { sc, size } = fit;
  const g = style.glow;
  const glow = g.enabled ? [`0 0 ${(g.radius * sc).toFixed(2)}px ${alphaMul(g.color, g.intensity)}`] : [];
  const pill: React.CSSProperties = bg.type === "none" ? {} : {
    backgroundColor: alphaMul(bg.color, bg.opacity),
    padding: `${((padX * 2) / 28).toFixed(2)}px ${padX.toFixed(2)}px`,
    borderRadius: bg.type === "pill" ? 9999 : bg.radius * sc,
    border: `${Math.max(1, 1.5 * sc).toFixed(2)}px solid rgba(255,255,255,0.08)`,
    ...(bg.blur > 0 ? { backdropFilter: `blur(${bg.blur * sc}px)` } : {}),
  };
  return (
    <Frame p={p} fit={fit} background={false} enterFromMs={cur === 0 ? page.startMs : w.startMs}>
      <div key={w.id} style={{ display: "flex", alignItems: "center", justifyContent: "center", ...pill }}>
        <span style={{ ...typeCss(style, sc, size), ...restFill(w, style), ...strokeCss(style.stroke, sc), textShadow: joinShadows([...glow, ...shadowLayers(style, sc)]) }}>{displayText(w, style)}</span>
      </div>
    </Frame>
  );
};

