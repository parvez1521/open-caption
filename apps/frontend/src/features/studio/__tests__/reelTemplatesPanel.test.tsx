import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectSettingsSchema } from "@capseasy/shared";
import { ReelTemplatesPanel } from "../panels/ReelTemplatesPanel";

function renderPanel() {
  const patch = vi.fn();
  const onSelect = vi.fn();
  const onChooseLook = vi.fn();
  const view = render(
    <ReelTemplatesPanel
      settings={ProjectSettingsSchema.parse({})}
      patch={patch}
      selectedId={null}
      onSelect={onSelect}
      getTimeMs={() => 1000}
      durationMs={30000}
      onChooseLook={onChooseLook}
    />,
  );
  return { view, patch, onSelect, onChooseLook };
}

describe("ReelTemplatesPanel", () => {
  it("lists all 50 templates grouped by category and applies one on click", () => {
    const { view, patch, onChooseLook } = renderPanel();
    expect(view.container.querySelectorAll('button[aria-label^="Apply "]')).toHaveLength(50);
    for (const heading of ["Hook", "Promo", "Tutorial", "Announcement", "Product & UGC"]) {
      expect(screen.getByText(heading)).toBeTruthy();
    }

    fireEvent.click(screen.getByRole("button", { name: "Apply Stop the Scroll" }));
    expect(patch).toHaveBeenCalledTimes(1);
    const overlays = patch.mock.calls[0][0].overlays;
    expect(overlays).toHaveLength(3);
    expect(overlays[0].kind).toBe("text");
    expect(overlays[0].text).toBe("STOP");
    expect(onChooseLook).toHaveBeenCalledWith("hormozi_box");
    view.unmount();
  });

  it("edits the applied template's headline through its param field", () => {
    const { view, patch } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Apply Stop the Scroll" }));
    const headline = screen.getByLabelText("Headline") as HTMLInputElement;
    expect(headline.value).toBe("STOP");
    fireEvent.change(headline, { target: { value: "WAIT FOR IT" } });
    expect(patch).toHaveBeenCalledTimes(2);
    const overlays = patch.mock.calls[1][0].overlays;
    expect(overlays.find((o: { text?: string }) => o.text === "WAIT FOR IT")).toBeTruthy();
    expect(overlays).toHaveLength(3);
    view.unmount();
  });

  it("replaces the previous instance when another template is applied", () => {
    const { view, patch, onChooseLook } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Apply Stop the Scroll" }));
    const firstIds = patch.mock.calls[0][0].overlays.map((o: { id: string }) => o.id);
    fireEvent.click(screen.getByRole("button", { name: "Apply New Drop" }));
    const second = patch.mock.calls[1][0].overlays;
    expect(second).toHaveLength(3);
    for (const id of firstIds) expect(second.some((o: { id: string }) => o.id === id)).toBe(false);
    expect(onChooseLook).toHaveBeenLastCalledWith("metal_script");
    view.unmount();
  });
});
