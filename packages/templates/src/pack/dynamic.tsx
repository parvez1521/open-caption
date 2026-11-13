/** Pack: Estate and Dynamic compositions. Templates (layouts) and gallery looks; wired in through ./index.ts. */
import React from "react";
import type { CaptionStyleV2, Page } from "@capseasy/shared";
import type { LookSeed } from "../looks/new";
import type { EmotionModifier, PageRenderProps, TemplateCapabilities, TemplateDefinition } from "../types";
import { EASE, cardOrdinal, keyWordIndex, keyframes, ringShadow, withAlpha } from "./kit";
import { CompositionView, mix, bodyFace, currentWord, cut, enter, heroFace, type Face, type Item, type Motion, type Paint, type Rendered, type Row } from "./dynamic-kit";

// ---------------------------------------------------------------------------------------------------------- shared

const caps = (over: Partial<TemplateCapabilities>): TemplateCapabilities => ({
  hero: false, alignment: false, stagger: false, accentPeriod: false, weight: true, color: true, background: true, emoji: false,
  activeEffects: ["none"], entrances: ["none"], ...over,
});

/** the dark blend tone / box colour lives in active.color: emotion must never recolour it */
const KEEP_ACCENT: Partial<Record<Page["emotion"], EmotionModifier>> = {
  excited: { accent: undefined }, sad: { accent: undefined }, angry: { accent: undefined }, surprised: { accent: undefined }, question: { accent: undefined }, hype: { accent: undefined },
};

const still = { entrance: { type: "none" as const, durationMs: 0, stagger: "none" as const, easing: "outExpo" as const }, exit: { type: "none" as const, durationMs: 200 } };
const noFx = (color: string) => ({ effect: "none" as const, color, scale: 1, boxRadius: 12 });
const solid = (color: string) => ({ type: "solid" as const, color });
const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);

/**
 * Split n words into slots of the given sizes. Extra words go to the last slot. A short card gives words up from the
 * front slots that hold several, then the last slot, then single front slots, so the signature slots stay filled.
 */
function split(n: number, counts: number[]): number[][] {
  const c = [...counts];
  const sum = () => c.reduce((x, y) => x + y, 0);
  if (n >= sum()) c[c.length - 1]! += n - sum();
  while (sum() > n) {
    const last = c.length - 1;
    let i = c.findIndex((v, j) => j < last && v >= 2);
    if (i < 0 && c[last]! >= 2) i = last;
    if (i < 0) i = c.findIndex((v) => v >= 1);
    c[i]! -= 1;
  }
  let at = 0;
  return c.map((k) => range(at, (at += k)));
}

/** three slots around the card's key word: words before / the key word / words after (falls back to `counts`) */
function aroundKey(page: Page, counts: [number, number, number]): number[][] {
  const n = page.words.length;
  if (n < 3) return split(n, counts);
  const k = Math.min(n - 2, Math.max(1, keyWordIndex(page)));
  return [range(0, k), [k], range(k + 1, n)];
}

/** catalogue shadow + a soft dark bed so white text also reads on bright footage */
const readable = (y: number, blur: number, alpha: number) => [{ x: 0, y, blur, color: `rgba(0,0,0,${alpha})` }, { x: 0, y: 3, blur: 16, color: "rgba(0,0,0,0.42)" }];

/** which composition this card uses: consecutive cards take consecutive compositions */
const compOf = (page: Page, count: number) => cardOrdinal(page) % count;

const view = (build: (p: PageRenderProps) => Rendered): React.FC<PageRenderProps> => {
  const C: React.FC<PageRenderProps> = (p) => <CompositionView {...p} build={build(p)} />;
  return C;
};

// ---------------------------------------------------------------------------------------------------------- Estate

/** Estate palettes (light / dark), as catalogued; the looks below use their default swatch */
export const ESTATE_PALETTES = {
  ice: ["#EBEBEB", "#3A88FE"], grey: ["#7D7D7D", "#232323"], magenta: ["#E00EFB", "#4B0452"], neon: ["#0DFB42", "#04421A"],
  sky: ["#38BDF8", "#0B3550"], orange: ["#FF6B00", "#B51A00"], yellow: ["#FFD877", "#A64F00"], steel: ["#E1E3E2", "#4E88AC"],
} as const;

/** estateMainWordIn: Y 26px -> 0 + fade, 0.5 s cubic-bezier(.22,1,.36,1) (26px at size 75) */
const estateMainIn = enter({ dur: 500, ease: EASE.outQuint, y: 26 / 75 });
/** estateSlideIn: X 90px -> 0 + fade, 0.45 s, same curve */
const estateSlideIn = enter({ dur: 450, ease: EASE.outQuint, x: 90 / 75 });
/** WhiteStair's "slide-up" transition: Y 30px -> 0 + fade, 0.4 s ease-out (30px at the style's size) */
const slideUp = (sizeRef: number) => enter({ dur: 400, ease: EASE.easeOut, y: 30 / sizeRef });
const slideLeft = (sizeRef: number) => enter({ dur: 400, ease: EASE.easeOut, x: -50 / sizeRef });
const slideDownFade = (sizeRef: number) => enter({ dur: 400, ease: EASE.easeOut, y: -30 / sizeRef });

