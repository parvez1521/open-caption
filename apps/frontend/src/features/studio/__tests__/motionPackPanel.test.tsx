/**
 * MotionPackPanel (2026-11-18): the Motion Graphics Pack inside the editor's right column.
 * Pins: the six everyday-use groups each render their template cards (same card style as
 * MotionStudioPanel), and adding a card goes through the shared overlay path
 * (makeSocialOverlay + patch + select) with the item length set to the template's
 * registry default duration. Previews stay posters here (the shared live budget is
 * never granted visibility in this harness).
 */
import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectSettingsSchema } from "@capseasy/shared";
import { getMotionTemplate } from "@capseasy/motion";
import { MotionPackPanel } from "../panels/MotionPackPanel";
import { MOTION_PACK_GROUPS } from "../motionPack";
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
  expect(livePreviewCount()).toBe(0);
  expect(livePreviewWaiterCount()).toBe(0);
});

function renderPanel() {
  const patch = vi.fn();
  const onSelect = vi.fn();
  const view = render(
    <MotionPackPanel
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

const addButtons = (root: HTMLElement) => [...root.querySelectorAll("button")].filter((b) => (b.getAttribute("aria-label") ?? "").startsWith("Add "));

describe("MotionPackPanel", () => {
  it("renders one section per pack group with every pack template as a card", () => {
    setup();
    const { view } = renderPanel();
    const labels = addButtons(view.container).map((b) => b.getAttribute("aria-label")).sort();
    const expected = MOTION_PACK_GROUPS.flatMap((g) => g.ids.map((id) => `Add ${getMotionTemplate(id)!.title}`)).sort();
    expect(labels).toEqual(expected);
    expect(labels).toHaveLength(14);
    for (const group of MOTION_PACK_GROUPS) {
      expect(view.container.textContent).toContain(group.title);
    }
    view.unmount();
  });

  it("clicking a card adds that variant at the playhead with the registry default duration and selects it", () => {
    setup();
    const { view, patch, onSelect } = renderPanel();
    const btn = addButtons(view.container).find((b) => b.getAttribute("aria-label") === "Add Callout Bubble");
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(patch).toHaveBeenCalledTimes(1);
    const arg = patch.mock.calls[0]![0] as { overlays: Array<{ id: string; kind: string; variant?: string; startMs: number; endMs: number }> };
    expect(arg.overlays).toHaveLength(1);
    const item = arg.overlays[0]!;
    expect(item).toMatchObject({ kind: "social", variant: "callout", startMs: 1000 });
    expect(item.endMs - item.startMs).toBe(getMotionTemplate("callout")!.defaultDurationMs);
    expect(onSelect).toHaveBeenCalledWith(item.id);
    view.unmount();
  });

  it("the progress card adds progress-fill the same way", () => {
    setup();
    const { view, patch, onSelect } = renderPanel();
    const btn = addButtons(view.container).find((b) => b.getAttribute("aria-label") === "Add Progress Fill");
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    const arg = patch.mock.calls[0]![0] as { overlays: Array<{ id: string; kind: string; variant?: string; startMs: number; endMs: number }> };
    expect(arg.overlays[0]).toMatchObject({ kind: "social", variant: "progress-fill", startMs: 1000 });
    expect(arg.overlays[0]!.endMs - arg.overlays[0]!.startMs).toBe(4000);
    expect(onSelect).toHaveBeenCalledWith(arg.overlays[0]!.id);
    view.unmount();
  });
});
