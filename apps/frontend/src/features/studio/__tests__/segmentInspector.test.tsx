/**
 * SegmentInspector wiring (Run 2): the panel is controlled — it must SHOW the selected
 * segment's current values and report every edit through the callbacks StudioPage wires to
 * the segment ops. These tests pin that contract at the same level as the other panel tests.
 */
import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SegmentEffect, SegmentKeyframe } from "@capseasy/shared";
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
  keyframes: [],
  effects: [],
  ...p,
});

function setup(
  p: Partial<SegmentView> = {},
  playheadMs = 2500,
  extra: { keyframes?: SegmentKeyframe[]; effects?: SegmentEffect[] } = {},
) {
  const handlers = {
    onTransform: vi.fn(),
    onPlaybackRate: vi.fn(),
    onTransition: vi.fn(),
    onDuplicate: vi.fn(),
    onRippleDelete: vi.fn(),
    onReverse: vi.fn(),
    onFreeze: vi.fn(),
    onAddKeyframe: vi.fn(),
    onUpdateKeyframe: vi.fn(),
    onRemoveKeyframe: vi.fn(),
    onAddEffect: vi.fn(),
    onUpdateEffect: vi.fn(),
    onRemoveEffect: vi.fn(),
    onMoveEffect: vi.fn(),
  };
  const utils = render(
    <SegmentInspector
      segment={view(p)} playheadMs={playheadMs} production={{ kind: "idle" }} {...handlers}
      keyframes={extra.keyframes ?? []} effects={extra.effects ?? []}
    />,
  );
  return { ...utils, handlers };
}

