/**
 * Repro for the /looks frozen-preview bug (owner report 2026-11-22): on the live site only the
 * first 3 Kinetic cards ever animate; every other card shows its static poster forever, even
 * after scrolling to it and waiting. The Studio panel recycles slots (slowly), so the suspect
 * is the slot lifecycle under REAL browser scrolling — many cards flipping near/far in ONE
 * batched render (a jump-scroll) — which the sequential show/hide walk in
 * animatedPreview.test.tsx never exercises.
 *
 * These tests assert WHICH cards are live, not just how many: a slot granted to a card that
 * has already scrolled out of view is a lost slot, and the count alone (still 3) hides it.
 */
import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LOOKS } from "@capseasy/templates";
import { AnimatedTemplatePreview } from "../panels/AnimatedTemplatePreview";
import { livePreviewCount, livePreviewWaiterCount } from "../panels/livePreviewBudget";

/** IntersectionObserver fake: the test drives visibility per element. */
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
  // Per-element geometry: the fix's grant check and scroll sweep read getBoundingClientRect,
  // so tests drive it explicitly. Unlisted elements default to FAR — fix v2 also
  // revalidates from rects on a ~1s interval, so a NEAR default would mark every card
  // visible and resurrect cards the test hid; IO-driven visibility is mirrored into
  // rects by FakeIO.setVisible above, and geometry tests set rects explicitly.
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

/** Geometry-driven re-validation (the fix): per-element rects for the sweep / grant check. */
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

