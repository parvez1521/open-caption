/**
 * MotionStudioPanel (follow-up 2026-11-11): Motion Studio inside the editor's right column.
 * Pins: every registry template is offered (same registry as /motion), search + category
 * chips filter through the registry's own search, and adding a template goes through the
 * shared overlay path (makeSocialOverlay + patch + select) with the item length set to the
 * template's registry default duration. Previews stay posters here (the shared live budget
 * is never granted visibility in this harness).
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
    expect(screen.getByRole("button", { name: `All (${MOTION_TEMPLATES.length})` })).toBeTruthy();
    const link = view.container.querySelector('a[href="/motion"]');
    expect(link?.textContent).toContain("full Motion Studio");
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

  it("a category chip filters to that category with the registry count", () => {
    setup();
    const { view } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Youtube (6)" }));
    expect(addButtons(view.container)).toHaveLength(6);
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
