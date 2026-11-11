/**
 * MotionStudioPanel (follow-up 2026-11-11): Motion Studio inside the editor's right column.
 * Pins: every registry template is offered (same registry as /motion), search filters
 * through the registry's own search, and adding a template goes through the shared
 * overlay path (makeSocialOverlay + patch + select) with the item length set to the
 * template's registry default duration. Previews stay posters here (the shared live budget
 * is never granted visibility in this harness).
 *
 * 2026-11-11 (owner order): the panel carries NO category filter UI — the pills the owner
 * screenshotted are gone; search + the full list only. The /motion discovery page keeps
 * its filters (different surface, pinned by its own tests).
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectSettingsSchema } from "@capseasy/shared";
import { MOTION_TEMPLATES, getMotionTemplate } from "@capseasy/motion";
import { MotionStudioPanel } from "../panels/MotionStudioPanel";
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
    <MotionStudioPanel
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

describe("MotionStudioPanel", () => {
  it("offers every registry template and links out to the full Motion Studio", () => {
    setup();
    const { view } = renderPanel();
    expect(addButtons(view.container)).toHaveLength(MOTION_TEMPLATES.length);
    const link = view.container.querySelector('a[href="/motion"]');
    expect(link?.textContent).toContain("full Motion Studio");
    view.unmount();
  });

  it("has NO category filter UI (owner order 2026-11-11 — the pills are gone)", () => {
    setup();
    const { view } = renderPanel();
    expect(view.container.querySelector('[aria-label="Motion template categories"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /^All \(\d+\)$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Youtube \(\d+\)$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Instagram \(\d+\)$/ })).toBeNull();
    // and with no filter state at all, the full list is what shows
    expect(addButtons(view.container)).toHaveLength(MOTION_TEMPLATES.length);
    view.unmount();
  });

  it("search filters through the registry search (the cursor family)", () => {
    setup();
    const { view } = renderPanel();
    fireEvent.change(screen.getByLabelText("Search motion templates"), { target: { value: "cursor" } });
    const labels = addButtons(view.container).map((b) => b.getAttribute("aria-label")).sort();
    expect(labels).toEqual(["Add Cursor Click Button", "Add Cursor Follow", "Add Cursor Like", "Add Cursor Subscribe"]);
    expect(labels).toHaveLength(4);
    view.unmount();
  });

  it("adding places the overlay at the playhead with the registry default duration and selects it", () => {
    setup();
    const { view, patch, onSelect } = renderPanel();
    const btn = addButtons(view.container).find((b) => b.getAttribute("aria-label") === "Add Cursor Click Button");
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(patch).toHaveBeenCalledTimes(1);
    const arg = patch.mock.calls[0]![0] as { overlays: Array<{ id: string; kind: string; variant?: string; startMs: number; endMs: number }> };
    expect(arg.overlays).toHaveLength(1);
    const item = arg.overlays[0]!;
    expect(item).toMatchObject({ kind: "social", variant: "cursor-click", startMs: 1000 });
    expect(item.endMs - item.startMs).toBe(getMotionTemplate("cursor-click")!.defaultDurationMs);
    expect(onSelect).toHaveBeenCalledWith(item.id);
    view.unmount();
  });

  it("an empty search says so instead of showing a blank grid", () => {
    setup();
    const { view } = renderPanel();
    fireEvent.change(screen.getByLabelText("Search motion templates"), { target: { value: "zzzz-nothing" } });
    expect(view.container.textContent).toContain("No templates match that search.");
    expect(addButtons(view.container)).toHaveLength(0);
    view.unmount();
  });
});
