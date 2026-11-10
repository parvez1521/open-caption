/**
 * Social Media preview guard (Phase 4 Run 2 — owner bug 2026-11-10: the Elements panel's
 * animated-graphics cards showed only a name + description and never played, so the owner could
 * not see what a graphic does before placing it).
 *
 * Pins three things:
 *  1. ElementsPanel mounts a REAL preview on every Social Media card — the poster is the actual
 *     OverlayView drawing (its acted-state text is on the card before anything goes live), and
 *     clicking a card still adds the overlay at the playhead + selects it, unchanged.
 *  2. Social previews go live near the viewport under the SAME 6-slot budget as the template
 *     previews: a mixed row of template + social previews caps at 6 live TOTAL (two private
 *     counters would allow 12), and unmounting returns the shared counter to 0.
 *  3. There is exactly ONE budget counter: both preview components import it from
 *     livePreviewBudget.ts and neither keeps a private counter (source-level pin).
 */
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectSettingsSchema } from "@capseasy/shared";
import { SOCIAL_META } from "@capseasy/compositions";
import { LOOKS } from "@capseasy/templates";
import { AnimatedSocialPreview } from "../panels/AnimatedSocialPreview";
import { AnimatedTemplatePreview } from "../panels/AnimatedTemplatePreview";
import { ElementsPanel } from "../panels/ElementsPanel";
import { livePreviewCount, livePreviewWaiterCount } from "../panels/livePreviewBudget";

/** IntersectionObserver fake: the test drives visibility per element (same fake as animatedPreview.test). */
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
  const g = globalThis as unknown as Record<string, unknown>;
  g["IntersectionObserver"] = FakeIO;
  g["ResizeObserver"] = FakeRO;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return 320; } });
}

afterEach(() => {
  FakeIO.instances = [];
  // a leaked slot/waiter from a failed test must not poison the next one — and asserting the
  // shared counter drained is itself part of the guard
  expect(livePreviewCount()).toBe(0);
  expect(livePreviewWaiterCount()).toBe(0);
});

const socialLiveLayers = (root: HTMLElement) => root.querySelectorAll('[data-testid="social-preview-live"]').length;
const templateLiveLayers = (root: HTMLElement) => root.querySelectorAll('div[style*="1080px"]').length;

function renderElementsPanel() {
  const patch = vi.fn();
  const onSelect = vi.fn();
  const view = render(
    <ElementsPanel
      settings={ProjectSettingsSchema.parse({})}
      patch={patch}
      selectedId={null}
      onSelect={onSelect}
      getTimeMs={() => 1000}
      durationMs={30000}
    />,
  );
  return { view, patch, onSelect };
}

describe("ElementsPanel Social Media cards (real previews mounted)", () => {
  it("mounts one AnimatedSocialPreview per SOCIAL_META variant, poster drawing the real element", () => {
    setup();
    const { view } = renderElementsPanel();
    const previews = view.container.querySelectorAll('[data-testid="social-preview"]');
    expect(previews.length).toBe(SOCIAL_META.length);
    expect([...previews].map((p) => p.getAttribute("data-variant"))).toEqual(SOCIAL_META.map((m) => m.id));
    // the poster is the real OverlayView at its acted instant — not a name/description stand-in:
    // Subscribe Pill's poster shows the flipped "Subscribed" label, the Counter's shows its
    // "followers" caption line, the Follow Banner's shows the default channel name lines.
    expect(view.container.textContent).toContain("Subscribed");
    expect(view.container.textContent).toContain("followers");
    expect(view.container.textContent).toContain("Creator Name");
    view.unmount();
  });

  it("clicking a card still adds that social overlay at the playhead and selects it (behaviour unchanged)", () => {
    setup();
    const { view, patch, onSelect } = renderElementsPanel();
    const btn = [...view.container.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Add Subscribe Pill");
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(patch).toHaveBeenCalledTimes(1);
    const arg = patch.mock.calls[0]![0] as { overlays: Array<{ id: string; kind: string; variant?: string; startMs: number }> };
    expect(arg.overlays).toHaveLength(1);
    expect(arg.overlays[0]).toMatchObject({ kind: "social", variant: "subscribe-pill", startMs: 1000 });
    expect(arg.overlays[0]!.id).toBeTruthy();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(arg.overlays[0]!.id);
    view.unmount();
  });

  it("social cards go live near the viewport, capped at the shared budget of 6", async () => {
    setup();
    const { view } = renderElementsPanel();
    const previews = [...view.container.querySelectorAll('[data-testid="social-preview"]')];
    expect(socialLiveLayers(view.container)).toBe(0);
    await act(async () => { previews.forEach((p) => FakeIO.setVisible(p, true)); });
    expect(socialLiveLayers(view.container)).toBe(6);
    expect(livePreviewCount()).toBe(6);
    // first card scrolls away: its slot recycles to a queued card — still exactly 6 live
    await act(async () => { FakeIO.setVisible(previews[0]!, false); });
    expect(socialLiveLayers(view.container)).toBe(6);
    view.unmount();
  });
});

describe("the shared live-slot budget (one counter for the whole studio)", () => {
  it("a mixed row of template + social previews caps at 6 live TOTAL, not 6 per kind", async () => {
    setup();
    const view = render(
      <div>
        {LOOKS.slice(0, 4).map((look) => (
          <AnimatedTemplatePreview key={look.id} look={look} poster={<div>POSTER</div>} />
        ))}
        {SOCIAL_META.slice(0, 4).map((m) => (
          <AnimatedSocialPreview key={m.id} variant={m.id} />
        ))}
      </div>,
    );
    const roots = [
      ...view.container.querySelectorAll(":scope > div > div"),
    ];
    await act(async () => { roots.forEach((r) => FakeIO.setVisible(r, true)); });
    // with two private counters this would be 8; the single shared budget caps the mix at 6
    expect(templateLiveLayers(view.container) + socialLiveLayers(view.container)).toBe(6);
    expect(livePreviewCount()).toBe(6);
    view.unmount();
    expect(livePreviewCount()).toBe(0);
  });

  it("both preview components import the budget from livePreviewBudget.ts and keep no private counter", () => {
    // vitest runs with the frontend package as cwd (pnpm --filter frontend test)
    const readPanel = (name: string) => readFileSync(join(process.cwd(), "src/features/studio/panels", name), "utf8");
    const budget = readPanel("livePreviewBudget.ts");
    expect(budget).toContain("MAX_LIVE_PREVIEWS = 6");
    for (const name of ["AnimatedTemplatePreview.tsx", "AnimatedSocialPreview.tsx"]) {
      const src = readPanel(name);
      expect(src, `${name} must use the shared budget`).toContain('from "./livePreviewBudget"');
      expect(src, `${name} must not keep a private slot counter`).not.toMatch(/let liveCount/);
      expect(src, `${name} must not keep a private waiter queue`).not.toMatch(/const waiters/);
    }
    // and the panel itself mounts the social preview component (not a text-only card)
    expect(readPanel("ElementsPanel.tsx")).toContain("AnimatedSocialPreview");
  });
});
