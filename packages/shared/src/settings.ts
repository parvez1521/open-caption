import { z } from "zod";
import { TranslationTargetSchema } from "./translate";
import { ENTRANCES, EXITS } from "./style";

export const PlatformSchema = z.enum(["tiktok", "reels", "shorts", "youtube", "linkedin", "podcast", "custom"]);
export type Platform = z.infer<typeof PlatformSchema>;

/** Words per caption card for every new project and every look (one-word looks use 1). */
export const DEFAULT_WORDS_PER_CARD = 3;

/** CSS-filter style adjustments applied to the video layer (1 / 0 = unchanged).
 *  Phase 4 Run 3 (slice 4.9) extends the original brightness/contrast/saturation with
 *  exposure (a second brightness multiplier), highlights/shadows (signed −1..1,
 *  mapped onto brightness/contrast cross-terms) and temperature/tint (signed −1..1,
 *  mapped onto a sepia term + colour-wash overlays) — ALL of it through the ONE
 *  shared mapping in packages/compositions (buildVideoFilter / buildAdjustOverlays),
 *  so preview ≡ browser export ≡ server render by construction. The photographic
 *  names are honest approximations of what CSS filters can express; the mapping is
 *  documented where it lives. */
export const VideoAdjustSchema = z.object({
  brightness: z.number().min(0.5).max(1.5).default(1),
  contrast: z.number().min(0.5).max(1.5).default(1),
  saturation: z.number().min(0.5).max(1.5).default(1),
  exposure: z.number().min(0.25).max(4).default(1),
  highlights: z.number().min(-1).max(1).default(0),
  shadows: z.number().min(-1).max(1).default(0),
  temperature: z.number().min(-1).max(1).default(0),
  tint: z.number().min(-1).max(1).default(0),
});
export type VideoAdjust = z.infer<typeof VideoAdjustSchema>;
export const NEUTRAL_VIDEO_ADJUST: VideoAdjust = {
  brightness: 1, contrast: 1, saturation: 1,
  exposure: 1, highlights: 0, shadows: 0, temperature: 0, tint: 0,
};

/** The app's own overlay shape set (inline SVG, drawn in packages/compositions). */
export const OVERLAY_SHAPES = ["ring", "circle", "arrow", "check", "star", "heart", "rectangle", "scribble-underline", "triangle",
  // Package 2 item F batch: everyday creator geometry, same hand-drawn SVG family
  "rounded-rectangle", "ellipse", "diamond", "chevron", "double-arrow", "speech-bubble", "underline-bar",
  "corner-brackets", "progress-bar", "plus", "cross", "badge"] as const;
export const OverlayShapeSchema = z.enum(OVERLAY_SHAPES);
export type OverlayShape = z.infer<typeof OverlayShapeSchema>;

/**
 * Animated "Social Media" overlay variants (2026-11-10): original drawn graphics (pill/card/bell/heart/
 * chat/counter/badge — no platform logos or chrome) whose animation phases are derived purely from the
 * item's own start/end window inside the shared composition, so preview ≡ browser export ≡ server render.
 * The item's `text` carries the editable lines (split on "\n"); `color` is the one accent colour.
 */
export const OVERLAY_SOCIAL_VARIANTS = [
  "subscribe-pill", "subscribe-banner", "follow-banner", "comment-popup",
  "like-pop", "heart-pop", "counter", "chat-stack", "orbit-badge", "search-bar",
  "profile-card", "notification-pop", "dm-popup", "story-ring", "lower-third",
  "logo-reveal", "qr-frame", "kinetic-title", "glitch-title", "neon-sign",
  "particle-burst", "typing-post", "upvote-card", "live-badge", "product-tag",
  "form-card", "audio-bars", "post-card", "repost-card", "voice-card",
  // Follow-up batch (2026-11-11): the cursor move→click→react family plus the most-used
  // social patterns the first library lacked (share/save, read ticks, countdown, up-next…).
  "cursor-click", "cursor-follow", "cursor-subscribe", "cursor-like",
  "share-pop", "save-pop", "follow-plus", "gift-pop", "bell-reminder", "watch-next",
  "chat-ticks", "dm-typing", "lower-third-bar", "logo-mark", "type-title", "countdown-pop",
] as const;
export const OverlaySocialVariantSchema = z.enum(OVERLAY_SOCIAL_VARIANTS);
export type OverlaySocialVariant = z.infer<typeof OverlaySocialVariantSchema>;

