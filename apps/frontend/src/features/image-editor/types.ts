/**
 * Image Elements Editor — layer model.
 *
 * A photo has no layers, so every edit is a layer over the base image:
 *  - recolour: HSL shift applied to the base pixels inside a mask.
 *  - erase: the masked region is filled with a soft blur of the nearby
 *    background (an approximation — the UI says so in plain words).
 *  - cutout: the masked region's pixels, lifted off the base and drawn back
 *    transformed (move / scale / rotate). The hole it leaves is erased unless
 *    the layer is a duplicate.
 *  - text / shape: vector overlays drawn on top.
 *
 * Layers render in array order: erase fills and recolours first (they change
 * base pixels), then cutouts, then text and shapes.
 */
export type Mask = {
  width: number;
  height: number;
  /** one byte per pixel, 1 = inside the region, 0 = outside */
  data: Uint8Array;
};

export type TextFontId = "sans" | "serif" | "jakarta" | "instrument";

export const TEXT_FONTS: Array<{ id: TextFontId; label: string; family: string }> = [
  { id: "jakarta", label: "Plus Jakarta Sans", family: "'Plus Jakarta Sans', system-ui, sans-serif" },
  { id: "sans", label: "System sans", family: "system-ui, sans-serif" },
  { id: "serif", label: "System serif", family: "Georgia, serif" },
  { id: "instrument", label: "Instrument Serif", family: "'Instrument Serif', Georgia, serif" },
];

export type LayerBase = { id: string; label: string; visible: boolean };

export type RecolourLayer = LayerBase & {
  kind: "recolour";
  mask: Mask;
  /** hue shift in degrees, -180..180 */
  hue: number;
  /** saturation multiplier, 0..2 (1 = unchanged) */
  saturation: number;
  /** brightness multiplier, 0..2 (1 = unchanged) */
  brightness: number;
  /** 0..1, how strongly the recolour replaces the original */
  opacity: number;
};

export type EraseLayer = LayerBase & { kind: "erase"; mask: Mask };

export type CutoutLayer = LayerBase & {
  kind: "cutout";
  /** RGBA pixels of the region, alpha already 0 outside the mask */
  cutout: { width: number; height: number; data: Uint8ClampedArray };
  /** the region's mask in base-image coordinates (the hole it leaves) */
  mask: Mask;
  /** false for a duplicate: the original stays where it was */
  eraseSource: boolean;
  /** top-left of the cutout in base-image coordinates (before rotation) */
  x: number;
  y: number;
  scale: number;
  /** degrees, clockwise */
  rotation: number;
  opacity: number;
};

export type TextLayer = LayerBase & {
  kind: "text";
  text: string;
  font: TextFontId;
  /** font size in base-image pixels */
  size: number;
  color: string;
  bold: boolean;
  /** anchor: left edge of the first baseline */
  x: number;
  y: number;
  rotation: number;
  opacity: number;
};

export type ShapeLayer = LayerBase & {
  kind: "shape";
  shape: "rect" | "ellipse";
  fill: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
};

export type Layer = RecolourLayer | EraseLayer | CutoutLayer | TextLayer | ShapeLayer;

/** One OCR word with its box in base-image coordinates. */
export type TextBox = { text: string; x0: number; y0: number; x1: number; y1: number; conf: number };

/** Words on one visual line, merged for text editing. */
export type TextLine = { text: string; words: TextBox[]; x0: number; y0: number; x1: number; y1: number };

export type RecolourParams = { hue: number; saturation: number; brightness: number; opacity: number };

export const DEFAULT_RECOLOUR: RecolourParams = { hue: 0, saturation: 1, brightness: 1, opacity: 1 };

/** Cap for the image the editor works on: bigger photos are downscaled on load. */
export const MAX_IMAGE_EDGE = 3000;
/** Biggest file the picker accepts. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Longest edge the canvas preview renders at (export always uses full size). */
export const PREVIEW_MAX_EDGE = 1000;
