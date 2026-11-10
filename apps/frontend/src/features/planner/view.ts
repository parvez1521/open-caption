/**
 * Content Planner — page view helpers (Phase 7, slice 7.1 UI), pure.
 *
 * The small string/grouping logic the /planner page needs that is not part
 * of the W1 core model (model.ts / dates.ts): hashtag input parsing and
 * formatting, grouping cards by day, and counting weekly-plan imports.
 * Everything here is deterministic and side-effect free so it can be
 * unit-tested without the page.
 */
import type { PlannerCardBody } from "./model";

/** One stored planner card as the page holds it: library id + title + parsed body. */
export interface PlannerCard {
  id: string;
  title: string;
  body: PlannerCardBody;
}

// ---------------------------------------------------------------------------
// Hashtags input
// ---------------------------------------------------------------------------

/**
 * Parse the hashtags text input into stored tags.
 *
 * Storage convention: tags are stored WITHOUT a leading '#' (the model and
 * buildPostPreview/buildCopyPack join them as-is). The input field shows
 * them the same way — as typed, minus any '#'. Splitting accepts commas
 * and/or whitespace as separators, strips one leading '#' per token, trims,
 * drops empties, and dedupes preserving first-seen order.
 */
export function parseHashtagsInput(s: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of s.split(/[\s,]+/)) {
    const tag = raw.trim().replace(/^#/, "");
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

/**
 * Format stored tags for the text input: the raw tags (no '#') joined with
 * ", " — the mirror of parseHashtagsInput, so an untouched field round-trips.
 */
export function formatHashtagsInput(tags: string[]): string {
  return tags.join(", ");
}

// ---------------------------------------------------------------------------
// Day grouping / ordering
// ---------------------------------------------------------------------------

/**
 * Order cards within one day: untimed cards first, then by time ascending,
 * then by title. (An absent time sorts as "" which is before any "HH:MM"
 * string, and that is exactly the pinned convention: untimed first.)
 * Returns a new array; the input is not mutated.
 */
export function sortCardsForDay(cards: PlannerCard[]): PlannerCard[] {
  return [...cards].sort((a, b) => {
    const aTime = a.body.time ?? "";
    const bTime = b.body.time ?? "";
    if (aTime !== bTime) return aTime < bTime ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Group cards by their local date (YYYY-MM-DD). Keys are in chronological
 * order (lexicographic order is chronological for this format — see
 * dates.ts), and each day's cards are ordered with sortCardsForDay.
 */
export function cardsByDate(cards: PlannerCard[]): Map<string, PlannerCard[]> {
  const grouped = new Map<string, PlannerCard[]>();
  for (const card of cards) {
    const list = grouped.get(card.body.date);
    if (list) list.push(card);
    else grouped.set(card.body.date, [card]);
  }
  const sorted = new Map<string, PlannerCard[]>();
  for (const date of [...grouped.keys()].sort()) {
    sorted.set(date, sortCardsForDay(grouped.get(date)!));
  }
  return sorted;
}

/** How many cards were imported from the given weekly-plan library item. */
export function countImportedFrom(cards: PlannerCard[], planItemId: string): number {
  return cards.filter((card) => card.body.sourcePlanId === planItemId).length;
}