/**
 * A timed overlay item rendered above the video and below the captions, in the preview AND the MP4 export
 * (one shared composition). Position is the item centre as a fraction of the canvas; fontSize is reference
 * px at a 1080 short edge, like the caption style schema.
 */
export const OverlayItemSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["text", "shape", "image", "social"]),
    text: z.string().max(500).optional(),
    shape: OverlayShapeSchema.optional(),
    /** social overlays: which animated graphic this item draws (required for kind "social") */
    variant: OverlaySocialVariantSchema.optional(),
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
    /**
     * Package 3 item I.5 — entrance/exit animation for EVERY overlay kind, in the SAME
     * motion system as the captions' In/Out (Package 2 item D): the same preset vocabulary
     * (ENTRANCES / EXITS from the caption style model) and the same speed semantics
     * (a multiplier over the renderer's base duration). Absent = no animation, exactly
     * the pre-existing behaviour. The renderer applies the box-applicable subset of the
     * presets (see OVERLAY_ENTER_ANIMS in @capseasy/compositions); letter-level presets
     * stay caption-only because an overlay is one box, not letters.
     */
    enterAnim: z.enum(ENTRANCES).optional(),
    enterSpeed: z.number().min(0.5).max(2).optional(),
    exitAnim: z.enum(EXITS).optional(),
    exitSpeed: z.number().min(0.5).max(2).optional(),
  })
  .refine((o) => o.endMs > o.startMs, { message: "endMs must be after startMs", path: ["endMs"] })
  .refine((o) => o.kind !== "shape" || o.shape !== undefined, { message: "shape overlays need a shape", path: ["shape"] })
  .refine((o) => o.kind !== "image" || o.assetId !== undefined, { message: "image overlays need a media asset id", path: ["assetId"] })
  .refine((o) => o.kind !== "social" || o.variant !== undefined, { message: "social overlays need a variant", path: ["variant"] });
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

/* ---------------- clip range (Clipper projects) ---------------- */

/**
 * A clip project's media range, in SOURCE-video milliseconds: the project was created from the
 * segment [startMs, endMs] of a longer video. The caption document is already shifted so the
 * segment start is 0; this range is the metadata that lets every renderer show ONLY the segment
 * (the source video file itself is never re-encoded or cut — it stays whole on the device).
 * Null on every normal project, which then renders exactly as before.
 */
export const ClipRangeSchema = z
  .object({
    startMs: z.number().min(0),
    endMs: z.number().min(1),
  })
  .refine((r) => r.endMs > r.startMs, { message: "endMs must be after startMs", path: ["endMs"] });
export type ClipRange = z.infer<typeof ClipRangeSchema>;

/** Length of a clip range in ms. */
export function clipRangeDurationMs(range: ClipRange): number {
  return Math.max(0, range.endMs - range.startMs);
}

/**
 * The duration a renderer should author for a project: with a clip range, only the segment
 * (clamped to the source when the source duration is known); without one, the source duration.
 */
export function effectiveDurationMs(sourceDurationMs: number, clipRange: ClipRange | null | undefined): number {
  if (!clipRange) return sourceDurationMs;
  const end = sourceDurationMs > 0 ? Math.min(clipRange.endMs, sourceDurationMs) : clipRange.endMs;
  return Math.max(0, end - clipRange.startMs);
}

/* ---------------- composition (CompositionDoc Stage B, Phase 4) ---------------- */

/**
 * The four timeline tracks the Stage-A composition view (and therefore the Stage-B editor
 * model) always carries, in this order. Stage B adds no new track kinds; "audio" from the
 * architecture's §2 model arrives with a later milestone, not with this storage slice.
 */
export const CompositionTrackKindSchema = z.enum(["video", "captions", "text", "graphics"]);
export type CompositionTrackKind = z.infer<typeof CompositionTrackKindSchema>;

/**
 * Per-track editor state: `locked` blocks edits, `visible` hides the track's clips,
 * `muted` silences it (only meaningful for the video track until audio tracks exist).
 * Every flag defaults to the neutral state — unlocked, visible, unmuted — so a project
 * that never touched a track control stores exactly the defaults and projects back
 * to the pre-Stage-B settings shape (see the untouched-shape rule in compositionDoc.ts).
 */
