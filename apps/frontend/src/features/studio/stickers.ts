import type { OverlayShape } from "@capseasy/shared";
import { OVERLAY_SHAPE_META } from "@capseasy/compositions";

/** Category ids come from OVERLAY_SHAPE_META (the single source) — no second list to drift. */
export type StickerCategory = (typeof OVERLAY_SHAPE_META)[number]["category"];

/**
 * The sticker registry: all 110 house-drawn shapes that live in the shared schema
 * + renderer (OVERLAY_SHAPES in packages/shared, OverlayShapeSvg in
 * packages/compositions/src/overlays.tsx) — the 21 original shapes, the 12
 * studio stickers batch (2026-11-18), the 17-shape expansion (2026-11-18) and
 * the 60-shape colourful expansion 2 (2026-11-18) across 12 categories.
 * Our own artwork, drawn in-house for Captionit — no third-party art, nothing
 * downloaded, no licence to clear.
 *
 * Licence: CC0 — drawn in-house for Captionit, free for any use.
 * Source: House-drawn SVG in packages/compositions/src/overlays.tsx (OverlayShapeSvg).
 *
 * Do NOT add shapes here without adding them to the shared schema + renderer first:
 * this registry only lists shapes the composition already knows how to render in
 * preview AND MP4 export.
 */
export const STICKER_SHAPE_IDS = [
  "ring",
  "circle",
  "arrow",
  "check",
  "star",
  "heart",
  "rectangle",
  "scribble-underline",
  "triangle",
  "rounded-rectangle",
  "ellipse",
  "diamond",
  "chevron",
  "double-arrow",
  "speech-bubble",
  "underline-bar",
  "corner-brackets",
  "progress-bar",
  "plus",
  "cross",
  "badge",
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
  "megaphone",
  "music-note",
  "mic",
  "camera",
  "play",
  "rocket",
  "trophy",
  "gift",
  "bell",
  "clock",
  "gem",
  "puzzle",
  "coffee",
  "umbrella",
  "key",
  "lock",
  "thumbs-down",
  "arrow-up",
  "arrow-down",
  "arrow-left",
  "arrow-turn",
  "sparkle",
  "shooting-star",
  "star-outline",
  "heart-broken",
  "heart-sparkle",
  "heart-arrow",
  "heart-outline",
  "face-smile",
  "face-laugh",
  "face-wink",
  "face-love",
  "face-cool",
  "face-surprise",
  "face-sad",
  "face-sleepy",
  "party-popper",
  "balloon",
  "fireworks",
  "cake",
  "bunting",
  "party-hat",
  "share-arrow",
  "link",
  "hashtag",
  "chat-heart",
  "hand-pointer",
  "check-badge",
  "hexagon",
  "pentagon",
  "octagon",
  "blob",
  "squiggle",
  "leaf",
  "flower",
  "tree",
  "mountain",
  "rainbow",
  "pizza",
  "burger",
  "ice-cream",
  "donut",
  "strawberry",
  "cupcake",
  "cat-face",
  "dog-face",
  "bird",
  "fish",
  "butterfly",
  "paw-print",
  "football",
  "basketball",
  "medal",
  "dumbbell",
  "headphones",
  "guitar",
  "music-double",
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

/** One sticker as the panel shows it: label + search metadata + its fixed default colour. */
export interface StickerShape {
  id: OverlayShape;
  label: string;
  /** Fixed default primary colour from OVERLAY_SHAPE_META (what the panel shows is what gets placed). */
  color: string;
  category: StickerCategory;
  tags: readonly string[];
}

/** The 110 sticker shapes with their labels, colours, categories and tags, in registry order. */
export function stickerShapes(): StickerShape[] {
  return STICKER_SETS[0]!.shapes.map((id) => {
    const meta = OVERLAY_SHAPE_META.find((s) => s.id === id);
    return {
      id,
      label: meta?.label ?? id,
      color: meta?.color ?? "#FFFFEB",
      category: meta?.category ?? "shapes",
      tags: meta?.tags ?? [],
    };
  });
}

/** Category chips for the panel, in the order the categories first appear in the registry. */
export const STICKER_CATEGORY_LABELS: Record<StickerCategory, string> = {
  arrows: "Arrows",
  stars: "Stars",
  hearts: "Hearts",
  faces: "Faces",
  celebration: "Celebration",
  social: "Social & CTA",
  shapes: "Shapes",
  nature: "Nature",
  food: "Food",
  animals: "Animals",
  sport: "Sport",
  music: "Music",
};

export function stickerCategories(): { id: StickerCategory; label: string; count: number }[] {
  const counts = new Map<StickerCategory, number>();
  for (const s of stickerShapes()) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  const order: StickerCategory[] = [];
  for (const s of stickerShapes()) if (!order.includes(s.category)) order.push(s.category);
  return order.map((id) => ({ id, label: STICKER_CATEGORY_LABELS[id], count: counts.get(id) ?? 0 }));
}

/**
 * Search filter (pure): every whitespace-separated token must match somewhere in the
 * sticker's label, id, tags or category — case-insensitive, substring. An empty query
 * matches everything; `category` narrows to one category ("all" = no narrowing).
 * The panel's empty state ("No stickers match") is the zero-length result of this.
 */
export function filterStickers(
  shapes: readonly StickerShape[],
  query: string,
  category: StickerCategory | "all" = "all",
): StickerShape[] {
  const tokens = query.toLowerCase().split(/\s+/).map((t) => t.trim()).filter(Boolean);
  return shapes.filter((s) => {
    if (category !== "all" && s.category !== category) return false;
    if (tokens.length === 0) return true;
    const hay = `${s.label} ${s.id} ${STICKER_CATEGORY_LABELS[s.category]} ${s.tags.join(" ")}`.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}