describe("AnimatedTemplatePreview slot recycling under real scrolling", () => {
  it("jump-scroll: a later group entering in the SAME commit the first group leaves must go live", async () => {
    setup();
    const { view, cards } = renderCards(40);
    // Page load: first 20 cards near the viewport (grid + 240px margin).
    await act(async () => { cards.slice(0, 20).forEach((c) => FakeIO.setVisible(c, true)); });
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    // Jump-scroll: the first 20 leave and the next 20 enter in ONE batched render —
    // exactly what a real scroll (and the browser's batched IO delivery) does.
    await act(async () => {
      cards.slice(0, 20).forEach((c) => FakeIO.setVisible(c, false));
      cards.slice(20, 40).forEach((c) => FakeIO.setVisible(c, true));
    });
    const live = liveSet(cards);
    expect(live.size).toBe(3);
    // Every live card must be one of the cards actually in view now. A slot held by a
    // card that has already scrolled away is a lost slot — the /looks symptom.
    expect([...live].every((i) => i >= 20)).toBe(true);
    expect(livePreviewCount("template")).toBe(3);
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 30000);

  it("slow scroll: the live set follows the viewport one card at a time", async () => {
    setup();
    const { view, cards } = renderCards(12);
    await act(async () => { [0, 1, 2].forEach((i) => FakeIO.setVisible(cards[i]!, true)); });
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    // Walk the window down one card at a time; each step the card that left must be
    // dark and the card that entered must have taken a slot.
    for (let start = 1; start <= 9; start++) {
      await act(async () => {
        FakeIO.setVisible(cards[start - 1]!, false);
        FakeIO.setVisible(cards[start + 2]!, true);
      });
      const live = liveSet(cards);
      expect(live.size).toBe(3);
      expect([...live].every((i) => i >= start && i <= start + 2)).toBe(true);
    }
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 30000);

  it("stale waiters that flashed near then left must not hold slots hostage", async () => {
    setup();
    const { view, cards } = renderCards(12);
    await act(async () => { cards.slice(0, 6).forEach((c) => FakeIO.setVisible(c, true)); });
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    expect(livePreviewWaiterCount("template")).toBe(3);
    // Jump past the queued cards entirely: 0-5 all leave, 6-8 enter, in one commit.
    await act(async () => {
      cards.slice(0, 6).forEach((c) => FakeIO.setVisible(c, false));
      cards.slice(6, 9).forEach((c) => FakeIO.setVisible(c, true));
    });
    const live = liveSet(cards);
    expect(live.size).toBe(3);
    expect([...live].every((i) => i >= 6 && i <= 8)).toBe(true);
    expect(livePreviewWaiterCount("template")).toBe(0);
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
  }, 30000);

  it("sequential per-frame delivery: hide in one commit, show in the next, walking down", async () => {
    // Real IO notifications arrive one frame at a time (one observer callback per
    // task), NOT all batched into a single commit the way the jump test drives
    // them. Walk the window down with a separate act() per notification.
    setup();
    const { view, cards } = renderCards(12);
    await act(async () => { [0, 1, 2].forEach((i) => FakeIO.setVisible(cards[i]!, true)); });
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    for (let start = 1; start <= 9; start++) {
      await act(async () => { FakeIO.setVisible(cards[start - 1]!, false); });
      await act(async () => { FakeIO.setVisible(cards[start + 2]!, true); });
      const live = liveSet(cards);
      expect(live.size).toBe(3);
      expect([...live].every((i) => i >= start && i <= start + 2)).toBe(true);
    }
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 30000);

  it("full /looks scale: 150 mounted, 20 near at load, jump to a far group", async () => {
    setup();
    const { view, cards } = renderCards(150);
    await act(async () => { cards.slice(0, 20).forEach((c) => FakeIO.setVisible(c, true)); });
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    // Jump-scroll deep into the list: first 20 leave, cards 120-139 enter, one commit.
    await act(async () => {
      cards.slice(0, 20).forEach((c) => FakeIO.setVisible(c, false));
      cards.slice(120, 140).forEach((c) => FakeIO.setVisible(c, true));
    });
    const live = liveSet(cards);
    expect(live.size).toBe(3);
    expect([...live].every((i) => i >= 120 && i <= 139)).toBe(true);
    expect(livePreviewWaiterCount("template")).toBe(17);
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 60000);

  it("scroll sweep releases a holder whose IO exit never fires", async () => {
    // The live failure: holders kept their slots forever while scrolled-to cards never
    // went live — the observer exit never arrived. Geometry must correct it.
    setup();
    const { view, cards } = renderCards(12);
    await act(async () => { cards.slice(0, 6).forEach((c) => FakeIO.setVisible(c, true)); });
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    expect(livePreviewWaiterCount("template")).toBe(3);
    // Geometry moves on WITHOUT any IO exit: 0-2 scrolled far away, 3-5 still near.
    cards.slice(0, 3).forEach((c) => setRect(c, false));
    cards.slice(3, 6).forEach((c) => setRect(c, true));
    cards.slice(6).forEach((c) => setRect(c, false));
    await scrollAndFlush();
    // The sweep must have corrected `near` for 0-2, released their slots, and the queued
    // cards 3-5 (geometrically near) must now be live — no IO exit was ever delivered.
    expect(liveSet(cards)).toEqual(new Set([3, 4, 5]));
    expect(livePreviewWaiterCount("template")).toBe(0);
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 30000);

  it("a grant offered to a card that already scrolled away is declined, not parked", async () => {
    setup();
    const { view, cards } = renderCards(12);
    // Cards 0-6 near at load: 0-2 live, 3-6 queued.
    await act(async () => { cards.slice(0, 7).forEach((c) => FakeIO.setVisible(c, true)); });
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    expect(livePreviewWaiterCount("template")).toBe(4);
    // Geometry moves on WITHOUT any IO exit: 0-2 AND the oldest waiter (3) scrolled far
    // away; 4-6 are still near.
    cards.slice(0, 4).forEach((c) => setRect(c, false));
    cards.slice(4, 7).forEach((c) => setRect(c, true));
    cards.slice(7).forEach((c) => setRect(c, false));
    await scrollAndFlush();
    // However the cleanup/drain interleaves, card 3 must never go live: either its wait is
    // cancelled first, or its grant is declined at grant time and the slot moves on. The
    // three freed slots must land on the visible cards 4, 5 and 6.
    expect(liveSet(cards)).toEqual(new Set([4, 5, 6]));
    expect(livePreviewWaiterCount("template")).toBe(0);
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 30000);
});
