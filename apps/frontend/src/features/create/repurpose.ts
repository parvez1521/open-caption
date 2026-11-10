/**
 * Repurposing (3.7): deterministic structural transforms of the user's OWN text.
 *
 * Meaning preservation is the contract of the template path: the output text is
 * composed of substrings of the source (whole units, or a unit's first sentence
 * where the transform says so) plus part labels — and, only where a transform
 * names it, the active profile's preferred CTA, which is also the user's own
 * saved wording. Nothing is paraphrased, summarised or invented here.
 *
 * For the same reason the template path does NOT apply the Brand Voice
 * avoid-word filter: dropping or replacing the user's own words would change
 * the meaning of their text. The model path carries the AVOID instruction in
 * its prompt instead (prompts.ts / brandProfile.profilePromptBlock).
 *
 * Pure module: no DOM, no storage, no network. Empty or whitespace-only source
 * returns [] — the page must require source text; this module invents nothing
 * to fill an empty batch.
 */
import type { GeneratedItem, RepurposeTransform } from "./model";
import type { BrandProfile } from "./brandProfile";

export interface RepurposeInput {
  transform: RepurposeTransform;
  sourceText: string;
  profile?: BrandProfile | null;
}

export const X_POST_LIMIT = 270;

/* ---------------------------------- splitting ---------------------------------- */