export const TrackStateSchema = z.object({
  locked: z.boolean().default(false),
  visible: z.boolean().default(true),
  muted: z.boolean().default(false),
});
export type TrackState = z.infer<typeof TrackStateSchema>;
export const DEFAULT_TRACK_STATE: TrackState = { locked: false, visible: true, muted: false };

/**
 * Per-segment visual transform (Stage C / Phase 4 Run 2): crop insets as fractions of the
 * source frame removed from each edge, a rotation, mirror flips, a scale and a centre offset
 * (fractions of the canvas). Every field defaults to the identity, so a segment that never
 * touched a transform control stores exactly {@link IDENTITY_SEGMENT_TRANSFORM}.
 */
export const SegmentTransformSchema = z.object({
  cropLeft: z.number().min(0).max(0.9).default(0),
  cropTop: z.number().min(0).max(0.9).default(0),
  cropRight: z.number().min(0).max(0.9).default(0),
  cropBottom: z.number().min(0).max(0.9).default(0),
  rotateDeg: z.number().min(-180).max(180).default(0),
  flipH: z.boolean().default(false),
  flipV: z.boolean().default(false),
  scale: z.number().min(0.1).max(4).default(1),
  offsetX: z.number().min(-1).max(1).default(0),
  offsetY: z.number().min(-1).max(1).default(0),
  /** Run 3 (slice 4.7): the segment's base opacity, 0..1 — also the value the
   *  "opacity" keyframe channel interpolates around. 1 = fully opaque. */
  opacity: z.number().min(0).max(1).default(1),
});
export type SegmentTransform = z.infer<typeof SegmentTransformSchema>;
export const IDENTITY_SEGMENT_TRANSFORM: SegmentTransform = {
  cropLeft: 0,
  cropTop: 0,
  cropRight: 0,
  cropBottom: 0,
  rotateDeg: 0,
  flipH: false,
  flipV: false,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  opacity: 1,
};

/**
 * A transition INTO a segment from its predecessor (Stage C / Phase 4 Run 2). At render the
 * two clips overlap by `durationMs`, so a transition compresses the total composition
 * duration (see {@link compositionDurationMs}). Only meaningful on segments at index ≥ 1.
 */
export const SegmentTransitionSchema = z.object({
  type: z.enum(["fade", "wipe", "slide", "zoom", "blur"]),
  durationMs: z.number().int().min(100).max(2000),
});
export type SegmentTransition = z.infer<typeof SegmentTransitionSchema>;

/* ---------------- Phase 4 Run 3: keyframes + effects stack (slice 4.7) ---------------- */

/** The transform/opacity channels a segment keyframe can animate. The base value of each
 *  channel is the segment's stored transform field of the same name (opacity lives on the
 *  transform too); keyframes interpolate BETWEEN keyframe values and hold the base value
 *  outside the keyframed range only where no keyframe covers it — see the sampler in
 *  packages/compositions (sampleSegmentKeyframes), the ONE evaluator preview and every
 *  export share. */
export const SEGMENT_KEYFRAME_PROPERTIES = ["offsetX", "offsetY", "scale", "rotateDeg", "opacity"] as const;
export const SegmentKeyframePropertySchema = z.enum(SEGMENT_KEYFRAME_PROPERTIES);
export type SegmentKeyframeProperty = z.infer<typeof SegmentKeyframePropertySchema>;

/** Easing of the span FROM the keyframe carrying it TO the next keyframe on the same
 *  channel. "hold" keeps this keyframe's value until the next one (a step). The curves
 *  are plain cubic maths in the compositions sampler — no Remotion spring, so a value
 *  depends only on (keyframes, time), never on render history. */
export const KEYFRAME_EASINGS = ["linear", "ease-in", "ease-out", "ease-in-out", "hold"] as const;
export const KeyframeEasingSchema = z.enum(KEYFRAME_EASINGS);
export type KeyframeEasing = z.infer<typeof KeyframeEasingSchema>;

/** Per-property legal value ranges, enforced by the refine below and by the op layer. */
export const KEYFRAME_VALUE_RANGES: Record<SegmentKeyframeProperty, { min: number; max: number }> = {
  offsetX: { min: -1, max: 1 },
  offsetY: { min: -1, max: 1 },
  scale: { min: 0.1, max: 4 },
  rotateDeg: { min: -180, max: 180 },
  opacity: { min: 0, max: 1 },
};

