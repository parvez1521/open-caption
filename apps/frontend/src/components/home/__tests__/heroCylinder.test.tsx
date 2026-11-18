import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeroCylinder } from "../HeroCylinder";

/**
 * CAP-U02: the hero cylinder used `touch-action: none` on the whole 320–360 px
 * strip, so a vertical swipe starting on it spun the carousel instead of
 * scrolling the page. Now it is `pan-y` — vertical swipes scroll, horizontal
 * drags still spin the ring. Live touch feel on a real phone is owner-check-owed;
 * this pins the value and the drag behaviour at code level.
 */

// jsdom has no IntersectionObserver / ResizeObserver / matchMedia / pointer capture; the cylinder needs them on mount.
class FakeIO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", FakeIO);
vi.stubGlobal("ResizeObserver", FakeIO);
vi.stubGlobal(
  "matchMedia",
  () => ({ matches: false, media: "", addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }),
);
if (typeof Element.prototype.setPointerCapture !== "function") {
  Element.prototype.setPointerCapture = () => {};
}

describe("HeroCylinder touch behaviour — CAP-U02", () => {
  it("lets vertical swipes scroll the page (touch-action pan-y, not none)", () => {
    const { unmount } = render(<HeroCylinder />);
    const wrap = screen.getByRole("img");
    expect(wrap.style.touchAction).toBe("pan-y");
    unmount();
  });

  it("a horizontal drag still spins the ring", () => {
    const { container, unmount } = render(<HeroCylinder />);
    const wrap = screen.getByRole("img");
    const ring = container.querySelector<HTMLDivElement>('[style*="preserve-3d"]');
    expect(ring).not.toBeNull();
    const before = ring!.style.transform;
    fireEvent.pointerDown(wrap, { pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(wrap, { pointerId: 1, clientX: 220 });
    fireEvent.pointerUp(wrap, { pointerId: 1, clientX: 220 });
    expect(ring!.style.transform).not.toBe(before);
    expect(ring!.style.transform).toMatch(/rotateY\(/);
    unmount();
  });
});
