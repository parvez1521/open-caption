/**
 * Shared plumbing for the Trending looks (./trending.tsx): card ordinals, the "solo keyword" card split, automatic
 * keyword picking, a deterministic idle wiggle, and the centred frame. The looks re-create caption styles catalogued
 * in docs/research/competitors-captions.md from their published parameters (fonts, colours, frame-based motion at
 * 30 fps converted to ms). Everything is a pure function of `timeMs` (export rules: see ./kit.ts).
 */
import React from "react";
import type { CaptionStyleV2, Page, Word } from "@capseasy/shared";
import { combineMotion, exitStyle, showAt } from "../motion";
import { containerCss } from "../text";
import type { PageRenderProps, TemplateCapabilities } from "../types";
import { keyWordIndex, rand } from "./kit";
import { alphaMul } from "./lines-engine";

/** one frame of the 30 fps timelines the catalogue's motion was authored in */
export const FRAME = 1000 / 30;
export const fr = (n: number) => n * FRAME;

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The card's position in the video. Unknown (a lone preview card) counts as the first card, so previews and
 * single-card renders always show a look's regular card, never a variant.
 */
export const ord = (page: Page) => page.index ?? 0;

export const opt = <T,>(style: CaptionStyleV2, key: string, fallback: T): T => {
  const v = style.templateOptions[key];
  return (v === undefined || v === null ? fallback : v) as T;
};

/** capabilities of a Trending layout: its own motion (no generic card entrance), only what the layout honours */
export const trendCaps = (over: Partial<TemplateCapabilities>): TemplateCapabilities => ({
  hero: false, alignment: false, stagger: false, accentPeriod: false, weight: true, color: true, background: false, emoji: false,
  activeEffects: ["none"], entrances: ["none"], ...over,
});

// ------------------------------------------------------------------------------------------------ lines

/** split words into `n` lines of balanced character length (keeps order) */
export function balancedLines(words: Word[], n: number): Word[][] {
  if (n <= 1 || words.length < 2) return [words];
  const len = (ws: Word[]) => ws.reduce((a, w) => a + w.text.length, 0) + Math.max(0, ws.length - 1);
  if (n === 2) {
    let best = 1;
    let score = Infinity;
    for (let i = 1; i < words.length; i++) {
      const s = Math.abs(len(words.slice(0, i)) - len(words.slice(i)));
      if (s < score) { score = s; best = i; }
    }
    return [words.slice(0, best), words.slice(best)];
  }
  const per = Math.ceil(words.length / n);
  const out: Word[][] = [];
  for (let i = 0; i < words.length; i += per) out.push(words.slice(i, i + per));
  return out;
}

/** the card's lines; a single line of `minWords`+ words is split in two when the look always shows two lines */
export const linesOf = (page: Page, forceTwo = false, minWords = 2): Word[][] => {
  const lines = page.lines.filter((l) => l.length > 0);
  if (forceTwo && lines.length === 1 && lines[0]!.length >= minWords) return balancedLines(lines[0]!, 2);
  return lines.length ? lines : [page.words];
};

// ------------------------------------------------------------------------------------------------ solo keyword cards

export interface Segment {
  page: Page;
  solo: boolean;
}

/**
 * "Solo keyword" cards: every `every`-th card (ordinals every-1, 2·every-1, …) gives its key word a card of its own.
 * The competitor's chunker cuts that word out into a one-word card; a layout here draws one derived card, so it does
 * the same split in time: the words before the key word show as a regular card, the key word alone while it is
 * spoken, then the words after it. No word is ever dropped.
 */
export function soloSegments(page: Page, every: number): Segment[] {
  if (every <= 0 || ord(page) % every !== every - 1 || page.words.length === 0) return [{ page, solo: false }];
  const ws = page.words;
  const k = keyWordIndex(page);
  // cut at speech times (the reveal schedule runs ahead of speech; the competitor cuts its cards by speech)
  const keyStart = k === 0 ? page.startMs : Math.max(page.startMs, Math.min(page.endMs, ws[k]!.startMs));
  const afterStart = k >= ws.length - 1 ? page.endMs : Math.max(keyStart, Math.min(page.endMs, ws[k + 1]!.startMs));
  const sub = (words: Word[], startMs: number, endMs: number, tag: string): Page => {
    const ids = new Set(words.map((w) => w.id));
    const lines = page.lines.map((l) => l.filter((w) => ids.has(w.id))).filter((l) => l.length > 0);
    return { ...page, id: `${page.id}~${tag}`, words, lines: lines.length ? lines : [words], startMs, endMs, heroIndex: 0 };
  };
  // (a key word that shares the card's start time with the words before it can't be cut out: the card stays whole)
  if (k > 0 && keyStart <= page.startMs) return [{ page, solo: false }];
  const out: Segment[] = [];
  if (k > 0) out.push({ page: sub(ws.slice(0, k), page.startMs, keyStart, "a"), solo: false });
  out.push({ page: sub([ws[k]!], keyStart, afterStart, "k"), solo: true });
  if (k < ws.length - 1 && afterStart < page.endMs) out.push({ page: sub(ws.slice(k + 1), afterStart, page.endMs, "b"), solo: false });
  return out;
}

/** the segment on screen at `timeMs` */
export const segmentAt = (segs: Segment[], timeMs: number): Segment => segs.find((s) => timeMs < s.page.endMs) ?? segs[segs.length - 1]!;

// ------------------------------------------------------------------------------------------------ keywords