/** the blended word of a style: light = hero fill (or the main fill), dark = highlight colour */
const blendOf = (style: CaptionStyleV2, own = false, bold = 0): Paint => ({ kind: "blend", light: own ? style.fill : style.hero.fill ?? style.fill, dark: style.active.color, bold });

/** Estate 4 split: headline / bold + thin pair / ONE big word (the last word) */
function stackSplit(n: number): { head: number[]; pair: number[]; big: number } {
  const big = n - 1;
  const rest = range(0, big);
  if (rest.length >= 3) return { head: rest.slice(0, rest.length - 2), pair: rest.slice(-2), big };
  if (rest.length === 2) return { head: [], pair: rest, big };
  return { head: rest, pair: [], big };
}

function stackRows(style: CaptionStyleV2, n: number, sizeRef: number, motion: Motion, thinWeight = 400): Row[] {
  const { head, pair, big } = stackSplit(n);
  const body = bodyFace(style);
  const thin: Face = { ...body, weight: thinWeight };
  const rows: Row[] = [];
  if (head.length) rows.push({ items: [{ idx: head, size: 1, face: body, paint: { kind: "body" }, motion }] });
  if (pair.length)
    rows.push({ items: [{ idx: [pair[0]!], size: 1, face: body, paint: { kind: "body" }, motion }, ...(pair[1] !== undefined ? [{ idx: [pair[1]], size: 1, face: thin, paint: { kind: "body" } as Paint, motion }] : [])] });
  if (big >= 0) rows.push({ items: [{ idx: [big], size: style.hero.scale, face: heroFace(style, 900), paint: blendOf(style), motion: estateMainIn }], gap: 0.02, lh: 0.95 });
  void sizeRef;
  return rows;
}

const estateWord: TemplateDefinition = {
  id: "pack_estate_word", name: "Blended Word", description: "One big word per card, light over dark footage with a dark-tone halo that keeps it readable on bright footage", layout: "pack-estate-word",
  defaults: { ...still, fontId: "Montserrat", fontWeight: 900, fontSize: 140, casing: "none", lineHeight: 1, fill: solid("#EBEBEB"), active: noFx("#3A88FE") },
  settingsDefaults: { maxWordsPerCard: 1 },
  fixedWordsPerCard: 1,
  // hero: true only exposes the highlight colour, which is the word's dark tone
  capabilities: caps({ hero: true }), fonts: ["Montserrat"], emotionMap: KEEP_ACCENT,
  Page: view(({ page, style }) => ({ rows: [{ items: [{ idx: range(0, page.words.length), size: 1, face: bodyFace(style, -0.01), paint: blendOf(style, true), motion: estateMainIn }] }] })),
};

/** Estate 2/3: a big blended MAIN word (the card's first word) + up to 3 words sliding in one by one */
/** a tight dark halo + soft dark bed: the words laid across the big word stay legible on it */
const overlayHalo = (s: number) => [...ringShadow(Math.max(1, s * 0.055), "rgba(0,0,0,0.9)", 16), `0 0 ${(0.16 * s).toFixed(2)}px rgba(0,0,0,0.8)`, `0 ${(0.04 * s).toFixed(2)}px ${(0.3 * s).toFixed(2)}px rgba(0,0,0,0.55)`];

const estateDuo = (overlay: boolean) => view(({ page, style }) => {
  const n = page.words.length;
  // overlay: the big word steps back (dimmer, light tone pulled toward the dark one) so the words across it lead
  const blend = blendOf(style, false, overlay ? 0.035 : 0);
  const mainPaint: Paint = overlay && blend.kind === "blend" && blend.light.type === "solid" ? { ...blend, light: solid(mix(blend.light.color, blend.dark, 0.18)) } : blend;
  const main: Item = { idx: [0], size: style.hero.scale, face: heroFace(style, 900, -0.01), paint: mainPaint, motion: estateMainIn, dim: overlay ? 0.82 : 1 };
  const subs: Item = { idx: range(1, n), size: 1, face: bodyFace(style), paint: overlay ? { kind: "body", glow: overlayHalo } : { kind: "body" }, motion: estateSlideIn };
  return { rows: [{ items: [main], lh: 1 }, overlay ? { items: [subs], overlay: true } : { items: [subs], gap: 0.02 }] };
});

