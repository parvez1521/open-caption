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
  doc: CaptionDocSchema.default(emptyDoc()),
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
});
export type CaptionedVideoProps = z.infer<typeof CaptionedVideoProps>;
export type CaptionedVideoInput = z.input<typeof CaptionedVideoProps>;
