import { describe, expect, it } from "vitest";
import {
  buildCropPath,
  cropPathSegmentsFromWire,
  planToWire,
  PATH_MAX_VELOCITY,
  type TimedFaces,
} from "./cropPath";
import { cropWindowFractionsFor, ASPECT_RATIOS } from "./reframe";
import type { FaceBox } from "./yunet";

/**
 * Reframe v2 tests: the crop follows faces (an off-centre face MUST produce
 * an off-centre crop), the path is smoothed within its velocity clamp, paths
 * never cross a scene cut, two-face scenes go wide when they can and track
 * when they can't, and no-face scenes fall back to the centre window.
 */

const SRC_W = 1920;
const SRC_H = 1080;

const face = (cx: number, cy: number, w = 0.11, h = 0.22): FaceBox => ({
  x: (cx - w / 2) * SRC_W,
  y: (cy - h / 2) * SRC_H,
  w: w * SRC_W,
  h: h * SRC_H,
  score: 0.95,
  landmarks: [],
});

/** Samples every 333 ms from fromMs to toMs with the given face factory. */
const sampleRange = (fromMs: number, toMs: number, make: (t: number) => FaceBox[]): TimedFaces[] => {
  const out: TimedFaces[] = [];
  for (let t = fromMs; t <= toMs; t += 333) out.push({ atMs: t, faces: make(t) });
  return out;
};

const plan = (samples: TimedFaces[], over: Partial<Parameters<typeof buildCropPath>[0]> = {}) =>
  buildCropPath({
    samples,
    scenes: [],
    rangeStartMs: 0,
    rangeEndMs: 20_000,
    sourceWidth: SRC_W,
    sourceHeight: SRC_H,
    aspect: "9:16",
    ...over,
  });

/** The visible window's left edge (source fraction) for a scene: window.x mapped through the fractions. */
const windowLeft = (x: number, zoom: number): number => {
  const f = cropWindowFractionsFor({ x, y: 0.5, zoom }, SRC_W, SRC_H, ASPECT_RATIOS["9:16"])!;
  return x * (1 - f.fw);
};