/** Split text into sentences, keeping the terminal punctuation on each one. */
export function splitSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+["'”’)]?|[^.!?]+$/g) ?? [];
  return matches.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Split source text into units: lines first (script-like input, one unit per
 * non-empty line); a single unbroken block falls back to sentences.
 */
export function splitUnits(sourceText: string): string[] {
  const lines = (sourceText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length >= 2) return lines;
  if (lines.length === 1) {
    const sentences = splitSentences(lines[0]!);
    return sentences.length ? sentences : lines;
  }
  return [];
}

const firstSentence = (unit: string): string => splitSentences(unit)[0] ?? unit;

const profileCta = (profile?: BrandProfile | null): string | null => {
  const ctas = (profile?.voice?.preferredCtas ?? []).map((c) => c.trim()).filter((c) => c.length > 0);
  return ctas[0] ?? null;
};

/* ---------------------------------- part labels ---------------------------------- */

const pad2 = (n: number): string => String(Math.floor(Math.abs(n))).padStart(2, "0");
const clock = (sec: number): string => `${Math.floor(sec / 60)}:${pad2(sec % 60)}`;

const carouselRole = (i: number, n: number): string => (i === 0 ? "Hook" : i === n - 1 ? "CTA" : "Point");

/**
 * The `detail` label for part `i` of `n` in a transform. Shared by the template
 * generator below and by prompts.parseModelOutput, so a batch carries the same
 * labels whichever source wrote it.
 */
export function repurposePartLabel(transform: RepurposeTransform, i: number, n: number): string {
  const total = Math.max(1, n);
  const index = Math.min(Math.max(0, i), total - 1);
  switch (transform) {
    case "script-to-x-thread":
      return `Post ${index + 1} of ${total}`;
    case "script-to-carousel":
      return `Slide ${index + 1} of ${total} · ${carouselRole(index, total)}`;
    case "script-to-linkedin":
      return "LinkedIn post — your words, restructured: hook first, short paragraphs";
    case "long-to-shorts":
      return "Short concept — film this part on its own (20–40 seconds), opening with its first line";
    case "reel-to-short": {
      if (index === 0) return "0–3s · Hook";
      if (index === total - 1) return "0:27–0:30 · CTA / payoff";
      // Middle beats share the 3–27s window of the 30s template split evenly.
      const middles = total - 2;
      const start = 3 + Math.floor(((index - 1) * 24) / middles);
      const end = 3 + Math.floor((index * 24) / middles);
      return `${clock(start)}–${clock(end)} · Beat`;
    }
  }
}

/* ---------------------------------- transforms ---------------------------------- */

/** Hard-split one oversized unit at word boundaries into chunks of at most `limit` characters. */
function hardSplit(unit: string, limit: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const word of unit.split(/\s+/)) {
    if (word.length > limit) {
      if (current) chunks.push(current);
      current = "";
      for (let at = 0; at < word.length; at += limit) chunks.push(word.slice(at, at + limit));
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > limit) {
      chunks.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function toXThread(input: RepurposeInput, units: string[]): GeneratedItem[] {
  const titles: string[] = [];
  // First post is the hook: the first unit, on its own (split only if it alone is too long).
  const [first, ...rest] = units;
  titles.push(...hardSplit(first!, X_POST_LIMIT));
  // Remaining units pack greedily; a unit is never split unless it alone exceeds the limit.
  let current = "";
  const flush = () => {
    if (current) titles.push(current);
    current = "";
  };
  for (const unit of rest) {
    if (unit.length > X_POST_LIMIT) {
      flush();
      titles.push(...hardSplit(unit, X_POST_LIMIT));
      continue;
    }
    const next = current ? `${current} ${unit}` : unit;
    if (next.length > X_POST_LIMIT) {
      flush();
      current = unit;
    } else {
      current = next;
    }
  }
  flush();
  // The only added text in any repurposing transform: the profile's own CTA, as a final post.
  const cta = profileCta(input.profile);
  const total = titles.length + (cta ? 1 : 0);
  const items = titles.map((title, i) => ({ title, detail: repurposePartLabel("script-to-x-thread", i, total) }));
  if (cta) items.push({ title: cta, detail: `Post ${total} of ${total} · CTA` });
  return items;
}

function toCarousel(units: string[]): GeneratedItem[] {
  const MAX_SLIDES = 10;
  const slides =
    units.length <= MAX_SLIDES
      ? [...units]
      : [...units.slice(0, MAX_SLIDES - 1), units.slice(MAX_SLIDES - 1).join(" ")];
  return slides.map((title, i) => ({
    title,
    detail: repurposePartLabel("script-to-carousel", i, slides.length),
  }));
}

function toLinkedin(input: RepurposeInput, units: string[]): GeneratedItem[] {
  const [first, ...rest] = units;
  const parts = [first!];
  if (rest.length) parts.push(rest.join("\n\n"));
  const cta = profileCta(input.profile);
  // No invented CTA: without a profile CTA the post is purely the user's text, restructured.
  if (cta) parts.push(cta);
  return [{ title: parts.join("\n\n"), detail: repurposePartLabel("script-to-linkedin", 0, 1) }];
}

function toShortOutline(units: string[]): GeneratedItem[] {
  if (units.length === 1) {
    return [{ title: units[0]!, detail: repurposePartLabel("reel-to-short", 0, 1) }];
  }
  const middles = units.slice(1, -1);
  const middleTitles =
    middles.length <= 3
      ? middles
      : [...middles.slice(0, 2), middles.slice(2).join(" ")];
  const titles = [units[0]!, ...middleTitles, units[units.length - 1]!];
  return titles.map((title, i) => ({
    title,
    detail: repurposePartLabel("reel-to-short", i, titles.length),
  }));
}

function toShortConcepts(units: string[]): GeneratedItem[] {
  const MAX = 6;
  const kept =
    units.length <= MAX ? [...units] : [...units.slice(0, MAX - 1), units.slice(MAX - 1).join(" ")];
  return kept.map((unit, i) => ({
    title: firstSentence(unit),
    detail: repurposePartLabel("long-to-shorts", i, kept.length),
  }));
}

/** Run one deterministic repurposing transform. Empty source returns []. */
export function generateRepurposed(input: RepurposeInput): GeneratedItem[] {
  const units = splitUnits(input.sourceText ?? "");
  if (!units.length) return [];
  switch (input.transform) {
    case "script-to-x-thread":
      return toXThread(input, units);
    case "script-to-carousel":
      return toCarousel(units);
    case "script-to-linkedin":
      return toLinkedin(input, units);
    case "reel-to-short":
      return toShortOutline(units);
    case "long-to-shorts":
      return toShortConcepts(units);
  }
}
