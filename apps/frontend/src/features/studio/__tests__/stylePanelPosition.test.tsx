import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultStyle } from "@capseasy/shared";
import { StylePanel } from "../panels/StylePanel";

/**
 * Bulk caption position (owner 2026-11-16): the Style panel's Position
 * section is the "all captions" home. "Apply to all captions" copies the
 * current card's position onto every card; "Reset all positions" clears
 * every override so all cards follow the global style position again. The
 * global Vertical/Horizontal sliders keep setting style.position as before.
 */

vi.mock("@/services/studio", () => ({
  studioService: {
    getBrand: () => Promise.resolve({ colors: [], fontId: null }),
    saveBrand: () => Promise.resolve(undefined),
  },
}));

function renderStyle(opts: { currentCardPosition?: { x: number; y: number } | null; hasPositionOverrides?: boolean; onGlobalPositionChange?: (fn: (pos: { x: number; y: number }) => { x: number; y: number }) => void } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const patch = vi.fn((fn: (s: ReturnType<typeof defaultStyle>) => ReturnType<typeof defaultStyle>) => fn(defaultStyle()));
  const onApplyPositionToAll = vi.fn();
  const onResetAllPositions = vi.fn();
  const utils = render(
    <QueryClientProvider client={qc}>
      <StylePanel
        style={defaultStyle()}
        patch={patch}
        lookName="Test look"
        onOpenLooks={() => {}}
        currentCardPosition={opts.currentCardPosition === undefined ? { x: 0.5, y: 0.2 } : opts.currentCardPosition}
        hasPositionOverrides={opts.hasPositionOverrides ?? true}
        onApplyPositionToAll={onApplyPositionToAll}
        onResetAllPositions={onResetAllPositions}
        onGlobalPositionChange={opts.onGlobalPositionChange}
      />
    </QueryClientProvider>,
  );
  return { ...utils, patch, onApplyPositionToAll, onResetAllPositions, onGlobalPositionChange: opts.onGlobalPositionChange };
}

describe("StylePanel — bulk caption position", () => {
  it("'Apply to all captions' fires the bulk action; 'Reset all positions' fires the reset", () => {
    const { onApplyPositionToAll, onResetAllPositions } = renderStyle();
    fireEvent.click(screen.getByRole("button", { name: "Apply to all captions" }));
    expect(onApplyPositionToAll).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Reset all positions" }));
    expect(onResetAllPositions).toHaveBeenCalledTimes(1);
  });

  it("says what Apply does in one short line", () => {
    renderStyle();
    expect(screen.getByText("Apply copies this card's position to every caption.")).toBeTruthy();
  });

  it("Apply is disabled with no card at the playhead; Reset is disabled with no overrides", () => {
    renderStyle({ currentCardPosition: null, hasPositionOverrides: false });
    expect(screen.getByRole("button", { name: "Apply to all captions" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Reset all positions" })).toHaveProperty("disabled", true);
  });

  it("the global Vertical slider still patches style.position", () => {
    const { patch } = renderStyle();
    const vertical = screen.getByLabelText("Vertical (exact value in %)") as HTMLInputElement;
    fireEvent.change(vertical, { target: { value: "20" } });
    fireEvent.blur(vertical);
    expect(patch).toHaveBeenCalled();
    const next = patch.mock.results[0]!.value as ReturnType<typeof defaultStyle>;
    expect(next.position.y).toBe(0.2);
    expect(next.position.x).toBe(defaultStyle().position.x);
  });

  it("with onGlobalPositionChange the Vertical slider routes through it (delta rule), not patch", () => {
    const onGlobalPositionChange = vi.fn((fn: (pos: { x: number; y: number }) => { x: number; y: number }) => fn(defaultStyle().position));
    const { patch } = renderStyle({ onGlobalPositionChange });
    const vertical = screen.getByLabelText("Vertical (exact value in %)") as HTMLInputElement;
    fireEvent.change(vertical, { target: { value: "20" } });
    fireEvent.blur(vertical);
    expect(onGlobalPositionChange).toHaveBeenCalledTimes(1);
    expect(patch).not.toHaveBeenCalled();
    // the updater maps the live global position, so the caller can shift
    // overridden cards by the same delta (0.72 -> 0.2)
    const fn = onGlobalPositionChange.mock.calls[0]![0] as (pos: { x: number; y: number }) => { x: number; y: number };
    expect(fn({ x: 0.5, y: 0.72 })).toEqual({ x: 0.5, y: 0.2 });
  });
});

describe("StylePanel — Case (text case)", () => {
  it("offers Small Caps alongside As spoken / UPPERCASE / lowercase / Title Case", () => {
    renderStyle();
    const select = screen.getByLabelText("Case") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.text)).toEqual([
      "As spoken",
      "UPPERCASE",
      "lowercase",
      "Title Case",
      "Small Caps",
    ]);
  });

  it("choosing Small Caps patches the style casing to smallcaps", () => {
    const { patch } = renderStyle();
    const select = screen.getByLabelText("Case") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "smallcaps" } });
    expect(patch).toHaveBeenCalled();
    const next = patch.mock.results[0]!.value as ReturnType<typeof defaultStyle>;
    expect(next.casing).toBe("smallcaps");
  });
});
