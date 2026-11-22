/**
 * Hover-to-play for the /looks animation previews (owner direction): hover over
 * ANY animation card and its animation plays immediately, no slot needed.
 *
 * The slot system (v1/v2/v3, live on main) caps live previews at 3 at a time and
 * has proven flaky in live browsers — only 1-3 cards per viewport ever animate.
 * Hover bypasses the budget entirely: pointer over the preview box mounts the
 * live layer and starts the clock at once; pointer leave stops it. Slot
 * auto-play stays exactly as is for non-hovered cards; a hovered card that also
 * holds a slot never double-acquires and never leaks the slot on unhover.
 *
 * These tests FAIL on the v3 source (no pointer handlers) and PASS with
 * hover-to-play (verified by running them before the source change).
 *
 * Harness note: same FakeIO/FakeRO/rect convention as the v3 suite — FakeIO
 * mirrors IO visibility into rects, unlisted elements default to FAR. Pointer
 * events are driven with fireEvent.pointerOver/pointerOut: React synthesises
 * onPointerEnter/onPointerLeave from over/out (a raw pointerenter dispatch
 * would never reach the handler).
 */
import React from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LOOKS } from "@capseasy/templates";
import { AnimatedTemplatePreview } from "../panels/AnimatedTemplatePreview";
import { livePreviewCount, livePreviewWaiterCount } from "../panels/livePreviewBudget";

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
// jsdom window is 1024x768: NEAR is inside the viewport, FAR is far below the fold.
const NEAR_RECT = { top: 0, bottom: 100, left: 0, right: 320, width: 320, height: 100 };
const FAR_RECT = { top: 5000, bottom: 5100, left: 0, right: 320, width: 320, height: 100 };

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

describe("AnimatedTemplatePreview hover-to-play: any card plays on hover, no slot needed", () => {
  it("hover starts the live layer with all slots exhausted by other cards", async () => {
    setup();
    const { view, cards } = renderCards(6);
    // Cards 0-2 take all 3 template slots via the normal auto-play path.
    await act(async () => { [0, 1, 2].forEach((i) => FakeIO.setVisible(cards[i]!, true)); });
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    expect(livePreviewCount("template")).toBe(3);
    // Card 3 is far below the fold: no slot, no queue, poster only.
    expect(isLive(cards[3]!)).toBe(false);
    // Hover card 3: it must go live immediately WITHOUT touching the budget —
    // no acquire (count stays 3), no queued wait (waiters stay 0).
    act(() => { fireEvent.pointerOver(cards[3]!); });
    expect(isLive(cards[3]!)).toBe(true);
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2, 3]));
    expect(livePreviewCount("template")).toBe(3);
    expect(livePreviewWaiterCount("template")).toBe(0);
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 30000);

  it("pointer leave stops the hover preview and returns to the poster", async () => {
    setup();
    const { view, cards } = renderCards(6);
    await act(async () => { [0, 1, 2].forEach((i) => FakeIO.setVisible(cards[i]!, true)); });
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    act(() => { fireEvent.pointerOver(cards[3]!); });
    expect(isLive(cards[3]!)).toBe(true);
    act(() => { fireEvent.pointerOut(cards[3]!); });
    expect(isLive(cards[3]!)).toBe(false);
    // The slot holders are untouched by the hover round-trip.
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    expect(livePreviewCount("template")).toBe(3);
    expect(livePreviewWaiterCount("template")).toBe(0);
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 30000);

  it("unmount while hovered leaks no slot", async () => {
    setup();
    const { view, cards } = renderCards(6);
    await act(async () => { [0, 1, 2].forEach((i) => FakeIO.setVisible(cards[i]!, true)); });
    expect(livePreviewCount("template")).toBe(3);
    // Hover card 3 (live without a slot) AND card 4, then unmount everything
    // while both are still hovered: the budget must drain back to zero.
    act(() => {
      fireEvent.pointerOver(cards[3]!);
      fireEvent.pointerOver(cards[4]!);
    });
    expect(isLive(cards[3]!)).toBe(true);
    expect(isLive(cards[4]!)).toBe(true);
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 30000);

  it("a hovered card that already holds a slot does not double-acquire or leak on unhover", async () => {
    setup();
    const { view, cards } = renderCards(3);
    await act(async () => { [0, 1, 2].forEach((i) => FakeIO.setVisible(cards[i]!, true)); });
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    expect(livePreviewCount("template")).toBe(3);
    // Card 0 holds a slot AND is hovered: still exactly one live layer, still 3 slots.
    act(() => { fireEvent.pointerOver(cards[0]!); });
    expect(isLive(cards[0]!)).toBe(true);
    expect(livePreviewCount("template")).toBe(3);
    expect(livePreviewWaiterCount("template")).toBe(0);
    // Unhover: the slot-held live layer keeps playing (hover was only additive).
    act(() => { fireEvent.pointerOut(cards[0]!); });
    expect(isLive(cards[0]!)).toBe(true);
    expect(livePreviewCount("template")).toBe(3);
    // Scroll card 0 out (IO exit): the slot releases normally, hover untouched.
    await act(async () => { FakeIO.setVisible(cards[0]!, false); });
    expect(isLive(cards[0]!)).toBe(false);
    expect(livePreviewCount("template")).toBe(2);
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 30000);

  it("reduced-motion users never get the live layer, hover or not", async () => {
    setup();
    const g = globalThis as unknown as Record<string, unknown>;
    const realMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    try {
      const { view, cards } = renderCards(3);
      await act(async () => { [0, 1, 2].forEach((i) => FakeIO.setVisible(cards[i]!, true)); });
      // No slot auto-play under reduced motion…
      expect(liveSet(cards)).toEqual(new Set());
      // …and hover must not start it either.
      act(() => { fireEvent.pointerOver(cards[0]!); });
      expect(isLive(cards[0]!)).toBe(false);
      expect(livePreviewCount("template")).toBe(0);
      view.unmount();
    } finally {
      if (realMatchMedia) window.matchMedia = realMatchMedia;
      else delete (g as Record<string, unknown>)["matchMedia"];
    }
  }, 30000);
});
