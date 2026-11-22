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
 *  - nearest-first within a kind: when a kind's budget is exhausted, callers of that
 *    kind queue; releasing a slot immediately grants the geometrically NEAREST queued
 *    waiter of that kind (FIFO only breaks ties) — the oldest waiter is usually a
 *    stale card that already scrolled away, and granting it first just churns
 *    declines while visible cards wait;
 *  - visible-only drain: a slot is offered only to a waiter actually in the viewport
 *    (distance 0). If even the nearest waiter is outside it, the slot stays free
 *    for a visible card's immediate-acquire path and every waiter stays queued for
 *    a later drain — offering the slot now would park it on an off-screen card;
 *  - a queued caller that goes away must cancel its wait so it never receives a stale grant.
 *
 * Decline (frozen-preview fix): a grant may be DECLINED. The live failure on /looks was that
 * slots were offered to cards that had already scrolled away (their exit signal never
 * arrived), so a live slot sat parked on an off-screen card while visible cards queued
 * forever. A grant callback returns false when the card is no longer actually in the
 * viewport (checked against its real rect at grant time — see livePreviewVisibility.ts);
 * the drain then offers the slot to the next waiter instead of counting the declined
 * grant as a held slot.
 *
 * Periodic drain (fix v2): the interval in livePreviewVisibility.ts also calls
 * drainFreePreviewSlots after each revalidation, so a card that scrolled into view
 * while a slot sat free does not wait for the next release to be granted.
 */

export type LivePreviewKind = "template" | "social";

/** Studio-wide ceiling: at most this many previews animate at once, all kinds together. */
export const MAX_LIVE_PREVIEWS = 6;
/** Slots owned by each kind. The two kinds sum to the ceiling, so the total can never exceed it. */
export const MAX_LIVE_PREVIEWS_PER_KIND = 3;

/**
 * A grant callback: invoked when a slot of the caller's kind is offered. Return true to
 * accept it (the slot is then held until the caller releases it) or false to decline it
 * (the caller no longer wants it — e.g. it already scrolled away). A throwing grant is
 * treated as a decline, so one broken waiter can never wedge the drain.
 */
export type LivePreviewGrant = () => boolean;

/**
 * A waiter's distance from the viewport in pixels: 0 when any part of the caller's box
 * is actually visible, the gap to the nearest viewport edge otherwise. The budget never
 * measures geometry itself — the caller supplies this (see viewportDistancePx in
 * livePreviewVisibility.ts). A waiter with no distance counts as 0, so callers that do
 * not measure geometry keep the v1 behaviour (FIFO among themselves, always offered).
 */
export type LivePreviewDistance = () => number;

interface LivePreviewWaiter {
  grant: LivePreviewGrant;
  distance?: LivePreviewDistance;
}

const liveCounts: Record<LivePreviewKind, number> = { template: 0, social: 0 };
const waiters: Record<LivePreviewKind, Array<LivePreviewWaiter>> = { template: [], social: [] };

/** Pixels from the viewport for a waiter; 0 = actually visible (or unknown — no distance given). */
function waiterDistance(waiter: LivePreviewWaiter): number {
  if (!waiter.distance) return 0;
  try {
    const d = waiter.distance();
    return Number.isFinite(d) ? Math.max(0, d) : 0;
  } catch {
    // A broken distance must never wedge the drain: treat it as visible and let the
    // grant itself decide (it can still decline).
    return 0;
  }
}

/** The geometrically nearest waiter of a kind, with its distance; earliest wins ties (FIFO). */
function nearestWaiter(kind: LivePreviewKind): { index: number; distance: number } {
  let index = -1;
  let distance = Infinity;
  for (let i = 0; i < waiters[kind].length; i++) {
    const d = waiterDistance(waiters[kind][i]!);
    if (d < distance) {
      distance = d;
      index = i;
    }
  }
  return { index, distance };
}

/**
 * Offer free slots to queued waiters, nearest first; a declined grant does not consume
 * the slot. If even the nearest waiter is outside the viewport, stop and leave the
 * slot free — a visible card can take it on its immediate-acquire path, and the
 * waiters stay queued for a later drain instead of being dropped by a decline.
 */
function drainWaiters(kind: LivePreviewKind): void {
  while (liveCounts[kind] < MAX_LIVE_PREVIEWS_PER_KIND && waiters[kind].length > 0) {
    const nearest = nearestWaiter(kind);
    if (nearest.index < 0 || nearest.distance > 0) break;
    const waiter = waiters[kind].splice(nearest.index, 1)[0]!;
    liveCounts[kind] += 1;
    let accepted = false;
    try {
      accepted = waiter.grant();
    } catch {
      accepted = false;
    }
    if (!accepted) liveCounts[kind] -= 1;
  }
}

/** Try to take a live slot of `kind`. Returns true (slot held) or queues `grant` and returns false. */
export function acquireLivePreviewSlot(
  kind: LivePreviewKind,
  grant: LivePreviewGrant,
  distance?: LivePreviewDistance,
): boolean {
  if (liveCounts[kind] < MAX_LIVE_PREVIEWS_PER_KIND) {
    liveCounts[kind] += 1;
    return true;
  }
  waiters[kind].push({ grant, distance });
  return false;
}

/**
 * Queue a grant WITHOUT granting it even if a slot is free right now. For a card in
 * the 240px queueing margin whose strict grant declines on the immediate-acquire
 * path: it must wait for a later drain (when it is actually visible) instead of
 * dropping the wait — its `near` is already true, so no later flip would re-run its
 * acquire effect. The periodic drain grants it once it is visible.
 */
export function queueLivePreviewWait(
  kind: LivePreviewKind,
  grant: LivePreviewGrant,
  distance?: LivePreviewDistance,
): void {
  waiters[kind].push({ grant, distance });
}

/** Give a held slot of `kind` back; the nearest queued waiter of that kind (if any) is granted immediately. */
export function releaseLivePreviewSlot(kind: LivePreviewKind): void {
  liveCounts[kind] = Math.max(0, liveCounts[kind] - 1);
  drainWaiters(kind);
}

/**
 * Grant any currently free slots to queued waiters (nearest visible first). Called by
 * the periodic revalidation after it corrects `near`, so a waiter that became visible
 * while a slot sat free does not wait for the next release.
 */
export function drainFreePreviewSlots(kind?: LivePreviewKind): void {
  if (kind) {
    drainWaiters(kind);
    return;
  }
  drainWaiters("template");
  drainWaiters("social");
}

/** Remove a still-queued waiter of `kind` (its card left the viewport or unmounted before being granted). */
export function cancelLivePreviewWait(kind: LivePreviewKind, grant: LivePreviewGrant): void {
  const i = waiters[kind].findIndex((w) => w.grant === grant);
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
