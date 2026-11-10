import { describe, expect, it } from "vitest";
import { FACE_PRESENCE_MIN, largestFace, sampleTimesForRange, suggestWindowFromFaces } from "./faceReframe";
import { cropWindowFractions, DEFAULT_CROP_WINDOW } from "./reframe";
import type { FaceBox } from "./yunet";

/**
 * Face → window aggregation (G5 Level 1): median centre, largest-face rule,
 * the presence gate, and zoom preservation — the exact behaviours the
 * evaluation sanctioned, including "no suggestion → window untouched".
 */
const face = (x: number, y: number, w: number, h: number): FaceBox => ({ x, y, w, h, score: 0.9, landmarks: [] });
const W = 1920;
const H = 1080;

describe("sampleTimesForRange", () => {
  it("samples at ~3 fps including both ends", () => {
    const times = sampleTimesForRange(10_000, 20_000);
    expect(times[0]).toBe(10_000);
    expect(times[times.length - 1]).toBe(20_000);
    expect(times.length).toBe(31); // 10 s at 3 fps + endpoint
  });

  it("caps very long ranges and handles a single instant", () => {
    expect(sampleTimesForRange(0, 600_000).length).toBe(90);
    expect(sampleTimesForRange(5_000, 5_000)).toEqual([]);
    expect(sampleTimesForRange(0, 100)).toEqual([50]);
  });
});

describe("largestFace", () => {
  it("picks the largest by area, null on empty", () => {
    expect(largestFace([])).toBeNull();
    expect(largestFace([face(0, 0, 10, 10), face(0, 0, 30, 20), face(0, 0, 25, 25)])?.w).toBe(25);
  });
});

describe("suggestWindowFromFaces", () => {
  it("centres the window on the median face centre (outliers cannot drag it)", () => {
    // face centred at x=1440 (0.75 of width) in most frames; one wild frame at x=100
    const centred = face(1440 - 100, 300, 200, 240);
    const wild = face(0, 0, 200, 240);
    const samples = [centred, centred, wild, centred, centred].map((f) => [f]);
    const win = suggestWindowFromFaces(samples, W, H)!;
    expect(win).not.toBeNull();
    const fractions = cropWindowFractions(win, W, H)!;
    const left = win.x * (1 - fractions.fw);
    // window centre ≈ 0.75 of the frame width
    expect(left + fractions.fw / 2).toBeCloseTo(0.75, 2);
    expect(win.zoom).toBe(1); // a 200px face fits the unzoomed window (fw ≈ 0.316 · 1920 ≈ 607px)
  });

  it("returns null below the presence gate and on no faces at all", () => {
    const withFace = [face(800, 300, 200, 240)];
    const sparse = [withFace, [], [], [], [], [], [], [], [], []]; // 10% presence
    expect(suggestWindowFromFaces(sparse, W, H)).toBeNull();
    expect(suggestWindowFromFaces([[], [], []], W, H)).toBeNull();
    expect(suggestWindowFromFaces([], W, H)).toBeNull();
    const atGate = Array.from({ length: 4 }, (_, i) => (i / 4 < FACE_PRESENCE_MIN ? withFace : withFace));
    expect(suggestWindowFromFaces(atGate, W, H)).not.toBeNull(); // 100% presence
    expect(suggestWindowFromFaces([withFace, [], [], []], W, H)).not.toBeNull(); // exactly 25%
  });

  it("preserves the current zoom — the suggestion only re-centres (a wide face cannot be fitted by zooming)", () => {
    const big = face(560, 200, 800, 700); // wider than the unzoomed window (~607px)
    const zoomed = suggestWindowFromFaces([[big], [big], [big]], W, H, { x: 0.5, y: 0.5, zoom: 2 })!;
    expect(zoomed.zoom).toBe(2);
    const fractions = cropWindowFractions(zoomed, W, H)!;
    // still centred on the face centre (0.5)
    expect(zoomed.x * (1 - fractions.fw) + fractions.fw / 2).toBeCloseTo(0.5, 2);
    // at zoom 2 the vertical centre bites too: face centre y = 550/1080 ≈ 0.509
    expect(zoomed.y * (1 - fractions.fh) + fractions.fh / 2).toBeCloseTo(550 / H, 2);
    const plain = suggestWindowFromFaces([[big], [big], [big]], W, H)!;
    expect(plain.zoom).toBe(1);
    expect(plain.y).toBe(0.5); // no vertical travel at zoom 1
  });

  it("returns null for portrait sources (no reframe window exists)", () => {
    expect(suggestWindowFromFaces([[face(400, 800, 200, 240)]], 1080, 1920)).toBeNull();
    expect(suggestWindowFromFaces([[face(0, 0, 10, 10)]], null, null)).toBeNull();
  });

  it("uses the largest face per frame (panel/interview rule)", () => {
    const small = face(100, 300, 150, 180);
    const large = face(1300, 300, 300, 360);
    const win = suggestWindowFromFaces([[small, large], [small, large]], W, H)!;
    const fractions = cropWindowFractions(win, W, H)!;
    expect(win.x * (1 - fractions.fw) + fractions.fw / 2).toBeCloseTo((1300 + 150) / W, 2);
    expect(DEFAULT_CROP_WINDOW.x).toBe(0.5);
  });
});
