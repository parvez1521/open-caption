/**
 * StickersPanel (2026-11-18): the House Stickers set inside the editor's right
 * column. Pins: all 110 stickers are offered with the licence line on the surface,
 * and clicking one adds it at the playhead through the shared overlay path
 * (makeShapeOverlay + patch + select) in the colour the button showed. Search
 * filters the grid by name/tags/category and shows a "No stickers match" empty
 * state; category chips narrow to one group.
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
  it("offers all 110 house stickers and shows the licence line", () => {
    const { view } = renderPanel();
    expect(addButtons(view.container)).toHaveLength(110);
    expect(view.container.textContent).toContain("CC0");
    expect(view.container.textContent).toContain("drawn in-house for Captionit");
    view.unmount();
  });

  it("clicking a sticker adds it at the playhead and selects it, in the button's colour", () => {
    const { view, patch, onSelect } = renderPanel();
    const btn = addButtons(view.container).find((b) => b.getAttribute("aria-label") === "Add Crown");
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(patch).toHaveBeenCalledTimes(1);
    const arg = patch.mock.calls[0]![0] as { overlays: Array<{ id: string; kind: string; shape?: string; startMs: number; endMs: number; color?: string }> };
    expect(arg.overlays).toHaveLength(1);
    const item = arg.overlays[0]!;
    expect(item).toMatchObject({ kind: "shape", shape: "crown", startMs: 1000, endMs: 4000 });
    // the crown's fixed default colour is gold — what the button showed is what gets placed
    expect(item.color).toBe("#FFC531");
    expect(onSelect).toHaveBeenCalledWith(item.id);
    view.unmount();
  });

  it("each sticker button renders the real shape SVG, not a placeholder", () => {
    const { view } = renderPanel();
    const btn = addButtons(view.container).find((b) => b.getAttribute("aria-label") === "Add Flame");
    expect(btn?.querySelector("svg")).toBeTruthy();
    view.unmount();
  });

  it("search filters by name and tag, and shows the empty state when nothing matches", () => {
    const { view } = renderPanel();
    const search = view.container.querySelector('input[aria-label="Search stickers"]') as HTMLInputElement;
    expect(search).toBeTruthy();
    fireEvent.change(search, { target: { value: "birthday" } });
    const birthday = addButtons(view.container);
    expect(birthday.length).toBeGreaterThan(0);
    expect(birthday.length).toBeLessThan(110);
    expect(birthday.some((b) => b.getAttribute("aria-label") === "Add Birthday cake")).toBe(true);
    expect(birthday.some((b) => b.getAttribute("aria-label") === "Add Star")).toBe(false);
    fireEvent.change(search, { target: { value: "zxqvkj" } });
    expect(addButtons(view.container)).toHaveLength(0);
    expect(view.container.textContent).toContain("No stickers match");
    expect(view.container.textContent).toContain("zxqvkj");
    fireEvent.change(search, { target: { value: "" } });
    expect(addButtons(view.container)).toHaveLength(110);
    view.unmount();
  });

  it("category chips narrow the grid to one group", () => {
    const { view } = renderPanel();
    const faces = [...view.container.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Faces ("));
    expect(faces).toBeTruthy();
    fireEvent.click(faces!);
    const shown = addButtons(view.container);
    expect(shown).toHaveLength(8);
    expect(shown.some((b) => b.getAttribute("aria-label") === "Add Smiling face")).toBe(true);
    expect(shown.some((b) => b.getAttribute("aria-label") === "Add Pizza slice")).toBe(false);
    view.unmount();
  });

  it("shows the GIF library section with its honest still-in-export note", () => {
    const { view } = renderPanel();
    expect(view.container.textContent).toContain("Animated GIFs");
    expect(view.container.textContent).toContain("Openverse");
    expect(view.container.textContent).toContain("play as a still");
    expect(view.container.querySelector('input[aria-label="Search GIFs"]')).toBeTruthy();
    view.unmount();
  });
});
