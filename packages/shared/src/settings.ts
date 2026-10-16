import { z } from "zod";

export const PlatformSchema = z.enum(["tiktok", "reels", "shorts", "youtube", "linkedin", "podcast", "custom"]);
export type Platform = z.infer<typeof PlatformSchema>;

/** Words per caption card for every new project and every look (one-word looks use 1). */
export const DEFAULT_WORDS_PER_CARD = 3;

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
