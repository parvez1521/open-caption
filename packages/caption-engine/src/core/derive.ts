import type { CaptionDoc, Page, ProjectSettings, Word } from "@capseasy/shared";
import { detectEmotion, pickHeroIndex } from "./hero";

export interface DeriveOptions {
  /**
   * Width of a piece of text in the same unit as `maxLineWidth`. When omitted, characters are counted
   * against `settings.maxCharsPerLine`. Templates inject a real font measurer here.
   */
  measure?: (text: string) => number;
  maxLineWidth?: number;
  /** Extra time (ms) a hold may bridge when gapBehavior is "hold". */
  holdBridgeMs?: number;
}

const SENTENCE_END = /[.!?…。？！।]["')\]”’]*$/;
export const endsSentence = (text: string) => SENTENCE_END.test(text.trim());

/** A word's text as it will be laid out on screen. */
const shown = (w: Word) => w.text.trim();

function lineWidth(words: Word[], o: Required<Pick<DeriveOptions, "maxLineWidth">> & DeriveOptions): number {
  const text = words.map(shown).join(" ");
  return o.measure ? o.measure(text) : text.length;
}

/** Greedy line breaking. Returns lines, never more than `maxLines` unless a single word overflows. */
export function breakLines(words: Word[], settings: ProjectSettings, opts: DeriveOptions = {}): Word[][] {
  const maxLineWidth = opts.maxLineWidth ?? settings.maxCharsPerLine;
  const o = { ...opts, maxLineWidth };
  const lines: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    const next = [...cur, w];
    if (cur.length > 0 && lineWidth(next, o) > maxLineWidth) {
      lines.push(cur);
      cur = [w];
    } else {
      cur = next;
    }
  }
  if (cur.length) lines.push(cur);
  return lines;
}

function fits(words: Word[], settings: ProjectSettings, opts: DeriveOptions): boolean {
  if (words.length > settings.maxWordsPerCard) return false;
  return breakLines(words, settings, opts).length <= settings.maxLines;
}

/** Words the audience actually sees, with the global sync offset applied. */
export function visibleWords(doc: CaptionDoc, settings: ProjectSettings): Word[] {
  const off = settings.syncOffsetMs;
  return doc.words
    .filter((w) => !w.hidden && w.text.trim().length > 0)
    .map((w) => (off ? { ...w, startMs: Math.max(0, w.startMs + off), endMs: Math.max(1, w.endMs + off) } : w));
}

/** Time (ms) an audience needs to read a card of these words. */
export function readMs(words: Word[]): number {
  const chars = words.reduce((n, w) => n + shown(w).length, 0);
  return Math.min(2200, 350 + words.length * 160 + chars * 18);
}

/** share of a card by which every word must have appeared, leaving the rest of the card to read it whole */
const REVEAL_BY = 0.4;
/** a word starts appearing at the latest half-way through the previous word, never later than when it is spoken */
const STEP_MIN_MS = 70;
const STEP_MAX_MS = 220;

/**
 * Reveal schedule for one card: words overlap (the next one starts appearing half-way through the previous) and the
 * whole card has appeared by REVEAL_BY of its duration, so the last word never lands just as the card is replaced.
 * Returns new word objects with `revealMs` set; the active-word highlight still follows startMs (speech).
 */
function withReveal(words: Word[], startMs: number, endMs: number): Word[] {
  const raw: number[] = [];
  words.forEach((w, i) => {
    if (i === 0) return raw.push(startMs);
    const prev = words[i - 1]!;
    const step = Math.min(STEP_MAX_MS, Math.max(STEP_MIN_MS, (prev.endMs - prev.startMs) / 2));
    raw.push(Math.max(startMs, Math.min(w.startMs, raw[i - 1]! + step)));
  });
  const span = raw[raw.length - 1]! - startMs;
  const budget = (endMs - startMs) * REVEAL_BY;
  const k = span > budget && span > 0 ? budget / span : 1;
  return words.map((w, i) => ({ ...w, revealMs: Math.round(startMs + (raw[i]! - startMs) * k) }));
}