export const SegmentKeyframeSchema = z
  .object({
    id: z.string().min(1),
    /** segment-LOCAL timeline ms (0 = the segment's first frame) — keyframes move with
     *  their segment through splits/trims/rate changes via the op layer's remapping. */
    atMs: z.number().min(0),
    property: SegmentKeyframePropertySchema,
    value: z.number(),
    easing: KeyframeEasingSchema.default("linear"),
  })
  .refine(
    (k) => k.value >= KEYFRAME_VALUE_RANGES[k.property].min && k.value <= KEYFRAME_VALUE_RANGES[k.property].max,
    { message: "keyframe value out of range for its property", path: ["value"] },
  );
export type SegmentKeyframe = z.infer<typeof SegmentKeyframeSchema>;

/**
 * One entry of a segment's ORDERED effects stack. The stack is applied in stored order
 * through the shared CSS-filter mapping in packages/compositions (buildSegmentEffects):
 * each type maps its normalised `amount` (0..1) onto a concrete CSS filter function or
 * a composition layer (vignette/grain are layers, not filters). Only the CSS-expressible
 * set ships — sharpen is deliberately absent (no CSS/SVG form passes the preview ≡
 * export parity bar in all three renderers; recorded in the roadmap as a non-goal for
 * this programme). Blend modes stay EXCLUDED (declared parity gap, STUDIO-ARCHITECTURE).
 */
export const SEGMENT_EFFECT_TYPES = ["blur", "glow", "vignette", "grain"] as const;
export const SegmentEffectTypeSchema = z.enum(SEGMENT_EFFECT_TYPES);
export type SegmentEffectType = z.infer<typeof SegmentEffectTypeSchema>;

export const SegmentEffectSchema = z.object({
  id: z.string().min(1),
  type: SegmentEffectTypeSchema,
  enabled: z.boolean().default(true),
  /** normalised strength 0..1; the renderer maps it per type (see buildSegmentEffects) */
  amount: z.number().min(0).max(1).default(0.5),
  /** glow only: the glow colour; ignored by the other types */
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "colour must be a #rrggbb hex value")
    .default("#FFA946"),
});
export type SegmentEffect = z.infer<typeof SegmentEffectSchema>;

/* ---------------- Phase 4 Run 3: audio studio model (slice 4.8) ---------------- */

/** 3-band EQ as stored params: shelf/peak gains in dB at the mix engine's fixed
 *  frequencies (low shelf 200 Hz, mid peak 1 kHz, high shelf 4 kHz — constants of the
 *  mix implementation, shared by the preview graph and the export mixdown). */
export const AudioEqSchema = z.object({
  lowDb: z.number().min(-15).max(15).default(0),
  midDb: z.number().min(-15).max(15).default(0),
  highDb: z.number().min(-15).max(15).default(0),
});
export type AudioEq = z.infer<typeof AudioEqSchema>;
export const NEUTRAL_AUDIO_EQ: AudioEq = { lowDb: 0, midDb: 0, highDb: 0 };

/**
 * "Basic cleanup" — honestly named: a high-pass filter (removes rumble) plus a noise
 * gate (silences the track between phrases). It is NOT noise removal and is never
 * labelled as such in the UI. Both halves are plain DSP, implemented identically by
 * the preview graph and the export mixdown from these params.
 */
export const AudioCleanupSchema = z.object({
  enabled: z.boolean().default(false),
  highPassHz: z.number().min(20).max(400).default(80),
  gateDb: z.number().min(-80).max(-20).default(-50),
});
export type AudioCleanup = z.infer<typeof AudioCleanupSchema>;
export const DEFAULT_AUDIO_CLEANUP: AudioCleanup = { enabled: false, highPassHz: 80, gateDb: -50 };

export const AudioClipProcessorsSchema = z.object({
  eq: AudioEqSchema.default({ lowDb: 0, midDb: 0, highDb: 0 }),
  cleanup: AudioCleanupSchema.default({ enabled: false, highPassHz: 80, gateDb: -50 }),
  /** wet mix 0..1 of the generated-impulse convolver reverb (the impulse is a seeded
   *  exponential-decay noise burst generated by the mix engine — never a recorded room) */
  reverb: z.number().min(0).max(1).default(0),
});
export type AudioClipProcessors = z.infer<typeof AudioClipProcessorsSchema>;
export const DEFAULT_AUDIO_CLIP_PROCESSORS: AudioClipProcessors = {
  eq: { lowDb: 0, midDb: 0, highDb: 0 },
  cleanup: { enabled: false, highPassHz: 80, gateDb: -50 },
  reverb: 0,
};

