/**
 * Title live previews: every one of the 50 title cards renders a real preview element
 * wired to its own animation kind, a card near the viewport goes live and plays the
 * title's own Remotion enter/exit (through overlayAnimStyle, the exact function the
 * studio preview and export use), the loop restarts after the title's own duration,
 * and the shared live-slot budget caps simultaneous live previews at 3 and recycles.
 */
import React from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectSettingsSchema } from "@capseasy/shared";
import { overlayAnimStyle } from "@capseasy/compositions";
import { TITLE_STYLES, makeTitleOverlay } from "../titleStyles";
import { TitlesPanel } from "../panels/TitlesPanel";
import { TitleLivePreview } from "../panels/TitleLivePreview";

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

function setupObservers() {
  FakeIO.instances = [];
  const g = globalThis as unknown as Record<string, unknown>;
  g["IntersectionObserver"] = FakeIO;
  g["ResizeObserver"] = FakeRO;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return 320; } });
}

afterEach(() => {
  FakeIO.instances = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPanel() {
  const patch = vi.fn();
  const onSelect = vi.fn();
  const view = render(
    <TitlesPanel
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

const previews = (root: HTMLElement) => [...root.querySelectorAll('[data-testid="title-preview"]')] as HTMLElement[];
const liveLayers = (root: HTMLElement) => [...root.querySelectorAll('[data-live-layer="true"]')];

describe("TitleLivePreview", () => {
  it("renders one live-preview element per title — all 50, each wired to its own animation kind", () => {
    setupObservers();
    const { view } = renderPanel();
    const cards = previews(view.container);
    expect(cards).toHaveLength(50);
    expect(TITLE_STYLES).toHaveLength(50);
    for (const style of TITLE_STYLES) {
      const card = cards.find((c) => c.getAttribute("data-title-id") === style.id);
      expect(card).toBeTruthy();
      expect(card!.getAttribute("data-enter-anim")).toBe(style.enterAnim);
      expect(card!.getAttribute("data-exit-anim")).toBe(style.exitAnim);
      // the preview shows the title's own text in its own typography, not a generic label
      expect(card!.textContent).toContain(style.text);
    }
    view.unmount();
  });

  it("clicking a card still adds the title at the playhead (preview does not swallow the click)", () => {
    setupObservers();
    const { view, patch, onSelect } = renderPanel();
    const btn = view.container.querySelector('button[aria-label="Add Big Impact"]')!;
    fireEvent.click(btn);
    expect(patch).toHaveBeenCalledTimes(1);
    const item = (patch.mock.calls[0]![0] as { overlays: Array<{ text: string }> }).overlays[0]!;
    expect(item.text).toBe("BIG IDEA");
    expect(onSelect).toHaveBeenCalled();
    view.unmount();
  });

  it("a card near the viewport goes live and plays the title's own Remotion animation, then loops", async () => {
    setupObservers();
    // Drive the rAF clock by hand so every asserted frame is deterministic: the callback
    // is captured, never auto-fired, and performance.now() is pinned to 0 at effect time.
    let rafCb: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { rafCb = cb; return 1; });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(performance, "now").mockImplementation(() => 0);

    const style = TITLE_STYLES.find((s) => s.id === "kinetic-slide")!;
    const item = makeTitleOverlay(style, 0, style.durationMs);
    // The clock steps in 30 fps frames, so the time a given `now` lands on is the frame
    // floor, not `now` itself (3400ms is not a frame boundary): derive it the same way.
    const frameMs = 1000 / 30;
    const clockMs = (now: number) => (Math.floor(now / frameMs) * frameMs) % style.durationMs;
    const expectedAt = (now: number) => overlayAnimStyle(item, clockMs(now));
    const view = render(<TitleLivePreview style={style} />);
    const card = previews(view.container)[0]!;
    await act(async () => { FakeIO.setVisible(card, true); });
    expect(liveLayers(view.container)).toHaveLength(1);
    // (the poster frame carries the same test id, settled — always scope to the live layer)
    const anim = () => view.container.querySelector('[data-live-layer="true"] [data-testid="title-anim"]') as HTMLElement;

    // t = 0: the slide-left entrance is at its start — the live layer shows the title's
    // own enter animation, exactly what overlayAnimStyle computes for the real overlay.
    await act(async () => { rafCb!(0); });
    expect(anim().style.transform).toBe(expectedAt(0).transform);
    expect(parseFloat(anim().style.opacity)).toBeCloseTo(Number(expectedAt(0).opacity), 6);

    // t = 2000ms (mid-loop): entrance done, exit not started — the title sits settled.
    await act(async () => { rafCb!(2000); });
    expect(expectedAt(2000)).toEqual({});
    expect(anim().style.transform).toBe("");
    expect(anim().style.opacity).toBe("");

    // t = 3400ms (near the end of the 3500ms window): the slide-up exit is running.
    await act(async () => { rafCb!(3400); });
    const exitStyle = expectedAt(3400);
    expect(exitStyle.transform).toMatch(/translateY\(-/);
    expect(anim().style.transform).toBe(exitStyle.transform);
    expect(parseFloat(anim().style.opacity)).toBeCloseTo(Number(exitStyle.opacity), 6);

    // t = 3500ms (the title's own duration): the loop restarts at the entrance.
    await act(async () => { rafCb!(3500); });
    expect(anim().style.transform).toBe(expectedAt(3500).transform);
    view.unmount();
  });

  it("caps at 3 live title previews and recycles the slot when a live card leaves the viewport", async () => {
    setupObservers();
    const { view } = renderPanel();
    const cards = previews(view.container);
    await act(async () => { cards.forEach((c) => FakeIO.setVisible(c, true)); });
    expect(liveLayers(view.container)).toHaveLength(3);
    const liveBefore = liveLayers(view.container).map((l) => l.closest('[data-testid="title-preview"]')!.getAttribute("data-title-id"));
    // first live card scrolls far away: its slot must free up and a queued card must take it
    const leaving = cards.find((c) => c.getAttribute("data-title-id") === liveBefore[0])!;
    await act(async () => { FakeIO.setVisible(leaving, false); });
    expect(liveLayers(view.container)).toHaveLength(3);
    const liveAfter = liveLayers(view.container).map((l) => l.closest('[data-testid="title-preview"]')!.getAttribute("data-title-id"));
    expect(liveAfter).not.toContain(liveBefore[0]);
    expect(liveAfter.some((id) => !liveBefore.includes(id))).toBe(true);
    view.unmount();
  });

  it("every title goes live when scrolled into view — all 50, no per-title exception", async () => {
    setupObservers();
    const { view } = renderPanel();
    const cards = previews(view.container);
    expect(cards).toHaveLength(50);
    for (let i = 0; i < cards.length; i += 3) {
      const group = cards.slice(i, i + 3);
      await act(async () => { group.forEach((c) => FakeIO.setVisible(c, true)); });
      expect(group.every((c) => c.querySelector('[data-live-layer="true"]') !== null)).toBe(true);
      expect(liveLayers(view.container)).toHaveLength(group.length);
      await act(async () => { group.forEach((c) => FakeIO.setVisible(c, false)); });
      expect(liveLayers(view.container)).toHaveLength(0);
    }
    view.unmount();
  }, 30000);
});
