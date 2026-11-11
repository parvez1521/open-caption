import { z } from "zod";
import { CaptionDocSchema, WordSchema } from "./doc";
import { TranslationTargetSchema } from "./translate";
import { JOB_KINDS, WorkerCapabilitiesSchema } from "./jobs";

export const VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"] as const;

export const ProbeSchema = z.object({
  durationMs: z.number().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive().optional(),
  rotation: z.number().optional(),
  videoCodec: z.string().optional(),
  audioCodec: z.string().optional(),
  hasAudio: z.boolean().optional(),
  /** how this browser shows the video: its own player, a converted copy, or captions only (picture unreadable) */
  previewMode: z.enum(["native", "converted", "captions-only"]).optional(),
  /** the picture can be played but not read frame by frame; MP4 export needs a compatible copy */
  needsCompat: z.boolean().optional(),
});
export type Probe = z.infer<typeof ProbeSchema>;

export const CreateVideoBody = z.object({
  filename: z.string().min(1).max(300),
  size: z.number().int().positive(),
  mime: z.string(),
  probe: ProbeSchema.optional(),
  /** the file stays on the user's device (IndexedDB); nothing is uploaded */
  local: z.boolean().optional(),
});

export const CompleteVideoBody = z.object({ needsProxy: z.boolean().optional(), editorMode: z.boolean().optional() }).default({});

export const SaveDocumentBody = z.object({
  expectedRevision: z.number().int().nonnegative(),
  doc: CaptionDocSchema,
});

/**
 * Save a translated caption track (slice 5.1): same doc shape as SaveDocumentBody, keyed by its
 * target language. The language must be a VERIFIED pair from the registry and must match the
 * doc's own `language` (the route checks that), so a track can never be filed under a language
 * it is not written in.
 */
export const SaveTranslationBody = z.object({
  language: TranslationTargetSchema,
  doc: CaptionDocSchema,
});

export const EXPORT_KINDS = ["mp4", "mov_alpha", "webm_alpha", "srt", "vtt", "ass", "txt", "json", "png"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];
export const TEXT_EXPORT_KINDS = ["srt", "vtt", "ass", "txt", "json"] as const;
export type TextExportKind = (typeof TEXT_EXPORT_KINDS)[number];
/**
 * The kinds `POST /projects/:id/exports` will actually create today — the ONE list both the API
 * validation (CreateExportBody below) and the Export UI derive from, so they can never drift.
 * Order is presentation order for the UI: browser MP4, then the text files, then the alpha overlays.
 *
 * `png` stays in EXPORT_KINDS (existing export rows and the companion's render formats still refer
 * to it) but is deliberately NOT creatable: the API has never produced a PNG still — creating one
 * was rejected with "PNG stills are not available yet", and it still is, now at schema validation.
 */
export const CREATABLE_EXPORT_KINDS = ["mp4", "srt", "vtt", "ass", "txt", "json", "mov_alpha", "webm_alpha"] as const satisfies readonly ExportKind[];
export type CreatableExportKind = (typeof CREATABLE_EXPORT_KINDS)[number];
/** Transparent-background caption overlays: rendered by the paired companion app, never in the browser. */
export const ALPHA_EXPORT_KINDS = ["mov_alpha", "webm_alpha"] as const satisfies readonly CreatableExportKind[];
export type AlphaExportKind = (typeof ALPHA_EXPORT_KINDS)[number];
/** File extension for every creatable kind (the download / storage naming used by the exports route). */
export const EXPORT_EXTENSIONS: Record<CreatableExportKind, string> = {
  mp4: "mp4", mov_alpha: "mov", webm_alpha: "webm", srt: "srt", vtt: "vtt", ass: "ass", txt: "txt", json: "json",
};
export const TEXT_EXPORT_MIME: Record<TextExportKind, string> = {
  srt: "application/x-subrip", vtt: "text/vtt", ass: "text/plain", txt: "text/plain", json: "application/json",
};
export const CreateExportBody = z.object({
  kind: z.enum(CREATABLE_EXPORT_KINDS),
  /**
   * Text exports only (slice 5.1): export the TRANSLATED caption track for this target language
   * instead of the primary doc. Validated against the verified-pairs registry (translate.ts) in
   * the route; ignored for render kinds, whose bilingual track rides the job snapshot instead.
   */
  language: z.string().min(2).max(10).optional(),
  width: z.number().int().min(64).max(7680).optional(),
  height: z.number().int().min(64).max(7680).optional(),
  fps: z.number().min(1).max(120).optional(),
  crf: z.number().int().min(0).max(51).optional(),
  range: z.object({ startMs: z.number().nonnegative(), endMs: z.number().positive() }).optional(),
});

// ---- companion / device flow ----
export const DeviceStartBody = z.object({
  workerName: z.string().min(1).max(80).default("My Computer"),
  platform: z.string().max(40).optional(),
  version: z.string().max(40).optional(),
});
export const DeviceTokenBody = z.object({
  deviceCode: z.string().min(16).max(200),
  /** one-click setup codes are created before the computer is known: it names itself when it claims the code */
  workerName: z.string().trim().min(1).max(80).optional(),
  platform: z.string().max(40).optional(),
});
export const DeviceApproveBody = z.object({ userCode: z.string().min(4).max(20), approve: z.boolean().default(true) });

export const HeartbeatBody = z.object({
  version: z.string().max(40).optional(),
  platform: z.string().max(40).optional(),
  capabilities: WorkerCapabilitiesSchema.optional(),
  currentJobId: z.string().uuid().nullable().optional(),
});
export const ClaimBody = z.object({
  kinds: z.array(z.enum(JOB_KINDS)).min(1),
  /** long-poll: hold the request up to this long waiting for a job (instant pickup without a socket) */
  waitMs: z.number().int().min(0).max(25_000).default(0),
});
export const ProgressBody = z.object({
  stage: z.string().max(60),
  progress: z.number().min(0).max(100),
  message: z.string().max(500).optional(),
});
export const FailBody = z.object({
  errorCode: z.string().max(60).default("WORKER_ERROR"),
  message: z.string().max(2000),
  retryable: z.boolean().default(false),
});

export const TranscribeResult = z.object({
  kind: z.literal("transcribe"),
  engine: z.enum(["whisper_cpp"]),
  model: z.string(),
  language: z.string().default("en"),
  durationMs: z.number().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  words: z.array(WordSchema).max(200_000),
});
export const ProxyResult = z.object({ kind: z.literal("proxy"), previewPath: z.string() });
export const ThumbnailResult = z.object({ kind: z.literal("thumbnail"), thumbnailPath: z.string() });
export const RenderResult = z.object({
  kind: z.literal("render"),
  path: z.string(),
  size: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative().optional(),
  renderMs: z.number().nonnegative().optional(),
});
export const CompleteBody = z.discriminatedUnion("kind", [TranscribeResult, ProxyResult, ThumbnailResult, RenderResult]);
export type CompleteBody = z.infer<typeof CompleteBody>;
