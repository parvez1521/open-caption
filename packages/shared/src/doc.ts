import { z } from "zod";

export const EmotionSchema = z.enum([
  "neutral", "excited", "funny", "serious", "sad", "angry", "surprised", "question", "hype", "calm",
]);
export type Emotion = z.infer<typeof EmotionSchema>;

export const WordSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  /** when the word appears on its card (set by derivePages, never stored): a little ahead of speech so a card is
   *  fully readable well before the next one replaces it */
  revealMs: z.number().optional(),
  confidence: z.number().min(0).max(1).optional(),
  hidden: z.boolean().optional(),
  emphasis: z.enum(["none", "strong", "hero"]).optional(),
  color: z.string().optional(),
  emoji: z
    .object({ char: z.string(), position: z.enum(["before", "after", "above"]) })
    .nullable()
    .optional(),
  source: z
    .object({
      text: z.enum(["asr", "user"]).optional(),
      emphasis: z.enum(["ai", "heuristic", "user"]).optional(),
      emoji: z.enum(["ai", "user"]).optional(),
      /** hidden automatically by the filler filter (reversible) */
      filler: z.boolean().optional(),
    })
    .optional(),
});
export type Word = z.infer<typeof WordSchema>;

export const CardMetaSchema = z.object({
  emotion: EmotionSchema.optional(),
  emotionSource: z.enum(["ai", "heuristic", "user"]).optional(),
  position: z.object({ x: z.number(), y: z.number() }).nullable().optional(),
  styleOverride: z.record(z.unknown()).nullable().optional(),
});
export type CardMeta = z.infer<typeof CardMetaSchema>;

export const CaptionDocSchema = z.object({
  version: z.literal(2),
  language: z.string().default("en"),
  direction: z.enum(["ltr", "rtl"]).default("ltr"),
  words: z.array(WordSchema),
  /** ids of words that START a new card (user "split here") */
  manualBreaks: z.array(z.string()).default([]),
  /** ids of words after which an automatic break is forbidden (user "merge") */
  noBreakAfter: z.array(z.string()).default([]),
  /** per-card metadata keyed by the card's FIRST word id */
  cards: z.record(CardMetaSchema).default({}),
  meta: z
    .object({
      userEdited: z.boolean().default(false),
      createdFromTranscriptId: z.string().optional(),
      enrichedAt: z.string().optional(),
    })
    .default({}),
});
export type CaptionDoc = z.infer<typeof CaptionDocSchema>;

/** A derived on-screen card. Never persisted: always computed from CaptionDoc + settings. */
export interface Page {
  id: string;
  /** position of this card in the video (0 = first): layouts that cycle compositions as the video runs use it */
  index?: number;
  startMs: number;
  endMs: number;
  words: Word[];
  lines: Word[][];
  heroIndex: number;
  emotion: Emotion;
  emotionSource?: "ai" | "heuristic" | "user";
  position: { x: number; y: number } | null;
  styleOverride: Record<string, unknown> | null;
}

export const emptyDoc = (language = "en"): CaptionDoc =>
  CaptionDocSchema.parse({ version: 2, language, words: [] });
