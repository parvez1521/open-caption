/**
 * Image Elements Editor — pure pixel/layer logic.
 *
 * Everything here is plain arrays and numbers (no canvas, no DOM) so the
 * behaviour is unit-testable in Node and identical in the browser and in the
 * verification scripts. The canvas renderer (render.ts) calls these, then
 * draws cutouts / text / shapes with the 2D context.
 */
import type { Mask, RecolourParams, TextBox, TextLine } from "./types";

export function maskPixelCount(mask: Mask): number {
  let n = 0;
  for (let i = 0; i < mask.data.length; i++) if (mask.data[i]) n++;
  return n;
}

export function maskBbox(mask: Mask): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = mask.width, y0 = mask.height, x1 = -1, y1 = -1;
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (!mask.data[y * mask.width + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** Grow a mask by `radius` pixels (4-neighbourhood dilation, repeated). */
export function dilateMask(mask: Mask, radius: number): Mask {
  if (radius <= 0) return mask;
  let cur = mask.data;
  const { width: w, height: h } = mask;
  for (let r = 0; r < radius; r++) {
    const next = new Uint8Array(cur);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (cur[y * w + x]) continue;
        if (
          (x > 0 && cur[y * w + x - 1]) ||
          (x + 1 < w && cur[y * w + x + 1]) ||
          (y > 0 && cur[(y - 1) * w + x]) ||
          (y + 1 < h && cur[(y + 1) * w + x])
        ) {
          next[y * w + x] = 1;
        }
      }
    }
    cur = next;
  }
  return { width: w, height: h, data: cur };
}

/**
 * Soft edge weights for a mask: 1 deep inside, fading to 0 over `radius`
 * pixels outside the edge. Used so an erase fill never leaves a hard rim.
 */
export function featherMask(mask: Mask, radius: number): Float32Array {
  const { width: w, height: h } = mask;
  const out = new Float32Array(w * h);
  if (radius <= 0) {
    for (let i = 0; i < out.length; i++) out[i] = mask.data[i] ? 1 : 0;
    return out;
  }
  // distance (in steps) from the mask edge, capped at radius
  const dist = new Int16Array(w * h).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < mask.data.length; i++) {
    if (!mask.data[i]) continue;
    // an edge pixel touches at least one outside pixel
    const x = i % w, y = Math.floor(i / w);
    const edge =
      x === 0 || x === w - 1 || y === 0 || y === h - 1 ||
      !mask.data[i - 1] || !mask.data[i + 1] || !mask.data[i - w] || !mask.data[i + w];
    if (edge) { dist[i] = 0; queue.push(i); }
  }
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++]!;
    const d = dist[i]!;
    if (d >= radius) continue;
    const x = i % w, y = Math.floor(i / w);
    const neighbours = [
      x > 0 ? i - 1 : -1,
      x + 1 < w ? i + 1 : -1,
      y > 0 ? i - w : -1,
      y + 1 < h ? i + w : -1,
    ];
    for (const n of neighbours) {
      if (n >= 0 && dist[n] === -1 && mask.data[n]) { dist[n] = d + 1; queue.push(n); }
    }
  }
  for (let i = 0; i < out.length; i++) {
    if (!mask.data[i]) { out[i] = 0; continue; }
    out[i] = dist[i] < 0 ? 1 : Math.min(1, (dist[i]! + 1) / (radius + 1));
  }
  return out;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s = Math.min(1, Math.max(0, s));
  l = Math.min(1, Math.max(0, l));
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const hk = h / 360;
  return [Math.round(f(hk + 1 / 3) * 255), Math.round(f(hk) * 255), Math.round(f(hk - 1 / 3) * 255)];
}

/**
 * Recolour the pixels of `data` (RGBA, mutated in place) where `mask` is 1:
 * hue shift (degrees), saturation and brightness multipliers, blended by
 * `opacity` (0 = original, 1 = fully recoloured). Pixels outside the mask
 * are never touched.
 */
export function applyRecolour(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mask: Mask,
  params: RecolourParams,
): void {
  const { hue, saturation, brightness, opacity } = params;
  if (opacity <= 0) return;
  if (mask.width !== width || mask.height !== height) throw new Error("recolour mask size must match the image");
  for (let i = 0; i < width * height; i++) {
    if (!mask.data[i]) continue;
    const o = i * 4;
    const [h, s, l] = rgbToHsl(data[o]!, data[o + 1]!, data[o + 2]!);
    const [r, g, b] = hslToRgb(h + hue, s * saturation, l * brightness);
    data[o] = data[o]! + (r - data[o]!) * opacity;
    data[o + 1] = data[o + 1]! + (g - data[o + 1]!) * opacity;
    data[o + 2] = data[o + 2]! + (b - data[o + 2]!) * opacity;
  }
}

/**
 * Soft background fill for an erased region: a coarse grid (one cell per
 * ~12 px) averaged from UNMASKED pixels only, diffused into cells that are
 * fully masked, then sampled per pixel. A large masked area therefore fills
 * with the colours around it, not with a blur of itself. The result is only
 * meaningful inside the mask; outside pixels are left as the caller's copy.
 */
