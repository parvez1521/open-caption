import { describe, expect, it } from "vitest";
import type { SegmentKeyframe } from "@capseasy/shared";
import { KEYFRAME_EASING_FNS, sampleChannel, sampleSegmentAnimation } from "./keyframes";

const kf = (atMs: number, property: SegmentKeyframe["property"], value: number, easing: SegmentKeyframe["easing"] = "linear", id?: string): SegmentKeyframe => ({
  id: id ?? `k-${property}-${atMs}-${value}`,
  atMs,
  property,
  value,
  easing,
});

describe("KEYFRAME_EASING_FNS", () => {
  it("pins each easing at t=0.5 (and the endpoints)", () => {
    expect(KEYFRAME_EASING_FNS.linear(0.5)).toBe(0.5);
    expect(KEYFRAME_EASING_FNS["ease-in"](0.5)).toBe(0.125); // 0.5^3
    expect(KEYFRAME_EASING_FNS["ease-out"](0.5)).toBe(0.875); // 1 - 0.5^3
    expect(KEYFRAME_EASING_FNS["ease-in-out"](0.5)).toBe(0.5);
    expect(KEYFRAME_EASING_FNS.hold(0.5)).toBe(0);
    for (const fn of [KEYFRAME_EASING_FNS.linear, KEYFRAME_EASING_FNS["ease-in"], KEYFRAME_EASING_FNS["ease-out"], KEYFRAME_EASING_FNS["ease-in-out"]]) {
      expect(fn(0)).toBe(0);
      expect(fn(1)).toBe(1);
    }
    expect(KEYFRAME_EASING_FNS["ease-in-out"](0.25)).toBe(0.0625); // 4 * 0.25^3
    expect(KEYFRAME_EASING_FNS.hold(0)).toBe(0);
    expect(KEYFRAME_EASING_FNS.hold(0.999)).toBe(0);
  });
});

describe("sampleChannel", () => {
  const scaleKfs = [kf(0, "scale", 1), kf(1000, "scale", 2)];

  it("returns the base value when there are no keyframes for the property", () => {
    expect(sampleChannel([], "scale", 1.5, 500)).toBe(1.5);
    expect(sampleChannel(undefined, "scale", 1.5, 500)).toBe(1.5);
    expect(sampleChannel(scaleKfs, "opacity", 0.75, 500)).toBe(0.75);
  });

  it("hits the endpoints exactly and lerps linearly between them", () => {
    expect(sampleChannel(scaleKfs, "scale", 1, 0)).toBe(1);
    expect(sampleChannel(scaleKfs, "scale", 1, 500)).toBe(1.5);
    expect(sampleChannel(scaleKfs, "scale", 1, 1000)).toBe(2);
  });

  it("applies the START keyframe's easing to the span", () => {
    expect(sampleChannel([kf(0, "scale", 0, "ease-in"), kf(1000, "scale", 1)], "scale", 0, 500)).toBe(0.125);
    expect(sampleChannel([kf(0, "scale", 0, "ease-out"), kf(1000, "scale", 1)], "scale", 0, 500)).toBe(0.875);
    expect(sampleChannel([kf(0, "scale", 0, "ease-in-out"), kf(1000, "scale", 1)], "scale", 0, 500)).toBe(0.5);
    // easing stored on the SECOND keyframe governs the NEXT span, not this one
    expect(sampleChannel([kf(0, "scale", 0), kf(1000, "scale", 1, "ease-in"), kf(2000, "scale", 2)], "scale", 0, 500)).toBe(0.5);
    expect(sampleChannel([kf(0, "scale", 0), kf(1000, "scale", 1, "ease-in"), kf(2000, "scale", 2)], "scale", 0, 1500)).toBe(1.125);
  });

  it("hold keeps the span's start value until the next keyframe, then steps", () => {
    const kfs = [kf(0, "opacity", 0.25, "hold"), kf(1000, "opacity", 0.75)];
    expect(sampleChannel(kfs, "opacity", 1, 0)).toBe(0.25);
    expect(sampleChannel(kfs, "opacity", 1, 999)).toBe(0.25);
    expect(sampleChannel(kfs, "opacity", 1, 1000)).toBe(0.75);
  });

  it("extrapolates constantly before the first and after the last keyframe (pro-editor rule)", () => {
    const kfs = [kf(500, "scale", 3), kf(1000, "scale", 4)];
    expect(sampleChannel(kfs, "scale", 1, 0)).toBe(3);
    expect(sampleChannel(kfs, "scale", 1, 250)).toBe(3);
    expect(sampleChannel(kfs, "scale", 1, 500)).toBe(3);
    expect(sampleChannel(kfs, "scale", 1, 1500)).toBe(4);
    expect(sampleChannel(kfs, "scale", 1, 99999)).toBe(4);
  });

  it("on duplicate atMs the later array entry wins", () => {
    const kfs = [kf(0, "scale", 1), kf(500, "scale", 2, "linear", "first"), kf(500, "scale", 5, "linear", "second"), kf(1000, "scale", 6)];
    expect(sampleChannel(kfs, "scale", 1, 500)).toBe(5);
    expect(sampleChannel(kfs, "scale", 1, 250)).toBe(3); // span 1 -> 5
    expect(sampleChannel(kfs, "scale", 1, 750)).toBe(5.5); // span 5 -> 6
  });

  it("accepts unsorted input", () => {
    const kfs = [kf(1000, "scale", 2), kf(0, "scale", 1), kf(500, "scale", 1.5)];
    expect(sampleChannel(kfs, "scale", 9, 250)).toBe(1.25);
    expect(sampleChannel(kfs, "scale", 9, 750)).toBe(1.75);
  });
});

describe("sampleSegmentAnimation", () => {
  it("with no keyframes returns exactly the resolved base transform channels", () => {
    const segment = { transform: { offsetX: 0.1, offsetY: -0.2, scale: 2, rotateDeg: 15, opacity: 0.6 } } as never;
    expect(sampleSegmentAnimation(segment, 500)).toEqual({ offsetX: 0.1, offsetY: -0.2, scale: 2, rotateDeg: 15, opacity: 0.6 });
    expect(sampleSegmentAnimation({} as never, 0)).toEqual({ offsetX: 0, offsetY: 0, scale: 1, rotateDeg: 0, opacity: 1 });
  });

  it("samples each channel independently against its own keyframes and base", () => {
    const segment = {
      transform: { scale: 1, opacity: 1 },
      keyframes: [kf(0, "scale", 1), kf(1000, "scale", 3), kf(0, "opacity", 1, "hold"), kf(1000, "opacity", 0)],
    } as never;
    expect(sampleSegmentAnimation(segment, 500)).toEqual({ offsetX: 0, offsetY: 0, scale: 2, rotateDeg: 0, opacity: 1 });
    expect(sampleSegmentAnimation(segment, 1000)).toEqual({ offsetX: 0, offsetY: 0, scale: 3, rotateDeg: 0, opacity: 0 });
  });
});
