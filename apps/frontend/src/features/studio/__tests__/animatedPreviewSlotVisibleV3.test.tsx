/**
 * Fix v3 for the /looks frozen-preview bug: v2 (main 679efdc9) is deployed and the
 * 1s interval DOES move slots now — re-entry works — but most named cards are still
 * frozen. The remaining jam: v2's slot lifecycle keyed on `near` (240px margin), so
 * a holder that scrolled just out of the viewport kept its slot while parked in the
 * margin zone, and all 3 slots could sit invisible while in-view cards queued.
 * v2's strict-visible rule only gated NEW grants, never holders.
 *
 * v3: the slot lifecycle keys on ACTUAL visibility (`visible`, 0px margin). A card
 * releases its slot the moment no part of it is on screen, even if it is still
 * inside the 240px margin. `near` keeps only its preload job (fonts). `visible` is
 * set from the live rect in the observer callback (immediate) and corrected by the
 * sweep/interval (within ~1s if the observer exit never arrives).
 *
 * These tests FAIL on v2 and PASS on v3 (verified by running them before the source
 * change). Real timers throughout: the interval tests wait ~1.3s of wall time.
 *
 * Harness note: FakeIO.setVisible mirrors IO visibility into rects (NEAR/FAR), and
 * unlisted elements default to FAR — the same convention as the dead-IO and recycle
 * suites. Every scenario sets a rect for every card it depends on, so no default
 * ever leaks into a sweep.
 */
import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LOOKS } from "@capseasy/templates";
import { AnimatedTemplatePreview } from "../panels/AnimatedTemplatePreview";
import { livePreviewCount, livePreviewWaiterCount } from "../panels/livePreviewBudget";

/** IntersectionObserver fake: the test drives visibility per element — and then stops. */
class FakeIO {
  static instances: FakeIO[] = [];
  cb: IntersectionObserverCallback;
  els = new Set<Element>();
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
    FakeIO.instances.push(this);
  }
  observe(el: Element) { this.els.add(el); }
  unobserve(el: Element) { this.els.delete(el); }
  disconnect() { this.els.clear(); }
  fire(el: Element, isIntersecting: boolean) {
    if (!this.els.has(el)) return;
    this.cb([{ isIntersecting, target: el } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  static setVisible(el: Element, v: boolean) {
    rects.set(el, v ? { ...NEAR_RECT } : { ...FAR_RECT });
    for (const io of FakeIO.instances) io.fire(el, v);
  }
  static fireEnter(el: Element) {
    // Fire an IO enter WITHOUT touching the rect: some scenarios set geometry
    // explicitly first (a margin-zone card must keep its MARGIN rect — setVisible
    // would overwrite it with NEAR and the test would prove nothing).
    for (const io of FakeIO.instances) io.fire(el, true);
  }
}
class FakeRO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function setup() {
  FakeIO.instances = [];
  rects.clear();
  const g = globalThis as unknown as Record<string, unknown>;
  g["IntersectionObserver"] = FakeIO;
  g["ResizeObserver"] = FakeRO;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return 320; } });
  Object.defineProperty(Element.prototype, "getBoundingClientRect", {
    configurable: true,
    value: function (this: Element) {
      return rects.get(this) ?? { ...FAR_RECT };
    },
  });
}

afterEach(() => {
  FakeIO.instances = [];
  rects.clear();
});

const rects = new Map<Element, { top: number; bottom: number; left: number; right: number; width: number; height: number }>();
// jsdom window is 1024x768: NEAR is inside the viewport, MARGIN is 32px below the
// viewport bottom — inside the 240px queueing margin but NOT actually visible,
// FAR is far below the fold.
const NEAR_RECT = { top: 0, bottom: 100, left: 0, right: 320, width: 320, height: 100 };
const MARGIN_RECT = { top: 800, bottom: 900, left: 0, right: 320, width: 320, height: 100 };
const FAR_RECT = { top: 5000, bottom: 5100, left: 0, right: 320, width: 320, height: 100 };
const setRect = (el: Element, rect: typeof NEAR_RECT) => {
  rects.set(el, rect);
};

/** Dispatch a scroll event and let the shared sweep's rAF throttle flush. */
async function scrollAndFlush() {
  await act(async () => {
    window.dispatchEvent(new Event("scroll"));
    for (let i = 0; i < 3; i++) {
      await new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
        else setTimeout(resolve, 20);
      });
    }
  });
}

/** Wait past one periodic-revalidation tick (interval is ~1s) with no other trigger. */
async function waitForIntervalTick() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 1300));
  });
}

/** Liveness per CARD (a card with a live layer), not per matching div: difference_invert draws two. */
const isLive = (card: Element) => card.querySelector('div[style*="1080px"]') !== null;
const liveSet = (cards: Element[]) => new Set(cards.map((c, i) => (isLive(c) ? i : -1)).filter((i) => i >= 0));

