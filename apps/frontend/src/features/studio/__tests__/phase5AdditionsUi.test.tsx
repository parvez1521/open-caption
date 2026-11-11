/**
 * A4 + A5 UI contracts:
 * - SegmentInspector's Auto zooms section: honest deterministic copy, the
 *   intensity choice, and the count-gated action firing onAutoZooms.
 * (The A5 TitleCardControl suite was removed with the control itself —
 * Package 2 item E: the auto title card left the Text panel on the owner's order.)
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SegmentInspector } from "../panels/SegmentInspector";
import { IDENTITY_TRANSFORM, type SegmentView } from "../segmentView";

const view = (p: Partial<SegmentView> = {}): SegmentView => ({
  id: "seg-1", index: 0, sourceInMs: 0, sourceOutMs: 10_000, startMs: 0,
  timelineDurationMs: 10_000, playbackRate: 1,
  transform: { ...IDENTITY_TRANSFORM }, transitionIn: null, assetId: null,
  still: false, keyframes: [], effects: [], ...p,
});

const noopHandlers = {
  onTransform: vi.fn(), onPlaybackRate: vi.fn(), onTransition: vi.fn(),
  onDuplicate: vi.fn(), onRippleDelete: vi.fn(), onReverse: vi.fn(), onFreeze: vi.fn(),
  onAddKeyframe: vi.fn(), onUpdateKeyframe: vi.fn(), onRemoveKeyframe: vi.fn(),
  onAddEffect: vi.fn(), onUpdateEffect: vi.fn(), onRemoveEffect: vi.fn(), onMoveEffect: vi.fn(),
};

describe("SegmentInspector — Auto zooms (A4)", () => {
  it("shows deterministic (not AI) copy, the intensity choice, and fires the chosen intensity", () => {
    const onAutoZooms = vi.fn();
    const { container } = render(
      <SegmentInspector segment={view()} playheadMs={0} production={{ kind: "idle" }} {...noopHandlers}
        keyframes={[]} effects={[]} onAutoZooms={onAutoZooms} autoZoomCount={3} />,
    );
    expect(container.textContent).toContain("Auto zooms");
    expect(container.textContent).toContain("Not AI: punch-in zooms");
    expect(container.textContent).toContain("ordinary scale keyframes");
    const select = [...container.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "strong"))!;
    fireEvent.change(select, { target: { value: "strong" } });
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Add auto zooms"))!;
    expect(button.textContent).toContain("(3)");
    fireEvent.click(button);
    expect(onAutoZooms).toHaveBeenCalledWith("strong");
  });

  it("with no zoom points the action is disabled and says why", () => {
    const { container } = render(
      <SegmentInspector segment={view()} playheadMs={0} production={{ kind: "idle" }} {...noopHandlers}
        keyframes={[]} effects={[]} onAutoZooms={vi.fn()} autoZoomCount={0} />,
    );
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Add auto zooms"))! as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(container.textContent).toContain("No zoom points found");
  });

  it("without the optional props the section does not render (existing mounts unchanged)", () => {
    const { container } = render(
      <SegmentInspector segment={view()} playheadMs={0} production={{ kind: "idle" }} {...noopHandlers} keyframes={[]} effects={[]} />,
    );
    expect(container.textContent).not.toContain("Auto zooms");
  });
});