const estateSubline: TemplateDefinition = {
  id: "pack_estate_subline", name: "Blended Word + Slide-In", description: "A big blended word with a second line of words sliding in one by one", layout: "pack-estate-subline",
  defaults: {
    ...still, fontId: "Passion One", fontWeight: 400, fontSize: 60, casing: "none", lineHeight: 1, fill: solid("#FFFFFF"),
    // sub shadow rgba(0,0,0,.75) blur 12 offsetY 4 (at size 75)
    shadows: [{ x: 0, y: 3, blur: 8, color: "rgba(0,0,0,0.75)" }],
    hero: { fontId: "Montserrat", fontWeight: 900, scale: 2.1, fill: solid("#E00EFB"), rotate: 0 }, active: noFx("#4B0452"),
  },
  settingsDefaults: { maxWordsPerCard: 4 }, fixedWordsPerCard: 4, heroDrawn: true,
  capabilities: caps({ hero: true }), fonts: ["Passion One", "Montserrat"], emotionMap: KEEP_ACCENT, Page: estateDuo(false),
};

const estateOverlay: TemplateDefinition = {
  id: "pack_estate_overlay", name: "Words Across a Blended Word", description: "The following words slide across the face of a huge, emboldened blended word", layout: "pack-estate-overlay",
  defaults: {
    ...still, fontId: "Passion One", fontWeight: 400, fontSize: 66, casing: "none", lineHeight: 1, fill: solid("#FFFFFF"),
    shadows: [{ x: 0, y: 3, blur: 8, color: "rgba(0,0,0,0.75)" }],
    hero: { fontId: "Montserrat", fontWeight: 900, scale: 2.2, fill: solid("#FFD877"), rotate: 0 }, active: noFx("#A64F00"),
  },
  settingsDefaults: { maxWordsPerCard: 4 }, fixedWordsPerCard: 4, heroDrawn: true,
  capabilities: caps({ hero: true }), fonts: ["Passion One", "Montserrat"], emotionMap: KEEP_ACCENT, Page: estateDuo(true),
};

const estateStack: TemplateDefinition = {
  id: "pack_estate_stack", name: "3-Line Blended Finish", description: "A white headline, a bold + thin pair, then one big blended word", layout: "pack-estate-stack",
  defaults: {
    ...still, fontId: "Inter", fontWeight: 700, fontSize: 56, casing: "none", lineHeight: 1, fill: solid("#FFFFFF"),
    shadows: readable(2, 6, 0.5),
    hero: { fontId: "Montserrat", fontWeight: 900, scale: 1.9, fill: solid("#0DFB42"), rotate: 0 }, active: noFx("#04421A"),
  },
  settingsDefaults: { maxWordsPerCard: 5 }, fixedWordsPerCard: 5, heroDrawn: true,
  capabilities: caps({ hero: true }), fonts: ["Inter", "Montserrat"], emotionMap: KEEP_ACCENT,
  // built-in entrance 0.5 s for the big word, slide-up (default transition) for the lines
  Page: view(({ page, style }) => ({ rows: stackRows(style, page.words.length, 68, slideUp(68)) })),
};

// ---------------------------------------------------------------------------------------------------------- Dynamic: Estate

const dynEstate: TemplateDefinition = {
  id: "pack_dyn_estate", name: "Rotating Blend Layouts", description: "Cycles an opener, a stacked pair, one word at a time and a three-line block, each with a blended main word", layout: "pack-dyn-estate",
  defaults: {
    ...still, fontId: "Plus Jakarta Sans", fontWeight: 700, fontSize: 56, casing: "none", lineHeight: 1, fill: solid("#FFFFFF"),
    shadows: readable(2, 6, 0.5),
    hero: { fontId: "Montserrat", fontWeight: 900, scale: 1.9, fill: solid("#FF6B00"), rotate: 0 }, active: noFx("#B51A00"),
  },
  settingsDefaults: { maxWordsPerCard: 5 }, fixedWordsPerCard: 5, heroDrawn: true,
  capabilities: caps({ hero: true }), fonts: ["Plus Jakarta Sans", "Montserrat"], emotionMap: KEEP_ACCENT,
  Page: view(({ page, style, timeMs }) => {
    const n = page.words.length;
    const body = bodyFace(style);
    const move = slideLeft(60);
    const big = (idx: number, scale = 1): Item => ({ idx: [idx], size: style.hero.scale * scale, face: heroFace(style, 900, -0.01), paint: blendOf(style), motion: estateMainIn });
    switch (compOf(page, 4)) {
      case 0: // opener: the blended first word, the rest of the card on one line under it
        return { rows: [{ items: [big(0)], lh: 0.95 }, { items: [{ idx: range(1, n), size: 1, face: body, paint: { kind: "body" }, motion: move }], gap: -0.1 }] };
      case 1: { // stacked pair: small line, then the last two words stacked big (white, then blended)
        const rows: Row[] = [];
        if (n > 2) rows.push({ items: [{ idx: range(0, n - 2), size: 1, face: body, paint: { kind: "body" }, motion: move }] });
        if (n > 1) rows.push({ items: [{ idx: [n - 2], size: 1.45, face: { ...body, weight: 800 }, paint: { kind: "body" }, motion: move }], lh: 0.95 });
        rows.push({ items: [big(n - 1)], lh: 0.95, gap: 0.04 });
        return { rows };
      }
      case 2: // one word at a time, each blended
        return { rows: [{ items: [big(currentWord(page, timeMs), 0.85)] }] };
      default: // a three-line block
        return { rows: stackRows(style, n, 60, move) };
    }
  }),
};

