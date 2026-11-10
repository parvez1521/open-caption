import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ClipTitleControl, ReframeControl, type ClipTitleState } from "../panels/ClipCreateControls";
import { DEFAULT_CROP_WINDOW, type CropWindow } from "@/features/clipper/reframe";
import type { ModelRunner } from "@/features/create/service";

/**
 * Slice 5.4 creation controls: the crop window really is draggable (a press on the
 * frame moves the window by the mapping's own arithmetic), the sliders drive the
 * same window, and a generated title is presented WITH its source badge — a
 * template title is never shown as AI.
 */
describe("ReframeControl", () => {
  const setup = (win: CropWindow = DEFAULT_CROP_WINDOW) => {
    const onWindowChange = vi.fn();
    const utils = render(
      <ReframeControl
        sourceUrl={null}
        sourceWidth={1920}
        sourceHeight={1080}
        startMs={32_000}
        enabled
        onEnabledChange={() => undefined}
        window={win}
        onWindowChange={onWindowChange}
      />,
    );
    const stage = utils.container.querySelector('[data-testid="reframe-stage"]') as HTMLElement;
    // jsdom has no layout: give the stage the 1000×562.5 box a 1920×1080 frame would get
    stage.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1000, height: 562.5, right: 1000, bottom: 562.5, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    return { onWindowChange, stage };
  };

  it("renders the window at the centre position by default (31.64% wide, offset by half the crop)", () => {
    const { stage } = setup();
    const winEl = stage.querySelector('[role="slider"]') as HTMLElement;
    expect(winEl.style.width).toBe("31.640625%");
    expect(winEl.style.left).toBe("34.1796875%");
    expect(winEl.style.height).toBe("100%");
  });

  it("dragging on the frame moves the window: a press at 70% width centres it there", () => {
    const { onWindowChange, stage } = setup();
    fireEvent.pointerDown(stage, { clientX: 700, clientY: 281 });
    expect(onWindowChange).toHaveBeenCalled();
    const next = onWindowChange.mock.calls[0]![0] as CropWindow;
    // window centre lands on the press: left = 0.7 − fw/2, x = left / (1 − fw)
    expect(next.x).toBeCloseTo((0.7 - 0.31640625 / 2) / (1 - 0.31640625), 6);
    expect(next.zoom).toBe(1);
  });

  it("grabbing the window itself keeps the grab offset (no jump)", () => {
    const { onWindowChange, stage } = setup();
    // press at the window's own left edge (34.1796875% of 1000 ≈ 342): x must stay 0.5
    fireEvent.pointerDown(stage, { clientX: 342, clientY: 281 });
    const next = onWindowChange.mock.calls[0]![0] as CropWindow;
    expect(next.x).toBeCloseTo(0.5, 2);
  });

  it("the horizontal slider drives the same window state", () => {
    const { onWindowChange } = setup();
    fireEvent.change(screen.getByLabelText("Crop window horizontal position"), { target: { value: "25" } });
    expect(onWindowChange).toHaveBeenCalledWith({ ...DEFAULT_CROP_WINDOW, x: 0.25 });
  });

  it("zooming reveals the vertical position slider; the copy never claims face tracking", () => {
    setup({ x: 0.5, y: 0.5, zoom: 2 });
    expect(screen.getByLabelText("Crop window vertical position")).toBeTruthy();
    expect(screen.getByText(/does not follow faces/)).toBeTruthy();
    expect(screen.getByText(/Vertical 9:16 crop window/)).toBeTruthy();
  });

  it("renders nothing when the source has no 9:16 window (portrait)", () => {
    const utils = render(
      <ReframeControl
        sourceUrl={null}
        sourceWidth={1080}
        sourceHeight={1920}
        startMs={0}
        enabled
        onEnabledChange={() => undefined}
        window={DEFAULT_CROP_WINDOW}
        onWindowChange={() => undefined}
      />,
    );
    expect(utils.container.firstChild).toBeNull();
  });
});

describe("ClipTitleControl", () => {
  it("generates through the deps and hands the badged result up", async () => {
    const runCloud: ModelRunner = async () => "The clip title from the cloud";
    const onState = vi.fn();
    render(
      <ClipTitleControl
        sourceTitle="Source"
        segmentText="some segment words"
        startMs={0}
        endMs={30_000}
        deps={{ runCloud, modelEnabled: false }}
        state={null}
        onState={onState}
      />,
    );
    fireEvent.click(screen.getByText("Generate a title for this clip"));
    await waitFor(() => expect(onState).toHaveBeenCalled());
    const next = onState.mock.calls[0]![0] as ClipTitleState;
    expect(next.source).toBe("cloud");
    expect(next.text).toBe("The clip title from the cloud");
  });

  it("presents a template title WITH the Template engine badge and an editable field", () => {
    const state: ClipTitleState = {
      title: "A template hook",
      text: "A template hook",
      source: "template",
      fellBack: true,
      note: "The free AI service was not available for this batch, so it came from the template engine instead.",
    };
    const onState = vi.fn();
    render(
      <ClipTitleControl
        sourceTitle="Source"
        segmentText="words"
        startMs={0}
        endMs={30_000}
        deps={{ modelEnabled: false }}
        state={state}
        onState={onState}
      />,
    );
    const badge = screen.getByText("Template engine");
    expect(badge.getAttribute("data-source")).toBe("template");
    expect(screen.getByText(/No model was used/)).toBeTruthy();
    const input = screen.getByDisplayValue("A template hook") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "My edited title" } });
    expect(onState).toHaveBeenCalledWith({ ...state, text: "My edited title" });
  });
});
