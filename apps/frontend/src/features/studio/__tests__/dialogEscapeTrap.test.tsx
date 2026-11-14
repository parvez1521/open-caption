/**
 * useDialogEscapeAndTrap (overnight QA F-05): Escape closes, Tab is trapped
 * inside the dialog, focus lands on the dialog when it opens and returns when
 * it closes, and only the topmost stacked dialog answers Escape.
 */
import React, { useRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDialogEscapeAndTrap } from "../useDialogEscapeAndTrap";

function TestDialog({ onClose, label = "Test dialog" }: { onClose: () => void; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogEscapeAndTrap(ref, onClose);
  return (
    <div ref={ref} role="dialog" aria-label={label} tabIndex={-1}>
      <button type="button">First</button>
      <button type="button">Last</button>
    </div>
  );
}

describe("useDialogEscapeAndTrap", () => {
  it("focuses the dialog on open", () => {
    render(<TestDialog onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("Escape calls onClose", () => {
    const onClose = vi.fn();
    render(<TestDialog onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a non-Escape key does not close", () => {
    const onClose = vi.fn();
    render(<TestDialog onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Tab from the last control wraps to the first", () => {
    render(<TestDialog onClose={vi.fn()} />);
    const last = screen.getByRole("button", { name: "Last" });
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
  });

  it("Shift+Tab from the first control wraps to the last", () => {
    render(<TestDialog onClose={vi.fn()} />);
    const first = screen.getByRole("button", { name: "First" });
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Last" }));
  });

  it("only the topmost stacked dialog answers Escape", () => {
    const bottomClose = vi.fn();
    const topClose = vi.fn();
    render(
      <>
        <TestDialog onClose={bottomClose} label="Bottom dialog" />
        <TestDialog onClose={topClose} label="Top dialog" />
      </>,
    );
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Top dialog" }), { key: "Escape" });
    expect(topClose).toHaveBeenCalledTimes(1);
    expect(bottomClose).not.toHaveBeenCalled();
  });

  it("returns focus to where it was when the dialog unmounts", () => {
    const { unmount } = render(<TestDialog onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    unmount();
    // focus was on <body> before the dialog opened, so it returns there
    expect(document.activeElement).toBe(document.body);
  });
});