const kf = (p: Partial<SegmentKeyframe> & { id: string }): SegmentKeyframe => ({
  atMs: 1000, property: "scale", value: 1.5, easing: "linear", ...p,
});
const fx = (p: Partial<SegmentEffect> & { id: string }): SegmentEffect => ({
  type: "blur", enabled: true, amount: 0.5, color: "#FFA946", ...p,
});
const selectByLabel = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll("label")].find((l) => l.textContent?.startsWith(label))?.querySelector("select") as HTMLSelectElement;
const buttonByText = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent === label) as HTMLButtonElement;

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
        onTransform={vi.fn()} onPlaybackRate={vi.fn()} onTransition={vi.fn()} onDuplicate={vi.fn()} onRippleDelete={vi.fn()} onReverse={vi.fn()} onFreeze={vi.fn()}
        keyframes={[]} effects={[]} onAddKeyframe={vi.fn()} onUpdateKeyframe={vi.fn()} onRemoveKeyframe={vi.fn()}
        onAddEffect={vi.fn()} onUpdateEffect={vi.fn()} onRemoveEffect={vi.fn()} onMoveEffect={vi.fn()} />,
    );
    expect(working.container.textContent).toContain("Reversing on this device… 40%");
    const errored = render(
      <SegmentInspector segment={view()} playheadMs={2500} production={{ kind: "error", action: "reverse", message: "No picture track." }}
        onTransform={vi.fn()} onPlaybackRate={vi.fn()} onTransition={vi.fn()} onDuplicate={vi.fn()} onRippleDelete={vi.fn()} onReverse={vi.fn()} onFreeze={vi.fn()}
        keyframes={[]} effects={[]} onAddKeyframe={vi.fn()} onUpdateKeyframe={vi.fn()} onRemoveKeyframe={vi.fn()}
        onAddEffect={vi.fn()} onUpdateEffect={vi.fn()} onRemoveEffect={vi.fn()} onMoveEffect={vi.fn()} />,
    );
    expect(errored.container.querySelector('[role="alert"]')?.textContent).toContain("No picture track.");
  });

  /* ---------------- Run 3 (4.7): opacity, keyframes, effects ---------------- */

  it("opacity slider shows the transform opacity as % and writes onTransform({opacity})", () => {
    const { container, handlers } = setup({ transform: { ...IDENTITY_TRANSFORM, opacity: 0.4 } });
    const s = slider(container, "Opacity");
    expect(s.value).toBe("0.4");
    expect(container.textContent).toContain("40%");
    fireEvent.change(s, { target: { value: "0.75" } });
    expect(handlers.onTransform).toHaveBeenCalledWith({ opacity: 0.75 });
  });

  it("keyframe rows render sorted by time, with time/value/easing controls wired to onUpdate/onRemoveKeyframe", () => {
    const keyframes = [
      kf({ id: "k-scale", atMs: 5000, property: "scale", value: 2, easing: "ease-in" }),
      kf({ id: "k-op", atMs: 1000, property: "opacity", value: 0.5 }),
    ];
    const { container, handlers } = setup({}, 2500, { keyframes });
    // sorted by atMs: the opacity row (1s) comes before the scale row (5s)
    const timeLabels = [...container.querySelectorAll("input")].map((i) => i.getAttribute("aria-label")).filter((a) => a?.includes("time in seconds"));
    expect(timeLabels).toEqual(["Opacity time in seconds", "Scale time in seconds"]);
    expect(container.textContent).toContain("holds the nearest value outside them");
    expect(slider(container, "Scale value").value).toBe("2");
    expect(slider(container, "Opacity value").value).toBe("0.5");
    expect(slider(container, "Scale value").max).toBe("4"); // KEYFRAME_VALUE_RANGES.scale
    expect(slider(container, "Opacity value").max).toBe("1");
    // time input is segment-local seconds, step 0.05
    const time = container.querySelector('input[aria-label="Scale time in seconds"]') as HTMLInputElement;
    expect(time.value).toBe("5");
    expect(time.step).toBe("0.05");
    fireEvent.change(time, { target: { value: "2.5" } });
    expect(handlers.onUpdateKeyframe).toHaveBeenCalledWith("k-scale", { atMs: 2500 });
    fireEvent.change(slider(container, "Scale value"), { target: { value: "3" } });
    expect(handlers.onUpdateKeyframe).toHaveBeenCalledWith("k-scale", { value: 3 });
    const easing = selectByLabel(container, "Easing");
    fireEvent.change(easing, { target: { value: "hold" } });
    expect(handlers.onUpdateKeyframe).toHaveBeenCalledWith("k-op", { easing: "hold" }); // first row's easing select
    const deletes = [...container.querySelectorAll("button")].filter((b) => b.textContent === "Delete");
    fireEvent.click(deletes[0]!);
    expect(handlers.onRemoveKeyframe).toHaveBeenCalledWith("k-op");
  });

  it("add keyframe at playhead passes (property, segment-local atMs, current base value); disabled outside the segment", () => {
    const inside = setup({}, 2500); // segment starts 2000 → local 500; default property Scale, base = transform.scale = 1
    const addBtn = buttonByText(inside.container, "Add keyframe at playhead");
    expect(addBtn.disabled).toBe(false);
    fireEvent.click(addBtn);
    expect(inside.handlers.onAddKeyframe).toHaveBeenCalledWith("scale", 500, 1);
    fireEvent.change(selectByLabel(inside.container, "Property"), { target: { value: "opacity" } });
    fireEvent.click(addBtn);
    expect(inside.handlers.onAddKeyframe).toHaveBeenCalledWith("opacity", 500, 1); // base opacity = transform.opacity = 1

    const outside = setup({}, 0);
    expect(buttonByText(outside.container, "Add keyframe at playhead").disabled).toBe(true);
    expect(outside.container.textContent).toContain("move the playhead inside this segment");
  });

  it("a still segment shows no Keyframes section but keeps Effects", () => {
    const { container } = setup({ still: true, assetId: "a1", playbackRate: 1 });
    expect(container.textContent).not.toContain("Add keyframe at playhead");
    expect(container.textContent).toContain("Effects");
  });

  it("effect rows render in stored order with enable/amount/colour/move/remove wired; disabled amount when off", () => {
    const effects = [
      fx({ id: "e-glow", type: "glow", enabled: false, amount: 0.3, color: "#00FF00" }),
      fx({ id: "e-blur", type: "blur", enabled: true, amount: 0.8 }),
    ];
    const { container, handlers } = setup({}, 2500, { effects });
    // stored order, not sorted: the effect rows' toggle labels appear Glow before Blur in the DOM
    const toggleLabels = [...container.querySelectorAll("label")]
      .filter((l) => l.querySelector('button[role="switch"]'))
      .map((l) => l.textContent);
    expect(toggleLabels.filter((t) => t === "Glow" || t === "Blur")).toEqual(["Glow", "Blur"]);
    expect(container.textContent).toContain("Applied in order, top to bottom");
    const amounts = [...container.querySelectorAll("label")]
      .filter((l) => l.textContent?.startsWith("Amount"))
      .map((l) => l.querySelector("input[type=range]") as HTMLInputElement);
    expect(amounts[0]!.value).toBe("0.3");
    // glow is disabled → its amount slider sits in a disabled fieldset (the Slider
    // primitive has no disabled prop; a disabled fieldset disables the control in the browser)
    expect((amounts[0]!.closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
    expect(amounts[1]!.value).toBe("0.8");
    expect((amounts[1]!.closest("fieldset") as HTMLFieldSetElement).disabled).toBe(false);
    fireEvent.change(amounts[1]!, { target: { value: "0.2" } });
    expect(handlers.onUpdateEffect).toHaveBeenCalledWith("e-blur", { amount: 0.2 });
    // glow carries a colour field; blur does not
    const colourText = container.querySelector('input[type="color"]') as HTMLInputElement;
    expect(colourText).not.toBeNull();
    fireEvent.change(colourText, { target: { value: "#123456" } });
    expect(handlers.onUpdateEffect).toHaveBeenCalledWith("e-glow", { color: "#123456" });
    // enable toggles: the switch inside the row labelled Glow
    const glowLabel = [...container.querySelectorAll("label")].find((l) => l.textContent?.startsWith("Glow"))!;
    fireEvent.click(glowLabel.querySelector('button[role="switch"]')!);
    expect(handlers.onUpdateEffect).toHaveBeenCalledWith("e-glow", { enabled: true });
    // move buttons are disabled at the ends
    const ups = [...container.querySelectorAll("button")].filter((b) => b.textContent === "Up");
    const downs = [...container.querySelectorAll("button")].filter((b) => b.textContent === "Down");
    expect(ups[0]!.disabled).toBe(true);
    expect(downs[1]!.disabled).toBe(true);
    fireEvent.click(downs[0]!);
    expect(handlers.onMoveEffect).toHaveBeenCalledWith("e-glow", 1);
    const removes = [...container.querySelectorAll("button")].filter((b) => b.textContent === "Remove");
    fireEvent.click(removes[1]!);
    expect(handlers.onRemoveEffect).toHaveBeenCalledWith("e-blur");
  });

  it("add effect reports the selected type", () => {
    const { container, handlers } = setup();
    fireEvent.click(buttonByText(container, "Add effect"));
    expect(handlers.onAddEffect).toHaveBeenCalledWith("blur"); // default selection
    fireEvent.change(selectByLabel(container, "Effect"), { target: { value: "grain" } });
    fireEvent.click(buttonByText(container, "Add effect"));
    expect(handlers.onAddEffect).toHaveBeenCalledWith("grain");
  });
});