/**
 * One placed piece of audio on the timeline. The bytes live in the media bin on this
 * device (assetId); only the placement + mix params are stored here. Times: `startMs`
 * is the PROJECT timeline position; sourceInMs/sourceOutMs are the used range of the
 * asset (assets play at rate 1 — speed is a video-segment feature). Fades are linear
 * gain ramps of the stored lengths. Everything is a stored mix param: the preview
 * Web Audio graph and the export Mediabunny mixdown are two consumers of this data.
 */
export const AudioClipSchema = z
  .object({
    id: z.string().min(1),
    assetId: z.string().min(1),
    assetName: z.string().max(300).default(""),
    trackId: z.string().min(1),
    startMs: z.number().min(0),
    sourceInMs: z.number().min(0),
    sourceOutMs: z.number().min(1),
    volume: z.number().min(0).max(2).default(1),
    fadeInMs: z.number().min(0).default(0),
    fadeOutMs: z.number().min(0).default(0),
    processors: AudioClipProcessorsSchema.default({
      eq: { lowDb: 0, midDb: 0, highDb: 0 },
      cleanup: { enabled: false, highPassHz: 80, gateDb: -50 },
      reverb: 0,
    }),
  })
  .refine((c) => c.sourceOutMs > c.sourceInMs, { message: "sourceOutMs must be after sourceInMs", path: ["sourceOutMs"] });
export type AudioClip = z.infer<typeof AudioClipSchema>;

/** Ducking: this track's gain is pulled down by `amountDb` while the voice (the video's
 *  own sound + clips on voice-role tracks) is active above `thresholdDb`. The envelope
 *  is ONE pure function of the voice peaks + these params, shared by both consumers. */
export const AudioDuckingSchema = z.object({
  enabled: z.boolean().default(false),
  amountDb: z.number().min(0).max(24).default(12),
  thresholdDb: z.number().min(-60).max(-20).default(-42),
});
export type AudioDucking = z.infer<typeof AudioDuckingSchema>;
export const DEFAULT_AUDIO_DUCKING: AudioDucking = { enabled: false, amountDb: 12, thresholdDb: -42 };

export const AudioTrackSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(80).default("Audio"),
  role: z.enum(["voice", "music", "other"]).default("other"),
  volume: z.number().min(0).max(2).default(1),
  muted: z.boolean().default(false),
  locked: z.boolean().default(false),
  ducking: AudioDuckingSchema.default({ enabled: false, amountDb: 12, thresholdDb: -42 }),
});
export type AudioTrack = z.infer<typeof AudioTrackSchema>;

/** The master end of the mix: overall level, the VIDEO chain's own sound level inside
 *  the mix (its mute still comes from the video track state), and one compressor. */
export const AudioMasterSchema = z.object({
  volume: z.number().min(0).max(2).default(1),
  videoVolume: z.number().min(0).max(2).default(1),
  compressor: z
    .object({
      enabled: z.boolean().default(false),
      thresholdDb: z.number().min(-60).max(0).default(-18),
      ratio: z.number().min(1).max(20).default(3),
      kneeDb: z.number().min(0).max(40).default(12),
      attackMs: z.number().min(0).max(100).default(10),
      releaseMs: z.number().min(10).max(1000).default(200),
    })
    .default({ enabled: false, thresholdDb: -18, ratio: 3, kneeDb: 12, attackMs: 10, releaseMs: 200 }),
});
export type AudioMaster = z.infer<typeof AudioMasterSchema>;
export const DEFAULT_AUDIO_MASTER: AudioMaster = {
  volume: 1,
  videoVolume: 1,
  compressor: { enabled: false, thresholdDb: -18, ratio: 3, kneeDb: 12, attackMs: 10, releaseMs: 200 },
};

/**
 * One APPROVED profanity bleep (Phase 5, A6): a PROJECT-timeline range where the mix
 * mutes every item and overlays a code-synthesised tone instead. This is a mix param,
 * never a destructive edit — the source audio is untouched and removing the entry
 * restores it exactly. Ranges are created ONLY from transcript matches the user
 * approved in the review UI (see features/studio/audio/bleep.ts); `wordText` keeps the
 * matched transcript word for that UI and is never rendered. The tone is synthesised
 * from `toneHz`/`level` by the ONE shared function in mixMath, so the preview graph
 * and the export mixdown produce the identical tone from these params.
 */
