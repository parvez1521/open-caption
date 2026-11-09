import { z } from "zod";

export const PlatformSchema = z.enum(["tiktok", "reels", "shorts", "youtube", "linkedin", "podcast", "custom"]);
export type Platform = z.infer<typeof PlatformSchema>;

/** Words per caption card for every new project and every look (one-word looks use 1). */
export const DEFAULT_WORDS_PER_CARD = 3;

/** CSS-filter style adjustments applied to the video layer (1 = unchanged). */
export const VideoAdjustSchema = z.object({
  brightness: z.number().min(0.5).max(1.5).default(1),
  contrast: z.number().min(0.5).max(1.5).default(1),
  saturation: z.number().min(0.5).max(1.5).default(1),
});
export type VideoAdjust = z.infer<typeof VideoAdjustSchema>;
export const NEUTRAL_VIDEO_ADJUST: VideoAdjust = { brightness: 1, contrast: 1, saturation: 1 };

/** The app's own overlay shape set (inline SVG, drawn in packages/compositions). */
export const OVERLAY_SHAPES = ["ring", "circle", "arrow", "check", "star", "heart", "rectangle", "scribble-underline", "triangle"] as const;
export const OverlayShapeSchema = z.enum(OVERLAY_SHAPES);
export type OverlayShape = z.infer<typeof OverlayShapeSchema>;

/**
 * A timed overlay item rendered above the video and below the captions, in the preview AND the MP4 export
 * (one shared composition). Position is the item centre as a fraction of the canvas; fontSize is reference
 * px at a 1080 short edge, like the caption style schema.
 */
export const OverlayItemSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["text", "shape"]),
    text: z.string().max(500).optional(),
    shape: OverlayShapeSchema.optional(),
    startMs: z.number().min(0),
    endMs: z.number().min(1),
    x: z.number().min(0).max(1).default(0.5),
    y: z.number().min(0).max(1).default(0.5),
    scale: z.number().min(0.25).max(4).default(1),
    rotation: z.number().min(-45).max(45).default(0),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "colour must be a #rrggbb hex value")
      .default("#FFFFFF"),
    fontSize: z.number().min(12).max(300).optional(),
  })
  .refine((o) => o.endMs > o.startMs, { message: "endMs must be after startMs", path: ["endMs"] })
  .refine((o) => o.kind !== "shape" || o.shape !== undefined, { message: "shape overlays need a shape", path: ["shape"] });
export type OverlayItem = z.infer<typeof OverlayItemSchema>;

export const ProjectSettingsSchema = z.object({
  platform: PlatformSchema.default("custom"),
  maxWordsPerCard: z.number().int().min(1).max(12).default(DEFAULT_WORDS_PER_CARD),
  maxLines: z.number().int().min(1).max(3).default(2),
  maxCharsPerLine: z.number().int().min(8).max(60).default(24),
  pauseMs: z.number().min(150).max(1500).default(400),
  holdMs: z.number().min(0).max(1500).default(500),
  minCardMs: z.number().min(200).max(2000).default(900),
  gapBehavior: z.enum(["hold", "clear"]).default("hold"),
  syncOffsetMs: z.number().min(-1000).max(1000).default(0),
  removeFillers: z.boolean().default(false),
  fillerList: z.array(z.string()).default([]),
  profanity: z.enum(["off", "mask", "emoji", "hide"]).default("off"),
  customVocabulary: z.array(z.string()).default([]),
  romanize: z.boolean().default(false),
  language: z.string().default("auto"),
  translateTo: z.string().nullable().default(null),
  bilingual: z.boolean().default(false),
  /** editor elements (Slice 1d): video filter adjustments + timed text/shape overlays */
  videoAdjust: VideoAdjustSchema.default({ brightness: 1, contrast: 1, saturation: 1 }),
  overlays: z.array(OverlayItemSchema).default([]),
});
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;
export const defaultSettings = (): ProjectSettings => ProjectSettingsSchema.parse({});

export interface PlatformPreset {
  label: string;
  aspect: "9:16" | "16:9" | "1:1" | "4:5";
  maxWordsPerCard: number;
  /** normalized y of the caption block center, chosen to clear the platform UI */
  y: number;
  /** fractions of the frame covered by platform UI (top/bottom/side rails) */
  unsafe: { top: number; bottom: number; left: number; right: number };
}

export const PLATFORM_PRESETS: Record<Platform, PlatformPreset> = {
  tiktok: { label: "TikTok", aspect: "9:16", maxWordsPerCard: 3, y: 0.66, unsafe: { top: 0.1, bottom: 0.22, left: 0.05, right: 0.14 } },
  reels: { label: "Instagram Reels", aspect: "9:16", maxWordsPerCard: 3, y: 0.68, unsafe: { top: 0.12, bottom: 0.2, left: 0.05, right: 0.12 } },
  shorts: { label: "YouTube Shorts", aspect: "9:16", maxWordsPerCard: 3, y: 0.67, unsafe: { top: 0.1, bottom: 0.2, left: 0.05, right: 0.14 } },
  youtube: { label: "YouTube", aspect: "16:9", maxWordsPerCard: 6, y: 0.86, unsafe: { top: 0.05, bottom: 0.1, left: 0.05, right: 0.05 } },
  linkedin: { label: "LinkedIn", aspect: "1:1", maxWordsPerCard: 5, y: 0.8, unsafe: { top: 0.05, bottom: 0.12, left: 0.05, right: 0.05 } },
  podcast: { label: "Podcast", aspect: "16:9", maxWordsPerCard: 7, y: 0.84, unsafe: { top: 0.05, bottom: 0.1, left: 0.06, right: 0.06 } },
  custom: { label: "Custom", aspect: "9:16", maxWordsPerCard: 4, y: 0.72, unsafe: { top: 0.06, bottom: 0.1, left: 0.06, right: 0.06 } },
};
