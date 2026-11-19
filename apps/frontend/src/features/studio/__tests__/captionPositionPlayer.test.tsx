import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectSettingsSchema } from "@capseasy/shared";
import type { CaptionedVideoInput } from "@capseasy/compositions";

/**
 * Caption position drag (owner 2026-11-16): dragging the caption text on the
 * preview moves it (via onMovePosition — StudioPage routes it globally by
 * default, or to just the timeline-selected cards). The hit box sits over the
 * current card's caption box; a drag moves it, a tap keeps the Player's
 * click-to-play behaviour AND fires onCaptionTap (StudioPage selects the card
 * and opens the Captions section). The grip is the same action as a keyboard
 * slider. When a selective drag moves cards the playhead card is NOT in, a
 * translucent ghost of the caption follows the pointer instead — the playhead
 * caption must never visibly move and then snap back.
 */

const captured = vi.hoisted(() => ({ toggles: 0 }));

vi.mock("@remotion/player", async () => {
  const React = await import("react");
  const Player = React.forwardRef(function PlayerStub(props: Record<string, unknown>, ref: React.Ref<unknown>) {
    React.useImperativeHandle(ref, () => ({
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      toggle: () => {
        captured.toggles += 1;
      },
      getCurrentFrame: () => 0,
      seekTo: () => undefined,
    }));
    return React.createElement("div", { "data-player-stub": "true" });
  });
  return { Player };
});
vi.mock("@capseasy/compositions", () => ({ CaptionedVideo: () => null }));

import { StudioPlayer } from "../StudioPlayer";

const input: CaptionedVideoInput = {
  src: null,
  settings: ProjectSettingsSchema.parse({ platform: "reels" }),
};

function renderPlayer(opts: { captionBox?: { x: number; y: number; w: number; h: number } | null; showPositionGrip?: boolean; onCaptionTap?: () => void; onPositionDragEnd?: () => void; dragGhost?: { x: number; y: number } | null; dragGhostText?: string; dragGhostFontPx?: number } = {}) {
  const onMovePosition = vi.fn();
  const onPositionDragStart = vi.fn();
  const onNudgePosition = vi.fn();
  const onCaptionTap = opts.onCaptionTap ?? vi.fn();
  const onPositionDragEnd = opts.onPositionDragEnd ?? vi.fn();
  // undefined = the default box; null = explicitly no box
  const captionBox = opts.captionBox === undefined ? { x: 0.5, y: 0.68, w: 0.8, h: 0.1 } : opts.captionBox;
  const utils = render(
    <StudioPlayer
      input={input}
      width={1080}
      height={1920}
      fps={30}
      durationMs={10_000}
      position={{ x: 0.5, y: 0.68 }}
      onMovePosition={onMovePosition}
      onPositionDragStart={onPositionDragStart}
      onNudgePosition={onNudgePosition}
      captionBox={captionBox}
      showPositionGrip={opts.showPositionGrip}
      onCaptionTap={onCaptionTap}
      onPositionDragEnd={onPositionDragEnd}
      dragGhost={opts.dragGhost ?? null}
      dragGhostText={opts.dragGhostText ?? ""}
      dragGhostFontPx={opts.dragGhostFontPx}
      onTime={vi.fn()}
    />,
  );
  return { ...utils, onMovePosition, onPositionDragStart, onNudgePosition, onCaptionTap, onPositionDragEnd };
}

