import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRANSITION_CATEGORIES, TRANSITION_REGISTRY } from "@capseasy/compositions";
import { TRANSITION_DRAG_MIME, TransitionsPanel, type TransitionsPanelProps } from "../panels/TransitionsPanel";

function renderPanel(props: Partial<TransitionsPanelProps> = {}) {
  const onApplyTransition = vi.fn();
  const onClearTransition = vi.fn();
  const onSplitAtPlayhead = vi.fn();
  const onSelectFirstJoin = vi.fn();
  const utils = render(
    <TransitionsPanel
      currentTransition={null}
      onApplyTransition={onApplyTransition}
      onClearTransition={onClearTransition}
      onSplitAtPlayhead={onSplitAtPlayhead}
      onSelectFirstJoin={onSelectFirstJoin}
      {...props}
    />,
  );
  return { ...utils, onApplyTransition, onClearTransition, onSplitAtPlayhead, onSelectFirstJoin };
}

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

function setupObservers() {
  FakeIO.instances = [];
  const g = globalThis as unknown as Record<string, unknown>;
  g["IntersectionObserver"] = FakeIO;
}

beforeEach(() => {
  setupObservers();
});

afterEach(() => {
  FakeIO.instances = [];
});

describe("TransitionsPanel", () => {
  it("renders all 10 category groups and all 100 transition cards", () => {
    renderPanel();
    for (const category of TRANSITION_CATEGORIES) {
      expect(screen.getByRole("heading", { name: category.label })).toBeTruthy();
    }
    expect(screen.getAllByLabelText(/^Apply /)).toHaveLength(100);
    expect(TRANSITION_REGISTRY).toHaveLength(100);
  });

  it("tapping a card applies that transition with its default duration", () => {
    const { onApplyTransition } = renderPanel({ selectedJoinLabel: "Cut after Clip 1" });
    fireEvent.click(screen.getByLabelText("Apply Cross Dissolve"));
    expect(onApplyTransition).toHaveBeenCalledWith({ type: "dissolve-cross", durationMs: 300 });
    fireEvent.click(screen.getByLabelText("Apply Glitch Hard"));
    expect(onApplyTransition).toHaveBeenCalledWith({ type: "glitch-hard", durationMs: 400 });
  });

  it("Split at playhead calls onSplitAtPlayhead", () => {
    const { onSplitAtPlayhead } = renderPanel();
    fireEvent.click(screen.getByText("Split at playhead"));
    expect(onSplitAtPlayhead).toHaveBeenCalledTimes(1);
  });

  it("with a current transition, the duration slider re-applies with the new duration and Plain cut clears", () => {
    const { onApplyTransition, onClearTransition } = renderPanel({
      selectedJoinLabel: "Cut after Clip 1",
      currentTransition: { type: "glitch", durationMs: 400 },
    });
    expect(screen.getByLabelText("Apply Glitch").getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByLabelText("Duration"), { target: { value: "800" } });
    expect(onApplyTransition).toHaveBeenCalledWith({ type: "glitch", durationMs: 800 });
    fireEvent.click(screen.getByText("Plain cut"));
    expect(onClearTransition).toHaveBeenCalledTimes(1);
  });

  it("without a current transition there is no duration slider or Plain cut button", () => {
    renderPanel();
    expect(screen.queryByLabelText("Duration")).toBeNull();
    expect(screen.queryByText("Plain cut")).toBeNull();
  });

  it("disabled props disable the split button and the transition cards", () => {
    renderPanel({ transitionsDisabled: true, splitDisabled: true });
    expect((screen.getByText("Split at playhead") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Apply Cross Dissolve") as HTMLButtonElement).disabled).toBe(true);
  });

  it("no join selected: plain message + inline split offer, and tapping a card asks for a cut instead of doing nothing (CAP-T01)", () => {
    const { onApplyTransition, onSplitAtPlayhead } = renderPanel({ selectedJoinLabel: null });
    expect(screen.getByText(/No cut selected/)).toBeTruthy();
    expect(screen.getByText(/click a cut marker in the timeline/)).toBeTruthy();
    fireEvent.click(screen.getByText("Split at playhead to create a cut"));
    expect(onSplitAtPlayhead).toHaveBeenCalledTimes(1);
    const card = screen.getByLabelText("Apply Cross Dissolve");
    expect(card.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(card);
    // the tap reaches the apply handler (the parent answers with the
    // "Select a cut…" note) instead of dying silently in the panel
    expect(onApplyTransition).toHaveBeenCalledWith({ type: "dissolve-cross", durationMs: 300 });
  });

  it("no join selected with joins: offers selecting the first cut; without joins it does not", () => {
    const first = renderPanel({ selectedJoinLabel: null, hasJoins: true });
    fireEvent.click(screen.getByText("Select the first cut"));
    expect(first.onSelectFirstJoin).toHaveBeenCalledTimes(1);
    first.unmount();
    renderPanel({ selectedJoinLabel: null, hasJoins: false });
    expect(screen.queryByText("Select the first cut")).toBeNull();
  });

  it("legacy caller (no join label) with transitionsDisabled still explains instead of a dead grid", () => {
    renderPanel({ transitionsDisabled: true });
    expect(screen.getByText(/No cut selected/)).toBeTruthy();
    expect(screen.getByText("Split at playhead to create a cut")).toBeTruthy();
  });

  it("join selected: shows the join label and tapping applies", () => {
    const { onApplyTransition } = renderPanel({ selectedJoinLabel: "Cut after Clip 1" });
    expect(screen.getByText("Applying to Cut after Clip 1")).toBeTruthy();
    expect(screen.queryByText(/No cut selected/)).toBeNull();
    fireEvent.click(screen.getByLabelText("Apply Cross Dissolve"));
    expect(onApplyTransition).toHaveBeenCalledWith({ type: "dissolve-cross", durationMs: 300 });
  });

  it("applied card shows the applied state unmistakably", () => {
    renderPanel({
      selectedJoinLabel: "Cut after Clip 1",
      currentTransition: { type: "dissolve-cross", durationMs: 300 },
    });
    const card = screen.getByLabelText("Apply Cross Dissolve");
    expect(card.getAttribute("aria-pressed")).toBe("true");
    expect(card.textContent).toMatch(/Applied/);
    expect(screen.getByLabelText("Apply Glitch Hard").textContent).not.toMatch(/Applied/);
  });

  it("dragging a card sets the transition drag payload with the registry id and duration", () => {
    renderPanel({ selectedJoinLabel: "Cut after Clip 1" });
    const card = screen.getByLabelText("Apply Cross Dissolve");
    expect((card as HTMLElement).draggable).toBe(true);
    const setData = vi.fn();
    const dataTransfer = { setData, effectAllowed: "" };
    fireEvent.dragStart(card, { dataTransfer });
    expect(setData).toHaveBeenCalledWith(
      TRANSITION_DRAG_MIME,
      JSON.stringify({ type: "dissolve-cross", durationMs: 300 }),
    );
    expect(dataTransfer.effectAllowed).toBe("copy");
  });

  it("every card carries a real animated preview (its own miniature, not a static label)", () => {
    renderPanel({ selectedJoinLabel: "Cut after Clip 1" });
    const previews = document.querySelectorAll("[data-transition-preview]");
    expect(previews).toHaveLength(100);
    expect(previews[0]?.getAttribute("data-transition-preview")).toBe("dissolve-cross");
  });

  it("a card near the viewport goes live, at most 3 at once, and the slot recycles", async () => {
    setupObservers();
    const view = renderPanel({ selectedJoinLabel: "Cut after Clip 1" });
    const previews = [...document.querySelectorAll("[data-transition-preview]")];
    expect(previews.length).toBe(100);
    await act(async () => { previews.slice(0, 8).forEach((el) => FakeIO.setVisible(el, true)); });
    expect(document.querySelectorAll("[data-transition-live]")).toHaveLength(3);
    await act(async () => { FakeIO.setVisible(previews[0]!, false); });
    expect(document.querySelectorAll("[data-transition-live]")).toHaveLength(3);
    view.unmount();
    expect(document.querySelectorAll("[data-transition-live]")).toHaveLength(0);
  });

  it("prefers-reduced-motion keeps every preview a still, even in view", async () => {
    setupObservers();
    const g = globalThis as unknown as Record<string, unknown>;
    const origMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    try {
      const view = renderPanel({ selectedJoinLabel: "Cut after Clip 1" });
      const previews = [...document.querySelectorAll("[data-transition-preview]")];
      await act(async () => { previews.slice(0, 4).forEach((el) => FakeIO.setVisible(el, true)); });
      expect(document.querySelectorAll("[data-transition-live]")).toHaveLength(0);
      view.unmount();
    } finally {
      if (origMatchMedia) window.matchMedia = origMatchMedia;
      else delete (g as Record<string, unknown>)["matchMedia"];
    }
  });
});
