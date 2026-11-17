/**
 * TitlesPanel: offers all 50 registry titles grouped by category, and clicking one
 * adds it at the playhead through the shared overlay path (makeTitleOverlay + patch +
 * select) with the preset's own text, font and entrance.
 */
import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectSettingsSchema } from "@capseasy/shared";
import { TITLE_STYLES } from "../titleStyles";
import { TitlesPanel } from "../panels/TitlesPanel";

function renderPanel() {
  const patch = vi.fn();
  const onSelect = vi.fn();
  const view = render(
    <TitlesPanel
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

describe("TitlesPanel", () => {
  it("offers every registry title, grouped in registry category order", () => {
    const { view } = renderPanel();
    expect(addButtons(view.container)).toHaveLength(50);
    const headings = [...view.container.querySelectorAll("h3")].map((h) => h.textContent);
    expect(headings).toEqual(["Text titles", "Kinetic Big", "Lower Third", "Minimal", "Bold Punch", "Elegant", "Fun Pop"]);
    view.unmount();
  });

  it("clicking a title adds it at the playhead with the preset fields and selects it", () => {
    const { view, patch, onSelect } = renderPanel();
    const style = TITLE_STYLES.find((s) => s.id === "big-impact")!;
    const btn = addButtons(view.container).find((b) => b.getAttribute("aria-label") === "Add Big Impact");
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(patch).toHaveBeenCalledTimes(1);
    const arg = patch.mock.calls[0]![0] as { overlays: Array<{ id: string; kind: string; text?: string; font?: string; enterAnim?: string; startMs: number; endMs: number }> };
    expect(arg.overlays).toHaveLength(1);
    const item = arg.overlays[0]!;
    expect(item).toMatchObject({
      kind: "text",
      text: style.text,
      font: style.font,
      enterAnim: style.enterAnim,
      startMs: 1000,
    });
    expect(item.endMs - item.startMs).toBe(style.durationMs);
    expect(onSelect).toHaveBeenCalledWith(item.id);
    view.unmount();
  });

  it("a lower-third title lands low on the frame", () => {
    const { view, patch } = renderPanel();
    const btn = addButtons(view.container).find((b) => b.getAttribute("aria-label") === "Add Lower Name");
    fireEvent.click(btn!);
    const item = (patch.mock.calls[0]![0] as { overlays: Array<{ y: number }> }).overlays[0]!;
    expect(item.y).toBe(0.82);
    view.unmount();
  });
});
