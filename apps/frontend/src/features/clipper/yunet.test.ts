import { describe, expect, it } from "vitest";
import {
  boxToSource,
  decodeYuNetOutputs,
  letterboxParams,
  nmsFaces,
  tensorFromLetterboxedRgba,
  YUNET_INPUT_SIZE,
  type FaceBox,
  type YuNetOutputs,
} from "./yunet";

/**
 * YuNet decode (G5 Level 1). The semantics were verified against the REAL
 * model on 2026-11-11 (portrait photo → one detection, score 0.95, box on
 * the face, landmarks on eyes/nose/mouth); these tests pin them with
 * synthetic tensors built from the same formulas OpenCV's FaceDetectorYN
 * uses: score = sqrt(cls·obj) on raw probabilities, centre =
 * (cell + offset)·stride, size = exp(·)·stride.
 */
function outputsWith(stride: 8 | 16 | 32, cell: number, vals: { cls: number; obj: number; bbox: number[]; kps?: number[] }): YuNetOutputs {
  const grid = YUNET_INPUT_SIZE / stride;
  const cells = grid * grid;
  const mk = (c: number, fill?: (arr: Float32Array) => void) => {
    const arr = new Float32Array(cells * c);
    fill?.(arr);
    return { data: arr };
  };
  const out: YuNetOutputs = {};
  for (const s of [8, 16, 32] as const) {
    const g = YUNET_INPUT_SIZE / s;
    out[`cls_${s}`] = { data: new Float32Array(g * g) };
    out[`obj_${s}`] = { data: new Float32Array(g * g) };
    out[`bbox_${s}`] = { data: new Float32Array(g * g * 4) };
    out[`kps_${s}`] = { data: new Float32Array(g * g * 10) };
  }
  out[`cls_${stride}`] = mk(1, (a) => { a[cell] = vals.cls; });
  out[`obj_${stride}`] = mk(1, (a) => { a[cell] = vals.obj; });
  out[`bbox_${stride}`] = mk(4, (a) => { vals.bbox.forEach((v, i) => { a[cell * 4 + i] = v; }); });
  if (vals.kps) out[`kps_${stride}`] = mk(10, (a) => { vals.kps!.forEach((v, i) => { a[cell * 10 + i] = v; }); });
  return out;
}

describe("decodeYuNetOutputs", () => {
  it("decodes a planted detection with OpenCV's formulas", () => {
    // stride 32, grid 20×20; cell (row 8, col 8) = index 168
    const faces = decodeYuNetOutputs(
      outputsWith(32, 168, { cls: 0.9, obj: 0.99, bbox: [1.5, 0.1, Math.log(6.4), Math.log(8.3)], kps: [0.1, 0.2, 2.8, 0.2, 1.4, 1.8, 0.3, 3.1, 2.5, 3.2] }),
    );
    expect(faces).toHaveLength(1);
    const f = faces[0]!;
    expect(f.score).toBeCloseTo(Math.sqrt(0.9 * 0.99), 5);
    // centre = ((8+1.5)·32, (8+0.1)·32) = (304, 259.2); size = (6.4·32, 8.3·32) = (204.8, 265.6)
    expect(f.x).toBeCloseTo(304 - 204.8 / 2, 4);
    expect(f.y).toBeCloseTo(259.2 - 265.6 / 2, 4);
    expect(f.w).toBeCloseTo(204.8, 4);
    expect(f.h).toBeCloseTo(265.6, 4);
    expect(f.landmarks[0]).toEqual([expect.closeTo((8 + 0.1) * 32, 4), expect.closeTo((8 + 0.2) * 32, 4)]);
    expect(f.landmarks[2]).toEqual([expect.closeTo((8 + 1.4) * 32, 4), expect.closeTo((8 + 1.8) * 32, 4)]);
  });

  it("drops detections below the score threshold and treats missing tensors as no faces", () => {
    expect(decodeYuNetOutputs(outputsWith(32, 0, { cls: 0.5, obj: 0.5, bbox: [0, 0, 1, 1] }))).toHaveLength(0);
    expect(decodeYuNetOutputs({})).toEqual([]);
    expect(decodeYuNetOutputs({ cls_8: { data: new Float32Array(3) } })).toEqual([]);
  });

  it("NMS keeps the stronger of two overlapping boxes and different faces apart", () => {
    const a: FaceBox = { x: 100, y: 100, w: 200, h: 200, score: 0.9, landmarks: [] };
    const b: FaceBox = { x: 110, y: 105, w: 200, h: 200, score: 0.8, landmarks: [] };
    const c: FaceBox = { x: 500, y: 100, w: 150, h: 150, score: 0.7, landmarks: [] };
    expect(nmsFaces([b, a, c]).map((f) => f.score)).toEqual([0.9, 0.7]);
  });
});

describe("letterbox geometry", () => {
  it("letterboxes a landscape frame with vertical padding only", () => {
    const p = letterboxParams(1920, 1080);
    expect(p.drawnW).toBe(640);
    expect(p.drawnH).toBe(360);
    expect(p.padX).toBe(0);
    expect(p.padY).toBe(140);
    const box: FaceBox = { x: 288, y: 288, w: 64, h: 64, score: 1, landmarks: [[320, 320]] };
    const src = boxToSource(box, p);
    // the box is centred on the letterbox centre (320,320) = the source frame's centre
    expect(src.x + src.w / 2).toBeCloseTo(960, 6);
    expect(src.y + src.h / 2).toBeCloseTo(540, 6);
    expect(src.landmarks[0]).toEqual([960, 540]);
  });

  it("builds a planar BGR tensor from RGBA pixels", () => {
    const rgba = new Uint8ClampedArray(YUNET_INPUT_SIZE * YUNET_INPUT_SIZE * 4);
    // first pixel: R=10, G=20, B=30
    rgba[0] = 10; rgba[1] = 20; rgba[2] = 30; rgba[3] = 255;
    const t = tensorFromLetterboxedRgba(rgba);
    const px = YUNET_INPUT_SIZE * YUNET_INPUT_SIZE;
    expect(t[0]).toBe(30);
    expect(t[px]).toBe(20);
    expect(t[2 * px]).toBe(10);
  });
});
