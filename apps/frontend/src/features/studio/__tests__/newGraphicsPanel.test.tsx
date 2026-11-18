/**
 * NewGraphicsPanel (2026-11-18): the 300 NEW motion graphics inside the editor's
 * right column. Pins: the fifteen new families each render their graphic cards
 * (same card style as MotionPackPanel), and adding a card goes through the shared
 * overlay path (makeSocialOverlay + patch + select) with the item length set to
 * the entry's registry default duration. Previews stay posters here (the shared
 * live budget is never granted visibility in this harness).
 */
import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectSettingsSchema } from "@capseasy/shared";
import { getNewGraphic } from "@capseasy/compositions";
import { NewGraphicsPanel } from "../panels/NewGraphicsPanel";
import { NEW_GRAPHICS_GROUPS } from "../newGraphics";
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
    <NewGraphicsPanel
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

describe("NewGraphicsPanel", () => {
  it("renders one section per new family with every new graphic as a card", () => {
    setup();
    const { view } = renderPanel();
    const labels = addButtons(view.container).map((b) => b.getAttribute("aria-label")).sort();
    const expected = NEW_GRAPHICS_GROUPS.flatMap((g) => g.ids.map((id) => `Add ${getNewGraphic(id)!.title}`)).sort();
    expect(labels).toEqual(expected);
    expect(labels).toHaveLength(300);
    for (const group of NEW_GRAPHICS_GROUPS) {
      expect(view.container.textContent).toContain(group.title);
    }
    view.unmount();
  });

  it("clicking a card adds that variant at the playhead with the registry default duration and selects it", () => {
    setup();
    const { view, patch, onSelect } = renderPanel();
    const btn = addButtons(view.container).find((b) => b.getAttribute("aria-label") === "Add Lower Third Bar Left");
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(patch).toHaveBeenCalledTimes(1);
    const arg = patch.mock.calls[0]![0] as { overlays: Array<{ id: string; kind: string; variant?: string; startMs: number; endMs: number }> };
    expect(arg.overlays).toHaveLength(1);
    const item = arg.overlays[0]!;
    expect(item).toMatchObject({ kind: "social", variant: "ng-lt-bar-left", startMs: 1000 });
    expect(item.endMs - item.startMs).toBe(getNewGraphic("ng-lt-bar-left")!.defaultDurationMs);
    expect(onSelect).toHaveBeenCalledWith(item.id);
    view.unmount();
  });

  it("a poll card adds with its 5000 ms registry duration", () => {
    setup();
    const { view, patch, onSelect } = renderPanel();
    const btn = addButtons(view.container).find((b) => b.getAttribute("aria-label") === "Add Poll 3 Bars");
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    const arg = patch.mock.calls[0]![0] as { overlays: Array<{ id: string; kind: string; variant?: string; startMs: number; endMs: number }> };
    expect(arg.overlays[0]).toMatchObject({ kind: "social", variant: "ng-po-3-bars", startMs: 1000 });
    expect(arg.overlays[0]!.endMs - arg.overlays[0]!.startMs).toBe(5000);
    expect(onSelect).toHaveBeenCalledWith(arg.overlays[0]!.id);
    view.unmount();
  });
});
