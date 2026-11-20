/**
 * Face swap — pure math + limits (no DOM, no runtime imports).
 *
 * The pipeline is the official InsightFace recipe
 * (deepinsight/insightface, model_zoo/inswapper.py + arcface_onnx.py),
 * re-implemented small:
 *  - detect with the vendored YuNet model (see ../clipper/yunet.ts),
 *  - align each face to a fixed 5-point template with a similarity
 *    transform (rotation + uniform scale + translation, no reflection),
 *  - embed the source face with ArcFace (w600k_r50, buffalo_l),
 *  - project the embedding with the inswapper emap (buff2fs) and
 *    re-normalise, then swap with inswapper_128 and paste back with a
 *    feathered mask.
 *
 * Everything here is pure arithmetic over typed arrays so the same code
 * runs in the Web Worker and in the Node verification test.
 */

export type Point = readonly [number, number];

/** InsightFace ArcFace template, 112×112: right eye, left eye, nose, right mouth, left mouth. */
export const ARCFACE_DST_112: Point[] = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

/**
 * The 128×128 inswapper template: InsightFace's estimate_norm() keeps the
 * 112 template at the same scale for a 128 crop and shifts it right by
 * 8 px (arcface_dst + (8, 0)) — it does NOT scale the template by
 * 128/112. Using the scaled template gives a 14% zoomed-in crop.
 */
export const ARCFACE_DST_128: Point[] = ARCFACE_DST_112.map(([x, y]) => [
  x + 8,
  y,
] as const);

export interface Similarity {
  /** x' = a·x − b·y + tx */
  a: number;
  /** y' = b·x + a·y + ty */
  b: number;
  tx: number;
  ty: number;
}

/**
 * Least-squares similarity transform (src → dst) via complex numbers:
 * the rotation+scale is the ratio of the centred cross-moment to the
 * centred variance. Orientation is preserved by construction, so a face
 * can never come back mirrored.
 */
export function estimateSimilarity(src: readonly Point[], dst: readonly Point[]): Similarity {
  const n = src.length;
  let sx = 0;
  let sy = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    sx += src[i]![0];
    sy += src[i]![1];
    dx += dst[i]![0];
    dy += dst[i]![1];
  }
  const smx = sx / n;
  const smy = sy / n;
  const dmx = dx / n;
  const dmy = dy / n;
  let numRe = 0;
  let numIm = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const ux = src[i]![0] - smx;
    const uy = src[i]![1] - smy;
    const vx = dst[i]![0] - dmx;
    const vy = dst[i]![1] - dmy;
    // conj(u) · v, with u = ux + i·uy and v = vx + i·vy
    numRe += ux * vx + uy * vy;
    numIm += ux * vy - uy * vx;
    den += ux * ux + uy * uy;
  }
  const a = den > 0 ? numRe / den : 1;
  const b = den > 0 ? numIm / den : 0;
  return { a, b, tx: dmx - (a * smx - b * smy), ty: dmy - (b * smx + a * smy) };
}

export function applySimilarity(t: Similarity, x: number, y: number): Point {
  return [t.a * x - t.b * y + t.tx, t.b * x + t.a * y + t.ty];
}

export function invertSimilarity(t: Similarity): Similarity {
  const det = t.a * t.a + t.b * t.b;
  if (det === 0) return { a: 1, b: 0, tx: 0, ty: 0 };
  const a = t.a / det;
  const b = -t.b / det;
  return { a, b, tx: -(a * t.tx - b * t.ty), ty: -(b * t.tx + a * t.ty) };
}

