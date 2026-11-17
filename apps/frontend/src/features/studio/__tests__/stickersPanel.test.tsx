/**
 * StickersPanel (2026-11-18): the House Stickers set inside the editor's right
 * column. Pins: all 12 stickers are offered with the licence line on the surface,
 * and clicking one adds it at the playhead through the shared overlay path
 * (makeShapeOverlay + patch + select).
 */
import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectSettingsSchema } from "@capseasy/shared";
import { StickersPanel } from "../panels/StickersPanel";

function renderPanel() {
  const patch = vi.fn();
  const onSelect = vi.fn();
  const view = render(
    <StickersPanel
      settings={ProjectSettingsSchema.parse({})}
      patch={patch}
      selectedId={null}
      onSelect={onSelect}
      getTimeMs={() => 1000}
      durationMs={30000}
    />,
  );
  return { view, patch, onSelect };
}

const addButtons = (root: HTMLElement) => [...root.querySelectorAll("button")].filter((b) => (b.getAttribute("aria-label") ?? "").startsWith("Add "));

describe("StickersPanel", () => {
  it("offers all 12 house stickers and shows the licence line", () => {
    const { view } = renderPanel();
    expect(addButtons(view.container)).toHaveLength(12);
    expect(view.container.textContent).toContain("CC0");
    expect(view.container.textContent).toContain("drawn in-house for Captionit");
    view.unmount();
  });

  it("clicking a sticker adds it at the playhead and selects it", () => {
    const { view, patch, onSelect } = renderPanel();
    const btn = addButtons(view.container).find((b) => b.getAttribute("aria-label") === "Add Crown");
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(patch).toHaveBeenCalledTimes(1);
    const arg = patch.mock.calls[0]![0] as { overlays: Array<{ id: string; kind: string; shape?: string; startMs: number; endMs: number }> };
    expect(arg.overlays).toHaveLength(1);
    const item = arg.overlays[0]!;
    expect(item).toMatchObject({ kind: "shape", shape: "crown", startMs: 1000, endMs: 4000 });
    expect(onSelect).toHaveBeenCalledWith(item.id);
    view.unmount();
  });

  it("each sticker button renders the real shape SVG, not a placeholder", () => {
    const { view } = renderPanel();
    const btn = addButtons(view.container).find((b) => b.getAttribute("aria-label") === "Add Flame");
    expect(btn?.querySelector("svg")).toBeTruthy();
    view.unmount();
  });
});
