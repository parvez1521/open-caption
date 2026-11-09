import type { Page } from "@capseasy/shared";

/**
 * Split-at-playhead (pure logic): which word should start a new caption card when the user splits
 * at the playhead? The split itself is the caption-engine's `splitCardAt` (a manualBreaks entry),
 * applied through `edit()` by the caller — this helper only finds the word, so it can be unit-tested
 * and so the UI can disable the control honestly when there is nothing to split.
 *
 * Rule: inside the page (card) that contains the playhead, split at the first word that starts at
 * or after the playhead. Returns null — no split — when:
 *  - the playhead is not inside any page (before the first card, in a gap, past the end);
 *  - the page has a single word (nothing to split off);
 *  - the first word at/after the playhead is the page's FIRST word (it already starts the card —
 *    splitting there would be a no-op) — this also covers a playhead sitting in the page's lead-in;
 *  - every word starts before the playhead (playhead inside the last word): no word at/after it.
 */
export function splitWordIdAtPlayhead(pages: readonly Page[], playheadMs: number): string | null {
  if (!Number.isFinite(playheadMs) || playheadMs < 0) return null;
  const page = pages.find((p) => p.words.length > 0 && playheadMs >= p.startMs && playheadMs < p.endMs);
  if (!page || page.words.length < 2) return null;
  const idx = page.words.findIndex((w) => w.startMs >= playheadMs);
  if (idx <= 0) return null;
  return page.words[idx]!.id;
}

export function canSplitAtPlayhead(pages: readonly Page[], playheadMs: number): boolean {
  return splitWordIdAtPlayhead(pages, playheadMs) !== null;
}
