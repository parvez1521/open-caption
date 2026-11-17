import type { OverlayShape } from "@capseasy/shared";
import { OVERLAY_SHAPE_META } from "@capseasy/compositions";

/**
 * The sticker registry: the 12 house-drawn sticker shapes that already live in the
 * shared schema + renderer (OVERLAY_SHAPES in packages/shared, OverlayShapeSvg in
 * packages/compositions/src/overlays.tsx). Our own artwork, drawn in-house for
 * Captionit — no third-party art, nothing downloaded, no licence to clear.
 *
 * Licence: CC0 — drawn in-house for Captionit, free for any use.
 * Source: House-drawn SVG in packages/compositions/src/overlays.tsx (OverlayShapeSvg).
 *
 * Do NOT add shapes here without adding them to the shared schema + renderer first:
 * this registry only lists shapes the composition already knows how to render in
 * preview AND MP4 export.
 */
export const STICKER_SHAPE_IDS = [
  "burst",
  "bolt",
  "crown",
  "flame",
  "thumbs-up",
  "curved-arrow",
  "sun",
  "explosion",
  "ribbon",
  "tag",
  "pin",
  "target",
] as const satisfies readonly OverlayShape[];

export interface StickerSet {
  id: string;
  name: string;
  /** Licence under which the set's artwork may be used. */
  licence: string;
  /** Where the artwork lives, so a reader can verify it is ours. */
  source: string;
  shapes: readonly OverlayShape[];
}

export const STICKER_SETS: StickerSet[] = [
  {
    id: "house-stickers",
    name: "House Stickers",
    licence: "CC0 — drawn in-house for Captionit, free for any use",
    source: "House-drawn SVG in packages/compositions/src/overlays.tsx (OverlayShapeSvg)",
    shapes: STICKER_SHAPE_IDS,
  },
];

/** The 12 sticker shapes with their labels from OVERLAY_SHAPE_META, in registry order. */
export function stickerShapes(): { id: OverlayShape; label: string }[] {
  return STICKER_SETS[0]!.shapes.map((id) => ({
    id,
    label: OVERLAY_SHAPE_META.find((s) => s.id === id)?.label ?? id,
  }));
}
