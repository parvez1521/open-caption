/**
 * The ONE live-preview slot budget for the whole studio (Phase 4 Run 2, social-preview fix).
 *
 * Both picker preview components — AnimatedTemplatePreview (caption templates) and
 * AnimatedSocialPreview (Social Media graphics) — acquire slots from this module, so at most
 * MAX_LIVE_PREVIEWS previews animate at once across the studio no matter which panel (or mix of
 * panels) is on screen. Before this module existed the budget lived inside
 * AnimatedTemplatePreview.tsx; the social previews originally shipped with no preview at all, and
 * giving them a second, private counter would have doubled the worst-case number of simultaneous
 * rAF-driven React renders on a phone tab.
 *
 * Semantics (unchanged from the original template-preview implementation):
 *  - FIFO: when the budget is exhausted, callers queue in arrival order;
 *  - releasing a slot immediately grants the oldest queued waiter;
 *  - a queued caller that goes away must cancel its wait so it never receives a stale grant.
 */

export const MAX_LIVE_PREVIEWS = 6;

let liveCount = 0;
const waiters: Array<() => void> = [];

/** Try to take a live slot. Returns true (slot held) or queues `grant` and returns false. */
export function acquireLivePreviewSlot(grant: () => void): boolean {
  if (liveCount < MAX_LIVE_PREVIEWS) {
    liveCount += 1;
    return true;
  }
  waiters.push(grant);
  return false;
}

/** Give a held slot back; the oldest queued waiter (if any) is granted immediately. */
export function releaseLivePreviewSlot(): void {
  liveCount = Math.max(0, liveCount - 1);
  while (liveCount < MAX_LIVE_PREVIEWS && waiters.length > 0) {
    const next = waiters.shift()!;
    liveCount += 1;
    next();
  }
}

/** Remove a still-queued waiter (its card left the viewport or unmounted before being granted). */
export function cancelLivePreviewWait(grant: () => void): void {
  const i = waiters.indexOf(grant);
  if (i >= 0) waiters.splice(i, 1);
}

/** How many previews are live right now (test/diagnostic readout of the single counter). */
export function livePreviewCount(): number {
  return liveCount;
}

/** How many callers are queued for a slot right now (test/diagnostic readout). */
export function livePreviewWaiterCount(): number {
  return waiters.length;
}
