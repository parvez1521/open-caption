import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectSettingsSchema } from "@capseasy/shared";
import type { CaptionedVideoInput } from "@capseasy/compositions";

/**
 * Per-card caption position (owner 2026-11-16): dragging the caption text on
 * the preview moves THAT card. The hit box sits over the current card's
 * caption box; a drag moves it (via onMovePosition), a tap keeps the Player's
 * click-to-play behaviour. The grip is the same action as a keyboard slider.
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

function renderPlayer(opts: { captionBox?: { x: number; y: number; w: number; h: number } | null; showPositionGrip?: boolean } = {}) {
  const onMovePosition = vi.fn();
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
      captionBox={captionBox}
      showPositionGrip={opts.showPositionGrip}
      onTime={vi.fn()}
    />,
  );
  return { ...utils, onMovePosition };
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
    const { onMovePosition } = renderPlayer();
    const hitbox = screen.getByTestId("caption-position-hitbox");
    stubFrameRect(hitbox);

    fireEvent.pointerDown(hitbox, { clientX: 270, clientY: 653, pointerId: 1 });
    fireEvent.pointerUp(hitbox);

    expect(onMovePosition).not.toHaveBeenCalled();
    expect(captured.toggles).toBe(1);
  });

  it("no caption box means no hit box; no current card hides the grip", () => {
    const { container } = renderPlayer({ captionBox: null, showPositionGrip: false });
    expect(screen.queryByTestId("caption-position-hitbox")).toBeNull();
    expect(screen.queryByRole("slider", { name: /caption position/i })).toBeNull();
    expect(container.querySelector("[data-player-stub]")).not.toBeNull();
  });

  it("with a current card the grip is present as the keyboard handle", () => {
    renderPlayer();
    expect(screen.getByRole("slider", { name: "Caption position for this card (drag)" })).toBeTruthy();
  });
});