// ---------------------------------------------------------------------------------------------------------- Dynamic: Classic

/** WhiteStair "Default" is a cut; a 140 ms settle (scale 1.06 -> 1, scaled by motion intensity) makes the cut land */
const classicCut: Motion = enter({ dur: 140, ease: EASE.outExpo, scale: 1.06, opacity: () => 1 });

const dynClassic: TemplateDefinition = {
  id: "pack_dyn_classic", name: "Rotating Editorial Stack", description: "Clean tight white type that changes composition every card: headline blocks, justified pairs, single words", layout: "pack-dyn-classic",
  defaults: {
    ...still, fontId: "Plus Jakarta Sans", fontWeight: 800, fontSize: 72, casing: "none", lineHeight: 0.98, fill: solid("#FFFFFF"),
    // catalogue 0 1px 4px rgba(0,0,0,.7), plus a soft bed for bright footage
    shadows: readable(1, 4, 0.7), active: noFx("#FFFFFF"),
  },
  settingsDefaults: { maxWordsPerCard: 5 }, fixedWordsPerCard: 5,
  capabilities: caps({}), fonts: ["Plus Jakarta Sans"],
  Page: view(({ page, style, timeMs }) => {
    const n = page.words.length;
    const face = bodyFace(style, -0.062);
    const it = (idx: number[], size: number): Item => ({ idx, size, face, paint: { kind: "body" }, motion: classicCut });
    const pair = (idx: number[], size: number): Row => ({ items: idx.map((i) => it([i], size)), align: "justify" });
    switch (compOf(page, 4)) {
      case 0: { // a 1.8x headline over a 3-line block (0.62x / 1.12x / a justified 0.62x pair)
        const [h, a, b, c] = split(n, [1, 1, 1, 2]);
        return { rows: [{ items: [it(h!, 1.8)] }, { items: [it(a!, 0.62)], gap: 0.05 }, { items: [it(b!, 1.12)] }, pair(c!, 0.62)] };
      }
      case 1: // one word at a time
        return { rows: [{ items: [it([currentWord(page, timeMs)], 1.12)] }] };
      case 2: { // a spaced pair over a 3-word line
        const [p, l] = split(n, [2, 3]);
        return { rows: [pair(p!, 1.12), { items: [it(l!, 1.12)] }] };
      }
      default: { // a pinned three-line block (1.12x / 1.58x / a justified 0.62x pair)
        const [a, b, c] = aroundKey(page, [2, 1, 2]);
        return { rows: [{ items: [it(a!, 1.12)], align: "left" }, { items: [it(b!, 1.58)], align: "left", lh: 0.92 }, pair(c!, 0.62)] };
      }
    }
  }),
};

// ---------------------------------------------------------------------------------------------------------- Dynamic: Creator

/** Creator 4 headline glow: yellow on the left, orange on the right (em offsets/blurs) */
const creatorGlow = (s: number) => [
  `${(-0.13 * s).toFixed(2)}px 0 ${(0.23 * s).toFixed(2)}px rgba(255,234,0,0.55)`,
  `${(-0.22 * s).toFixed(2)}px 0 ${(0.45 * s).toFixed(2)}px rgba(255,234,0,0.3)`,
  `${(0.07 * s).toFixed(2)}px 0 ${(0.24 * s).toFixed(2)}px rgba(255,109,0,0.6)`,
  `0 0 ${(0.6 * s).toFixed(2)}px rgba(255,109,0,0.38)`,
  `0 0 ${(0.95 * s).toFixed(2)}px rgba(255,109,0,0.22)`,
];
/** script line: white glow 0.13/0.30/0.60/1.08em + orange 0.60em */
const scriptGlow = (s: number) => [
  `0 0 ${(0.13 * s).toFixed(2)}px rgba(255,255,255,0.85)`,
  `0 0 ${(0.3 * s).toFixed(2)}px rgba(255,255,255,0.5)`,
  `0 0 ${(0.6 * s).toFixed(2)}px rgba(255,255,255,0.3)`,
  `0 0 ${(1.08 * s).toFixed(2)}px rgba(255,255,255,0.16)`,
  `0 0 ${(0.6 * s).toFixed(2)}px rgba(255,109,0,0.45)`,
  `0 ${(0.04 * s).toFixed(2)}px ${(0.16 * s).toFixed(2)}px rgba(0,0,0,0.35)`,
];
const smallGlow = (s: number) => [`0 ${(0.03 * s).toFixed(2)}px ${(0.12 * s).toFixed(2)}px rgba(0,0,0,0.7)`, `0 ${(0.05 * s).toFixed(2)}px ${(0.4 * s).toFixed(2)}px rgba(0,0,0,0.45)`];

const SCRIPT: Face = { family: "Great Vibes", weight: 400 };
const SMALL: Face = { family: "Plus Jakarta Sans", weight: 400, trackEm: -0.06 };

