"use client";

import { applyRecolour, blurredFill, downscaleRgba, featherMask, maskBbox, resampleMask } from "./layers";
import { TEXT_FONTS, type Layer, type Mask } from "./types";

/**
 * Image Elements Editor — canvas compositing.
 *
 * Two stages: pure pixel ops (erase fills + recolours, from layers.ts) run on
 * ImageData, then cutouts / text / shapes draw with the 2D context. Preview
 * renders at a capped size for speed; export renders at full size.
 */

export type BaseImage = { data: Uint8ClampedArray; width: number; height: number };

/** Base pixels with every erase + recolour layer applied, in order. */
export function flattenPixelLayers(base: BaseImage, layers: Layer[]): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(base.data);
  for (const layer of layers) {
    if (!layer.visible) continue;
    if (layer.kind === "erase") {
      const fill = blurredFill(base.data, base.width, base.height, layer.mask);
      const feather = featherMask(layer.mask, 2);
      for (let i = 0; i < base.width * base.height; i++) {
        const wgt = feather[i]!;
        if (wgt <= 0) continue;
        const o = i * 4;
        out[o] = out[o]! + (fill[o]! - out[o]!) * wgt;
        out[o + 1] = out[o + 1]! + (fill[o + 1]! - out[o + 1]!) * wgt;
        out[o + 2] = out[o + 2]! + (fill[o + 2]! - out[o + 2]!) * wgt;
      }
    } else if (layer.kind === "recolour") {
      applyRecolour(out, base.width, base.height, layer.mask, layer);
    }
  }
  return out;
}

/** Downscaled copy of the base plus every layer's geometry resampled to match, for previews. */
export function previewBase(
  base: BaseImage,
  layers: Layer[],
  maxEdge: number,
): { base: BaseImage; layers: Layer[]; scale: number } {
  const small = downscaleRgba(base.data, base.width, base.height, maxEdge);
  const scale = small.width / base.width;
  const scaledLayers = layers.map((layer): Layer => {
    if (layer.kind === "recolour" || layer.kind === "erase") {
      return { ...layer, mask: resampleMask(layer.mask, small.width, small.height) };
    }
    if (layer.kind === "cutout") {
      const cut = downscaleRgba(layer.cutout.data, layer.cutout.width, layer.cutout.height, Math.max(1, Math.round(layer.cutout.width * scale)));
      return {
        ...layer,
        mask: resampleMask(layer.mask, small.width, small.height),
        cutout: { width: cut.width, height: cut.height, data: cut.data },
        x: layer.x * scale,
        y: layer.y * scale,
      };
    }
    if (layer.kind === "text") {
      return { ...layer, x: layer.x * scale, y: layer.y * scale, size: Math.max(1, layer.size * scale) };
    }
    if (layer.kind === "shape") {
      return { ...layer, x: layer.x * scale, y: layer.y * scale, w: layer.w * scale, h: layer.h * scale };
    }
    return layer;
  });
  return { base: { data: small.data, width: small.width, height: small.height }, layers: scaledLayers, scale };
}

const cutoutCanvasCache = new Map<string, { data: Uint8ClampedArray; canvas: HTMLCanvasElement }>();

function cutoutCanvas(layer: Extract<Layer, { kind: "cutout" }>): HTMLCanvasElement {
  const hit = cutoutCanvasCache.get(layer.id);
  if (hit && hit.data === layer.cutout.data) return hit.canvas;
  const c = document.createElement("canvas");
  c.width = layer.cutout.width;
  c.height = layer.cutout.height;
  const ctx = c.getContext("2d")!;
  const img = new ImageData(
    layer.cutout.data as unknown as Uint8ClampedArray<ArrayBuffer>,
    layer.cutout.width,
    layer.cutout.height,
  );
  ctx.putImageData(img, 0, 0);
  cutoutCanvasCache.set(layer.id, { data: layer.cutout.data, canvas: c });
  if (cutoutCanvasCache.size > 24) {
    const first = cutoutCanvasCache.keys().next().value;
    if (first) cutoutCanvasCache.delete(first);
  }
  return c;
}

