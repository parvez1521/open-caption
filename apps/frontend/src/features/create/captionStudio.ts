/**
 * Caption & Hashtag Studio helpers (3.6): sponsored enforcement, the CTA
 * library, and hashtag-group storage shapes for the content library.
 *
 * Pure module, like templates.ts: no DOM, no storage, no network. Everything
 * here works on GeneratedItem values from ANY source (template engine, local
 * model, cloud) — sponsored wording is the sponsor's exact text, so it is
 * enforced after generation rather than trusted to a generator.
 */
import type { GeneratedItem, SponsoredInput } from "./model";
import type { BrandProfile } from "./brandProfile";

/* ---------------------------------- sponsored ---------------------------------- */

/**
 * Apply sponsored requirements to every item, verbatim:
 *   - each talking point is appended as its own line at the end of `title`,
 *     in the order given;
 *   - the disclosure is appended verbatim as the FINAL line of `title`
 *     (after the talking points, after any profile CTA — the service calls
 *     this last, on the winning source's final items);
 *   - required tags are merged into `hashtags`, deduplicated, existing tags
 *     first, then the required ones in their given order.
 * Pure and total: items are copied, never mutated, and empty sponsored fields
 * simply add nothing.
 */
export function applySponsored(items: GeneratedItem[], sponsored: SponsoredInput): GeneratedItem[] {
  const points = (sponsored.talkingPoints ?? []).filter((p) => typeof p === "string" && p.length > 0);
  const disclosure = typeof sponsored.disclosure === "string" ? sponsored.disclosure : "";
  const required = (sponsored.requiredTags ?? []).filter((t) => typeof t === "string" && t.length > 0);
  return items.map((item) => {
    const lines = [item.title, ...points];
    if (disclosure.length > 0) lines.push(disclosure);
    const merged: string[] = [];
    for (const tag of [...(item.hashtags ?? []), ...required]) {
      if (!merged.includes(tag)) merged.push(tag);
    }
    return {
      ...item,
      title: lines.join("\n"),
      ...(merged.length ? { hashtags: merged } : {}),
    };
  });
}

/* ---------------------------------- CTA library ---------------------------------- */

/** General calls to action written for this product. No outcome promises. */
export const CTA_LIBRARY: string[] = [
  "Follow for more like this.",
  "Save this for later.",
  "Share this with someone who needs it.",
  "Comment with your take below.",
  "Try it today and tell us how it goes.",
  "Watch the next one for part two.",
  "Bookmark this before you scroll on.",
  "Tag a friend who would use this.",
  "Check the link in bio for the full guide.",
  "Turn on notifications so you do not miss the next post.",
  "Reply with a question and we will answer it in a follow-up.",
  "Start with step one today — it takes two minutes.",
  "Send this to your future self.",
];

/**
 * CTA choices for the picker: the active profile's preferred CTAs first (in
 * the profile's order), then the general library, deduplicated.
 */
export function ctaOptions(profile?: BrandProfile | null): string[] {
  const preferred = (profile?.voice?.preferredCtas ?? [])
    .map((cta) => cta.trim())
    .filter((cta) => cta.length > 0);
  const out: string[] = [];
  for (const cta of [...preferred, ...CTA_LIBRARY]) {
    if (!out.includes(cta)) out.push(cta);
  }
  return out;
}

/** Return a copy of `item` with `cta` appended as a new final line of its title. */
export function appendCta(item: GeneratedItem, cta: string): GeneratedItem {
  const line = cta.trim();
  if (!line) return { ...item };
  return { ...item, title: item.title ? `${item.title}\n${line}` : line };
}

/* ---------------------------------- hashtag groups ---------------------------------- */

const cleanTags = (tags: unknown): string[] => {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
};

/**
 * The content-library body for a saved hashtag group (ContentKind
 * "hashtag-group"): just the tags, cleaned and deduplicated.
 */
export function hashtagGroupBody(tags: string[]): { tags: string[] } {
  return { tags: cleanTags(tags) };
}

/** Read tags back out of an untrusted library body. Anything malformed reads as no tags. */
export function tagsFromGroupBody(body: unknown): string[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  return cleanTags((body as Record<string, unknown>).tags);
}

export const MAX_ITEM_TAGS = 30;

/** Merge a tag group onto an item: existing tags first, deduplicated, capped at 30 tags total. */
export function applyTagGroup(item: GeneratedItem, tags: string[]): GeneratedItem {
  const merged = cleanTags([...(item.hashtags ?? []), ...cleanTags(tags)]).slice(0, MAX_ITEM_TAGS);
  return { ...item, hashtags: merged };
}
