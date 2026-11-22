/**
 * Fix v2 for the /looks frozen-preview bug: v1 (main 730d0394) is deployed and its code
 * is provably in the live bundle, yet /looks stays frozen — only a rare random visible
 * card animates. The dead-IO repro passes 5/5, so the sweep/budget logic is correct
 * under mocked IO; the live failure is that v1 revalidates ONLY off window scroll
 * events, and those evidently rarely reach the listener. v2 removes that single point
 * of failure and the two secondary jams:
 *
 *  (a) periodic revalidation: a ~1s interval re-checks every registered card's rect
 *      and drains free slots, so reassignment no longer depends on scroll events;
 *  (b) nearest-waiter drain: a freed slot goes to the geometrically nearest waiter
 *      (FIFO only as tiebreak), not the oldest — the oldest is usually a stale card
 *      that already scrolled away;
 *  (c) visible-only drain: a slot is offered only to a waiter actually in the
 *      viewport, never to one parked in the 240px queueing margin;
 *  (d) revalidate on visibilitychange -> visible.
 *
 * These tests FAIL on v1 and PASS on v2 (verified by running them before the source
 * change). Real timers throughout: the interval tests wait ~1.3s of wall time.
 *
 * NOTE on the dropped registration sweep: an earlier draft of (d) scheduled a sweep
 * on registration so cards would go live even if IO never fires. It was removed:
 * the sweep fires with unlaid-out rects at mount and marks every card near before
 * the observer ever reports, which broke the existing suites' waiter-count
 * assertions. The interval covers the same no-IO case within ~1s.
 */
import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LOOKS } from "@capseasy/templates";
import { AnimatedTemplatePreview } from "../panels/AnimatedTemplatePreview";
import {
  acquireLivePreviewSlot,
  cancelLivePreviewWait,
  drainFreePreviewSlots,
  livePreviewCount,
  livePreviewWaiterCount,
  queueLivePreviewWait,
  releaseLivePreviewSlot,
  type LivePreviewGrant,
  type LivePreviewKind,
} from "../panels/livePreviewBudget";

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
  // drive it explicitly. Unlisted elements default to NEAR — every scenario below sets
  // a rect for EVERY card before the assertion that depends on geometry.
  Object.defineProperty(Element.prototype, "getBoundingClientRect", {
    configurable: true,
    value: function (this: Element) {
      return rects.get(this) ?? { ...NEAR_RECT };
    },
  });
}

afterEach(() => {
  FakeIO.instances = [];
  rects.clear();
});

const rects = new Map<Element, { top: number; bottom: number; left: number; right: number; width: number; height: number }>();
// jsdom window is 1024x768: NEAR is inside the viewport, MARGIN is inside the 240px
// queueing margin but NOT actually visible, FAR is far below the fold.
const NEAR_RECT = { top: 0, bottom: 100, left: 0, right: 320, width: 320, height: 100 };
const MARGIN_RECT = { top: 800, bottom: 900, left: 0, right: 320, width: 320, height: 100 };
const FAR_RECT = { top: 5000, bottom: 5100, left: 0, right: 320, width: 320, height: 100 };
const setRect = (el: Element, rect: typeof NEAR_RECT) => {
  rects.set(el, rect);
};