const dynCreator: TemplateDefinition = {
  id: "pack_dyn_creator", name: "Rotating Warm Script", description: "A warm gradient headline with a glowing white script line, changing composition every card", layout: "pack-dyn-creator",
  defaults: {
    ...still, fontId: "Poppins", fontWeight: 700, fontSize: 76, casing: "none", lineHeight: 1,
    fill: { type: "gradient", angle: 135, stops: [{ color: "#FFFDE7", at: 0 }, { color: "#FFEA00", at: 0.06 }, { color: "#FFB300", at: 0.22 }, { color: "#FF9100", at: 0.6 }, { color: "#FF6D00", at: 1 }] },
    active: noFx("#FFFFFF"), templateOptions: { scriptScale: 1.3 },
  },
  settingsDefaults: { maxWordsPerCard: 5 }, fixedWordsPerCard: 5,
  capabilities: caps({}), fonts: ["Poppins", "Great Vibes", "Plus Jakarta Sans"],
  Page: view(({ page, style, timeMs }) => {
    const n = page.words.length;
    const move = slideDownFade(30);
    const sScale = typeof style.templateOptions.scriptScale === "number" ? (style.templateOptions.scriptScale as number) : 1.3;
    const head = (idx: number[], size = 1): Item => ({ idx, size, face: bodyFace(style, -0.02), paint: { kind: "body", glow: creatorGlow }, motion: move });
    const script = (idx: number[], paint: Paint): Item => ({ idx, size: sScale, face: SCRIPT, paint, motion: move });
    const white: Paint = { kind: "solid", color: "#FFFFFF", glow: scriptGlow, bare: true };
    const small = (idx: number[]): Item => ({ idx, size: 0.62, face: SMALL, paint: { kind: "solid", color: "#FFFFFF", glow: smallGlow, bare: true }, motion: move });
    switch (compOf(page, 4)) {
      case 0: { // a 3+2: gradient headline over its script line
        const [h, s] = split(n, [3, 2]);
        return { rows: [{ items: [head(h!)] }, { items: [script(s!, white)], gap: -0.22 * sScale, lh: 1.05 }] };
      }
      case 1: { // a thin-framed script pair: small words around a gradient script line
        const [a, s, b] = split(n, [1, 2, 2]);
        return { rows: [{ items: [small(a!)], lh: 1.1 }, { items: [script(s!, { kind: "body", glow: creatorGlow })], gap: -0.12, lh: 1.05 }, { items: [small(b!)], gap: -0.05, lh: 1.1 }] };
      }
      case 2: // one word at a time
        return { rows: [{ items: [head([currentWord(page, timeMs)], 1.25)] }] };
      default: { // a 2+3: headline over a script line
        const [h, s] = split(n, [2, 3]);
        return { rows: [{ items: [head(h!)] }, { items: [script(s!, white)], gap: -0.22 * sScale, lh: 1.05 }] };
      }
    }
  }),
};

// ---------------------------------------------------------------------------------------------------------- Dynamic: Simple

/** simpleBoxFill: clip-path wipe right-to-left, 0.42 s cubic-bezier(.22,1,.36,1) */
const boxFill: Motion = ({ t }) => {
  if (t < 0) return { opacity: 0 };
  const p = EASE.outQuint(Math.min(1, t / 420));
  return p >= 1 ? {} : { clipPath: `inset(0 0 0 ${((1 - p) * 100).toFixed(2)}%)` };
};
/** simpleBoxWord: X 0.18em, hidden until 45 %, 0.42 s */
const boxWord = enter({ dur: 420, ease: EASE.outQuint, x: 0.18, opacity: (lin) => (lin < 0.45 ? 0 : 1) });
/** simpleBoxWordLate: X 0.12em, 0.22 s (words spoken after their box has filled) */
const boxWordLate = enter({ dur: 220, ease: EASE.outQuint, x: 0.12 });
/** simpleBoxRise: Y 0.42em, 0.34 s */
const boxRise = enter({ dur: 340, ease: EASE.outQuint, y: 0.42 });
/** simpleRotateIn: X -0.22em, rotate -6deg, origin bottom-left, 0.34 s */
const rotateIn = enter({ dur: 340, ease: EASE.outQuint, x: -0.22, rot: -6, origin: "0% 100%" });

