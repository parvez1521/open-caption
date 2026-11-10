/**
 * A14 Colour Scopes — the PURE aggregation math (Phase 8).
 *
 * Pixels in → histogram bins / waveform grid out. No DOM, no React, no project
 * state: this module only reads the RGBA byte array it is handed, which is what
 * makes the scopes unit-testable without a browser and DISPLAY-ONLY by
 * construction — there is nothing here that could write anywhere.
 *
 * Data layout: `pixels` is row-major RGBA (4 bytes per pixel, the exact shape
 * `CanvasRenderingContext2D.getImageData().data` returns), `width` × `height`
 * pixels. Fully transparent pixels (alpha 0) carry no colour and are skipped;
 * every other pixel counts exactly once per histogram channel and once in the
 * waveform.
 *
 * Luma is Rec. 709 (`0.2126 R + 0.7152 G + 0.0722 B`), rounded to the nearest
 * 0–255 integer — the same weighting a waveform monitor's luma trace uses.
 */

/** Histogram resolution: one bin per 0–255 channel value. */
export const HISTOGRAM_BINS = 256;

/** Waveform vertical resolution: luma is quantised into this many levels. */
export const WAVEFORM_LEVELS = 64;

export interface HistogramData {
  /** counts per 0–255 value, one array per channel */
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  /** counts per 0–255 Rec. 709 luma value */
  luma: Uint32Array;
  /** pixels counted (alpha > 0) */
  total: number;
  /** largest single-bin count across all four arrays (the display scale) */
  maxCount: number;
}

export interface WaveformData {
  /** horizontal resolution: one entry per output column */
  columns: number;
  /** vertical resolution (luma levels, level 0 = black) */
  levels: number;
  /**
   * Pixel counts per (level, column), row-major by level:
   * `density[level * columns + column]`. Level 0 is luma 0 (bottom of a
   * waveform display), level `levels - 1` is the brightest band (top).
   */
  density: Uint32Array;
  /** largest single-cell count (the display scale) */
  maxDensity: number;
  /** per-column luma spread over the pixels that landed in the column */
  columnMin: Uint8Array;
  columnMax: Uint8Array;
  columnMean: Float32Array;
  /** pixels counted per column (0 for a column in an empty frame) */
  columnCount: Uint32Array;
  /** pixels counted overall (alpha > 0) */
  total: number;
}

export interface ColorScopesData {
  histogram: HistogramData;
  waveform: WaveformData;
}

/** Rec. 709 luma of one pixel, 0–255. */
export const lumaOf = (r: number, g: number, b: number): number =>
  Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);

function assertPixels(pixels: Uint8ClampedArray | Uint8Array, width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError(`colorScopes: frame size must be positive integers, got ${width}×${height}`);
  }
  if (pixels.length < width * height * 4) {
    throw new RangeError(`colorScopes: expected at least ${width * height * 4} RGBA bytes for ${width}×${height}, got ${pixels.length}`);
  }
}

/** Per-channel (R/G/B) + luma distributions of one frame. */
export function computeHistogram(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): HistogramData {
  assertPixels(pixels, width, height);
  const r = new Uint32Array(HISTOGRAM_BINS);
  const g = new Uint32Array(HISTOGRAM_BINS);
  const b = new Uint32Array(HISTOGRAM_BINS);
  const luma = new Uint32Array(HISTOGRAM_BINS);
  let total = 0;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (pixels[o + 3] === 0) continue;
    const pr = pixels[o]!;
    const pg = pixels[o + 1]!;
    const pb = pixels[o + 2]!;
    r[pr]!++;
    g[pg]!++;
    b[pb]!++;
    luma[lumaOf(pr, pg, pb)]!++;
    total++;
  }
  let maxCount = 0;
  for (let i = 0; i < HISTOGRAM_BINS; i++) {
    if (r[i]! > maxCount) maxCount = r[i]!;
    if (g[i]! > maxCount) maxCount = g[i]!;
    if (b[i]! > maxCount) maxCount = b[i]!;
    if (luma[i]! > maxCount) maxCount = luma[i]!;
  }
  return { r, g, b, luma, total, maxCount };
}

/**
 * Column-wise luma waveform of one frame: every pixel contributes to the
 * column its x position maps to and to the luma level its brightness falls
 * in, so a bright object draws a bright trace in its own columns only.
 *
 * `columns` defaults to the frame width (the sampler already downscales the
 * frame to ~160 px wide, so 1 source column = 1 waveform column there); a
 * caller with a wider frame can cap it.
 */
export function computeWaveform(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  columns: number = width,
): WaveformData {
  assertPixels(pixels, width, height);
  const cols = Math.max(1, Math.min(width, Math.floor(columns) || 1));
  const levels = WAVEFORM_LEVELS;
  const density = new Uint32Array(cols * levels);
  const columnMin = new Uint8Array(cols).fill(255);
  const columnMax = new Uint8Array(cols);
  const columnSum = new Float64Array(cols);
  const columnCount = new Uint32Array(cols);
  let total = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const o = row + x * 4;
      if (pixels[o + 3] === 0) continue;
      const l = lumaOf(pixels[o]!, pixels[o + 1]!, pixels[o + 2]!);
      const col = Math.min(cols - 1, Math.floor((x * cols) / width));
      const level = Math.min(levels - 1, Math.floor((l * levels) / 256));
      density[level * cols + col]!++;
      if (l < columnMin[col]!) columnMin[col] = l;
      if (l > columnMax[col]!) columnMax[col] = l;
      columnSum[col]! += l;
      columnCount[col]!++;
      total++;
    }
  }
  const columnMean = new Float32Array(cols);
  let maxDensity = 0;
  for (let c = 0; c < cols; c++) {
    columnMean[c] = columnCount[c]! > 0 ? columnSum[c]! / columnCount[c]! : 0;
    if (columnCount[c] === 0) columnMin[c] = 0; // an empty column has no spread; 0/0 reads honestly
  }
  for (let i = 0; i < density.length; i++) if (density[i]! > maxDensity) maxDensity = density[i]!;
  return { columns: cols, levels, density, maxDensity, columnMin, columnMax, columnMean, columnCount, total };
}

/** Both scopes for one frame in a single pass over the caller's two calls. */
export function computeColorScopes(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  waveformColumns?: number,
): ColorScopesData {
  return {
    histogram: computeHistogram(pixels, width, height),
    waveform: computeWaveform(pixels, width, height, waveformColumns),
  };
}
