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
 *  - every preview registers its box here; ONE shared, rAF-throttled scroll/resize sweep
 *    (a single window listener, capture phase so inner scroll containers are covered too)
 *    recomputes each registered card's geometry and corrects its `near` state when the
 *    geometry disagrees with it. Scroll is exactly when visibility changes, so a sweep
 *    on scroll is what re-assigns slots to the cards actually in view — even if no IO
 *    exit ever arrives for the cards that scrolled away.
 *  - the listener attaches on first registration and detaches when the registry empties,
 *    so pages without live previews pay nothing; the sweep only calls setNear when a
 *    card's computed visibility actually changed.
 *
 * Zero-size rects (an element not laid out yet, or jsdom in tests, where every rect is
 * 0x0 at the origin) count as near: a real preview box always has size once laid out,
 * and treating an unlaid-out box as far would decline every grant in tests and at
 * mount. IO remains the primary signal for genuinely hidden elements.
 */

const NEAR_MARGIN_PX = 240;

export function isNearViewport(el: Element, margin: number = NEAR_MARGIN_PX): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return true;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return r.bottom >= -margin && r.top <= vh + margin && r.right >= -margin && r.left <= vw + margin;
}

interface LivePreviewEntry {
  el: Element;
  getNear: () => boolean;
  setNear: (near: boolean) => void;
}

const entries = new Map<Element, LivePreviewEntry>();
let listening = false;
let rafId = 0;

/** Recompute every registered card's visibility from its real rect; correct `near` where it disagrees. */
export function revalidateLivePreviews(): void {
  for (const entry of entries.values()) {
    const computed = isNearViewport(entry.el);
    if (computed !== entry.getNear()) entry.setNear(computed);
  }
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

function ensureListening(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  // capture: scroll events do not bubble, but they do travel the capture phase from the
  // window down — so this also sees scrolls inside inner containers (e.g. the Studio panels).
  window.addEventListener("scroll", scheduleRevalidation, { passive: true, capture: true });
  window.addEventListener("resize", scheduleRevalidation, { passive: true });
}

function stopListening(): void {
  if (!listening) return;
  listening = false;
  if (rafId !== 0) {
    if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(rafId);
    else window.clearTimeout(rafId);
    rafId = 0;
  }
  window.removeEventListener("scroll", scheduleRevalidation, { capture: true });
  window.removeEventListener("resize", scheduleRevalidation);
}

/**
 * Register a preview box for geometry re-validation. Returns an unregister function;
 * call it on unmount. The listener is shared across all registered previews.
 */
export function registerLivePreviewElement(
  el: Element,
  getNear: () => boolean,
  setNear: (near: boolean) => void,
): () => void {
  entries.set(el, { el, getNear, setNear });
  ensureListening();
  return () => unregisterLivePreviewElement(el);
}

export function unregisterLivePreviewElement(el: Element): void {
  entries.delete(el);
  if (entries.size === 0) stopListening();
}