const dynSimple: TemplateDefinition = {
  id: "pack_dyn_simple", name: "Blue Box Wipe Reel", description: "Thin and bold words with a blue box that wipes in, cycling three compositions", layout: "pack-dyn-simple",
  defaults: {
    ...still, fontId: "Plus Jakarta Sans", fontWeight: 800, fontSize: 56, casing: "none", lineHeight: 1, fill: solid("#FFFFFF"),
    shadows: readable(1, 4, 0.7),
    // the highlight colour is the box
    active: noFx("#0061FF"), templateOptions: { bigScale: 2.25 },
  },
  settingsDefaults: { maxWordsPerCard: 5 }, fixedWordsPerCard: 5,
  capabilities: caps({ hero: true, weight: false }), fonts: ["Plus Jakarta Sans"], emotionMap: KEEP_ACCENT,
  Page: view(({ page, style }) => {
    const n = page.words.length;
    const thin: Face = { family: style.fontId, weight: 400, trackEm: -0.025 };
    const bold: Face = { family: style.fontId, weight: 800, trackEm: -0.03 };
    const big = typeof style.templateOptions.bigScale === "number" ? (style.templateOptions.bigScale as number) : 2.25;
    const thinIt = (idx: number[]): Item => ({ idx, size: 1, face: thin, paint: { kind: "body" }, motion: boxRise });
    const boxed = (idx: number[]): Item => ({
      idx, size: 1, face: bold, paint: { kind: "body", bare: true }, motion: boxWord,
      box: { color: style.active.color, padX: 0.17, padY: 0.03, radius: 0.04, body: 1.18, motion: boxFill },
      motionFor: (own, start) => (own - start > 420 * 0.45 ? { motion: boxWordLate, at: own } : { motion: boxWord, at: start }),
    });
    switch (compOf(page, 3)) {
      case 0: { // a boxed pair under a thin line
        const [a, b] = split(n, [3, 2]);
        return { rows: [{ items: [thinIt(a!)] }, { items: [boxed(b!)], gap: 0.06 }] };
      }
      case 1: { // a big word (2.25x) that two words take turns in
        const [a, b] = split(n, [3, 2]);
        return { rows: [{ items: [thinIt(a!)] }, { items: [{ idx: b!, size: big, face: bold, paint: { kind: "body" }, motion: rotateIn, turns: true }], lh: 0.92, gap: -0.05 }] };
      }
      default: { // a staggered three-line block: the box starts where the thin line ends
        const [a, b, c] = split(n, [2, 2, 1]);
        return {
          rows: [
            { items: [thinIt(a!)], align: "left" },
            { items: [boxed(b!)], at: (g) => (g[0] ? g[0].x + g[0].w : 0), gap: 0.06 },
            { items: [{ idx: c!, size: 1, face: bold, paint: { kind: "body" }, motion: boxRise }], at: (g) => (g[1] ? g[1].x + g[1].w : g[0] ? g[0].x + g[0].w : 0), anchor: "end", gap: 0.06 },
          ],
        };
      }
    }
  }),
};

// ---------------------------------------------------------------------------------------------------------- Dynamic: Doctor

const dynDoctor: TemplateDefinition = {
  id: "pack_dyn_doctor", name: "Green Badge Reel", description: "Tall condensed green caps and green/black badges, changing composition every card", layout: "pack-dyn-doctor",
  defaults: {
    ...still, fontId: "Bebas Neue", fontWeight: 400, fontSize: 72, casing: "upper", lineHeight: 0.96, fill: solid("#4EFF58"),
    shadows: readable(2, 6, 0.55),
    // the highlight colour is the badge colour (green text on it, or it as text on green)
    active: noFx("#000000"),
  },
  settingsDefaults: { maxWordsPerCard: 5 }, fixedWordsPerCard: 5,
  capabilities: caps({ hero: true, weight: false }), fonts: ["Bebas Neue"], emotionMap: KEEP_ACCENT,
  Page: view(({ page, style }) => {
    const n = page.words.length;
    const face = bodyFace(style, -0.01, { scaleY: 1.15 });
    // the ink (text colour or gradient) also paints the badges
    const ink = style.fill.type === "solid" ? style.fill.color : `linear-gradient(${style.fill.angle}deg, ${style.fill.stops.map((s) => `${s.color} ${Math.round(s.at * 100)}%`).join(", ")})`;
    const move = slideUp(60);
    const plain = (idx: number[], size = 1): Item => ({ idx, size, face, paint: { kind: "body" }, motion: move });
    // badge: ink box, box-colour text; rev: box-colour box, ink text (radius 2px, padding ~1px 3px at size 60)
    const badge = (idx: number[], size = 1, rev = false): Item => ({
      idx, size, face, together: true, motion: move,
      paint: rev ? { kind: "body" } : { kind: "solid", color: style.active.color },
      box: { color: rev ? style.active.color : ink, padX: 0.09, padY: 0.03, radius: 2 / 60, body: 1.0 },
    });
    switch (compOf(page, 4)) {
      case 0: { // a badge laid inside a big headline word (1.55x, badge 0.46x)
        const [a, b, c] = aroundKey(page, [2, 1, 2]);
        return { rows: [{ items: [plain(a!)] }, { items: [plain(b!, 1.55), { ...badge(c!, 0.8), valign: "top", dy: 0.06, dx: -0.12 }], lh: 0.96 }] };
      }
      case 1: { // reversed badges arriving in two groups
        const [a, b] = split(n, [3, 2]);
        return { rows: [{ items: [badge(a!, 1, true)] }, { items: [badge(b!, 1, true)], gap: 0.08 }] };
      }
      case 2: { // a three-line stack: badge / 1.5x main / rev
        const [a, b, c] = aroundKey(page, [2, 1, 2]);
        return { rows: [{ items: [badge(a!)] }, { items: [plain(b!, 1.5)], gap: 0.06 }, { items: [badge(c!, 1, true)], gap: 0.06 }] };
      }
      default: { // a two-line block of badges
        const [a, b] = split(n, [3, 2]);
        return { rows: [{ items: [badge(a!)] }, { items: [badge(b!)], gap: 0.08 }] };
      }
    }
  }),
};

