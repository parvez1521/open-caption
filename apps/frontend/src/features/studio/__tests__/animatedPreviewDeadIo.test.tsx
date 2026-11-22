/**
 * Dead-IO repro for the /looks frozen-preview bug (owner report 2026-11-22, fix
 * deployed as main 730d0394 still not reassigning slots live).
 *
 * The earlier recycle suite (animatedPreviewSlotRecycle.test.tsx) proved the slot
 * logic correct when the mocked IntersectionObserver fires enter/exit faithfully.
 * The live failure mode it never covered is the one the browser sessions point at:
 * the observer fires enter ONLY for the initially-visible cards at mount and then
 * NEVER fires again — no enter for cards scrolled into view, no exit for cards that
 * left. In that world the scroll sweep in livePreviewVisibility.ts is the ONLY
 * mechanism that can move a slot: scrolling is simulated here purely by changing
 * getBoundingClientRect values and dispatching window scroll events. If the sweep
 * alone cannot reassign slots under a dead observer, the fix cannot work live.
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
    // Keep geometry in sync with the driven visibility: fix v2 revalidates from
    // rects (periodic interval + scroll sweep), so a rect left at its default would
    // resurrect a card the test just hid, or hide one it just showed. Unlisted cards
    // keep the FAR default — on the real page most cards start below the fold.
    // Geometry tests override rects explicitly after the IO setup, as before.
    rects.set(el, v ? { ...NEAR_RECT } : { ...FAR_RECT });
    for (const io of FakeIO.instances) io.fire(el, v);
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
  // Per-element geometry: the sweep / grant check read getBoundingClientRect, so tests
  // drive it explicitly. Unlisted elements default to FAR — fix v2 also revalidates
  // from rects on a ~1s interval, so a NEAR default would mark every card visible and
  // resurrect cards the test hid; IO-driven visibility is mirrored into rects by
  // FakeIO.setVisible above. Every scenario below sets a rect for EVERY card before
  // scrolling, so no default ever leaks into a sweep.
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
const NEAR_RECT = { top: 0, bottom: 100, left: 0, right: 320, width: 320, height: 100 };
const FAR_RECT = { top: 5000, bottom: 5100, left: 0, right: 320, width: 320, height: 100 };
const setRect = (el: Element, near: boolean) => {
  rects.set(el, near ? NEAR_RECT : FAR_RECT);
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

describe("AnimatedTemplatePreview slot recycling with a dead IntersectionObserver", () => {
  it("sweep alone reassigns slots when IO fires enter only at mount and never again", async () => {
    setup();
    const { view, cards } = renderCards(12);
    // Page load: the observer fires enter ONLY for the first 3 cards, then goes silent
    // forever — no enter for scrolled-to cards, no exit for cards that leave.
    await act(async () => { [0, 1, 2].forEach((i) => FakeIO.setVisible(cards[i]!, true)); });
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    // Geometry moves on with NO further IO signal: 0-2 scrolled far away, 6-8 in view.
    cards.forEach((c, i) => setRect(c, i >= 6 && i <= 8));
    await scrollAndFlush();
    // The sweep alone must have released 0-2 and put 6-8 live.
    expect(liveSet(cards)).toEqual(new Set([6, 7, 8]));
    expect(livePreviewCount("template")).toBe(3);
    expect(livePreviewWaiterCount("template")).toBe(0);
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 30000);

  it("jump-scroll deep with stale waiters queued at load: the sweep must reach the new group", async () => {
    setup();
    const { view, cards } = renderCards(24);
    // Realistic load: the observer fires enter for the first 8 cards (viewport + 240px
    // margin) — 0-2 live, 3-7 queued — then goes silent forever.
    await act(async () => { cards.slice(0, 8).forEach((c) => FakeIO.setVisible(c, true)); });
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    expect(livePreviewWaiterCount("template")).toBe(5);
    // Jump-scroll deep with NO further IO signal: 0-7 far away, 20-22 in view.
    cards.forEach((c, i) => setRect(c, i >= 20 && i <= 22));
    await scrollAndFlush();
    // The freed slots must land on the visible cards 20-22 — the stale waiters 3-7
    // (far away by now) must be declined or cancelled, never parked on.
    expect(liveSet(cards)).toEqual(new Set([20, 21, 22]));
    expect(livePreviewCount("template")).toBe(3);
    expect(livePreviewWaiterCount("template")).toBe(0);
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 30000);

  it("repeated scrolls with a dead observer: the live set keeps following the viewport", async () => {
    setup();
    const { view, cards } = renderCards(12);
    await act(async () => { [0, 1, 2].forEach((i) => FakeIO.setVisible(cards[i]!, true)); });
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    // Walk the window down in steps driven ONLY by geometry + scroll events.
    for (let start = 3; start <= 9; start += 3) {
      cards.forEach((c, i) => setRect(c, i >= start && i < start + 3));
      await scrollAndFlush();
      expect(liveSet(cards)).toEqual(new Set([start, start + 1, start + 2]));
      expect(livePreviewCount("template")).toBe(3);
    }
    // And back to the top: the first cards must go live again.
    cards.forEach((c, i) => setRect(c, i < 3));
    await scrollAndFlush();
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    expect(livePreviewWaiterCount("template")).toBe(0);
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 30000);

  it("negative control: geometry moves but no scroll event fires, slots do not move", async () => {
    // Documents that the sweep is scroll-driven: if the live browser's scroll events
    // never reach the window listener, nothing reassigns — rects alone change nothing.
    setup();
    const { view, cards } = renderCards(12);
    await act(async () => { [0, 1, 2].forEach((i) => FakeIO.setVisible(cards[i]!, true)); });
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    cards.forEach((c, i) => setRect(c, i >= 6 && i <= 8));
    // No scroll event dispatched — only rAF ticks.
    await act(async () => {
      for (let i = 0; i < 3; i++) {
        await new Promise<void>((resolve) => {
          if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
          else setTimeout(resolve, 20);
        });
      }
    });
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
  }, 30000);

  it("full /looks scale, dead observer: 150 mounted, jump to a far group via sweep alone", async () => {
    setup();
    const { view, cards } = renderCards(150);
    await act(async () => { cards.slice(0, 8).forEach((c) => FakeIO.setVisible(c, true)); });
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    expect(livePreviewWaiterCount("template")).toBe(5);
    // Jump-scroll deep with NO further IO signal: 0-7 far away, 120-122 in view.
    cards.forEach((c, i) => setRect(c, i >= 120 && i <= 122));
    await scrollAndFlush();
    expect(liveSet(cards)).toEqual(new Set([120, 121, 122]));
    expect(livePreviewCount("template")).toBe(3);
    expect(livePreviewWaiterCount("template")).toBe(0);
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 60000);
});
