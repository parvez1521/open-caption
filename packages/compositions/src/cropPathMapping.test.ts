import { describe, expect, it } from "vitest";
import type { SegmentKeyframe, SegmentTransform } from "@capseasy/shared";
import { sampleSegmentAnimation } from "./keyframes";
import { segmentTransformStyleForTransform } from "./overlayMath";

/**
 * THE CROP-PATH PROBE (AI Clipping Studio, reframe v2): the smart-crop path is
 * encoded as a base crop window (the transform's crop insets) plus offsetX /
 * offsetY keyframes that PAN the window. This test pins the mapping the
 * encoding relies on, against the two functions the renderer itself uses —
 * the keyframe sampler and the transform→style builder:
 *
 *   visible window left edge  =  cropLeft − offsetX
 *   visible window top edge   =  cropTop  − offsetY
 *   visible window size       =  (1 − cropLeft − cropRight) × (1 − cropTop − cropBottom)
 *
 * The visible window is recomputed NUMERICALLY from the emitted CSS (inner
 * width %, left/top %, and the translate %, which CSS resolves against the
 * inner box's own size) — not from the formula — so if either function's
 * geometry ever changes, this test fails before a wrong crop can ship.
 * Preview and export share this composition, so the mapping holding here is
 * the mapping everywhere.
 */

const BASE: SegmentTransform = {
  cropLeft: 0.52,
  cropRight: 0.2,
  cropTop: 0.1,
  cropBottom: 0.3,
  rotateDeg: 0,
  flipH: false,
  flipV: false,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  opacity: 1,
};

const KF = (atMs: number, property: "offsetX" | "offsetY", value: number): SegmentKeyframe => ({
  id: `${property}-${atMs}`,
  atMs,
  property,
  value,
  easing: "linear",
});

/** The source fraction visible at the stage's left/top edge, computed from the emitted styles. */
function visibleEdge(style: { width: string; left: string; transform?: string }, axis: "x" | "y"): number {
  const sizePct = parseFloat(style.width); // inner size as % of the stage (per axis via width/height symmetry)
  const posPct = parseFloat(style.left);
  const m = /translate\((-?[\d.]+)%,\s*(-?[\d.]+)%\)/.exec(style.transform ?? "");
  const translatePct = m ? parseFloat(axis === "x" ? m[1]! : m[2]!) : 0;
  // stage position of source point p: pos + translate% of inner size + p * inner size (all in stage %)
  // visible edge = p where the stage position is 0.
  return -(posPct + (translatePct / 100) * sizePct) / sizePct;
}

describe("crop-path offset mapping (the probe)", () => {
  const keyframes: SegmentKeyframe[] = [
    KF(0, "offsetX", 0),
    KF(5000, "offsetX", -0.2), // pan the window RIGHT by 0.20 of the source width
    KF(0, "offsetY", 0),
    KF(5000, "offsetY", 0.05), // pan the window UP by 0.05 of the source height
  ];
  const segment = { transform: BASE, keyframes };

  const visibleAt = (localMs: number): { left: number; top: number; fw: number; fh: number } => {
    const sampled = sampleSegmentAnimation(segment, localMs);
    const effective: SegmentTransform = { ...BASE, offsetX: sampled.offsetX, offsetY: sampled.offsetY };
    const style = segmentTransformStyleForTransform(effective);
    expect(style).not.toBeNull();
    const inner = style!.inner as { width: string; height: string; left: string; top: string; transform?: string };
    return {
      left: visibleEdge({ width: inner.width, left: inner.left, transform: inner.transform }, "x"),
      top: visibleEdge({ width: inner.height, left: inner.top, transform: inner.transform }, "y"),
      fw: 100 / parseFloat(inner.width),
      fh: 100 / parseFloat(inner.height),
    };
  };

  it("at the base keyframe the visible window is exactly the base crop", () => {
    const v = visibleAt(0);
    expect(v.left).toBeCloseTo(0.52, 6);
    expect(v.top).toBeCloseTo(0.1, 6);
    expect(v.fw).toBeCloseTo(0.28, 6);
    expect(v.fh).toBeCloseTo(0.6, 6);
  });

  it("offsetX = −0.2 moves the visible window right by exactly 0.2 of the source width", () => {
    const v = visibleAt(5000);
    expect(v.left).toBeCloseTo(0.72, 6);
    expect(v.fw).toBeCloseTo(0.28, 6); // a pan never resizes the window
  });

  it("mid-pan the sampler interpolates — the window glides through the shared evaluator", () => {
    const v = visibleAt(2500);
    expect(v.left).toBeCloseTo(0.62, 6);
    expect(v.top).toBeCloseTo(0.1 - 0.025, 6);
  });

  it("after the last keyframe the final window holds (constant extrapolation)", () => {
    const v = visibleAt(60_000);
    expect(v.left).toBeCloseTo(0.72, 6);
  });
});
