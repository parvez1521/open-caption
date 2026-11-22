/**
 * Geometry-based visibility safety net for live previews (frozen-preview fix).
 *
 * The previews' primary visibility signal is IntersectionObserver (240px root margin), and
 * the slot lifecycle in the preview components keys off it. On the live site that signal
 * proved unreliable under real scrolling: on /looks the first cards kept their slots
 * forever while cards scrolled into view never went live, even though the same slot logic
 * passes every mocked-IO test. So liveness must ALSO follow the card's real geometry:
 *
 *  - `isNearViewport` answers "is this element in or near the viewport right now?" from
 *    getBoundingClientRect, with the same 240px margin the observers use;
 *  - `isVisibleInViewport` answers the stricter "is any part of it ACTUALLY visible?"
 *    (0px margin) — a freed slot goes only to a card the user can see, never to one
 *    parked in the queueing margin;
 *  - `viewportDistancePx` is the gap from the viewport edge in pixels (0 when visible),
 *    so the slot budget can grant the NEAREST waiter instead of the oldest;
 *  - every preview registers its box here; ONE shared, rAF-throttled scroll/resize sweep
 *    (a single window listener, capture phase so inner scroll containers are covered too)
 *    recomputes each registered card's geometry and corrects its `near` state when the
 *    geometry disagrees with it. Scroll is exactly when visibility changes, so a sweep
 *    on scroll is what re-assigns slots to the cards actually in view — even if no IO
 *    exit ever arrives for the cards that scrolled away.
 *  - v2: the sweep is NOT scroll-only any more. The live failure of v1 was that scroll
 *    events evidently rarely reach the listener, so a scroll-driven sweep alone never
 *    reassigns. A ~1s interval revalidates every registered card AND drains any free
 *    slot to a visible waiter while any preview is registered; a sweep is also run
 *    on visibilitychange back to visible (background tabs throttle rAF/timers).
 *    (A sweep on registration was tried and dropped: it fires with unlaid-out rects
 *    at mount and marks every card near before the observer ever reports.)
 *  - v3: the slot lifecycle keys on ACTUAL visibility (`visible`, 0px margin), not
 *    `near` (240px). v2 proved the interval moves slots, but holders kept theirs
 *    while parked in the 240px margin just off-screen, so all 3 slots could sit
 *    invisible while in-view cards queued. `visible` is set from the live rect in
 *    two places that must agree: the observer callback (immediate — an in-view card
 *    goes live on enter with no 1s wait) and this sweep (corrective — it fixes
 *    `visible` within ~1s when the observer exit never arrives, the live failure
 *    mode). `near` keeps its 240px margin for preload only (fonts) and never holds
 *    a slot. No hysteresis: a card crossing the viewport edge is a genuine state
 *    change (scrolling is monotonic there), and re-entering restarts the animation
 *    — the desired behaviour, not thrash.
 *  - the listeners and the interval attach on first registration and detach/clear when
 *    the registry empties, so pages without live previews pay nothing; the sweep only
 *    calls setNear/setVisible when a card's computed visibility actually changed.
 *
 * Zero-size rects (an element not laid out yet, or jsdom in tests, where every rect is
 * 0x0 at the origin) count as near/visible with distance 0: a real preview box always
 * has size once laid out, and treating an unlaid-out box as far would decline every
 * grant in tests and at mount. IO remains the primary signal for genuinely hidden elements.
 */

import { drainFreePreviewSlots } from "./livePreviewBudget";

const NEAR_MARGIN_PX = 240;
/** How often the periodic revalidation re-checks every registered card (fix v2). */
export const REVALIDATE_INTERVAL_MS = 1000;

export function isNearViewport(el: Element, margin: number = NEAR_MARGIN_PX): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return true;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return r.bottom >= -margin && r.top <= vh + margin && r.right >= -margin && r.left <= vw + margin;
}

/** Is any part of the element actually in the viewport right now (0px margin)? */
export function isVisibleInViewport(el: Element): boolean {
  return isNearViewport(el, 0);
}

/**
 * Pixels from the viewport edge; 0 when any part of the element is actually visible.
 * Zero-size rects count as 0 (same convention as isNearViewport).
 */
