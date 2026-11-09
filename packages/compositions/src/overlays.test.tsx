import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OVERLAY_SHAPES, type OverlayItem } from "@capseasy/shared";
import { OVERLAY_SHAPE_META, OverlayShapeSvg, OverlayView } from "./overlays";

const textItem: OverlayItem = {
  id: "t1", kind: "text", text: "Watch this", startMs: 0, endMs: 3000,
  x: 0.25, y: 0.75, scale: 2, rotation: -10, color: "#34D399", fontSize: 80,
};

describe("OverlayView (static markup — the same tree the Player and the web-renderer draw)", () => {
  it("positions a text overlay centre-anchored with rotation, scale, colour and size", () => {
    const html = renderToStaticMarkup(<OverlayView item={textItem} sc={1} />);
    expect(html).toContain("Watch this");
    expect(html).toContain("left:25%");
    expect(html).toContain("top:75%");
    expect(html).toContain("translate(-50%, -50%) rotate(-10deg) scale(2)");
    expect(html).toContain("color:#34D399");
    expect(html).toContain("font-size:80px");
    expect(html).toContain("Plus Jakarta Sans");
    expect(html).not.toContain("mix-blend-mode");
  });

  it("scales reference px with the canvas scale factor", () => {
    const html = renderToStaticMarkup(<OverlayView item={textItem} sc={0.5} />);
    expect(html).toContain("font-size:40px");
  });

  it("renders every shape in the set as an SVG painted with the item colour", () => {
    expect(OVERLAY_SHAPE_META.map((s) => s.id)).toEqual([...OVERLAY_SHAPES]);
    for (const shape of OVERLAY_SHAPES) {
      const html = renderToStaticMarkup(<OverlayShapeSvg shape={shape} color="#FFA946" size={120} />);
      expect(html).toContain("<svg");
      expect(html).toContain('width="120"');
      expect(html).toContain("#FFA946");
      expect(html).not.toContain("mix-blend-mode");
    }
  });

  it("renders a shape overlay item through OverlayView", () => {
    const item: OverlayItem = { id: "s1", kind: "shape", shape: "arrow", startMs: 0, endMs: 1000, x: 0.5, y: 0.5, scale: 1, rotation: 0, color: "#FFA946" };
    const html = renderToStaticMarkup(<OverlayView item={item} sc={1} />);
    expect(html).toContain("<svg");
    expect(html).toContain("#FFA946");
    expect(html).toContain("left:50%");
  });
});
