import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FreePopup } from "../FreePopup";
import { FREE_POPUP_DISMISSED_KEY } from "../freePopup";

/**
 * Homepage "Free until 5th December" popup (owner order 2026-11-28):
 * 5s after the entrance finishes, close button + Escape dismiss it,
 * a dismissal suppresses it for 7 days, and it never shows while another
 * dialog is open or after the free window ends.
 */
describe("FreePopup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // inside the free window (ends 5 Dec 2026, 23:59 IST)
    vi.setSystemTime(new Date("2026-12-01T10:00:00Z"));
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("stays hidden while the entrance is still running, however long it takes", () => {
    render(<FreePopup ready={false} />);
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("appears exactly 5s after ready, with the offer and the Start free link", () => {
    const { rerender } = render(<FreePopup ready={false} />);
    rerender(<FreePopup ready />);
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Free until 5th December" }),
    ).toBeTruthy();
    expect(screen.getByText(/no card needed/)).toBeTruthy();
    expect(screen.getByText(/Starter ₹149/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Start free/ })).toHaveAttribute(
      "href",
      "/start",
    );
  });

  it("close button hides it, records the dismissal, and it stays hidden on remount", () => {
    render(<FreePopup ready />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      window.localStorage.getItem(FREE_POPUP_DISMISSED_KEY),
    ).toBeTruthy();
    // fresh mount (next visit) inside the 7 days: still suppressed
    render(<FreePopup ready />);
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape closes it", () => {
    render(<FreePopup ready />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      window.localStorage.getItem(FREE_POPUP_DISMISSED_KEY),
    ).toBeTruthy();
  });

  it("waits while another dialog is open, then shows when it closes", () => {
    // the wrapper keeps FreePopup mounted at the same position while the
    // other dialog comes and goes — a bare rerender would remount it and
    // restart its 5s timer, which is not what this test is about
    const Harness = ({ showOther }: { showOther: boolean }) => (
      <>
        {showOther ? <div role="dialog">cookie banner</div> : null}
        <FreePopup ready />
      </>
    );
    const { rerender } = render(<Harness showOther />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(
      screen.queryByRole("heading", { name: "Free until 5th December" }),
    ).toBeNull();
    rerender(<Harness showOther={false} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(
      screen.getByRole("heading", { name: "Free until 5th December" }),
    ).toBeTruthy();
  });

  it("never shows after the free window ends", () => {
    vi.setSystemTime(new Date("2026-12-06T10:00:00Z"));
    render(<FreePopup ready />);
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
