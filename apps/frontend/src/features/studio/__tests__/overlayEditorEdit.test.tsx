/**
 * Placed motion elements are fully editable (P4 regression, 2026-11-11).
 *
 * The chain the owner reported broken: add a template from the Motion panel →
 * move it → resize it → edit its text/colour — and have ALL of it land in the
 * stored overlay, with the composition (OverlayView — the same renderer the
 * export uses) drawing the edited result. The panel-add step is pinned by
 * motionStudioPanel.test; this file pins the editing half: the inspector's
 * "Edit template" block is the shared registry form, the transform fields cover
 * position/scale/rotation/opacity, and the final item renders edited.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OverlayItem } from "@capseasy/shared";
import { OverlayView } from "@capseasy/compositions";
import { OverlayEditor } from "../panels/OverlayEditor";
import { makeSocialOverlay } from "../panels/overlayItems";

const sliderInput = (label: string): HTMLInputElement => {
  const el = screen.getByText(label).closest("label")!.querySelector('input[type="range"]');
  if (!el) throw new Error(`no slider for ${label}`);
  return el as HTMLInputElement;
};

describe("OverlayEditor — Edit template + transforms (P4)", () => {
  it("add → move → resize → edit text/colour → the composition draws the edited item", () => {
    // add-from-panel state (makeSocialOverlay is the panel's own builder), held by a
    // stateful harness so the controlled editor re-renders per patch like the real app
    let item: OverlayItem = { ...makeSocialOverlay("subscribe-banner", 1000, 30000) };
    const Harness: React.FC = () => {
      const [current, setCurrent] = React.useState(item);
      return (
        <OverlayEditor
          item={current}
          onChange={(next) => { item = next; setCurrent(next); }}
          onDelete={() => {}}
          mediaAssets={[]}
          onImportMedia={async () => []}
        />
      );
    };
    const view = render(<Harness />);

    // the SAME registry form as the customize page: Edit template block with
    // Text lines + Accent colour + Avatar image + Duration
    expect(screen.getByText("Edit template")).toBeTruthy();
    const textArea = screen.getByLabelText("Text lines") as HTMLTextAreaElement;
    expect(textArea.value).toBe(item.text);
    expect(screen.getByLabelText("Accent colour (hex value)")).toBeTruthy();
    expect(screen.getByLabelText("Avatar image")).toBeTruthy();

    // move: exact X/Y fields (50% / 78% defaults for this builder)
    fireEvent.change(screen.getByLabelText("Position X percent"), { target: { value: "25" } });
    expect(item.x).toBe(0.25);
    fireEvent.change(screen.getByLabelText("Position Y percent"), { target: { value: "30" } });
    expect(item.y).toBe(0.3);

    // resize + rotate + opacity via the transform fields
    fireEvent.change(sliderInput("Scale"), { target: { value: "2" } });
    expect(item.scale).toBe(2);
    fireEvent.change(sliderInput("Rotation"), { target: { value: "15" } });
    expect(item.rotation).toBe(15);
    fireEvent.change(sliderInput("Opacity"), { target: { value: "60" } });
    expect(item.opacity).toBe(0.6);

    // edit the template itself: text + colour + duration
    fireEvent.change(textArea, { target: { value: "My Channel\nDaily videos\nSubscribe\nSubscribed" } });
    expect(item.text).toContain("My Channel");
    fireEvent.change(screen.getByLabelText("Accent colour (hex value)"), { target: { value: "#34D399" } });
    expect(item.color).toBe("#34D399");
    fireEvent.change(screen.getByLabelText("Duration value in milliseconds"), { target: { value: "6000" } });
    expect(item.endMs - item.startMs).toBe(6000);

    // the composition renderer (preview ≡ export) draws the edited config
    view.unmount();
    const { container } = render(<OverlayView item={item} sc={1} localMs={2600} />);
    expect(container.textContent).toContain("My Channel");
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.style.transform).toContain("rotate(15deg)");
    expect(frame.style.transform).toContain("scale(2)");
    expect(frame.style.opacity).toBe("0.6");
    expect(frame.style.left).toBe("25%");
    expect(frame.style.top).toBe("30%");
  });

  it("a text overlay keeps its plain editor (no template block) and gains opacity", () => {
    const item: OverlayItem = {
      id: "t1", kind: "text", text: "Hello", startMs: 0, endMs: 4000,
      x: 0.5, y: 0.5, scale: 1, rotation: 0, color: "#FFFFFF",
    };
    render(<OverlayEditor item={item} onChange={() => {}} onDelete={() => {}} />);
    expect(screen.queryByText("Edit template")).toBeNull();
    expect(sliderInput("Opacity")).toBeTruthy();
    expect(screen.getByLabelText("Position X percent")).toBeTruthy();
  });
});