function bilinear(src: Uint8ClampedArray | Float32Array, srcW: number, srcH: number, channels: number, x: number, y: number, c: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (px: number, py: number): number => {
    const cx = Math.min(srcW - 1, Math.max(0, px));
    const cy = Math.min(srcH - 1, Math.max(0, py));
    return src[(cy * srcW + cx) * channels + c]!;
  };
  const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
  const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * Warp an RGBA image through a transform that maps OUTPUT pixels back to
 * SOURCE pixels (i.e. pass the inverse of the alignment transform).
 * Pixels sampling outside the source are transparent.
 */
export function warpRgba(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstToSrc: Similarity,
  outW: number,
  outH: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      // Integer coordinates are pixel centres in both grids, so the
      // identity transform reproduces the source exactly.
      const [sx, sy] = applySimilarity(dstToSrc, x, y);
      const o = (y * outW + x) * 4;
      if (sx < 0 || sy < 0 || sx > srcW - 1 || sy > srcH - 1) {
        out[o + 3] = 0;
        continue;
      }
      for (let c = 0; c < 3; c++) out[o + c] = bilinear(src, srcW, srcH, 4, sx, sy, c);
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Same warp for a single-channel float mask. */
export function warpMask(mask: Float32Array, srcW: number, srcH: number, dstToSrc: Similarity, outW: number, outH: number): Float32Array {
  const out = new Float32Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const [sx, sy] = applySimilarity(dstToSrc, x, y);
      if (sx < 0 || sy < 0 || sx > srcW - 1 || sy > srcH - 1) continue;
      out[y * outW + x] = bilinear(mask, srcW, srcH, 1, sx, sy, 0);
    }
  }
  return out;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Feathered face mask in the 128×128 aligned crop: an ellipse over the
 * face (eyes to chin) that fades to zero at the edge, so the pasted face
 * blends into the thumbnail instead of showing a hard square.
 */
export function faceMask128(featherPx = 10): Float32Array {
  const size = 128;
  const mask = new Float32Array(size * size);
  const cx = 64;
  const cy = 68;
  const rx = 54;
  const ry = 62;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
      mask[y * size + x] = 1 - smoothstep(1 - featherPx / 54, 1, d);
    }
  }
  return mask;
}

/** L2-normalise a vector in place and return it. */
export function l2Normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i]! * v[i]!;
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < v.length; i++) v[i] = v[i]! / norm;
  return v;
}

/**
 * The inswapper latent: the official recipe (model_zoo/inswapper.py) is
 *   latent = normed_embedding @ emap; latent /= ||latent||
 * where emap is the inswapper file's last initializer ("buff2fs", a
 * 512×512 matrix stored row-major). The raw normed embedding on its own
 * barely moves the output — without this projection the swap does not
 * transfer identity. The emap ships as a 1 MB asset (public/models/
 * buff2fs.bin); it is a projection matrix, not a model download.
 */
export function projectEmbedding(embedding: Float32Array, emap: Float32Array): Float32Array {
  const latent = new Float32Array(512);
  for (let j = 0; j < 512; j++) {
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += embedding[i]! * emap[i * 512 + j]!;
    latent[j] = sum;
  }
  return l2Normalize(latent);
}

/** The largest face by area — the default pick when a thumbnail has several. */
export function pickLargestFace<T extends { w: number; h: number }>(faces: T[]): T | null {
  if (faces.length === 0) return null;
  let best = faces[0]!;
  for (const f of faces) {
    if (f.w * f.h > best.w * best.h) best = f;
  }
  return best;
}

/** Long-edge cap for the uploaded thumbnail (task spec). */
export const MAX_EDGE_PX = 1280;

export function scaleToMaxEdge(w: number, h: number, maxEdge = MAX_EDGE_PX): { w: number; h: number; scaled: boolean } {
  const edge = Math.max(w, h);
  if (edge <= maxEdge) return { w, h, scaled: false };
  const s = maxEdge / edge;
  return { w: Math.round(w * s), h: Math.round(h * s), scaled: true };
}

/** Daily swap limit — 5 per browser per day. This is a soft, on-device
 *  limit (localStorage): it keeps honest users inside the free tier, it
 *  is not server enforcement, and the code must never claim otherwise. */
export const DAILY_SWAP_LIMIT = 5;

export function swapsDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface CounterStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function swapsUsedToday(store: CounterStore, d = new Date()): number {
  const raw = store.getItem(`faceswap:swaps:${swapsDayKey(d)}`);
  const n = raw === null ? 0 : parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function swapsLeftToday(store: CounterStore, d = new Date()): number {
  return Math.max(0, DAILY_SWAP_LIMIT - swapsUsedToday(store, d));
}

export function recordSwap(store: CounterStore, d = new Date()): number {
  const used = swapsUsedToday(store, d) + 1;
  store.setItem(`faceswap:swaps:${swapsDayKey(d)}`, String(used));
  return Math.max(0, DAILY_SWAP_LIMIT - used);
}