// ---------------------------------------------------------------------------------------------------------- Dynamic: Luxe

/** hero gradients (3 stops, top -> bottom); "auto" changes palette every card */
export const LUXE_PALETTES: Record<string, [string, string, string]> = {
  copper: ["#FFD08A", "#E0812F", "#8A3E12"],
  magenta: ["#FF8AF7", "#FF1FE5", "#B000B5"],
  violet: ["#E7A6FF", "#B23CF0", "#5E0E8F"],
  teal: ["#B5FFF4", "#2EE0CB", "#0A8A93"],
  ember: ["#FFB199", "#FF4B2B", "#B3120E"],
};
const LUXE_AUTO = ["copper", "magenta", "violet", "teal", "ember"];
/** the default Sky pair, for the blended words */
const LUXE_SKY = ["#38BDF8", "#0B3550"] as const;

const soft = EASE.outSoft;
const luxeBlurIn = enter({ dur: 420, ease: soft, scale: 1.3, y: 0.12, blur: 0.12 });
const luxeHeroIn = enter({ dur: 500, ease: soft, scale: 1.4 });
const luxeFromLeft = enter({ dur: 450, ease: soft, x: -1.4 });
const luxeUp = enter({ dur: 400, ease: soft, y: 0.7 });
const luxeEnterLeft = enter({ dur: 600, ease: EASE.outExpo, xPct: -120 });
const luxeUpFar = enter({ dur: 600, ease: soft, y: 1.8 });

/** luxeExitRight: X +2em, 0.35 s ease-in */
const exitRight = (until: number, unit: number): React.CSSProperties => {
  if (until >= 350) return {};
  const p = EASE.easeIn(Math.min(1, Math.max(0, 1 - until / 350)));
  return { transform: `translateX(${(p * 2 * unit).toFixed(2)}px)`, opacity: 1 - p };
};
/** luxeFlicker: step-end opacity flicker over the last 0.45 s */
const flicker = (until: number): React.CSSProperties => {
  if (until >= 450) return {};
  const t = 1 - until / 450;
  const on = keyframes(t, [[0, 1], [0.18, 1], [0.18, 0], [0.3, 0], [0.3, 1], [0.46, 1], [0.46, 0], [0.56, 0], [0.56, 0.85], [0.68, 0.85], [0.68, 0], [1, 0]]);
  return { opacity: on };
};

const dynLuxe: TemplateDefinition = {
  id: "pack_dyn_luxe", name: "Luxe Gradient Hero", description: "Heavy tight caps with thin italic words and a gradient hero word that changes colour every card", layout: "pack-dyn-luxe",
  defaults: {
    ...still, fontId: "Montserrat", fontWeight: 900, fontSize: 60, casing: "none", lineHeight: 0.95, fill: solid("#FFFFFF"),
    shadows: readable(2, 8, 0.45), active: noFx("#FFFFFF"), templateOptions: { palette: "auto" },
  },
  settingsDefaults: { maxWordsPerCard: 5 }, fixedWordsPerCard: 5,
  capabilities: caps({}), fonts: ["Montserrat", "Josefin Sans"],
  Page: view(({ page, style, timeMs }) => {
    const n = page.words.length;
    const ord = cardOrdinal(page);
    const comp = ord % 4;
    const opt = String(style.templateOptions.palette ?? "auto");
    const pal = LUXE_PALETTES[opt] ?? LUXE_PALETTES[LUXE_AUTO[ord % LUXE_AUTO.length]!]!;
    const heroPaint: Paint = { kind: "gradient", css: `linear-gradient(180deg, ${pal[0]} 0%, ${pal[1]} 55%, ${pal[2]} 100%)`, base: pal[2], glow: (s) => [`0 ${(0.04 * s).toFixed(2)}px ${(0.18 * s).toFixed(2)}px ${withAlpha(pal[2], 0.55)}`] };
    const heavy = bodyFace(style, -0.035);
    const thin: Face = { family: "Josefin Sans", weight: 300, italic: true };
    const it = (idx: number[], size: number, face: Face, motion: Motion, paint: Paint = { kind: "body" }): Item => ({ idx, size, face, paint, motion });
    const ownExit = comp % 2 === 0 ? (u: number) => flicker(u) : exitRight;
    switch (comp) {
      case 0: { // tight overlapping stack: thin italic line / big gradient hero / thin line
        const [a, h, b] = aroundKey(page, [2, 1, 2]);
        return {
          ownExit,
          rows: [
            { items: [it(a!, 0.78, thin, luxeFromLeft)], lh: 1 },
            { items: [it(h!, 2.1, heavy, luxeHeroIn, heroPaint)], gap: -0.32, lh: 0.9 },
            { items: [it(b!, 0.78, thin, luxeUp)], gap: -0.3, lh: 1 },
          ],
        };
      }
      case 1: // single italic words (800)
        return { ownExit, rows: [{ items: [it([currentWord(page, timeMs)], 1.5, { ...heavy, weight: 800, italic: true }, luxeBlurIn)] }] };
      case 2: { // a staggered headline with small words tucked bottom-right
        const [a, b, c] = split(n, [2, 1, 2]);
        return {
          ownExit,
          rows: [
            { items: [it(a!, 1.25, heavy, luxeEnterLeft)], align: "left" },
            { items: [it(b!, 1.25, heavy, luxeEnterLeft, heroPaint)], at: (g) => (g[0] ? g[0].w * 0.3 : 0), gap: -0.08 },
            { items: [it(c!, 0.6, thin, luxeUpFar)], at: (g) => { const r = g[g.length - 1]; return r ? r.x + r.w : 0; }, anchor: "end", gap: -0.12 },
          ],
        };
      }
      default: { // a clean two-line pair, the second line blended
        const [a, b] = split(n, [3, 2]);
        const blend: Paint = { kind: "blend", light: solid(LUXE_SKY[0]), dark: LUXE_SKY[1] };
        return { ownExit, rows: [{ items: [it(a!, 1, heavy, luxeUp)] }, { items: [it(b!, 1.35, heavy, luxeBlurIn, blend)], gap: -0.06 }] };
      }
    }
  }),
};

