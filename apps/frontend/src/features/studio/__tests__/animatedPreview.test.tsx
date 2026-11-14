/**
 * Bug 1 regression guard (picker live previews): the live layer must actually mount when a card nears
 * the viewport, the per-kind cap (3 live template previews — the budget module splits the studio-wide
 * 6 between the two preview kinds so neither panel can starve the other) must hold, and slots must
 * RECYCLE — a card leaving the viewport (or unmounting) frees its slot so a queued card goes live.
 * Before the fix, the immediate-acquire path incremented the slot counter but never called the grant
 * callback, so NO preview ever went live.
 */
import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LOOKS } from "@capseasy/templates";
import { AnimatedTemplatePreview } from "../panels/AnimatedTemplatePreview";

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
    for (const io of FakeIO.instances) io.fire(el, v);
  }
}
class FakeRO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const liveLayers = (root: HTMLElement) => root.querySelectorAll('div[style*="1080px"]').length;

function setup() {
  FakeIO.instances = [];
  const g = globalThis as unknown as Record<string, unknown>;
  g["IntersectionObserver"] = FakeIO;
  g["ResizeObserver"] = FakeRO;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return 320; } });
}

afterEach(() => {
  FakeIO.instances = [];
});

describe("AnimatedTemplatePreview live-slot lifecycle", () => {
  it("a card near the viewport actually goes live (renders the template's own Page)", async () => {
    setup();
    const look = LOOKS[0]!;
    const view = render(<AnimatedTemplatePreview look={look} poster={<div>POSTER</div>} />);
    await act(async () => { FakeIO.setVisible(view.container.firstElementChild as Element, true); });
    expect(liveLayers(view.container)).toBe(1);
    // the sample line is in the live layer (LOOKS[0] uppercases + letter-splits it, hence the regex)
    expect(view.container.textContent).toMatch(/M+A+K+E+/);
    view.unmount();
  });

  it("caps at 3 live template previews and recycles the slot when a live card leaves the viewport", async () => {
    setup();
    const looks = LOOKS.slice(0, 8);
    const view = render(
      <div>
        {looks.map((look) => (
          <AnimatedTemplatePreview key={look.id} look={look} poster={<div>POSTER</div>} />
        ))}
      </div>,
    );
    const cards = [...view.container.querySelectorAll(":scope > div > div")];
    await act(async () => { cards.forEach((c) => FakeIO.setVisible(c, true)); });
    expect(liveLayers(view.container)).toBe(3);
    // first card scrolls far away: its slot must free up and a queued card must take it
    await act(async () => { FakeIO.setVisible(cards[0]!, false); });
    expect(liveLayers(view.container)).toBe(3);
    // and scrolling it back re-acquires (possibly queueing behind others): total still capped
    await act(async () => { FakeIO.setVisible(cards[0]!, true); });
    expect(liveLayers(view.container)).toBeLessThanOrEqual(3);
    view.unmount();
    expect(liveLayers(view.container)).toBe(0);
  });

  it("unmounting a live card frees its slot for a queued card", async () => {
    setup();
    const looks = LOOKS.slice(0, 7);
    const Harness: React.FC<{ n: number }> = ({ n }) => (
      <div>
        {looks.slice(0, n).map((look) => (
          <AnimatedTemplatePreview key={look.id} look={look} poster={<div>POSTER</div>} />
        ))}
      </div>
    );
    const view = render(<Harness n={7} />);
    const cards = [...view.container.querySelectorAll(":scope > div > div")];
    await act(async () => { cards.forEach((c) => FakeIO.setVisible(c, true)); });
    expect(liveLayers(view.container)).toBe(3);
    view.rerender(<Harness n={6} />);
    // still 6 mounted, 3 live — the freed slot went to the card that was queued
    expect(liveLayers(view.container)).toBe(3);
    view.unmount();
  });

  it("every look goes live when scrolled into view — all 150, no per-look exception", async () => {
    // Browser fine-probe (dev harness, 2026-11-14): scrolling the full list made 144 of
    // 150 looks live; 6 never surfaced at a sampled instant (scroll-step granularity, not
    // a per-look defect — 3 of the 6 were live in the top-of-list probe). This test closes
    // the gap: it walks every look through the viewport in groups of 3 (the per-kind
    // budget) and asserts each group actually goes live, then releases cleanly.
    setup();
    expect(LOOKS.length).toBe(150);
    const view = render(
      <div>
        {LOOKS.map((look) => (
          <AnimatedTemplatePreview key={look.id} look={look} poster={<div>POSTER</div>} />
        ))}
      </div>,
    );
    const cards = [...view.container.querySelectorAll(":scope > div > div")];
    expect(cards).toHaveLength(150);
    // Liveness is counted per CARD (a card with a live layer), not per matching div:
    // difference_invert draws two 1080px-wide divs in its live layer, so the global
    // div count overcounts it — the budget still holds exactly 3 live cards.
    const isLive = (card: Element) => card.querySelector('div[style*="1080px"]') !== null;
    const liveCardCount = () => cards.filter(isLive).length;
    for (let i = 0; i < cards.length; i += 3) {
      const group = cards.slice(i, i + 3);
      await act(async () => { group.forEach((c) => FakeIO.setVisible(c, true)); });
      expect(group.every(isLive)).toBe(true);
      expect(liveCardCount()).toBe(group.length);
      await act(async () => { group.forEach((c) => FakeIO.setVisible(c, false)); });
      expect(liveCardCount()).toBe(0);
    }
    // 30s timeout (not the 5s default): the walk is 50 show/hide rounds over 150 cards.
    view.unmount();
    expect(liveCardCount()).toBe(0);
  }, 30000);
});
