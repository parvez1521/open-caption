import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TRANSITION_CATEGORIES, TRANSITION_REGISTRY } from "@capseasy/compositions";
import { TransitionsPanel, type TransitionsPanelProps } from "../panels/TransitionsPanel";

function renderPanel(props: Partial<TransitionsPanelProps> = {}) {
  const onApplyTransition = vi.fn();
  const onClearTransition = vi.fn();
  const onSplitAtPlayhead = vi.fn();
  const utils = render(
    <TransitionsPanel
      currentTransition={null}
      onApplyTransition={onApplyTransition}
      onClearTransition={onClearTransition}
      onSplitAtPlayhead={onSplitAtPlayhead}
      {...props}
    />,
  );
  return { ...utils, onApplyTransition, onClearTransition, onSplitAtPlayhead };
}

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
    const { onApplyTransition } = renderPanel();
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
});
