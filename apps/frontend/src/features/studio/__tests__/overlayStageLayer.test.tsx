/**
 * OverlayStageLayer (P4, 2026-11-11): placed overlays can be dragged on the stage.
 * Pins the pure geometry (centre is the item's exact x/y; clamps match the schema)
 * and the gesture wiring: pointer down on a box selects it, moving patches x/y,
 * the corner handle patches scale, the top handle patches rotation — all through
 * the same settings-patch path the inspector uses.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OverlayItem } from "@capseasy/shared";
import { OverlayStageLayer, movedItem, overlayStageBox, rotatedItem, scaledItem } from "../OverlayStageLayer";

const item: OverlayItem = {
  id: "ov1", kind: "social", variant: "subscribe-banner",
  text: "Your Channel\nNew videos every week\nSubscribe\nSubscribed",
  startMs: 0, endMs: 8000, x: 0.5, y: 0.78, scale: 1, rotation: 0, color: "#FF4D2E",
};

class FakeRO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function setup() {
  const g = globalThis as unknown as Record<string, unknown>;
  g["ResizeObserver"] = FakeRO;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return 800; } });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get() { return 450; } });
}

function renderLayer(overrides: Partial<React.ComponentProps<typeof OverlayStageLayer>> = {}) {
  const onSelect = vi.fn();
  const onPatch = vi.fn();
  const view = render(
    <OverlayStageLayer overlays={[item]} timeMs={1000} selectedId={null} onSelect={onSelect} onPatch={onPatch} {...overrides} />,
  );
  // jsdom has no layout: give the layer root the same rect the size mocks imply
  const root = view.container.firstElementChild as HTMLElement;
  root.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 800, bottom: 450, width: 800, height: 450, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return { view, onSelect, onPatch, root };
}

describe("overlay stage geometry", () => {
  it("the box centre is the item's exact position; size follows kind + scale", () => {
    const box = overlayStageBox(item, 800, 450);
    expect(box.cx).toBe(400);
    expect(box.cy).toBe(351);
    // subscribe-banner natural 640x122 reference px at sc = 450/1080
    expect(box.w).toBeCloseTo(640 * (450 / 1080), 1);
    expect(box.h).toBeCloseTo(122 * (450 / 1080), 1);
    const bigger = overlayStageBox({ ...item, scale: 2 }, 800, 450);
    expect(bigger.w).toBeCloseTo(box.w * 2, 1);
  });

  it("move/scale/rotate clamp to the schema ranges", () => {
    expect(movedItem(item, 0.8, -2).x).toBe(1);
    expect(movedItem(item, 0.8, -2).y).toBe(0);
    expect(scaledItem(item, 100, 900).scale).toBe(4);
    expect(scaledItem(item, 100, 5).scale).toBe(0.25);
    expect(rotatedItem(item, 0, 120).rotation).toBe(45);
    expect(rotatedItem(item, 0, -120).rotation).toBe(-45);
  });
});

describe("OverlayStageLayer gestures", () => {
  it("renders a hit box only while the item is on screen at the playhead", () => {
    setup();
    const { view } = renderLayer();
    expect(screen.getByTestId("overlay-stage-box-ov1")).toBeTruthy();
    view.unmount();
    const late = renderLayer({ timeMs: 9000 });
    expect(screen.queryByTestId("overlay-stage-box-ov1")).toBeNull();
    late.view.unmount();
  });

  it("dragging the box moves the item (and selects it)", () => {
    setup();
    const { onSelect, onPatch } = renderLayer();
    const box = screen.getByTestId("overlay-stage-box-ov1");
    fireEvent.pointerDown(box, { clientX: 400, clientY: 351, pointerId: 1 });
    expect(onSelect).toHaveBeenCalledWith("ov1");
    fireEvent.pointerMove(window, { clientX: 480, clientY: 306, pointerId: 1 });
    expect(onPatch).toHaveBeenCalled();
    const patched = onPatch.mock.calls[onPatch.mock.calls.length - 1]![0] as OverlayItem;
    expect(patched.x).toBeCloseTo(0.6, 3); // +80px of 800
    expect(patched.y).toBeCloseTo(0.68, 3); // -45px of 450
    fireEvent.pointerUp(window, { pointerId: 1 });
  });

  it("the corner handle rescales by distance from the centre", () => {
    setup();
    const { onPatch } = renderLayer({ selectedId: "ov1" });
    const handle = screen.getByTestId("overlay-scale-handle-ov1");
    const box = overlayStageBox(item, 800, 450);
    // grab at the handle (bottom-right corner), then pull to twice the distance
    fireEvent.pointerDown(handle, { clientX: box.cx + box.w / 2, clientY: box.cy + box.h / 2, pointerId: 2 });
    fireEvent.pointerMove(window, { clientX: box.cx + box.w, clientY: box.cy + box.h, pointerId: 2 });
    const patched = onPatch.mock.calls[onPatch.mock.calls.length - 1]![0] as OverlayItem;
    expect(patched.scale).toBeCloseTo(2, 1);
    fireEvent.pointerUp(window, { pointerId: 2 });
  });

  it("the top handle rotates, clamped at 45 degrees", () => {
    setup();
    const { onPatch } = renderLayer({ selectedId: "ov1" });
    const handle = screen.getByTestId("overlay-rotate-handle-ov1");
    const box = overlayStageBox(item, 800, 450);
    // grab above the centre (angle -90), then move the pointer to the right (angle 0)
    fireEvent.pointerDown(handle, { clientX: box.cx, clientY: box.cy - 60, pointerId: 3 });
    fireEvent.pointerMove(window, { clientX: box.cx + 60, clientY: box.cy, pointerId: 3 });
    const patched = onPatch.mock.calls[onPatch.mock.calls.length - 1]![0] as OverlayItem;
    expect(patched.rotation).toBe(45);
    fireEvent.pointerUp(window, { pointerId: 3 });
  });
});