export function viewportDistancePx(el: Element): number {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return 0;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return Math.max(0, -r.bottom, r.top - vh, -r.right, r.left - vw);
}

interface LivePreviewEntry {
  el: Element;
  getNear: () => boolean;
  setNear: (near: boolean) => void;
  /** Strict-visibility signal (fix v3): present only for previews whose slot keys on it. */
  getVisible?: () => boolean;
  setVisible?: (visible: boolean) => void;
}

const entries = new Map<Element, LivePreviewEntry>();
let listening = false;
let rafId = 0;
let intervalId = 0;

/**
 * Recompute every registered card's visibility from its real rect; correct `near`
 * (240px, preload) and `visible` (0px, slot lifecycle) where they disagree.
 */
export function revalidateLivePreviews(): void {
  for (const entry of entries.values()) {
    const computedNear = isNearViewport(entry.el);
    if (computedNear !== entry.getNear()) entry.setNear(computedNear);
    if (entry.getVisible && entry.setVisible) {
      const computedVisible = isVisibleInViewport(entry.el);
      if (computedVisible !== entry.getVisible()) entry.setVisible(computedVisible);
    }
  }
}

/** One periodic tick: revalidate geometry, then grant any free slot to a visible waiter. */
function onPeriodicRevalidation(): void {
  revalidateLivePreviews();
  drainFreePreviewSlots();
}

function scheduleRevalidation(): void {
  if (rafId !== 0) return;
  const raf =
    typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (cb: FrameRequestCallback): number => window.setTimeout(() => cb(performance.now()), 16);
  rafId = raf(() => {
    rafId = 0;
    revalidateLivePreviews();
  });
}

function handleVisibilityChange(): void {
  // Background tabs throttle rAF and timers, so a returning tab can hold stale
  // `near` state for seconds; revalidate the moment it becomes visible again.
  if (typeof document !== "undefined" && document.visibilityState === "visible") {
    scheduleRevalidation();
  }
}

function ensureListening(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  // capture: scroll events do not bubble, but they do travel the capture phase from the
  // window down — so this also sees scrolls inside inner containers (e.g. the Studio panels).
  window.addEventListener("scroll", scheduleRevalidation, { passive: true, capture: true });
  window.addEventListener("resize", scheduleRevalidation, { passive: true });
  document.addEventListener("visibilitychange", handleVisibilityChange);
  // Periodic revalidation (fix v2): scroll events evidently rarely reach the listener
  // live, so scroll alone can never be the only trigger. Re-check every second while
  // any preview is registered; 150 getBoundingClientRect calls per tick is trivial,
  // and the tick also drains any free slot to a visible waiter.
  intervalId = window.setInterval(onPeriodicRevalidation, REVALIDATE_INTERVAL_MS);
}

function stopListening(): void {
  if (!listening) return;
  listening = false;
  if (rafId !== 0) {
    if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(rafId);
    else window.clearTimeout(rafId);
    rafId = 0;
  }
  if (intervalId !== 0) {
    window.clearInterval(intervalId);
    intervalId = 0;
  }
  window.removeEventListener("scroll", scheduleRevalidation, { capture: true });
  window.removeEventListener("resize", scheduleRevalidation);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
}

/**
 * Register a preview box for geometry re-validation. Returns an unregister function;
 * call it on unmount. The listener is shared across all registered previews.
 * `getVisible`/`setVisible` are optional: pass them when the preview's slot lifecycle
 * keys on actual visibility (fix v3) so the sweep corrects that signal too; previews
 * that key on `near` alone omit them and behave exactly as before.
 */
export function registerLivePreviewElement(
  el: Element,
  getNear: () => boolean,
  setNear: (near: boolean) => void,
  getVisible?: () => boolean,
  setVisible?: (visible: boolean) => void,
): () => void {
  entries.set(el, { el, getNear, setNear, getVisible, setVisible });
  ensureListening();
  return () => unregisterLivePreviewElement(el);
}

export function unregisterLivePreviewElement(el: Element): void {
  entries.delete(el);
  if (entries.size === 0) stopListening();
}
