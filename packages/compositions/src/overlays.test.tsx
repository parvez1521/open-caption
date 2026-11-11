import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Remotion's <Img> reads the composition config (absent in a static-markup render); stand it in
// with a plain <img> so the overlay's own markup — src, size, position — is what gets asserted.
vi.mock("remotion", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, Img: (props: Record<string, unknown>) => React.createElement("img", props) };
});
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
    // Package 2 item F: the original nine plus twelve new creator shapes
    expect(OVERLAY_SHAPES).toHaveLength(21);
    for (const id of ["rounded-rectangle", "ellipse", "diamond", "chevron", "double-arrow", "speech-bubble", "underline-bar", "corner-brackets", "progress-bar", "plus", "cross", "badge"] as const) {
      expect(OVERLAY_SHAPES).toContain(id);
    }
    for (const shape of OVERLAY_SHAPES) {
      const html = renderToStaticMarkup(<OverlayShapeSvg shape={shape} color="#FFA946" size={120} />);
      expect(html).toContain("<svg");
      expect(html).toContain('width="120"');
      expect(html).toContain("#FFA946");
      expect(html).not.toContain("mix-blend-mode");
    }
  });

  it("Package 3 I.5: overlay entrance/exit animation applies only to animated items", () => {
    const base: OverlayItem = { id: "a1", kind: "shape", shape: "star", startMs: 0, endMs: 4000, x: 0.5, y: 0.5, scale: 1, rotation: 0, color: "#FFA946" };
    // no animation fields: no animation wrapper styles anywhere
    const plain = renderToStaticMarkup(<OverlayView item={base} sc={1} localMs={0} />);
    expect(plain).not.toContain("translateY");
    // rise entrance at t=0: fully offset + transparent; settled by the base duration
    const rising: OverlayItem = { ...base, enterAnim: "rise" };
    const at0 = renderToStaticMarkup(<OverlayView item={rising} sc={1} localMs={0} />);
    expect(at0).toContain("translateY(26");
    expect(at0).toContain("opacity:0");
    const settled = renderToStaticMarkup(<OverlayView item={rising} sc={1} localMs={2000} />);
    expect(settled).not.toContain("translateY");
    // exit fade near the end of the window: opacity dropping; mid-window untouched
    const fading: OverlayItem = { ...base, exitAnim: "fade" };
    const nearEnd = renderToStaticMarkup(<OverlayView item={fading} sc={1} localMs={3950} />);
    expect(nearEnd).toMatch(/opacity:0\.\d/);
    const mid = renderToStaticMarkup(<OverlayView item={fading} sc={1} localMs={2000} />);
    expect(mid).not.toMatch(/opacity:0\.\d/);
    // speed semantics: 2x speed halves the entrance duration
    const fast: OverlayItem = { ...base, enterAnim: "rise", enterSpeed: 2 };
    expect(renderToStaticMarkup(<OverlayView item={fast} sc={1} localMs={200} />)).not.toContain("translateY");
    expect(renderToStaticMarkup(<OverlayView item={rising} sc={1} localMs={200} />)).toContain("translateY");
  });

  it("renders an image overlay only when its asset URL is resolved in this context", () => {
    const item: OverlayItem = { id: "i1", kind: "image", assetId: "asset-9", assetName: "logo.png", startMs: 0, endMs: 1000, x: 0.5, y: 0.25, scale: 1, rotation: 0, color: "#FFFFFF" };
    const withSrc = renderToStaticMarkup(<OverlayView item={item} sc={1} assetSrc="blob:logo" />);
    expect(withSrc).toContain('src="blob:logo"');
    expect(withSrc).toContain("width:360px");
    expect(withSrc).toContain("top:25%");
    expect(withSrc).not.toContain("mix-blend-mode");
    // no resolved URL (e.g. a server render, which cannot see device-local bytes): nothing is drawn
    expect(renderToStaticMarkup(<OverlayView item={item} sc={1} />)).toBe("");
  });

  it("renders a shape overlay item through OverlayView", () => {
    const item: OverlayItem = { id: "s1", kind: "shape", shape: "arrow", startMs: 0, endMs: 1000, x: 0.5, y: 0.5, scale: 1, rotation: 0, color: "#FFA946" };
    const html = renderToStaticMarkup(<OverlayView item={item} sc={1} />);
    expect(html).toContain("<svg");
    expect(html).toContain("#FFA946");
    expect(html).toContain("left:50%");
  });
});
