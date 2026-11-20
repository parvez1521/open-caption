import { describe, expect, it } from "vitest";
import {
  ARCFACE_DST_112,
  ARCFACE_DST_128,
  DAILY_SWAP_LIMIT,
  estimateSimilarity,
  faceMask128,
  invertSimilarity,
  l2Normalize,
  pickLargestFace,
  projectEmbedding,
  recordSwap,
  scaleToMaxEdge,
  swapsDayKey,
  swapsLeftToday,
  swapsUsedToday,
  warpRgba,
  type CounterStore,
} from "../swapMath";

function memoryStore(): CounterStore & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe("estimateSimilarity", () => {
  it("recovers a known rotation + scale + translation", () => {
    // dst = 2·R(30°)·src + (10, −5)
    const angle = Math.PI / 6;
    const a = 2 * Math.cos(angle);
    const b = 2 * Math.sin(angle);
    const src = [
      [0, 0],
      [10, 0],
      [0, 10],
      [10, 10],
      [5, 3],
    ] as const;
    const dst = src.map(([x, y]) => [a * x - b * y + 10, b * x + a * y - 5] as const);
    const t = estimateSimilarity(src, dst);
    expect(t.a).toBeCloseTo(a, 6);
    expect(t.b).toBeCloseTo(b, 6);
    expect(t.tx).toBeCloseTo(10, 6);
    expect(t.ty).toBeCloseTo(-5, 6);
  });

  it("inverts itself", () => {
    const t = estimateSimilarity(
      [
        [0, 0],
        [10, 0],
        [0, 10],
      ],
      [
        [5, 5],
        [15, 5],
        [5, 15],
      ],
    );
    const inv = invertSimilarity(t);
    for (const [x, y] of [
      [0, 0],
      [3, 7],
      [9, 1],
    ]) {
      const [x1, y1] = [t.a * x - t.b * y + t.tx, t.b * x + t.a * y + t.ty];
      const [x2, y2] = [inv.a * x1 - inv.b * y1 + inv.tx, inv.b * x1 + inv.a * y1 + inv.ty];
      expect(x2).toBeCloseTo(x, 6);
      expect(y2).toBeCloseTo(y, 6);
    }
  });
});

describe("warpRgba", () => {
  it("is the identity under the identity transform", () => {
    const src = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]);
    const out = warpRgba(src, 2, 2, { a: 1, b: 0, tx: 0, ty: 0 }, 2, 2);
    expect(Array.from(out)).toEqual(Array.from(src));
  });
});

describe("faceMask128", () => {
  it("is opaque in the middle and transparent at the corners", () => {
    const mask = faceMask128();
    expect(mask[64 * 128 + 64]!).toBeCloseTo(1, 6);
    expect(mask[0]!).toBe(0);
    expect(mask[127 * 128 + 127]!).toBe(0);
    for (const v of mask) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of mask) expect(v).toBeLessThanOrEqual(1);
  });
});

describe("l2Normalize", () => {
  it("produces a unit vector", () => {
    const v = l2Normalize(new Float32Array([3, 4]));
    expect(v[0]!).toBeCloseTo(0.6, 6);
    expect(v[1]!).toBeCloseTo(0.8, 6);
  });
});

describe("ARCFACE_DST_128", () => {
  it("is the official 128 template: arcface_dst shifted right by 8 px, not scaled", () => {
    for (let i = 0; i < 5; i++) {
      expect(ARCFACE_DST_128[i]![0]).toBeCloseTo(ARCFACE_DST_112[i]![0]! + 8, 6);
      expect(ARCFACE_DST_128[i]![1]).toBeCloseTo(ARCFACE_DST_112[i]![1]!, 6);
    }
  });
});

describe("projectEmbedding", () => {
  it("is the identity for an identity emap and returns a unit vector", () => {
    const emap = new Float32Array(512 * 512);
    for (let i = 0; i < 512; i++) emap[i * 512 + i] = 1;
    const emb = new Float32Array(512);
    emb[0] = 0.6;
    emb[1] = 0.8;
    const out = projectEmbedding(emb, emap);
    expect(out[0]!).toBeCloseTo(0.6, 5);
    expect(out[1]!).toBeCloseTo(0.8, 5);
    let norm = 0;
    for (const v of out) norm += v * v;
    expect(Math.sqrt(norm)).toBeCloseTo(1, 5);
  });

  it("multiplies the embedding by the emap as a row vector, then re-normalises", () => {
    // emap swaps the first two coordinates and doubles the third.
    const emap = new Float32Array(512 * 512);
    emap[0 * 512 + 1] = 1;
    emap[1 * 512 + 0] = 1;
    emap[2 * 512 + 2] = 2;
    const emb = new Float32Array(512);
    emb[0] = 1;
    emb[1] = 0;
    emb[2] = 0;
    // emb @ emap = [0, 1, 0, ...], unit already.
    const out = projectEmbedding(emb, emap);
    expect(out[0]!).toBeCloseTo(0, 5);
    expect(out[1]!).toBeCloseTo(1, 5);
    expect(out[2]!).toBeCloseTo(0, 5);
  });
});

describe("scaleToMaxEdge", () => {
  it("caps the long edge at 1280", () => {
    expect(scaleToMaxEdge(2000, 1000)).toEqual({ w: 1280, h: 640, scaled: true });
    expect(scaleToMaxEdge(800, 600)).toEqual({ w: 800, h: 600, scaled: false });
    expect(scaleToMaxEdge(1280, 1280)).toEqual({ w: 1280, h: 1280, scaled: false });
  });
});

describe("pickLargestFace", () => {
  it("picks the biggest box and null for none", () => {
    expect(pickLargestFace([])).toBeNull();
    const small = { w: 10, h: 10 };
    const big = { w: 40, h: 30 };
    expect(pickLargestFace([small, big])).toBe(big);
  });
});

describe("daily swap limit", () => {
  it("counts 5 swaps per day and resets on a new day", () => {
    const store = memoryStore();
    const day = new Date(2026, 10, 18, 12, 0, 0);
    expect(swapsUsedToday(store, day)).toBe(0);
    expect(swapsLeftToday(store, day)).toBe(DAILY_SWAP_LIMIT);
    expect(swapsDayKey(day)).toBe("2026-11-18");
    for (let i = 0; i < 5; i++) recordSwap(store, day);
    expect(swapsUsedToday(store, day)).toBe(5);
    expect(swapsLeftToday(store, day)).toBe(0);
    expect(swapsUsedToday(store, new Date(2026, 10, 19, 12, 0, 0))).toBe(0);
  });
});