describe("buildCropPath", () => {
  it("an off-centre face produces an off-centre crop that contains the face", () => {
    const p = plan(sampleRange(0, 20_000, () => [face(0.8, 0.45)]));
    expect(p).not.toBeNull();
    const scene = p!.scenes[0]!;
    expect(scene.strategy).toBe("track");
    expect(p!.anyFace).toBe(true);
    const left = windowLeft(scene.baseWindow.x, scene.baseWindow.zoom);
    const f = cropWindowFractionsFor(scene.baseWindow, SRC_W, SRC_H, ASPECT_RATIOS["9:16"])!;
    expect(left).toBeGreaterThan(0.4); // firmly right of centre
    expect(left).toBeLessThanOrEqual(0.8);
    expect(left + f.fw).toBeGreaterThanOrEqual(0.8); // the face centre is inside the window
    // a static subject needs no keyframes at all
    expect(scene.keyframes).toHaveLength(0);
  });

  it("a moving face produces a smoothed path whose implied velocity never exceeds the clamp", () => {
    // face walks from cx 0.25 to 0.75 over 20 s (0.025/s — under the clamp), sampled with jitter
    const samples = sampleRange(0, 20_000, (t) => [face(0.25 + (t / 20_000) * 0.5 + (Math.sin(t / 300) * 0.004), 0.45)]);
    const p = plan(samples);
    const scene = p!.scenes[0]!;
    expect(scene.keyframes.length).toBeGreaterThan(2);
    const xs = scene.keyframes.filter((k) => k.property === "offsetX");
    // the window follows: final offset is NEGATIVE (window moved right of its base)
    expect(xs[xs.length - 1]!.value).toBeLessThan(-0.15);
    for (let i = 1; i < xs.length; i++) {
      const dt = (xs[i]!.atMs - xs[i - 1]!.atMs) / 1000;
      if (dt <= 0) continue;
      expect(Math.abs(xs[i]!.value - xs[i - 1]!.value) / dt).toBeLessThanOrEqual(PATH_MAX_VELOCITY + 0.02);
    }
    // keyframes stay inside the segment's local span
    expect(Math.max(...scene.keyframes.map((k) => k.atMs))).toBeLessThanOrEqual(20_000);
  });

  it("a jerky detection series does not make the window jump (dead zone + smoothing)", () => {
    // face essentially static at 0.5 but detections jitter ±0.01 — inside the dead zone
    const samples = sampleRange(0, 10_000, (t) => [face(0.5 + (Math.sin(t / 211) * 0.01), 0.45)]);
    const p = plan(samples, { rangeEndMs: 10_000 });
    const scene = p!.scenes[0]!;
    const xs = scene.keyframes.filter((k) => k.property === "offsetX");
    expect(xs.every((k) => Math.abs(k.value) < 0.02)).toBe(true);
  });

  it("no faces at all → centre window, no keyframes (Level-1 fallback)", () => {
    const p = plan(sampleRange(0, 10_000, () => []), { rangeEndMs: 10_000 });
    const scene = p!.scenes[0]!;
    expect(scene.strategy).toBe("centre");
    expect(scene.baseWindow).toEqual({ x: 0.5, y: 0.5, zoom: 1 });
    expect(p!.anyFace).toBe(false);
  });

  it("faces in too few samples (below the presence gate) → centre window", () => {
    const samples = sampleRange(0, 10_000, (t) => (t < 1000 ? [face(0.8, 0.45)] : []));
    const p = plan(samples, { rangeEndMs: 10_000 });
    expect(p!.scenes[0]!.strategy).toBe("centre");
  });

  it("two persistent faces that fit → a wide window containing both", () => {
    const p = plan(sampleRange(0, 10_000, () => [face(0.42, 0.45), face(0.58, 0.45)]), { rangeEndMs: 10_000 });
    const scene = p!.scenes[0]!;
    expect(scene.strategy).toBe("wide");
    expect(scene.trackCount).toBe(2);
    const f = cropWindowFractionsFor(scene.baseWindow, SRC_W, SRC_H, ASPECT_RATIOS["9:16"])!;
    const left = scene.baseWindow.x * (1 - f.fw);
    expect(left).toBeLessThanOrEqual(0.42);
    expect(left + f.fw).toBeGreaterThanOrEqual(0.58);
  });

  it("two persistent faces too far apart to share a window → tracking, not wide", () => {
    const p = plan(sampleRange(0, 10_000, () => [face(0.15, 0.45), face(0.85, 0.45)]), { rangeEndMs: 10_000 });
    const scene = p!.scenes[0]!;
    expect(scene.strategy).toBe("track");
    expect(scene.trackCount).toBe(2);
  });

  it("paths never cross a scene cut: each scene's keyframes are local and restart clean", () => {
    const samples = [
      ...sampleRange(0, 9_999, (t) => [face(0.3 + (t / 10_000) * 0.1, 0.45)]),
      ...sampleRange(10_000, 20_000, (t) => [face(0.7 - ((t - 10_000) / 10_000) * 0.1, 0.45)]),
    ];
    const p = plan(samples, {
      scenes: [
        { startMs: 0, endMs: 10_000 },
        { startMs: 10_000, endMs: 20_000 },
      ],
    });
    expect(p!.scenes).toHaveLength(2);
    for (const scene of p!.scenes) {
      for (const k of scene.keyframes) expect(k.atMs).toBeLessThanOrEqual(scene.endMs - scene.startMs);
    }
    // scene 2's window starts on ITS face (right side), not on scene 1's last position
    expect(windowLeft(p!.scenes[1]!.baseWindow.x, p!.scenes[1]!.baseWindow.zoom)).toBeGreaterThan(0.4);
  });

  it("a small face zooms in (bounded), a large face stays at zoom 1", () => {
    const small = plan(sampleRange(0, 10_000, () => [face(0.5, 0.45, 0.07, 0.14)]), { rangeEndMs: 10_000 });
    expect(small!.scenes[0]!.baseWindow.zoom).toBeGreaterThan(1.2);
    expect(small!.scenes[0]!.baseWindow.zoom).toBeLessThanOrEqual(1.8);
    const large = plan(sampleRange(0, 10_000, () => [face(0.5, 0.45, 0.2, 0.4)]), { rangeEndMs: 10_000 });
    expect(large!.scenes[0]!.baseWindow.zoom).toBe(1);
  });

  it("a portrait source has no crop path (null) — the caller keeps today's shape", () => {
    const p = buildCropPath({
      samples: [],
      scenes: [],
      rangeStartMs: 0,
      rangeEndMs: 10_000,
      sourceWidth: 1080,
      sourceHeight: 1920,
      aspect: "9:16",
    });
    expect(p).toBeNull();
  });

  it("works for the 1:1 target aspect too", () => {
    const p = plan(sampleRange(0, 10_000, () => [face(0.75, 0.5)]), { rangeEndMs: 10_000, aspect: "1:1" });
    const scene = p!.scenes[0]!;
    const f = cropWindowFractionsFor(scene.baseWindow, SRC_W, SRC_H, ASPECT_RATIOS["1:1"])!;
    const left = scene.baseWindow.x * (1 - f.fw);
    expect(left).toBeGreaterThan(0.2);
    expect(left + f.fw).toBeGreaterThanOrEqual(0.75);
  });
});

describe("cropPathSegmentsFromWire", () => {
  it("rebuilds tiling segments with the window transform + keyframes from real dimensions", () => {
    const p = plan(sampleRange(0, 20_000, (t) => [face(0.3 + (t / 20_000) * 0.4, 0.45)]));
    const wire = planToWire(p!);
    const segments = cropPathSegmentsFromWire(wire, SRC_W, SRC_H, "9:16");
    expect(segments).not.toBeNull();
    expect(segments![0]!.sourceInMs).toBe(0);
    expect(segments![segments!.length - 1]!.sourceOutMs).toBe(20_000);
    const seg = segments![0]!;
    expect(seg.transform.cropLeft + seg.transform.cropRight).toBeLessThan(1);
    expect(seg.keyframes.length).toBeGreaterThan(0);
    expect(seg.keyframes.every((k) => k.atMs >= 0 && Math.abs(k.value) <= 1)).toBe(true);
  });

  it("returns null for a source with no crop for the aspect", () => {
    expect(cropPathSegmentsFromWire([{ startMs: 0, endMs: 1000, window: { x: 0.5, y: 0.5, zoom: 1 }, keyframes: [] }], 1080, 1920, "9:16")).toBeNull();
  });
});
