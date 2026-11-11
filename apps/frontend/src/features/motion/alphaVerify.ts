/**
 * Post-encode alpha verification — the last honesty gate for transparent WebM export.
 *
 * The capability probe (alphaCapability.ts) proves the browser CLAIMS it can encode alpha;
 * this module proves the FINISHED FILE actually contains it. After a transparent render,
 * the encoded blob is demuxed with Mediabunny and checked twice:
 *  1. the video track must report canBeTransparent() (the WebM track carries AlphaMode);
 *  2. decoded frames sampled mid-animation must contain BOTH (near-)transparent pixels AND
 *     (near-)opaque pixels — a flat alpha channel in either direction means the "transparent"
 *     file is really an opaque render (or an empty one), and the export FAILS instead of
 *     delivering it (runStandaloneExport throws and saves nothing).
 *
 * The decision logic (alphaStatsOf / evaluateAlphaFrames) is pure and unit-tested; the live
 * read-back (verifyAlphaExport) fails closed: any error, missing track or undecodable frame
 * returns false.
 */

/** Alpha extremes a genuinely transparent frame must show: some pixels (near-)clear, some (near-)solid. */
export const ALPHA_CLEAR_MAX = 250;
export const ALPHA_SOLID_MIN = 250;

export interface AlphaStats {
  min: number;
  max: number;
  /** fraction of sampled pixels whose alpha is below ALPHA_CLEAR_MAX */
  transparentFraction: number;
}

/** Alpha-channel statistics of one RGBA pixel buffer (every 4th byte is alpha). Pure. */
export function alphaStatsOf(data: Uint8ClampedArray): AlphaStats {
  let min = 255;
  let max = 0;
  let clear = 0;
  let n = 0;
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i]!;
    if (a < min) min = a;
    if (a > max) max = a;
    if (a < ALPHA_CLEAR_MAX) clear += 1;
    n += 1;
  }
  return { min, max, transparentFraction: n === 0 ? 0 : clear / n };
}

/**
 * The verdict over the sampled frames: EVERY sampled frame must show both extremes —
 * min below the clear threshold (real transparency somewhere) and max above the solid
 * threshold (the graphic itself is really there). Pure; an empty sample set fails.
 */
export function evaluateAlphaFrames(frames: Pick<AlphaStats, "min" | "max">[]): boolean {
  if (frames.length === 0) return false;
  return frames.every((f) => f.min < ALPHA_CLEAR_MAX && f.max > ALPHA_SOLID_MIN);
}

/** Where in the file the verification frames are sampled (fractions of the duration). */
export const ALPHA_SAMPLE_FRACTIONS = [0.35, 0.65] as const;

/**
 * Verify a rendered blob really is transparent WebM. Browser-only (Mediabunny demux +
 * WebCodecs decode under the hood); in any environment where that cannot run it returns
 * false — fail closed, exactly like the capability probe.
 */
export async function verifyAlphaExport(blob: Blob): Promise<boolean> {
  try {
    const { Input, BlobSource, ALL_FORMATS, CanvasSink } = await import("mediabunny");
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) return false;
    if (!(await track.canBeTransparent())) return false;
    const durationSec = await input.computeDuration();
    if (!Number.isFinite(durationSec) || durationSec <= 0) return false;
    const sink = new CanvasSink(track);
    const stats: AlphaStats[] = [];
    for (const fraction of ALPHA_SAMPLE_FRACTIONS) {
      const wrapped = await sink.getCanvas(Math.min(durationSec - 0.05, Math.max(0.05, durationSec * fraction)));
      if (!wrapped) return false;
      const src = wrapped.canvas as { width: number; height: number };
      const canvas = document.createElement("canvas");
      canvas.width = src.width;
      canvas.height = src.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return false;
      ctx.drawImage(wrapped.canvas as CanvasImageSource, 0, 0);
      stats.push(alphaStatsOf(ctx.getImageData(0, 0, canvas.width, canvas.height).data));
    }
    input.dispose();
    return evaluateAlphaFrames(stats);
  } catch {
    return false;
  }
}