export const DYNAMIC_TEMPLATES: TemplateDefinition[] = [estateWord, estateSubline, estateOverlay, estateStack, dynEstate, dynClassic, dynCreator, dynSimple, dynDoctor, dynLuxe];

// ---------------------------------------------------------------------------------------------------------- looks

const per = (n: number) => ({ maxWordsPerCard: n, maxLines: 3, maxCharsPerLine: 32 });

export const DYNAMIC_LOOKS: LookSeed[] = [
  { id: "estate_blend_word", name: "Blended Single Word", description: "One heavy word at a time, ice-light over dark footage, held by a blue halo on bright footage", category: "Real Estate", templateId: "pack_estate_word",
    tags: ["One word", "Blend"], style: {}, settings: per(1) },
  { id: "estate_blend_subline", name: "Blended Word + Slide-In", description: "A big magenta blended word with a white line of words sliding in under it", category: "Real Estate", templateId: "pack_estate_subline",
    tags: ["Blend", "Slide in"], style: {}, settings: per(4) },
  { id: "estate_blend_overlay", name: "Words Across a Gold Word", description: "Words slide one by one across the face of a huge emboldened gold word", category: "Real Estate", templateId: "pack_estate_overlay",
    tags: ["Blend", "Overlay"], style: {}, settings: per(4) },
  { id: "estate_blend_stack", name: "3-Line Neon Finish", description: "A white headline and a bold/thin pair finished by one big neon-green word", category: "Real Estate", templateId: "pack_estate_stack",
    tags: ["3 lines", "Blend"], style: {}, settings: per(5) },
  { id: "dyn_estate_cycle", name: "Rotating Orange Blend", description: "Four compositions in turn, each built around a big orange blended word", category: "Dynamic", templateId: "pack_dyn_estate",
    tags: ["Rotating layouts", "Blend"], style: {}, settings: per(5) },
  { id: "dyn_classic_cycle", name: "Rotating Editorial Stack", description: "Tight white headline blocks, justified pairs and single words, a new layout every card", category: "Dynamic", templateId: "pack_dyn_classic",
    tags: ["Rotating layouts", "Justified"], style: {}, settings: per(5) },
  { id: "dyn_creator_cycle", name: "Rotating Warm Script", description: "A glowing orange gradient headline and white script, a new layout every card", category: "Dynamic", templateId: "pack_dyn_creator",
    tags: ["Rotating layouts", "Gradient", "Script"], style: {}, settings: per(5) },
  { id: "dyn_simple_cycle", name: "Blue Box Wipe Reel", description: "Thin and bold words with a blue box wiping in, a new layout every card", category: "Dynamic", templateId: "pack_dyn_simple",
    tags: ["Rotating layouts", "Box wipe"], style: {}, settings: per(5) },
  { id: "dyn_doctor_cycle", name: "Green Badge Reel", description: "Tall green caps with green and black badges, a new layout every card", category: "Dynamic", templateId: "pack_dyn_doctor",
    tags: ["Badges", "Tall caps"], style: {}, settings: per(5) },
  { id: "dyn_luxe_cycle", name: "Luxe Gradient Hero", description: "Heavy caps, thin italics and a hero word whose gradient changes every card, flickering out", category: "Dynamic", templateId: "pack_dyn_luxe",
    tags: ["Rotating layouts", "Gradient hero", "Flicker"], style: {}, settings: per(5) },
];
