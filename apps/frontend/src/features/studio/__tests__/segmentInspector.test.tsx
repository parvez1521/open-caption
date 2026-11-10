/**
 * SegmentInspector wiring (Run 2): the panel is controlled — it must SHOW the selected
 * segment's current values and report every edit through the callbacks StudioPage wires to
 * the segment ops. These tests pin that contract at the same level as the other panel tests.
 */
import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SegmentInspector, percentToCrop, cropToPercent, percentToOffset } from "../panels/SegmentInspector";
import { IDENTITY_TRANSFORM, type SegmentView } from "../segmentView";

const view = (p: Partial<SegmentView> = {}): SegmentView => ({
  id: "seg-1",
  index: 1,
  sourceInMs: 2000,
  sourceOutMs: 6000,
  startMs: 2000,
  timelineDurationMs: 2000,
  playbackRate: 2,
  transform: { ...IDENTITY_TRANSFORM, rotateDeg: 30, cropLeft: 0.1 },
  transitionIn: { type: "fade", durationMs: 300 },
  assetId: null,
  still: false,
  ...p,
});

function setup(p: Partial<SegmentView> = {}, playheadMs = 2500) {
  const handlers = {
    onTransform: vi.fn(),
    onPlaybackRate: vi.fn(),
    onTransition: vi.fn(),
    onDuplicate: vi.fn(),
    onRippleDelete: vi.fn(),
    onReverse: vi.fn(),
    onFreeze: vi.fn(),
  };
  const utils = render(
    <SegmentInspector segment={view(p)} playheadMs={playheadMs} production={{ kind: "idle" }} {...handlers} />,
  );
  return { ...utils, handlers };
}

const slider = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll("label")].find((l) => l.textContent?.startsWith(label))?.querySelector("input[type=range]") as HTMLInputElement;

describe("SegmentInspector", () => {
  it("shows the segment's current transform + speed values", () => {
    const { container } = setup();
    expect(slider(container, "Rotate").value).toBe("30");
    expect(slider(container, "Crop left").value).toBe("10"); // stored fraction 0.1 shown as 10%
    expect(slider(container, "Playback speed").value).toBe("2");
    expect(container.textContent).toContain("Segment 2");
  });

  it("reports transform edits as stored fractions via onTransform", () => {
    const { container, handlers } = setup();
    fireEvent.change(slider(container, "Crop left"), { target: { value: "25" } });
    expect(handlers.onTransform).toHaveBeenCalledWith({ cropLeft: 0.25 });
    fireEvent.change(slider(container, "Offset X"), { target: { value: "-40" } });
    expect(handlers.onTransform).toHaveBeenCalledWith({ offsetX: -0.4 });
  });

  it("unit converters round-trip crop and offset", () => {
    expect(cropToPercent(percentToCrop(33))).toBe(33);
    expect(percentToCrop(120)).toBe(0.9);
    expect(percentToOffset(-250)).toBe(-1);
  });

  it("reports speed edits from both the slider and the numeric input", () => {
    const { container, handlers } = setup();
    fireEvent.change(slider(container, "Playback speed"), { target: { value: "0.5" } });
    expect(handlers.onPlaybackRate).toHaveBeenCalledWith(0.5);
    const numeric = container.querySelector('input[aria-label="Playback speed value"]') as HTMLInputElement;
    expect(numeric.value).toBe("2");
    fireEvent.change(numeric, { target: { value: "1.5" } });
    expect(handlers.onPlaybackRate).toHaveBeenCalledWith(1.5);
  });

  it("transition controls appear only from the second segment on", () => {
    const first = setup({ index: 0, transitionIn: null });
    expect(first.container.textContent).not.toContain("Transition in");
    const second = setup({ index: 1 });
    expect(second.container.textContent).toContain("Transition in");
    const select = [...second.container.querySelectorAll("select")][0] as HTMLSelectElement;
    expect(select.value).toBe("fade");
    fireEvent.change(select, { target: { value: "none" } });
    expect(second.handlers.onTransition).toHaveBeenCalledWith(null);
    fireEvent.change(select, { target: { value: "wipe" } });
    expect(second.handlers.onTransition).toHaveBeenCalledWith({ type: "wipe", durationMs: 300 });
  });

  it("duplicate / ripple-delete / reverse buttons fire their callbacks", () => {
    const { container, handlers } = setup();
    const btn = (label: string) => [...container.querySelectorAll("button")].find((b) => b.textContent === label) as HTMLButtonElement;
    fireEvent.click(btn("Duplicate"));
    expect(handlers.onDuplicate).toHaveBeenCalledTimes(1);
    fireEvent.click(btn("Ripple delete"));
    expect(handlers.onRippleDelete).toHaveBeenCalledTimes(1);
    fireEvent.click(btn("Reverse"));
    expect(handlers.onReverse).toHaveBeenCalledTimes(1);
  });

  it("freeze needs the playhead inside the segment, and the honest device note is shown", () => {
    const outside = setup({}, 0); // segment starts at 2000
    const freezeBtn = [...outside.container.querySelectorAll("button")].find((b) => b.textContent === "Freeze frame") as HTMLButtonElement;
    expect(freezeBtn.disabled).toBe(true);
    expect(outside.container.textContent).toContain("stored on this device");
    expect(outside.container.textContent).toContain("Reversing renders a new copy on this device — it can take a while on long videos.");
    const inside = setup({}, 2500);
    const btn2 = [...inside.container.querySelectorAll("button")].find((b) => b.textContent === "Freeze frame") as HTMLButtonElement;
    expect(btn2.disabled).toBe(false);
    fireEvent.click(btn2);
    expect(inside.handlers.onFreeze).toHaveBeenCalledTimes(1);
  });

  it("a still segment shows no speed / reverse sections (its span is its duration)", () => {
    const { container } = setup({ still: true, assetId: "a1", playbackRate: 1 });
    expect(container.textContent).not.toContain("Playback speed");
    expect(container.textContent).not.toContain("Reverse & freeze");
    expect(container.textContent).toContain("freeze-frame still");
  });

  it("production progress and errors surface as real states", () => {
    const working = render(
      <SegmentInspector segment={view()} playheadMs={2500} production={{ kind: "working", action: "reverse", progress: 0.4 }}
        onTransform={vi.fn()} onPlaybackRate={vi.fn()} onTransition={vi.fn()} onDuplicate={vi.fn()} onRippleDelete={vi.fn()} onReverse={vi.fn()} onFreeze={vi.fn()} />,
    );
    expect(working.container.textContent).toContain("Reversing on this device… 40%");
    const errored = render(
      <SegmentInspector segment={view()} playheadMs={2500} production={{ kind: "error", action: "reverse", message: "No picture track." }}
        onTransform={vi.fn()} onPlaybackRate={vi.fn()} onTransition={vi.fn()} onDuplicate={vi.fn()} onRippleDelete={vi.fn()} onReverse={vi.fn()} onFreeze={vi.fn()} />,
    );
    expect(errored.container.querySelector('[role="alert"]')?.textContent).toContain("No picture track.");
  });
});