function renderCards(n: number) {
  const looks = LOOKS.slice(0, n);
  const view = render(
    <div>
      {looks.map((look) => (
        <AnimatedTemplatePreview key={look.id} look={look} poster={<div>POSTER</div>} />
      ))}
    </div>,
  );
  const cards = [...view.container.querySelectorAll(":scope > div > div")];
  expect(cards).toHaveLength(n);
  return { view, cards };
}

describe("AnimatedTemplatePreview v3: slots held only while actually visible", () => {
  it("a holder scrolled just outside the viewport (still within the 240px margin) releases its slot", async () => {
    setup();
    const { view, cards } = renderCards(6);
    await act(async () => { [0, 1, 2].forEach((i) => FakeIO.setVisible(cards[i]!, true)); });
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    // Card 0 scrolls just below the fold: 32px outside the viewport, still inside
    // the 240px margin — so `near` stays true. No IO signal, no scroll event: only
    // the periodic revalidation may notice. v2 keeps card 0 live here (its slot
    // effect keys on `near`); v3 must release it.
    setRect(cards[0]!, MARGIN_RECT);
    await waitForIntervalTick();
    expect(isLive(cards[0]!)).toBe(false);
    expect(liveSet(cards)).toEqual(new Set([1, 2]));
    expect(livePreviewCount("template")).toBe(2);
    expect(livePreviewWaiterCount("template")).toBe(0);
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 30000);

  it("the scroll sweep alone releases a margin-zone holder, with no interval wait", async () => {
    setup();
    const { view, cards } = renderCards(6);
    await act(async () => { [0, 1, 2].forEach((i) => FakeIO.setVisible(cards[i]!, true)); });
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    // Same move as above, but the scroll sweep (not the interval) must release it:
    // card 0 is 32px below the viewport, still inside the 240px margin.
    setRect(cards[0]!, MARGIN_RECT);
    await scrollAndFlush();
    expect(isLive(cards[0]!)).toBe(false);
    expect(liveSet(cards)).toEqual(new Set([1, 2]));
    expect(livePreviewCount("template")).toBe(2);
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 30000);

  it("a freed slot goes to a visible card, not to a card parked in the margin", async () => {
    setup();
    const { view, cards } = renderCards(12);
    await act(async () => { [0, 1, 2].forEach((i) => FakeIO.setVisible(cards[i]!, true)); });
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    // Cards 6-8 scroll into view with no IO signal at all: the interval must put
    // them in the queue (budget full), not leave them dark. (0-2 keep their NEAR
    // rects — overwriting them FAR would release them, which is a different test.)
    cards.forEach((c, i) => setRect(c, i < 3 || (i >= 6 && i <= 8) ? NEAR_RECT : FAR_RECT));
    await waitForIntervalTick();
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    expect(livePreviewWaiterCount("template")).toBe(3);
    // Card 0 scrolls just below the fold (margin zone, `near` still true): its
    // slot must free and go to the nearest visible waiter (6), with no scroll event.
    setRect(cards[0]!, MARGIN_RECT);
    await waitForIntervalTick();
    expect(liveSet(cards)).toEqual(new Set([1, 2, 6]));
    expect(livePreviewCount("template")).toBe(3);
    expect(livePreviewWaiterCount("template")).toBe(2);
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 30000);

  it("a margin-zone card never holds a slot while a visible card waits", async () => {
    setup();
    const { view, cards } = renderCards(6);
    // Explicit geometry for every card: 0, 2, 3 visible; 1 in the 240px margin
    // (near but not visible); 4, 5 far.
    cards.forEach((c, i) => setRect(c, i === 1 ? MARGIN_RECT : i === 0 || i === 2 || i === 3 ? NEAR_RECT : FAR_RECT));
    // The observer fires enter for the near cards (0-3, margin included): 0, 2, 3
    // take the 3 slots. Card 1 is near but NOT visible — v2 queues it (its slot
    // effect keys on `near`); v3 must not even queue it. fireEnter (not setVisible)
    // so card 1 keeps its explicit MARGIN rect.
    await act(async () => { [0, 1, 2, 3].forEach((i) => FakeIO.fireEnter(cards[i]!)); });
    expect(liveSet(cards)).toEqual(new Set([0, 2, 3]));
    expect(isLive(cards[1]!)).toBe(false);
    expect(livePreviewCount("template")).toBe(3);
    expect(livePreviewWaiterCount("template")).toBe(0);
    // A visible card (4) scrolls into view with no IO signal: the interval queues
    // it — it is the ONLY waiter, even though card 1 has been near longer.
    setRect(cards[4]!, NEAR_RECT);
    await waitForIntervalTick();
    expect(livePreviewWaiterCount("template")).toBe(1);
    expect(isLive(cards[1]!)).toBe(false);
    // Card 0 scrolls just below the fold (margin zone): its slot must go to the
    // visible waiter 4, never to the margin-zone card 1.
    setRect(cards[0]!, MARGIN_RECT);
    await waitForIntervalTick();
    expect(liveSet(cards)).toEqual(new Set([2, 3, 4]));
    expect(isLive(cards[1]!)).toBe(false);
    expect(livePreviewCount("template")).toBe(3);
    expect(livePreviewWaiterCount("template")).toBe(0);
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 30000);
});
