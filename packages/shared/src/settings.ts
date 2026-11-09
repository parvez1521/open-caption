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
    kind: z.enum(["text", "shape", "image"]),
    text: z.string().max(500).optional(),
    shape: OverlayShapeSchema.optional(),
    /** image overlays: the media-bin asset (device-local IndexedDB) whose bytes this overlay shows.
     *  Only the id + display name are stored — the bytes never leave the device, exactly like the
     *  project video; renderers resolve the id to a URL in the browser and skip the item without one. */
    assetId: z.string().min(1).optional(),
    assetName: z.string().max(300).optional(),
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
  .refine((o) => o.kind !== "shape" || o.shape !== undefined, { message: "shape overlays need a shape", path: ["shape"] })
  .refine((o) => o.kind !== "image" || o.assetId !== undefined, { message: "image overlays need a media asset id", path: ["assetId"] });
export type OverlayItem = z.infer<typeof OverlayItemSchema>;

/* ---------------- export settings (resolution + frame rate) ---------------- */

/** The four export resolutions the owner asked for, as ids. "2k" is the 1440p tier and "4k" the 2160p tier. */
export const EXPORT_RESOLUTIONS = ["720p", "1080p", "2k", "4k"] as const;
export const ExportResolutionSchema = z.enum(EXPORT_RESOLUTIONS);
export type ExportResolution = z.infer<typeof ExportResolutionSchema>;

/** The two export frame rates. No interpolation is ever done: see the fps hint copy in the Export UI. */
export const EXPORT_FPS_OPTIONS = [30, 60] as const;
export const ExportFpsSchema = z.union([z.literal(30), z.literal(60)]);
export type ExportFps = z.infer<typeof ExportFpsSchema>;

export const ExportSettingsSchema = z.object({
  resolution: ExportResolutionSchema.default("1080p"),
  fps: ExportFpsSchema.default(30),
});
export type ExportSettings = z.infer<typeof ExportSettingsSchema>;
export const DEFAULT_EXPORT_SETTINGS: ExportSettings = { resolution: "1080p", fps: 30 };

/** Short-edge size (the "p") each resolution id stands for. */
export const EXPORT_RESOLUTION_SHORT_EDGE: Record<ExportResolution, number> = {
  "720p": 720,
  "1080p": 1080,
  "2k": 1440,
  "4k": 2160,
};

export const EXPORT_RESOLUTION_LABEL: Record<ExportResolution, string> = {
  "720p": "720p",
  "1080p": "1080p",
  "2k": "2K",
  "4k": "4K",
};

const evenDim = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * THE DIMENSIONS RULE (implemented here, used by every render path):
 * the chosen resolution's "p" is the SHORT edge of the output frame, whatever the aspect.
 * Portrait (height > width): the width IS p — 9:16 at 720p is 720×1280, at 1080p 1080×1920,
 * at 2K 1440×2560, at 4K 2160×3840; 4:5 at 720p is 720×900.
 * Landscape (width > height): the height IS p — 16:9 at 720p is 1280×720, at 1080p 1920×1080,
 * at 2K 2560×1440, at 4K 3840×2160.
 * Square: both edges are p — 1:1 at 1080p is 1080×1080.
 * The long edge follows the source's aspect ratio and is rounded to an even number (H.264 needs even dims).
 * The source size does not cap the result: picking 4K for a 1080p video really renders 4K (upscaled video,
 * captions drawn natively at the bigger canvas).
 */
export function exportDimensions(sourceWidth: number, sourceHeight: number, resolution: ExportResolution): { width: number; height: number } {
  const p = EXPORT_RESOLUTION_SHORT_EDGE[resolution];
  const w = Math.max(1, sourceWidth);
  const h = Math.max(1, sourceHeight);
  if (w === h) return { width: p, height: p };
  if (w < h) return { width: p, height: evenDim((p * h) / w) };
  return { width: evenDim((p * w) / h), height: p };
}

/** Same rule, starting from an aspect string like "9:16" (the PLATFORM_PRESETS shape). */
export function exportDimensionsForAspect(aspect: string, resolution: ExportResolution): { width: number; height: number } {
  const [aw, ah] = aspect.split(":").map((n) => Number(n));
  if (!aw || !ah) throw new Error(`Bad aspect ratio: ${aspect}`);
  return exportDimensions(aw, ah, resolution);
}

/**
 * Frames for a duration at a frame rate. ALL timing in this system is stored in milliseconds
 * (caption pages, overlays, trims), and every renderer converts ms × fps at render time, so
 * doubling the fps doubles the frame count and every caption still lands at the same instant.
 */
export function framesForDurationMs(durationMs: number, fps: number): number {
  return Math.max(1, Math.ceil((Math.max(0, durationMs) / 1000) * fps));
}

/**
 * Plain-words message for a render that died because the device ran out of memory, or null when the
 * error is not a memory failure. Callers surface this INSTEAD of a generic "export failed", so the
 * user is told what happened and what to do (pick a lower resolution).
 */
export function exportMemoryErrorMessage(error: unknown, resolution?: ExportResolution): string | null {
  const raw = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  if (!/out of memory|out-of-memory|\boom\b|allocation (failed|error)|failed to allocate|cannot allocate|unable to allocate|allocationfailed|array buffer allocation|heap out of memory|memory pressure|not enough memory/i.test(raw)) return null;
  const at = resolution ? ` at ${EXPORT_RESOLUTION_LABEL[resolution]}` : "";
  return `Your device ran out of memory while rendering${at}. Try a lower resolution (1080p or 720p) and export again.`;
}

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
  /** last export choice, per project (owner 2026-11-10): drives BOTH render paths; old projects get 1080p/30 */
  exportSettings: ExportSettingsSchema.default({ resolution: "1080p", fps: 30 }),
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
