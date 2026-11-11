/**
 * alphaVerify: the pure decision core of the post-encode alpha check. A transparent
 * export is delivered only when every sampled frame shows BOTH (near-)transparent and
 * (near-)opaque pixels — flat alpha in either direction (an opaque render wearing a
 * transparent label, or an empty file) must fail. (The live Mediabunny read-back itself
 * needs a real browser decoder; it fails closed around this core.)
 */
import { describe, expect, it } from "vitest";
import { ALPHA_SAMPLE_FRACTIONS, alphaStatsOf, evaluateAlphaFrames } from "../alphaVerify";

/** Build an RGBA buffer from a list of alpha values (RGB zeroed). */
const rgba = (alphas: number[]): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(alphas.length * 4);
  alphas.forEach((a, i) => {
    data[i * 4 + 3] = a;
  });
  return data;
};

describe("alphaStatsOf", () => {
  it("reports min/max alpha and the transparent fraction", () => {
    const s = alphaStatsOf(rgba([0, 128, 255, 255]));
    expect(s.min).toBe(0);
    expect(s.max).toBe(255);
    expect(s.transparentFraction).toBeCloseTo(0.5, 5);
  });
  it("an empty buffer is all-opaque by the numbers (fraction 0)", () => {
    const s = alphaStatsOf(new Uint8ClampedArray(0));
    expect(s.transparentFraction).toBe(0);
  });
});

describe("evaluateAlphaFrames (the no-alpha-no-delivery verdict)", () => {
  it("passes when every sampled frame mixes clear and solid pixels", () => {
    expect(evaluateAlphaFrames([{ min: 0, max: 255 }, { min: 12, max: 255 }])).toBe(true);
    expect(evaluateAlphaFrames([{ min: 0, max: 251 }])).toBe(true);
  });
  it("FAILS a flat-opaque file (an opaque render labelled transparent)", () => {
    expect(evaluateAlphaFrames([{ min: 255, max: 255 }, { min: 255, max: 255 }])).toBe(false);
    expect(evaluateAlphaFrames([{ min: 252, max: 255 }])).toBe(false);
  });
  it("FAILS a fully transparent (empty) file — the graphic must be present too", () => {
    expect(evaluateAlphaFrames([{ min: 0, max: 0 }, { min: 0, max: 40 }])).toBe(false);
  });
  it("FAILS when ANY sampled frame is flat, and on no samples at all", () => {
    expect(evaluateAlphaFrames([{ min: 0, max: 255 }, { min: 255, max: 255 }])).toBe(false);
    expect(evaluateAlphaFrames([])).toBe(false);
  });
  it("samples mid-animation (0.35 / 0.65), never the enter/exit tails", () => {
    expect(ALPHA_SAMPLE_FRACTIONS).toEqual([0.35, 0.65]);
  });
});
