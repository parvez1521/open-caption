/**
 * A4 + A5 UI contracts:
 * - SegmentInspector's Auto zooms section: honest deterministic copy, the
 *   intensity choice, and the count-gated action firing onAutoZooms.
 * - TitleCardControl: generation shows the title WITH its SourceBadge for
 *   confirmation/edit (template badged as template, cloud as free AI), and
 *   placing hands a normal overlay object to onPlace.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ModelRunner } from "../../create/service";
import { SegmentInspector } from "../panels/SegmentInspector";
import { TitleCardControl } from "../panels/TitleCardControl";
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
    expect(container.textContent).toContain("deterministic — not AI");
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

describe("TitleCardControl (A5)", () => {
  it("template generation is badged 'Template engine', is editable, and places a normal overlay at 0", async () => {
    const onPlace = vi.fn();
    render(
      <TitleCardControl
        sourceTitle="My long podcast"
        transcriptText="nobody tells you this about morning routines and it changes everything"
        durationMs={60_000}
        onPlace={onPlace}
        deps={{ modelEnabled: false }}
      />,
    );
    fireEvent.click(screen.getByText("Add title card"));
    const input = await screen.findByLabelText(/Title card text/);
    expect(document.body.textContent).toContain("Template engine");
    expect(document.body.textContent).toContain("No model was used");
    fireEvent.change(input, { target: { value: "My edited title" } });
    fireEvent.click(screen.getByText("Place title card at start"));
    await waitFor(() => expect(onPlace).toHaveBeenCalledTimes(1));
    const item = onPlace.mock.calls[0]![0];
    expect(item.kind).toBe("text");
    expect(item.text).toBe("My edited title");
    expect(item.startMs).toBe(0);
    expect(item.endMs).toBe(3000);
  });

  it("a cloud title is badged as free AI, never as template", async () => {
    const runCloud: ModelRunner = async () => "The morning routine nobody films";
    render(
      <TitleCardControl
        sourceTitle="My long podcast"
        transcriptText="nobody tells you this about morning routines"
        durationMs={60_000}
        onPlace={vi.fn()}
        deps={{ runCloud, modelEnabled: false }}
      />,
    );
    fireEvent.click(screen.getByText("Add title card"));
    const input = await screen.findByLabelText(/Title card text/) as HTMLInputElement;
    expect(input.value).toBe("The morning routine nobody films");
    expect(document.querySelector("[data-source='cloud']")).not.toBeNull();
    expect(document.body.textContent).toContain("Free AI");
  });
});