/** Let the shared sweep's rAF throttle flush. */
async function flushRaf() {
  await act(async () => {
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

describe("livePreviewBudget v2: nearest-waiter, visible-only drain", () => {
  it("a freed slot goes to the nearest waiter, not the oldest — the far waiter stays queued", async () => {
    const accepted: string[] = [];
    const queued: Array<{ grant: LivePreviewGrant; kind: LivePreviewKind }> = [];
    const take = (kind: LivePreviewKind, id: string) => {
      const g: LivePreviewGrant = () => {
        accepted.push(id);
        return true;
      };
      if (acquireLivePreviewSlot(kind, g)) g();
    };
    take("template", "a");
    take("template", "b");
    take("template", "c");
    expect(livePreviewCount("template")).toBe(3);
    // Oldest waiter is far away (already scrolled off); a nearer waiter queued after it.
    const far: LivePreviewGrant = () => {
      accepted.push("far");
      return true;
    };
    const near: LivePreviewGrant = () => {
      accepted.push("near");
      return true;
    };
    expect(acquireLivePreviewSlot("template", far, () => 5000)).toBe(false);
    expect(acquireLivePreviewSlot("template", near, () => 0)).toBe(false);
    queued.push({ grant: far, kind: "template" }, { grant: near, kind: "template" });
    expect(livePreviewWaiterCount("template")).toBe(2);
    // One release: the drain must offer the slot to the NEAR waiter first, even though
    // the far waiter queued first. v1 (FIFO) offers it to "far".
    releaseLivePreviewSlot("template");
    expect(accepted).toEqual(["a", "b", "c", "near"]);
    expect(livePreviewCount("template")).toBe(3);
    // The far waiter was never offered, so it is still queued — not dropped.
    expect(livePreviewWaiterCount("template")).toBe(1);
    // Clean up: cancel the still-queued far waiter, then release the 3 held slots.
    cancelLivePreviewWait("template", far);
    expect(livePreviewWaiterCount("template")).toBe(0);
    releaseLivePreviewSlot("template");
    releaseLivePreviewSlot("template");
    releaseLivePreviewSlot("template");
    expect(livePreviewCount("template")).toBe(0);
  });

  it("the drain stops when no waiter is actually visible — the slot stays free", async () => {
    const accepted: string[] = [];
    const take = (kind: LivePreviewKind, id: string) => {
      const g: LivePreviewGrant = () => {
        accepted.push(id);
        return true;
      };
      if (acquireLivePreviewSlot(kind, g)) g();
    };
    take("social", "a");
    take("social", "b");
    take("social", "c");
    expect(livePreviewCount("social")).toBe(3);
    // Only waiter is far outside the viewport (5000px away).
    const far: LivePreviewGrant = () => {
      accepted.push("far");
      return true;
    };
    expect(acquireLivePreviewSlot("social", far, () => 5000)).toBe(false);
    expect(livePreviewWaiterCount("social")).toBe(1);
    // One release: v1 offers the slot to "far" and it accepts. v2 must NOT offer it —
    // the slot stays free for a visible card, and the waiter stays queued.
    releaseLivePreviewSlot("social");
    expect(accepted).toEqual(["a", "b", "c"]);
    expect(livePreviewCount("social")).toBe(2);
    expect(livePreviewWaiterCount("social")).toBe(1);
    // The interval-style drain must not conjure a grant either.
    drainFreePreviewSlots("social");
    expect(accepted).toEqual(["a", "b", "c"]);
    expect(livePreviewCount("social")).toBe(2);
    expect(livePreviewWaiterCount("social")).toBe(1);
    // Clean up: cancel the far waiter, then release the 2 held slots.
    cancelLivePreviewWait("social", far);
    releaseLivePreviewSlot("social");
    releaseLivePreviewSlot("social");
    expect(livePreviewCount("social")).toBe(0);
    expect(livePreviewWaiterCount("social")).toBe(0);
  });

  it("queueLivePreviewWait queues without granting, and the drain later grants it once visible", async () => {
    const accepted: string[] = [];
    const take = (kind: LivePreviewKind, id: string) => {
      const g: LivePreviewGrant = () => {
        accepted.push(id);
        return true;
      };
      if (acquireLivePreviewSlot(kind, g)) g();
    };
    take("template", "a");
    expect(livePreviewCount("template")).toBe(1);
    // A slot is free, but the caller is only in the margin zone: queue explicitly
    // instead of taking the free slot now.
    let distance = 100;
    const g: LivePreviewGrant = () => {
      accepted.push("queued");
      return true;
    };
    queueLivePreviewWait("template", g, () => distance);
    expect(livePreviewCount("template")).toBe(1);
    expect(livePreviewWaiterCount("template")).toBe(1);
    // Still in the margin: the drain must not offer it.
    drainFreePreviewSlots("template");
    expect(accepted).toEqual(["a"]);
    expect(livePreviewCount("template")).toBe(1);
    // Now visible: the drain grants it.
    distance = 0;
    drainFreePreviewSlots("template");
    expect(accepted).toEqual(["a", "queued"]);
    expect(livePreviewCount("template")).toBe(2);
    expect(livePreviewWaiterCount("template")).toBe(0);
    releaseLivePreviewSlot("template");
    releaseLivePreviewSlot("template");
    expect(livePreviewCount("template")).toBe(0);
  });
});

describe("AnimatedTemplatePreview v2: reassignment without scroll events", () => {
  it("the interval alone reassigns slots with NO scroll event and a dead observer", async () => {
    setup();
    const { view, cards } = renderCards(12);
    // Page load: the observer fires enter ONLY for the first 3 cards, then goes silent.
    await act(async () => { [0, 1, 2].forEach((i) => FakeIO.setVisible(cards[i]!, true)); });
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    // Geometry moves on with NO further IO signal and NO scroll event at all: 0-2
    // scrolled far away, 6-8 in view. v1's negative control proves nothing moves
    // without a scroll event; v2's periodic revalidation must move the slots.
    cards.forEach((c, i) => setRect(c, i >= 6 && i <= 8 ? NEAR_RECT : FAR_RECT));
    await waitForIntervalTick();
    expect(liveSet(cards)).toEqual(new Set([6, 7, 8]));
    expect(livePreviewCount("template")).toBe(3);
    expect(livePreviewWaiterCount("template")).toBe(0);
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 30000);

  it("a margin-zone card does not take a slot, then goes live via the interval once visible", async () => {
    // Fix v3 changed this test's middle: the margin-zone card no longer QUEUES
    // (v2 asserted waiterCount 1). The slot effect keys on actual visibility, so a
    // card that is near but not visible never acquires or queues — it simply waits
    // for `visible` to flip and acquires then. The end state is unchanged: once it
    // scrolls fully into view it goes live.
    setup();
    const { view, cards } = renderCards(12);
    // Explicit geometry for every card from the start, so no default rect leaks in:
    // card 0 visible, card 5 in the 240px margin (near but not visible), rest far.
    cards.forEach((c, i) => setRect(c, i === 0 ? NEAR_RECT : i === 5 ? MARGIN_RECT : FAR_RECT));
    await act(async () => { FakeIO.setVisible(cards[0]!, true); });
    expect(liveSet(cards)).toEqual(new Set([0]));
    expect(livePreviewCount("template")).toBe(1);
    // Card 5 approaches (IO enter): a slot is free, but the card is only in the
    // margin zone — v1 takes the free slot immediately (its grant accepts "near");
    // v2 declines the strict grant and QUEUES instead; v3 does not queue at all —
    // its slot effect keys on `visible`, which is false here.
    await act(async () => { FakeIO.setVisible(cards[5]!, true); });
    expect(isLive(cards[5]!)).toBe(false);
    expect(livePreviewCount("template")).toBe(1);
    expect(livePreviewWaiterCount("template")).toBe(0);
    // Card 5 scrolls fully into view; no scroll event fires — the interval alone
    // must make it live (its effect acquires on the `visible` flip).
    setRect(cards[5]!, NEAR_RECT);
    await waitForIntervalTick();
    expect(isLive(cards[5]!)).toBe(true);
    expect(liveSet(cards)).toEqual(new Set([0, 5]));
    expect(livePreviewCount("template")).toBe(2);
    expect(livePreviewWaiterCount("template")).toBe(0);
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 30000);

  it("visibilitychange to visible revalidates with no scroll event", async () => {
    setup();
    const { view, cards } = renderCards(12);
    await act(async () => { [0, 1, 2].forEach((i) => FakeIO.setVisible(cards[i]!, true)); });
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    // Geometry moves on with NO IO signal: 0-2 far away, 6-8 in view.
    cards.forEach((c, i) => setRect(c, i >= 6 && i <= 8 ? NEAR_RECT : FAR_RECT));
    // The tab becomes visible again (e.g. back from background, where rAF and
    // timers were throttled): the visibilitychange handler must revalidate, with
    // no scroll event and well before the next interval tick.
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flushRaf();
    expect(liveSet(cards)).toEqual(new Set([6, 7, 8]));
    expect(livePreviewCount("template")).toBe(3);
    expect(livePreviewWaiterCount("template")).toBe(0);
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 30000);

  it("cards go live with no IO and no scroll event, via the periodic revalidation", async () => {
    setup();
    const { view, cards } = renderCards(6);
    // The observer NEVER fires at all — not even the initial enter. Geometry is set
    // right after mount (0-2 in view, 3-5 far); the periodic revalidation must read
    // the fresh rects and put 0-2 live, with no scroll event. (A sweep scheduled on
    // registration was tried for this and dropped: it fires with unlaid-out rects at
    // mount and marks every card near before the observer ever reports.)
    cards.forEach((c, i) => setRect(c, i < 3 ? NEAR_RECT : FAR_RECT));
    await waitForIntervalTick();
    expect(liveSet(cards)).toEqual(new Set([0, 1, 2]));
    expect(livePreviewCount("template")).toBe(3);
    expect(livePreviewWaiterCount("template")).toBe(0);
    view.unmount();
    expect(livePreviewCount("template")).toBe(0);
    expect(livePreviewWaiterCount("template")).toBe(0);
  }, 30000);
});
