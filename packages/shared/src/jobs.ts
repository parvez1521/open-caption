import { z } from "zod";
import { CaptionDocSchema } from "./doc";
import { ProjectSettingsSchema } from "./settings";
import { CaptionStyleSchema } from "./style";

export const JOB_KINDS = ["transcribe", "enrich", "render", "proxy", "thumbnail"] as const;
export type JobKind = (typeof JOB_KINDS)[number];
export const JOB_STATUSES = ["queued", "processing", "completed", "failed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const WHISPER_MODELS = [
  "tiny", "tiny.en", "base", "base.en", "small", "small.en", "medium", "medium.en", "large-v1", "large-v2", "large-v3", "large-v3-turbo",
] as const;

export const FontRefSchema = z.object({
  family: z.string(),
  weight: z.number().default(400),
  style: z.string().default("normal"),
  url: z.string().url().optional(),
});
export type FontRef = z.infer<typeof FontRefSchema>;

export const TranscribeJobSchema = z.object({
  kind: z.literal("transcribe"),
  videoId: z.string(),
  engine: z.enum(["local", "cloud"]),
  model: z.string().default("small"),
  language: z.string().default("auto"),
  prompt: z.string().optional(),
  romanize: z.boolean().default(false),
});
export const EnrichJobSchema = z.object({
  kind: z.literal("enrich"),
  documentRevision: z.number().int(),
  features: z.array(z.enum(["hero", "emoji", "emotion", "fillers"])),
});
export const ProxyJobSchema = z.object({ kind: z.literal("proxy"), videoId: z.string(), targetHeight: z.number().default(720) });
export const ThumbnailJobSchema = z.object({ kind: z.literal("thumbnail"), videoId: z.string(), atMs: z.number().optional() });

export const RENDER_FORMATS = ["mp4", "mov_alpha", "webm_alpha", "png"] as const;
export const RenderJobSchema = z.object({
  kind: z.literal("render"),
  exportId: z.string(),
  format: z.enum(RENDER_FORMATS),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  crf: z.number().int().min(0).max(51).default(21),
  range: z.object({ startMs: z.number().nonnegative(), endMs: z.number().positive() }).optional(),
  docSnapshot: CaptionDocSchema,
  /**
   * The translated caption track for `settings.translateTo` at enqueue time (slice 5.1), when one
   * exists. Optional so pre-5.1 queued jobs still validate; the composition only draws it when
   * `settings.bilingual` is on, exactly like the preview/browser paths.
   */
  translatedDocSnapshot: CaptionDocSchema.optional(),
  style: CaptionStyleSchema,
  settings: ProjectSettingsSchema,
  fonts: z.array(FontRefSchema).default([]),
  sourceVideoId: z.string(),
});

export const JobPayloadSchema = z.discriminatedUnion("kind", [
  TranscribeJobSchema, EnrichJobSchema, ProxyJobSchema, ThumbnailJobSchema, RenderJobSchema,
]);
export type JobPayload = z.infer<typeof JobPayloadSchema>;
export type RenderJob = z.infer<typeof RenderJobSchema>;
export type TranscribeJob = z.infer<typeof TranscribeJobSchema>;

export const WorkerCapabilitiesSchema = z.object({
  kinds: z.array(z.enum(JOB_KINDS)).default([]),
  whisper: z.object({ installed: z.boolean(), models: z.array(z.string()) }).optional(),
  gpu: z.enum(["nvidia", "apple", "amd"]).nullable().optional(),
  cpuCores: z.number().optional(),
  ramGb: z.number().optional(),
  diskFreeGb: z.number().optional(),
  chromeReady: z.boolean().optional(),
  ffmpeg: z.boolean().optional(),
});
export type WorkerCapabilities = z.infer<typeof WorkerCapabilitiesSchema>;