function stubFrameRect(hitbox: HTMLElement) {
  const frame = hitbox.parentElement!;
  frame.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 540, height: 960, right: 540, bottom: 960, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

describe("StudioPlayer — caption drag hit box", () => {
  it("dragging the caption text moves it (pointer fractions, centre snap kept)", () => {
    const { onMovePosition } = renderPlayer();
    const hitbox = screen.getByTestId("caption-position-hitbox");
    stubFrameRect(hitbox);

    // press on the caption centre (0.5, 0.68 of a 540×960 frame), drag down 47px
    fireEvent.pointerDown(hitbox, { clientX: 270, clientY: 653, pointerId: 1 });
    fireEvent.pointerMove(hitbox, { clientX: 270, clientY: 700, pointerId: 1 });
    fireEvent.pointerUp(hitbox);

    expect(onMovePosition).toHaveBeenCalledWith(expect.objectContaining({ x: 0.5, y: expect.closeTo(0.729, 3) }));
    expect(captured.toggles).toBe(0);
  });

  it("a tap on the caption (no drag) toggles play instead of moving it", () => {
    captured.toggles = 0;
    const { onMovePosition, onCaptionTap } = renderPlayer();
    const hitbox = screen.getByTestId("caption-position-hitbox");
    stubFrameRect(hitbox);

    fireEvent.pointerDown(hitbox, { clientX: 270, clientY: 653, pointerId: 1 });
    fireEvent.pointerUp(hitbox);

    expect(onMovePosition).not.toHaveBeenCalled();
    expect(captured.toggles).toBe(1);
    // the tap also selects the caption (StudioPage opens the Captions section)
    expect(onCaptionTap).toHaveBeenCalledTimes(1);
  });

  it("a drag on the caption does NOT fire the tap callback", () => {
    const { onCaptionTap } = renderPlayer();
    const hitbox = screen.getByTestId("caption-position-hitbox");
    stubFrameRect(hitbox);

    fireEvent.pointerDown(hitbox, { clientX: 270, clientY: 653, pointerId: 1 });
    fireEvent.pointerMove(hitbox, { clientX: 270, clientY: 700, pointerId: 1 });
    fireEvent.pointerUp(hitbox);

    expect(onCaptionTap).not.toHaveBeenCalled();
  });

  it("no caption box means no hit box; no current card hides the grip", () => {
    const { container } = renderPlayer({ captionBox: null, showPositionGrip: false });
    expect(screen.queryByTestId("caption-position-hitbox")).toBeNull();
    expect(screen.queryByRole("slider", { name: /caption position/i })).toBeNull();
    expect(container.querySelector("[data-player-stub]")).not.toBeNull();
  });

  it("with a current card the grip is present as the keyboard handle", () => {
    renderPlayer();
    expect(screen.getByRole("slider", { name: "Caption position (drag)" })).toBeTruthy();
  });

  it("MA-A5-009: the 20px grip carries the 24px+ hit expander", () => {
    renderPlayer();
    const grip = screen.getByRole("slider", { name: "Caption position (drag)" });
    // h-5 w-5 (20px) with before:-inset-2 expands the hit area to 36px
    expect(grip.className).toContain("before:-inset-2");
  });

  it("a drag ghost renders at the dragged spot with the caption text", () => {
    renderPlayer({ dragGhost: { x: 0.5, y: 0.3 }, dragGhostText: "Dulha Dulhan?", dragGhostFontPx: 32 });
    const ghost = screen.getByTestId("caption-position-ghost");
    expect(ghost.textContent).toBe("Dulha Dulhan?");
    expect(ghost.style.left).toBe("50%");
    expect(ghost.style.top).toBe("30%");
    expect(ghost.style.fontSize).toBe("32px");
  });

  it("no ghost without a drag position", () => {
    renderPlayer({ dragGhostText: "Dulha Dulhan?" });
    expect(screen.queryByTestId("caption-position-ghost")).toBeNull();
  });

  it("pointer up after a drag signals the drag end (StudioPage clears the ghost)", () => {
    const onPositionDragEnd = vi.fn();
    renderPlayer({ onPositionDragEnd });
    const hitbox = screen.getByTestId("caption-position-hitbox");
    stubFrameRect(hitbox);
    fireEvent.pointerDown(hitbox, { clientX: 270, clientY: 653, pointerId: 1 });
    fireEvent.pointerMove(hitbox, { clientX: 270, clientY: 700, pointerId: 1 });
    fireEvent.pointerUp(hitbox);
    expect(onPositionDragEnd).toHaveBeenCalledTimes(1);
  });

  it("pointerdown on the caption fires the drag start with the pointer fractions (delta rule)", () => {
    const { onPositionDragStart } = renderPlayer();
    const hitbox = screen.getByTestId("caption-position-hitbox");
    stubFrameRect(hitbox);

    fireEvent.pointerDown(hitbox, { clientX: 270, clientY: 653, pointerId: 1 });

    expect(onPositionDragStart).toHaveBeenCalledTimes(1);
    expect(onPositionDragStart).toHaveBeenCalledWith(expect.objectContaining({ x: 0.5, y: expect.closeTo(0.68, 3) }));
  });

  it("pointerdown on the grip fires the drag start too", () => {
    const { onPositionDragStart } = renderPlayer();
    const hitbox = screen.getByTestId("caption-position-hitbox");
    stubFrameRect(hitbox);
    const grip = screen.getByRole("slider", { name: "Caption position (drag)" });

    fireEvent.pointerDown(grip, { clientX: 270, clientY: 653, pointerId: 1 });

    expect(onPositionDragStart).toHaveBeenCalledTimes(1);
    expect(onPositionDragStart).toHaveBeenCalledWith(expect.objectContaining({ x: 0.5, y: expect.closeTo(0.68, 3) }));
  });

  it("grip arrow keys are NUDGES (one step), not absolute moves", () => {
    const { onNudgePosition, onMovePosition } = renderPlayer();
    const grip = screen.getByRole("slider", { name: "Caption position (drag)" });

    fireEvent.keyDown(grip, { key: "ArrowUp" });
    fireEvent.keyDown(grip, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(grip, { key: "ArrowDown" });
    fireEvent.keyDown(grip, { key: "ArrowLeft" });

    expect(onNudgePosition).toHaveBeenCalledTimes(4);
    expect(onNudgePosition).toHaveBeenNthCalledWith(1, { dx: 0, dy: -0.01 });
    expect(onNudgePosition).toHaveBeenNthCalledWith(2, { dx: 0.05, dy: 0 });
    expect(onNudgePosition).toHaveBeenNthCalledWith(3, { dx: 0, dy: 0.01 });
    expect(onNudgePosition).toHaveBeenNthCalledWith(4, { dx: -0.01, dy: 0 });
    // no absolute move is fired from the keyboard any more
    expect(onMovePosition).not.toHaveBeenCalled();
  });
});