export const AudioBleepSchema = z
  .object({
    id: z.string().min(1),
    startMs: z.number().min(0),
    endMs: z.number().min(1),
    toneHz: z.number().min(200).max(4000).default(1000),
    level: z.number().min(0).max(1).default(0.5),
    wordText: z.string().max(80).default(""),
  })
  .refine((b) => b.endMs > b.startMs, { message: "endMs must be after startMs", path: ["endMs"] });
export type AudioBleep = z.infer<typeof AudioBleepSchema>;
export const DEFAULT_BLEEP_TONE_HZ = 1000;
export const DEFAULT_BLEEP_LEVEL = 0.5;

/** The composition's whole audio slice: tracks + placed clips + master. Empty = the
 *  project has no audio-studio content and every audio behaviour is exactly Run 2's. */
export const CompositionAudioSchema = z.object({
  tracks: z.array(AudioTrackSchema).default([]),
  clips: z.array(AudioClipSchema).default([]),
  master: AudioMasterSchema.default({
    volume: 1,
    videoVolume: 1,
    compressor: { enabled: false, thresholdDb: -18, ratio: 3, kneeDb: 12, attackMs: 10, releaseMs: 200 },
  }),
  /** Phase 5 (A6): approved profanity bleeps — see AudioBleepSchema. */
  bleeps: z.array(AudioBleepSchema).default([]),
  /**
   * Phase 5 (A12, gated spike that PASSED — see features/studio/audio/denoise.ts):
   * media-bin asset id of a noise-suppressed WAV derived ONCE from the main source's
   * audio (decode → RNNoise → WAV in the media bin, the reverse-conform derived-asset
   * pattern). When set, the mix plan reads the video items' audio from this asset
   * instead of the main source, so preview and export consume IDENTICAL samples —
   * there are no two live RNNoise implementations. Null = the source's own audio.
   * Device-local like every media-bin asset: on another device the id resolves to
   * nothing and the mix falls back to the source's own sound.
   */
  noiseSuppressionAssetId: z.string().nullable().default(null),
});
export type CompositionAudio = z.infer<typeof CompositionAudioSchema>;
export const EMPTY_COMPOSITION_AUDIO: CompositionAudio = {
  tracks: [],
  clips: [],
  master: {
    volume: 1,
    videoVolume: 1,
    compressor: { enabled: false, thresholdDb: -18, ratio: 3, kneeDb: 12, attackMs: 10, releaseMs: 200 },
  },
  bleeps: [],
  noiseSuppressionAssetId: null,
};

/**
 * One piece of video on the timeline, in SOURCE-video milliseconds. At Stage B the stored
 * segments were a contiguous partition of one source span; Stage C (Gate G4) lifts that
 * constraint — segments are now independent source ranges laid out on the TIMELINE in array
 * order, so a source discontinuity between neighbours is a legal jump cut, not invalid data.
 *
 * Run-2 fields, ALL defaulted so pre-Run-2 stored data parses identically:
 * - `playbackRate` — the source plays at this rate; the segment's TIMELINE duration is
 *   `(sourceOutMs − sourceInMs) / playbackRate` (see {@link segmentTimelineDurationMs}).
 * - `transform` — per-segment crop/rotate/flip/scale/offset; identity by default.
 * - `transitionIn` — transition from the previous segment; null = a plain cut.
 * - `assetId` — a device-local media-bin asset (a reversed-video conform or a freeze still)
 *   that replaces the project's main source for this segment; null = the main source.
 * - `still` — a freeze-frame still clip: sourceIn/Out are a PSEUDO-span whose length is the
 *   on-screen duration (played at rate 1), not a range of moving source video.
 */