const STOP = new Set([
  "the", "a", "an", "is", "are", "was", "were", "of", "to", "and", "in", "on", "at", "it", "this", "that", "i", "you", "he", "she",
  "we", "they", "but", "or", "so", "be", "as", "for", "with", "my", "your", "do", "does", "did", "its", "im", "just", "if", "then",
  "than", "have", "has", "had", "not", "can", "will", "what", "when", "how", "all", "our", "their", "them", "me", "us", "from",
]);
const clean = (t: string) => t.replace(/[^\p{L}\p{N}]/gu, "");

/**
 * The card's keywords (page.words indices, in reading order). Words the creator (or the AI pass) marked as emphasis
 * always count. Otherwise ~1 word in `perWords` across the video is picked: the card's budget is the share of a
 * running count, and the strongest words win (the engine's key word first, then long, non-stop words, numbers).
 */
export function keywords(page: Page, perWords = 3): number[] {
  const marked = page.words.map((w, i) => (w.emphasis === "hero" || w.emphasis === "strong" ? i : -1)).filter((i) => i >= 0);
  if (marked.length) return marked;
  const n = page.words.length;
  const o = ord(page);
  const budget = Math.floor(((o + 1) * n) / perWords) - Math.floor((o * n) / perWords);
  if (budget <= 0) return [];
  const scored = page.words.map((w, i) => {
    const c = clean(w.text);
    let s = c.length;
    if (!c || STOP.has(c.toLowerCase())) s -= 100;
    if (/\d/.test(c)) s += 3;
    if (i === page.heroIndex) s += 4;
    return { i, s };
  });
  return scored.filter((x) => x.s > 2).sort((a, b) => b.s - a.s).slice(0, budget).map((x) => x.i).sort((a, b) => a - b);
}

/** running keyword count before this card (so a 3-colour palette keeps cycling from card to card) */
export const keywordOffset = (page: Page, perWords = 3) => Math.floor((ord(page) * page.words.length) / perWords);

// ------------------------------------------------------------------------------------------------ idle motion

/**
 * Deterministic wiggle on one axis: a value-noise walk (one random target per 1/freq s, cosine-eased between them,
 * starting from 0) of amplitude `amp`. Same seed + time → same offset on every renderer.
 */
export function wiggle(tSec: number, freqHz: number, amp: number, seed: number): number {
  if (freqHz <= 0 || tSec <= 0) return 0;
  const e = tSec * freqHz;
  const r = Math.floor(e);
  const s = (1 - Math.cos(Math.PI * (e - r))) / 2;
  const at = (k: number) => (k === 0 ? 0 : rand(seed, k) * 2 - 1);
  const a = at(r);
  return amp * (a + (at(r + 1) - a) * s);
}

// ------------------------------------------------------------------------------------------------ paint helpers

/** the style's drop shadows as text-shadow layers, scaled with the fitted text (`ratio` = rendered / reference size) */
export const shadowsAt = (style: CaptionStyleV2, sc: number, ratio = 1) =>
  style.shadows.map((s) => `${(s.x * sc * ratio).toFixed(2)}px ${(s.y * sc * ratio).toFixed(2)}px ${(s.blur * sc * ratio).toFixed(2)}px ${s.color}`);

/** the standard two-layer glow */
export function glowAt(style: CaptionStyleV2, sc: number): string[] {
  if (!style.glow.enabled) return [];
  const r = style.glow.radius * sc;
  return [`0 0 ${r.toFixed(2)}px ${alphaMul(style.glow.color, style.glow.intensity)}`, `0 0 ${(r * 2).toFixed(2)}px ${alphaMul(style.glow.color, style.glow.intensity * 0.6)}`];
}

export const joinLayers = (layers: string[]) => (layers.length ? layers.join(", ") : "none");

/** the style's box (background control) as a colour + corner radius in px for text of `size` px; null when off */
export function boxOf(style: CaptionStyleV2, size: number, defaultPadding = 16): { color: string; radius: number; pad: number; blur?: string } | null {
  const b = style.background;
  if (b.type === "none") return null;
  return {
    color: alphaMul(b.color, b.opacity),
    radius: b.type === "pill" ? 9999 : (b.radius / style.fontSize) * size,
    pad: b.padding / defaultPadding,
    ...(b.blur > 0 ? { blur: `blur(${(b.blur * (size / style.fontSize)).toFixed(2)}px)` } : {}),
  };
}

// ------------------------------------------------------------------------------------------------ frame

/**
 * The centred caption block: the outer container keeps translate(-50%, -50%) (+ the style's rotation) first; the inner
 * column carries the look's own card motion, chained with the exit the creator picks.
 */
export const TFrame: React.FC<{
  p: PageRenderProps;
  box: { width: number; cx: number; cy: number };
  size: number;
  motion?: React.CSSProperties;
  inner?: React.CSSProperties;
  align?: React.CSSProperties["alignItems"];
  children: React.ReactNode;
}> = ({ p, box, size, motion, inner, align = "center", children }) => {
  const { page, timeMs, style, settled } = p;
  return (
    <div style={containerCss(box, style.rotation)}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: align, position: "relative", ...inner, ...combineMotion(motion ?? {}, exitStyle(style, page.endMs - timeMs, settled, size)) }}>
        {children}
      </div>
    </div>
  );
};

/** opacity of a word that appears at its spoken time over `durMs` with `ease` (settled → shown) */
export function showOpacity(w: Word, timeMs: number, durMs: number, ease: (t: number) => number, settled?: boolean): number {
  if (settled) return 1;
  const t0 = showAt(w);
  if (timeMs < t0) return 0;
  return durMs <= 0 ? 1 : ease(clamp01((timeMs - t0) / durMs));
}