export function blurredFill(
  base: Uint8ClampedArray,
  width: number,
  height: number,
  mask: Mask,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(base);
  const CELL = 12;
  const gw = Math.ceil(width / CELL), gh = Math.ceil(height / CELL);
  const cellR = new Float32Array(gw * gh), cellG = new Float32Array(gw * gh), cellB = new Float32Array(gw * gh);
  const cellN = new Float32Array(gw * gh);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask.data[y * width + x]) continue;
      const c = Math.floor(y / CELL) * gw + Math.floor(x / CELL);
      const o = (y * width + x) * 4;
      cellR[c]! += base[o]!; cellG[c]! += base[o + 1]!; cellB[c]! += base[o + 2]!;
      cellN[c]! += 1;
    }
  }
  // diffuse empty cells from their neighbours (a few passes fill any hole)
  const filled = new Uint8Array(gw * gh);
  for (let i = 0; i < cellN.length; i++) if (cellN[i]! > 0) filled[i] = 1;
  for (let pass = 0; pass < gw + gh + 4; pass++) {
    let changed = false;
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const c = gy * gw + gx;
        if (filled[c]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (const [nx, ny] of [[gx - 1, gy], [gx + 1, gy], [gx, gy - 1], [gx, gy + 1]] as const) {
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const nc = ny * gw + nx;
          if (!filled[nc]) continue;
          r += cellR[nc]! / cellN[nc]!; g += cellG[nc]! / cellN[nc]!; b += cellB[nc]! / cellN[nc]!;
          n++;
        }
        if (n > 0) {
          cellR[c] = r / n; cellG[c] = g / n; cellB[c] = b / n; cellN[c] = 1;
          filled[c] = 1; changed = true;
        }
      }
    }
    if (!changed) break;
  }
  // cells that stayed empty (image fully masked) fall back to mid-grey
  for (let i = 0; i < filled.length; i++) {
    if (!filled[i]) { cellR[i] = 128; cellG[i] = 128; cellB[i] = 128; cellN[i] = 1; }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask.data[y * width + x]) continue;
      const fx = (x + 0.5) / CELL - 0.5, fy = (y + 0.5) / CELL - 0.5;
      const x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(gw - 1, x0 + 1);
      const y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(gh - 1, y0 + 1);
      const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
      const sample = (arr: Float32Array) => {
        const n = (c: number) => arr[c]! / cellN[c]!;
        return (
          n(y0 * gw + x0) * (1 - tx) * (1 - ty) +
          n(y0 * gw + x1) * tx * (1 - ty) +
          n(y1 * gw + x0) * (1 - tx) * ty +
          n(y1 * gw + x1) * tx * ty
        );
      };
      const o = (y * width + x) * 4;
      out[o] = sample(cellR); out[o + 1] = sample(cellG); out[o + 2] = sample(cellB); out[o + 3] = 255;
    }
  }
  return out;
}

/** Cut the masked region out of `base` as RGBA pixels (alpha 0 outside). */
export function extractCutout(
  base: Uint8ClampedArray,
  width: number,
  height: number,
  mask: Mask,
): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    if (!mask.data[i]) continue;
    const o = i * 4;
    data[o] = base[o]!; data[o + 1] = base[o + 1]!; data[o + 2] = base[o + 2]!; data[o + 3] = 255;
  }
  return { width, height, data };
}

/** Nearest-neighbour resample of a mask (used to match preview resolution). */
export function resampleMask(mask: Mask, newWidth: number, newHeight: number): Mask {
  if (newWidth === mask.width && newHeight === mask.height) return mask;
  const data = new Uint8Array(newWidth * newHeight);
  for (let y = 0; y < newHeight; y++) {
    const sy = Math.min(mask.height - 1, Math.floor((y * mask.height) / newHeight));
    for (let x = 0; x < newWidth; x++) {
      const sx = Math.min(mask.width - 1, Math.floor((x * mask.width) / newWidth));
      data[y * newWidth + x] = mask.data[sy * mask.width + sx]!;
    }
  }
  return { width: newWidth, height: newHeight, data };
}

/** Box-average downscale of RGBA data to at most `maxEdge` on the long side. */
export function downscaleRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  maxEdge: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  if (scale >= 1) return { data: new Uint8ClampedArray(data), width, height };
  const nw = Math.max(1, Math.round(width * scale)), nh = Math.max(1, Math.round(height * scale));
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor((y * height) / nh), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / nh));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor((x * width) / nw), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / nw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const o = (sy * width + sx) * 4;
          r += data[o]!; g += data[o + 1]!; b += data[o + 2]!; a += data[o + 3]!; n++;
        }
      }
      const o = (y * nw + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return { data: out, width: nw, height: nh };
}

/**
 * Merge OCR words into lines: words whose vertical centres are within
 * `yTolerance` (default: half the median word height) of a line's centre
 * join that line. Lines are sorted top-to-bottom, words left-to-right.
 */
export function groupWordsIntoLines(words: TextBox[], yTolerance = 0): TextLine[] {
  if (words.length === 0) return [];
  const sorted = [...words].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2 || a.x0 - b.x0);
  const heights = sorted.map((w) => w.y1 - w.y0).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)]!;
  const tol = yTolerance > 0 ? yTolerance : Math.max(4, medianH / 2);
  const lines: TextBox[][] = [];
  for (const w of sorted) {
    const cy = (w.y0 + w.y1) / 2;
    let placed = false;
    for (const line of lines) {
      const lcy = line.reduce((s, x) => s + (x.y0 + x.y1) / 2, 0) / line.length;
      if (Math.abs(cy - lcy) <= tol) { line.push(w); placed = true; break; }
    }
    if (!placed) lines.push([w]);
  }
  return lines.map((line) => {
    const ws = [...line].sort((a, b) => a.x0 - b.x0);
    return {
      text: ws.map((w) => w.text).join(" "),
      words: ws,
      x0: Math.min(...ws.map((w) => w.x0)),
      y0: Math.min(...ws.map((w) => w.y0)),
      x1: Math.max(...ws.map((w) => w.x1)),
      y1: Math.max(...ws.map((w) => w.y1)),
    };
  });
}