export const VideoSegmentSchema = z
  .object({
    id: z.string().min(1),
    sourceInMs: z.number().min(0),
    sourceOutMs: z.number().min(0),
    playbackRate: z.number().min(0.25).max(4).default(1),
    transform: SegmentTransformSchema.default(IDENTITY_SEGMENT_TRANSFORM),
    transitionIn: SegmentTransitionSchema.nullable().default(null),
    assetId: z.string().nullable().default(null),
    still: z.boolean().default(false),
    /** Run 3 (4.7): keyframes over the transform/opacity channels, segment-local times */
    keyframes: z.array(SegmentKeyframeSchema).default([]),
    /** Run 3 (4.7): the ordered effects stack, applied in array order */
    effects: z.array(SegmentEffectSchema).default([]),
  })
  .refine((s) => s.sourceOutMs > s.sourceInMs, { message: "sourceOutMs must be after sourceInMs", path: ["sourceOutMs"] });
export type VideoSegment = z.infer<typeof VideoSegmentSchema>;

/** The on-screen (timeline) duration of one segment: its source span played at its rate. */
export function segmentTimelineDurationMs(seg: Pick<VideoSegment, "sourceInMs" | "sourceOutMs" | "playbackRate">): number {
  return Math.round((seg.sourceOutMs - seg.sourceInMs) / seg.playbackRate);
}

/** Sum of the segments' timeline durations, before transitions compress the joins. */
export function segmentsTimelineDurationMs(segs: readonly Pick<VideoSegment, "sourceInMs" | "sourceOutMs" | "playbackRate">[]): number {
  return segs.reduce((sum, seg) => sum + segmentTimelineDurationMs(seg), 0);
}

/**
 * The rendered duration of a segment list: the sum of timeline durations minus every
 * transition on segments[1..] (each transition overlaps its two neighbours by its full
 * duration). With fewer than 2 segments there are no joins, so nothing is subtracted.
 */
export function compositionDurationMs(segs: readonly (Pick<VideoSegment, "sourceInMs" | "sourceOutMs" | "playbackRate"> & { transitionIn?: SegmentTransition | null })[]): number {
  if (segs.length < 2) return segmentsTimelineDurationMs(segs);
  const overlap = segs.slice(1).reduce((sum, seg) => sum + (seg.transitionIn?.durationMs ?? 0), 0);
  return Math.max(0, segmentsTimelineDurationMs(segs) - overlap);
}

/** A named point on the PROJECT (rendered) timeline. `atMs` is project time, not source time. */
export const CompositionMarkerSchema = z.object({
  id: z.string().min(1),
  atMs: z.number().min(0),
  label: z.string().max(80).default(""),
});
export type CompositionMarker = z.infer<typeof CompositionMarkerSchema>;

/** Track state for all four tracks; each track falls back to the neutral state on its own. */
export const CompositionTracksSchema = z.object({
  video: TrackStateSchema.default({ locked: false, visible: true, muted: false }),
  captions: TrackStateSchema.default({ locked: false, visible: true, muted: false }),
  text: TrackStateSchema.default({ locked: false, visible: true, muted: false }),
  graphics: TrackStateSchema.default({ locked: false, visible: true, muted: false }),
});
export type CompositionTracks = z.infer<typeof CompositionTracksSchema>;
export const DEFAULT_COMPOSITION_TRACKS: CompositionTracks = {
  video: { locked: false, visible: true, muted: false },
  captions: { locked: false, visible: true, muted: false },
  text: { locked: false, visible: true, muted: false },
  graphics: { locked: false, visible: true, muted: false },
};

/**
 * The Stage-B "composition_json inside the settings patch" (STUDIO-ARCHITECTURE.md §1.2,
 * Stage B): the timeline-only slice of the composition that does not already live
 * elsewhere in settings. Caption words stay in the caption doc (its own revisioned
 * payload) and overlays stay in `overlays` — this slice carries only what is new:
 * the video segmentation, the markers, and per-track state. It rides `settings_json`
 * through the existing settings patch, whose allow-list is this schema, so it must be
 * a declared field here to survive the round trip; there is deliberately no
 * `projects.composition_json` column at Stage B (that is Stage C).
 *
 * An empty slice (`videoSegments: []`) means "no segmentation stored": the editor
 * synthesises the single video clip from `clipRange` / the full source instead, which
 * is what keeps pre-Stage-B projects byte-identical in spirit after a build+project
 * round trip.
 */