/** Draw cutout / text / shape layers onto `ctx` (base pixels already drawn). */
export function drawOverlayLayers(ctx: CanvasRenderingContext2D, layers: Layer[], scale: number): void {
  for (const layer of layers) {
    if (!layer.visible) continue;
    if (layer.kind === "cutout") {
      const canvas = cutoutCanvas(layer);
      // anchor move / scale / rotate on the region's own centre, not the image centre
      const bbox = maskBbox(layer.mask) ?? { x0: 0, y0: 0, x1: layer.mask.width - 1, y1: layer.mask.height - 1 };
      const cx = ((bbox.x0 + bbox.x1) / 2) * scale;
      const cy = ((bbox.y0 + bbox.y1) / 2) * scale;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.translate(layer.x * scale + cx, layer.y * scale + cy);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.scale(layer.scale, layer.scale);
      ctx.drawImage(canvas, -cx, -cy, canvas.width * scale, canvas.height * scale);
      ctx.restore();
    } else if (layer.kind === "text") {
      const font = TEXT_FONTS.find((f) => f.id === layer.font) ?? TEXT_FONTS[0]!;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.translate(layer.x * scale, layer.y * scale);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.font = `${layer.bold ? 700 : 400} ${Math.max(1, layer.size * scale)}px ${font.family}`;
      ctx.fillStyle = layer.color;
      ctx.textBaseline = "alphabetic";
      const lines = layer.text.split("\n");
      lines.forEach((line, i) => ctx.fillText(line, 0, i * layer.size * scale * 1.2));
      ctx.restore();
    } else if (layer.kind === "shape") {
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.translate((layer.x + layer.w / 2) * scale, (layer.y + layer.h / 2) * scale);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.fillStyle = layer.fill;
      if (layer.shape === "rect") {
        ctx.fillRect((-layer.w / 2) * scale, (-layer.h / 2) * scale, layer.w * scale, layer.h * scale);
      } else {
        ctx.beginPath();
        ctx.ellipse(0, 0, (layer.w / 2) * scale, (layer.h / 2) * scale, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

/** Full render of base + layers into `canvas` at the base's own resolution. */
export function renderToCanvas(canvas: HTMLCanvasElement, base: BaseImage, layers: Layer[]): void {
  canvas.width = base.width;
  canvas.height = base.height;
  const ctx = canvas.getContext("2d")!;
  const flat = flattenPixelLayers(base, layers);
  ctx.putImageData(new ImageData(flat, base.width, base.height), 0, 0);
  drawOverlayLayers(ctx, layers, 1);
}

/** Preview render at a capped size; returns the scale (preview px per base px). */
export function renderPreview(canvas: HTMLCanvasElement, base: BaseImage, layers: Layer[], maxEdge: number): number {
  const { base: small, layers: scaled, scale } = previewBase(base, layers, maxEdge);
  renderToCanvas(canvas, small, scaled);
  return scale;
}

/** Flatten everything to a PNG blob at the original size. */
export function exportPng(base: BaseImage, layers: Layer[]): Promise<Blob> {
  const canvas = document.createElement("canvas");
  renderToCanvas(canvas, base, layers);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The PNG could not be made in this browser."));
    }, "image/png");
  });
}

/** Tint a mask on an overlay context (selection feedback, not part of the export). */
export function drawMaskTint(
  ctx: CanvasRenderingContext2D,
  mask: Mask,
  scale: number,
  color = "52,211,153",
  alpha = 0.25,
): void {
  const c = document.createElement("canvas");
  c.width = mask.width;
  c.height = mask.height;
  const mctx = c.getContext("2d")!;
  const img = mctx.createImageData(mask.width, mask.height);
  const [cr, cg, cb] = color.split(",").map((n) => parseInt(n, 10));
  for (let i = 0; i < mask.data.length; i++) {
    if (!mask.data[i]) continue;
    const o = i * 4;
    img.data[o] = cr; img.data[o + 1] = cg; img.data[o + 2] = cb; img.data[o + 3] = 255;
  }
  mctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, 0, 0, mask.width * scale, mask.height * scale);
  ctx.restore();
}

/** A plain rectangle outline on an overlay context. */
export function drawBoxOutline(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  scale: number,
  color = "#FFA946",
  lineWidth = 2,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(x0 * scale, y0 * scale, (x1 - x0) * scale, (y1 - y0) * scale);
  ctx.restore();
}
