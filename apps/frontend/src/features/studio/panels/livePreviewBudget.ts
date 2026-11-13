/**
 * The live-preview slot budget for the whole studio (Phase 4 Run 2, social-preview fix).
 *
 * Both picker preview components — AnimatedTemplatePreview (caption templates) and
 * AnimatedSocialPreview (Social Media graphics, incl. MotionPreview on the /motion pages)
 * — acquire slots from this module, so at most MAX_LIVE_PREVIEWS previews animate at once
 * across the studio no matter which panel (or mix of panels) is on screen. Before this
 * module existed the budget lived inside AnimatedTemplatePreview.tsx; the social previews
 * originally shipped with no preview at all, and giving them a second, private counter would
 * have doubled the worst-case number of simultaneous rAF-driven React renders on a phone tab.
 *
 * Per-kind split (owner bug 2026-11-14: NO caption template preview played at all): the
 * budget used to be ONE shared FIFO pool of 6. The Motion panel (right column) is mounted
 * from the moment the Studio loads, so its social previews took all 6 slots first; the
 * Looks panel mounts only when the user opens Templates, so every look preview queued
 * behind them — and a freed slot always went to the next queued SOCIAL card, so the looks
 * never went live, however far the user scrolled. The split keeps the studio-wide ceiling
 * at 6 (the phone-performance reason for one module still holds) but each kind owns
 * MAX_LIVE_PREVIEWS_PER_KIND slots of it, so neither panel can starve the other: with
 * both panels open, 3 template previews and 3 social previews animate at once.
 *
 * Semantics (unchanged from the original template-preview implementation, now per kind):
 *  - FIFO within a kind: when a kind's budget is exhausted, callers of that kind queue in
 *    arrival order; releasing a slot immediately grants the oldest queued waiter of that kind;
 *  - a queued caller that goes away must cancel its wait so it never receives a stale grant.
 */

export type LivePreviewKind = "template" | "social";

/** Studio-wide ceiling: at most this many previews animate at once, all kinds together. */
export const MAX_LIVE_PREVIEWS = 6;
/** Slots owned by each kind. The two kinds sum to the ceiling, so the total can never exceed it. */
export const MAX_LIVE_PREVIEWS_PER_KIND = 3;

const liveCounts: Record<LivePreviewKind, number> = { template: 0, social: 0 };
const waiters: Record<LivePreviewKind, Array<() => void>> = { template: [], social: [] };

/** Try to take a live slot of `kind`. Returns true (slot held) or queues `grant` and returns false. */
export function acquireLivePreviewSlot(kind: LivePreviewKind, grant: () => void): boolean {
  if (liveCounts[kind] < MAX_LIVE_PREVIEWS_PER_KIND) {
    liveCounts[kind] += 1;
    return true;
  }
  waiters[kind].push(grant);
  return false;
}

/** Give a held slot of `kind` back; the oldest queued waiter of that kind (if any) is granted immediately. */
export function releaseLivePreviewSlot(kind: LivePreviewKind): void {
  liveCounts[kind] = Math.max(0, liveCounts[kind] - 1);
  while (liveCounts[kind] < MAX_LIVE_PREVIEWS_PER_KIND && waiters[kind].length > 0) {
    const next = waiters[kind].shift()!;
    liveCounts[kind] += 1;
    next();
  }
}

/** Remove a still-queued waiter of `kind` (its card left the viewport or unmounted before being granted). */
export function cancelLivePreviewWait(kind: LivePreviewKind, grant: () => void): void {
  const i = waiters[kind].indexOf(grant);
  if (i >= 0) waiters[kind].splice(i, 1);
}

/**
 * How many previews are live right now. With no `kind` this is the studio-wide total
 * (still capped at MAX_LIVE_PREVIEWS); with a kind, that kind's live count.
 */
export function livePreviewCount(kind?: LivePreviewKind): number {
  return kind ? liveCounts[kind] : liveCounts.template + liveCounts.social;
}

/** How many callers are queued for a slot right now (total, or one kind's queue). */
export function livePreviewWaiterCount(kind?: LivePreviewKind): number {
  return kind ? waiters[kind].length : waiters.template.length + waiters.social.length;
}