export const CompositionSettingsSchema = z.object({
  version: z.literal(1).default(1),
  videoSegments: z.array(VideoSegmentSchema).default([]),
  markers: z.array(CompositionMarkerSchema).default([]),
  tracks: CompositionTracksSchema.default({
    video: { locked: false, visible: true, muted: false },
    captions: { locked: false, visible: true, muted: false },
    text: { locked: false, visible: true, muted: false },
    graphics: { locked: false, visible: true, muted: false },
  }),
  /** Run 3 (4.8): audio tracks + placed clips + master — see CompositionAudioSchema */
  audio: CompositionAudioSchema.default({
    tracks: [],
    clips: [],
    master: {
      volume: 1,
      videoVolume: 1,
      compressor: { enabled: false, thresholdDb: -18, ratio: 3, kneeDb: 12, attackMs: 10, releaseMs: 200 },
    },
  }),
});
export type CompositionSettings = z.infer<typeof CompositionSettingsSchema>;
export const EMPTY_COMPOSITION_SETTINGS: CompositionSettings = {
  version: 1,
  videoSegments: [],
  markers: [],
  tracks: {
    video: { locked: false, visible: true, muted: false },
    captions: { locked: false, visible: true, muted: false },
    text: { locked: false, visible: true, muted: false },
    graphics: { locked: false, visible: true, muted: false },
  },
  audio: {
    tracks: [],
    clips: [],
    master: {
      volume: 1,
      videoVolume: 1,
      compressor: { enabled: false, thresholdDb: -18, ratio: 3, kneeDb: 12, attackMs: 10, releaseMs: 200 },
    },
    bleeps: [],
    noiseSuppressionAssetId: null,
  },
};
export const DEFAULT_COMPOSITION_SETTINGS: CompositionSettings = EMPTY_COMPOSITION_SETTINGS;

/**
 * Project canvas (Stage C / Phase 4 Run 2): the output aspect — "source" keeps the source
 * video's own aspect, the others reframe onto that canvas — and what fills the frame area
 * the (possibly reframed / transformed) video does not cover: "blur" (a blurred stretch of
 * the video itself) or a CSS colour string.
 */
export const CanvasSettingsSchema = z.object({
  aspect: z.enum(["source", "9:16", "16:9", "1:1", "4:5"]).default("source"),
  background: z.string().min(1).default("blur"),
});
export type CanvasSettings = z.infer<typeof CanvasSettingsSchema>;
export const DEFAULT_CANVAS_SETTINGS: CanvasSettings = { aspect: "source", background: "blur" };

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
  /**
   * On-device translation target (slice 5.1): only VERIFIED OPUS-MT pairs from the registry in
   * translate.ts are valid — an unregistered language fails validation instead of silently
   * doing nothing (this field was a dead free string until 5.1 wired it).
   */
  translateTo: TranslationTargetSchema.nullable().default(null),
  /** bilingual display: the translated track renders as a secondary line under each caption card */
  bilingual: z.boolean().default(false),
  /** editor elements (Slice 1d): video filter adjustments + timed text/shape overlays */
  videoAdjust: VideoAdjustSchema.default({
    brightness: 1, contrast: 1, saturation: 1,
    exposure: 1, highlights: 0, shadows: 0, temperature: 0, tint: 0,
  }),
  overlays: z.array(OverlayItemSchema).default([]),
  /** last export choice, per project (owner 2026-11-10): drives BOTH render paths; old projects get 1080p/30 */
  exportSettings: ExportSettingsSchema.default({ resolution: "1080p", fps: 30 }),
  /** Clipper projects only: the source-video range this project is a clip of; null = whole video */
  clipRange: ClipRangeSchema.nullable().default(null),
  /** output canvas: aspect reframe + background fill ("blur" or a CSS colour); defaults = source aspect, blur fill */
  canvas: CanvasSettingsSchema.default({ aspect: "source", background: "blur" }),
  /** Stage-B composition slice (video segments + markers + track state); empty = pre-Stage-B shape */
  composition: CompositionSettingsSchema.default({
    version: 1,
    videoSegments: [],
    markers: [],
    tracks: {
      video: { locked: false, visible: true, muted: false },
      captions: { locked: false, visible: true, muted: false },
      text: { locked: false, visible: true, muted: false },
      graphics: { locked: false, visible: true, muted: false },
    },
    audio: {
      tracks: [],
      clips: [],
      master: {
        volume: 1,
        videoVolume: 1,
        compressor: { enabled: false, thresholdDb: -18, ratio: 3, kneeDb: 12, attackMs: 10, releaseMs: 200 },
      },
      bleeps: [],
      noiseSuppressionAssetId: null,
    },
  }),
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
