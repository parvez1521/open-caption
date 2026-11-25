import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TutorialTour } from "../TutorialTour";
import { TUTORIAL_NEVER_KEY, TUTORIAL_SEEN_KEY } from "../tutorial";

/**
 * "Never show again" (owner 2026-11-25): offered only on the tour's final
 * (Export) step. It sets the permanent opt-out flag and closes the tour;
 * earlier steps must not offer it. Skip / Esc only mark this version seen.
 */

describe("TutorialTour never-show-again", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  function renderTour() {
    const onClose = vi.fn();
    const utils = render(<TutorialTour onClose={onClose} />);
    return { ...utils, onClose };
  }

  function goToLastStep() {
    // 9 steps: 8 Next clicks from step 1
    for (let i = 0; i < 8; i++) fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Step 9 of 9")).toBeTruthy();
  }

  it("does not offer Never show again before the final step", () => {
    renderTour();
    expect(screen.queryByRole("button", { name: "Never show again" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Step 2 of 9")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Never show again" })).toBeNull();
  });

  it("offers Never show again on the final (Export) step and it opts out permanently", () => {
    const { onClose } = renderTour();
    goToLastStep();
    expect(screen.getByText("Export")).toBeTruthy();
    const never = screen.getByRole("button", { name: "Never show again" });
    fireEvent.click(never);
    expect(window.localStorage.getItem(TUTORIAL_NEVER_KEY)).toBe("1");
    expect(window.localStorage.getItem(TUTORIAL_SEEN_KEY)).toBe("1");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Skip on the last step only marks this version seen, never the opt-out", () => {
    const { onClose } = renderTour();
    goToLastStep();
    fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
    expect(window.localStorage.getItem(TUTORIAL_SEEN_KEY)).toBe("1");
    expect(window.localStorage.getItem(TUTORIAL_NEVER_KEY)).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
