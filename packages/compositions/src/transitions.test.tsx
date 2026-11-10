import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// AbsoluteFill renders fine statically, but the full remotion module pulls composition config
// helpers; keep the real module and only ensure Img-style config reads are not needed here.
vi.mock("remotion", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual };
});

import { BlurPresentation, ZoomPresentation, blurPresentation, zoomPresentation } from "./transitions";

const render = (Comp: typeof ZoomPresentation, direction: "entering" | "exiting", progress: number) =>
  renderToStaticMarkup(
    <Comp
      presentationDirection={direction}
      presentationProgress={progress}
      presentationDurationInFrames={9}
      passedProps={{}}
      onElementImage={() => {}}
      onUnmount={() => {}}
      bothEnteringAndExiting={false}
    >
      <div data-scene="true" />
    </Comp>,
  );

describe("ZoomPresentation (custom @remotion/transitions presentation)", () => {
  it("at progress 0.5 both scenes are mounted with intermediate scale/opacity (the blend evidence)", () => {
    const entering = render(ZoomPresentation, "entering", 0.5);
    expect(entering).toContain('data-scene="true"');
    expect(entering).toContain("opacity:0.5");
    expect(entering).toContain("scale(0.925)"); // 0.85 -> 1 at 0.5
    const exiting = render(ZoomPresentation, "exiting", 0.5);
    expect(exiting).toContain('data-scene="true"');
    expect(exiting).toContain("opacity:0.5");
    expect(exiting).toContain("scale(1.075)"); // 1 -> 1.15 at 0.5
  });

  it("endpoints: entering starts invisible at 0.85, exiting ends invisible at 1.15", () => {
    expect(render(ZoomPresentation, "entering", 0)).toContain("scale(0.85)");
    expect(render(ZoomPresentation, "exiting", 1)).toContain("opacity:0");
  });

  it("zoomPresentation() returns a TransitionPresentation with the component and empty props", () => {
    const p = zoomPresentation();
    expect(p.component).toBe(ZoomPresentation);
    expect(p.props).toEqual({});
  });
});

describe("BlurPresentation (custom @remotion/transitions presentation)", () => {
  it("at progress 0.5 both scenes are mounted, crossfaded, with 6px blur (the blend evidence)", () => {
    const entering = render(BlurPresentation, "entering", 0.5);
    expect(entering).toContain('data-scene="true"');
    expect(entering).toContain("opacity:0.5");
    expect(entering).toContain("blur(6px)"); // 12px -> 0 at 0.5
    const exiting = render(BlurPresentation, "exiting", 0.5);
    expect(exiting).toContain('data-scene="true"');
    expect(exiting).toContain("opacity:0.5");
    expect(exiting).toContain("blur(6px)"); // 0 -> 12px at 0.5
  });

  it("endpoints: entering starts at blur 12px, exiting ends at blur 12px", () => {
    expect(render(BlurPresentation, "entering", 0)).toContain("blur(12px)");
    expect(render(BlurPresentation, "exiting", 1)).toContain("blur(12px)");
    expect(render(BlurPresentation, "entering", 1)).toContain("blur(0px)");
  });

  it("blurPresentation() returns a TransitionPresentation with the component and empty props", () => {
    const p = blurPresentation();
    expect(p.component).toBe(BlurPresentation);
    expect(p.props).toEqual({});
  });
});
