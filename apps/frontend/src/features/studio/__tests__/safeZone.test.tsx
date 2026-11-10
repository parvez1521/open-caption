import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PLATFORM_PRESETS, ProjectSettingsSchema, type Platform } from "@capseasy/shared";
import type { CaptionedVideoInput } from "@capseasy/compositions";
import { safeZoneFor, safeZoneStyle } from "../safeZone";

/**
 * Slice 5.5 (b): platform safe-zone guide in the studio preview.
 * - The geometry comes from the shared PLATFORM_PRESETS `unsafe` fractions (no second copy).
 * - EXPORT PARITY: the guide is Player chrome only. The Player below is a stub that records
 *   the props it receives; toggling the guide must leave the composition input byte-identical
 *   (same object), and the guide element must live OUTSIDE the Player's rendered subtree —
 *   exports render the composition alone, so chrome DOM can never reach a file.
 */

const captured = vi.hoisted(() => ({ inputProps: [] as unknown[] }));

vi.mock("@remotion/player", async () => {
  const React = await import("react");
  const Player = React.forwardRef(function PlayerStub(props: Record<string, unknown>, ref: React.Ref<unknown>) {
    captured.inputProps.push(props.inputProps);
    React.useImperativeHandle(ref, () => ({
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      toggle: () => undefined,
      getCurrentFrame: () => 0,
      seekTo: () => undefined,
    }));
    return React.createElement("div", { "data-player-stub": "true" });
  });
  return { Player };
});
vi.mock("@capseasy/compositions", () => ({ CaptionedVideo: () => null }));

import { StudioPlayer } from "../StudioPlayer";

describe("safeZoneFor — geometry from the shared platform presets", () => {
  it("reels: the safe rect is the frame minus the preset's stored unsafe insets", () => {
    const zone = safeZoneFor("reels");
    expect(zone.label).toBe("Instagram Reels");
    expect(zone.unsafe).toEqual(PLATFORM_PRESETS.reels.unsafe);
    // reels unsafe: top .12, bottom .20, left .05, right .12
    expect(zone.safe).toEqual({ leftPct: 5, topPct: 12, widthPct: 83, heightPct: 68 });
    expect(safeZoneStyle(zone)).toEqual({ left: "5%", top: "12%", width: "83%", height: "68%" });
  });

  it("tiktok / shorts / youtube insets match their presets exactly", () => {
    expect(safeZoneFor("tiktok").safe).toEqual({ leftPct: 5, topPct: 10, widthPct: 81, heightPct: 68 });
    expect(safeZoneFor("shorts").safe).toEqual({ leftPct: 5, topPct: 10, widthPct: 81, heightPct: 70 });
    expect(safeZoneFor("youtube").safe).toEqual({ leftPct: 5, topPct: 5, widthPct: 90, heightPct: 85 });
  });

  it("for every platform the safe rect plus insets tiles the frame exactly", () => {
    for (const platform of Object.keys(PLATFORM_PRESETS) as Platform[]) {
      const zone = safeZoneFor(platform);
      expect(zone.safe.leftPct + zone.safe.widthPct + zone.unsafe.right * 100).toBeCloseTo(100, 6);
      expect(zone.safe.topPct + zone.safe.heightPct + zone.unsafe.bottom * 100).toBeCloseTo(100, 6);
      expect(zone.safe.widthPct).toBeGreaterThan(0);
      expect(zone.safe.heightPct).toBeGreaterThan(0);
    }
  });
});

describe("StudioPlayer safe-zone guide — preview chrome only (export parity)", () => {
  const input: CaptionedVideoInput = {
    src: null,
    settings: ProjectSettingsSchema.parse({ platform: "reels" }),
  };

  it("toggling the guide changes NO composition input and renders outside the Player", () => {
    captured.inputProps.length = 0;
    const { container } = render(
      <StudioPlayer
        input={input}
        width={1080}
        height={1920}
        fps={30}
        durationMs={10_000}
        position={{ x: 0.5, y: 0.68 }}
        onMovePosition={vi.fn()}
        onTime={vi.fn()}
      />,
    );
    // guide off by default; the Player already received the untouched input object
    expect(container.querySelector("[data-safe-zone-guide]")).toBeNull();
    expect(captured.inputProps.length).toBeGreaterThan(0);
    expect(captured.inputProps[captured.inputProps.length - 1]).toBe(input);

    fireEvent.click(screen.getByRole("button", { name: "Toggle platform safe-zone guide" }));

    // guide is drawn, honestly labelled as a guide that is not in the export
    const guide = container.querySelector("[data-safe-zone-guide]");
    expect(guide).not.toBeNull();
    expect(guide!.textContent).toContain("Instagram Reels safe zone");
    expect(guide!.textContent).toContain("not in your export");
    // …as chrome: NOT inside the Player's subtree, and the Player's input is still
    // the exact same object — nothing about the composition changed
    const stub = container.querySelector("[data-player-stub]")!;
    expect(stub.querySelector("[data-safe-zone-guide]")).toBeNull();
    expect(captured.inputProps[captured.inputProps.length - 1]).toBe(input);

    // toggling back off removes the guide; the input is STILL untouched
    fireEvent.click(screen.getByRole("button", { name: "Toggle platform safe-zone guide" }));
    expect(container.querySelector("[data-safe-zone-guide]")).toBeNull();
    expect(captured.inputProps[captured.inputProps.length - 1]).toBe(input);
  });

  it("an explicit platform prop wins over the settings platform", () => {
    const { container } = render(
      <StudioPlayer
        input={input}
        width={1080}
        height={1920}
        fps={30}
        durationMs={10_000}
        position={{ x: 0.5, y: 0.66 }}
        onMovePosition={vi.fn()}
        onTime={vi.fn()}
        platform="tiktok"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Toggle platform safe-zone guide" }));
    expect(container.querySelector("[data-safe-zone-guide]")!.textContent).toContain("TikTok safe zone");
  });
});
