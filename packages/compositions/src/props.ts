import { z } from "zod";
import { CaptionDocSchema, CaptionStyleSchema, OverlayItemSchema, ProjectSettingsSchema, VideoAdjustSchema, emptyDoc } from "@capseasy/shared";

export const MediaMetaSchema = z.object({
  width: z.number().int().positive().default(1080),
  height: z.number().int().positive().default(1920),
  fps: z.number().positive().default(30),
  durationMs: z.number().nonnegative().default(0),
  rotation: z.number().default(0),
});

/** The one input contract for preview (Player) and export (renderMedia). */
export const CaptionedVideoProps = z.object({
  /** video URL; null renders captions only (stills, overlay exports) */
  src: z.string().nullable().default(null),
  media: MediaMetaSchema.default({}),
  /**
   * Export output override (resolution + frame-rate choice): when a renderer is making an export at a
   * chosen resolution/fps, it passes the TARGET canvas here and calculateMetadata authors the composition
   * at that size/rate instead of the source media's. `media` stays the truth about the source file.
   * Absent = render at the source size/rate (preview, stills, legacy jobs). Timing is ms-based
   * everywhere, so a higher outputFps only multiplies frame counts — captions land at the same instants.
   */
  outputWidth: z.number().int().positive().optional(),
  outputHeight: z.number().int().positive().optional(),
  outputFps: z.number().positive().optional(),
  doc: CaptionDocSchema.default(emptyDoc()),
  /**
   * The translated caption track (slice 5.1): a second, real CaptionDoc in `settings.translateTo`'s
   * language, produced on-device by OPUS-MT. It is only DRAWN when `settings.bilingual` is on and
   * its language matches `settings.translateTo`; otherwise the render is exactly the pre-5.1 one.
   * Optional on purpose: render payloads without a translation (every pre-5.1 job) stay valid.
   */
  translatedDoc: CaptionDocSchema.optional(),
  style: CaptionStyleSchema.default({}),
  settings: ProjectSettingsSchema.default({}),
  /** "burn" composites over the video; "overlay" is transparent captions only */
  mode: z.enum(["burn", "overlay"]).default("burn"),
  /** CSS background painted when there is no video in burn mode (look previews, demos) */
  backdrop: z.string().nullable().default(null),
  /**
   * How the source video is decoded. "offthread" (default): the Companion's renderMedia and the Player.
   * "media": @remotion/media's <Video>, required by the in-browser renderer (@remotion/web-renderer).
   */
  videoEngine: z.enum(["offthread", "media"]).default("offthread"),
  /**
   * Editor elements (Slice 1d): video filter adjustments + timed text/shape overlays. Optional on purpose:
   * when absent, the composition falls back to the same fields inside `settings` — which is how the
   * companion/server render payload carries them — so every render path shows the same picture.
   */
  videoAdjust: VideoAdjustSchema.optional(),
  overlays: z.array(OverlayItemSchema).optional(),
  /**
   * Resolved URLs for image overlays, keyed by media-asset id. Image bytes are device-local
   * (IndexedDB), so only the browser paths (Player preview + in-browser export) can resolve them —
   * the studio passes object URLs here; a renderer without a URL for an asset skips that overlay,
   * the same device-local constraint the main video already has for server renders.
   */
  overlayAssets: z.record(z.string()).optional(),
  /**
   * Resolved URLs for per-segment media, keyed by media-asset id (a segment's `assetId`).
   * Segment media bytes are device-local (IndexedDB), so only the browser paths (Player
   * preview + in-browser export) can resolve them — the studio passes object URLs here; a
   * renderer without a URL for a segment's asset falls back to the composition's main `src`,
   * the same device-local constraint the main video already has for server renders.
   */
  segmentAssets: z.record(z.string()).optional(),
});
export type CaptionedVideoProps = z.infer<typeof CaptionedVideoProps>;
export type CaptionedVideoInput = z.input<typeof CaptionedVideoProps>;