/**
 * doc + settings -> non-overlapping pages. Pure and deterministic; memoize at the call site.
 * Order of rules: manual break -> no-break -> sentence end -> pause -> word/line limits -> min duration -> clamp.
 */
export function derivePages(doc: CaptionDoc, settings: ProjectSettings, opts: DeriveOptions = {}): Page[] {
  const words = visibleWords(doc, settings);
  if (words.length === 0) return [];
  const manual = new Set(doc.manualBreaks);
  const noBreak = new Set(doc.noBreakAfter);

  // 1) group
  const groups: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    if (cur.length > 0) {
      const prev = cur[cur.length - 1]!;
      const forced = manual.has(w.id);
      const forbidden = noBreak.has(prev.id);
      const natural = endsSentence(prev.text) || w.startMs - prev.endMs > settings.pauseMs;
      const overflow = !fits([...cur, w], settings, opts);
      // manual split always wins; a user "merge" beats natural/overflow breaks up to a hard cap
      const split = forced || (forbidden ? cur.length >= settings.maxWordsPerCard * 2 : natural || overflow);
      if (split) {
        groups.push(cur);
        cur = [];
      }
    }
    cur.push(w);
  }
  if (cur.length) groups.push(cur);

  // 2) merge too-short groups into a neighbour when they fit and the user did not split there
  const merged: Word[][] = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]!;
    const dur = g[g.length - 1]!.endMs - g[0]!.startMs;
    const prev = merged[merged.length - 1];
    const startsManual = manual.has(g[0]!.id);
    if (dur < settings.minCardMs && prev && !startsManual && !endsSentence(prev[prev.length - 1]!.text)) {
      const gap = g[0]!.startMs - prev[prev.length - 1]!.endMs;
      if (gap <= settings.pauseMs && fits([...prev, ...g], settings, opts)) {
        prev.push(...g);
        continue;
      }
    }
    merged.push(g);
  }

  // 3) build pages with clamped, non-overlapping windows
  const bridge = opts.holdBridgeMs ?? 1500;
  return merged.map((g, i) => {
    const first = g[0]!;
    const last = g[g.length - 1]!;
    const nextStart = merged[i + 1]?.[0]?.startMs;
    let end = Math.max(last.endMs + settings.holdMs, first.startMs + readMs(g));
    if (settings.gapBehavior === "hold" && nextStart != null && nextStart - last.endMs <= bridge) end = Math.max(end, nextStart);
    if (nextStart != null) end = Math.min(end, nextStart);
    end = Math.max(end, Math.min(last.endMs, nextStart ?? last.endMs), first.startMs + 1);

    const meta = doc.cards[first.id];
    const heroIndex = pickHeroIndex(g);
    const shownWords = withReveal(g, first.startMs, end);
    return {
      id: first.id,
      index: i,
      startMs: first.startMs,
      endMs: end,
      words: shownWords,
      lines: breakLines(shownWords, settings, opts),
      heroIndex,
      emotion: meta?.emotion ?? detectEmotion(g.map(shown).join(" ")),
      emotionSource: meta?.emotionSource ?? (meta?.emotion ? undefined : "heuristic"),
      position: meta?.position ?? null,
      styleOverride: (meta?.styleOverride as Record<string, unknown> | null | undefined) ?? null,
    };
  });
}

/** The page on screen at `timeMs` (or null in a gap). Binary search; pages are sorted and disjoint. */
export function pageAt(pages: Page[], timeMs: number): Page | null {
  let lo = 0;
  let hi = pages.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = pages[mid]!;
    if (timeMs < p.startMs) hi = mid - 1;
    else if (timeMs >= p.endMs) lo = mid + 1;
    else return p;
  }
  return null;
}
