/**
 * Canvas settings view (Run 2, Worker D): the pinned `settings.canvas` shape —
 * `{ aspect: "source" | "9:16" | "16:9" | "1:1" | "4:5", background: string }` where
 * background is "blur" or a CSS colour — plus the pure geometry the studio derives from it.
 *
 * On the base this branch was cut from, `ProjectSettings` has no `canvas` field yet (the
 * schema side is another worker's), so `canvasOf` reads it defensively and falls back to
 * the pinned defaults; once the schema lands, stored values flow through unchanged.
 */

export type CanvasAspect = "source" | "9:16" | "16:9" | "1:1" | "4:5";

export interface CanvasSettings {
  aspect: CanvasAspect;
  /** "blur" (blurred-fill background) or a CSS colour */
  background: string;
}

export const DEFAULT_CANVAS_SETTINGS: CanvasSettings = { aspect: "source", background: "blur" };

const ASPECTS: readonly CanvasAspect[] = ["source", "9:16", "16:9", "1:1", "4:5"];

/** Read the canvas settings off a settings object, pinned defaults for anything missing/invalid. */
export function canvasOf(settings: unknown): CanvasSettings {
  const raw = (settings as { canvas?: Partial<CanvasSettings> } | null | undefined)?.canvas;
  if (!raw) return DEFAULT_CANVAS_SETTINGS;
  return {
    aspect: ASPECTS.includes(raw.aspect as CanvasAspect) ? (raw.aspect as CanvasAspect) : "source",
    background: typeof raw.background === "string" && raw.background.length > 0 ? raw.background : "blur",
  };
}

const ASPECT_RATIO: Record<Exclude<CanvasAspect, "source">, { w: number; h: number }> = {
  "9:16": { w: 9, h: 16 },
  "16:9": { w: 16, h: 9 },
  "1:1": { w: 1, h: 1 },
  "4:5": { w: 4, h: 5 },
};

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * The canvas dimensions for a source of `srcW × srcH` under a canvas aspect:
 * - "source" → the source dims pass through untouched;
 * - otherwise the LARGEST frame of exactly that aspect that fits INSIDE the source box
 *   (both dims ≤ the source dims), with even dimensions and a 2px minimum — H.264 and the
 *   Remotion composition both want even frames, and upscaling the canvas beyond the source
 *   box would invent pixels the export short-edge rule does not ask for.
 */
export function canvasDims(
  canvas: Pick<CanvasSettings, "aspect">,
  srcW: number,
  srcH: number,
): { width: number; height: number } {
  const w = Math.max(2, Math.floor(srcW) || 2);
  const h = Math.max(2, Math.floor(srcH) || 2);
  if (canvas.aspect === "source") return { width: w, height: h };
  const { w: aw, h: ah } = ASPECT_RATIO[canvas.aspect];
  // fit by width first; if that overflows the height, fit by height instead
  let width = w;
  let height = (w * ah) / aw;
  if (height > h) {
    height = h;
    width = (h * aw) / ah;
  }
  return { width: even(width), height: even(height) };
}

/**
 * The aspect an export should be authored at: the canvas aspect when one is chosen,
 * otherwise the source's own aspect (as a "W:H" pair the shared export-dims helpers parse).
 */
export function effectiveAspect(canvas: Pick<CanvasSettings, "aspect">, srcW: number, srcH: number): string {
  if (canvas.aspect !== "source") return canvas.aspect;
  const w = Math.max(1, Math.floor(srcW) || 1);
  const h = Math.max(1, Math.floor(srcH) || 1);
  return `${w}:${h}`;
}
