// Typings for `captionseasy/remotion` (copied to dist/remotion.d.ts at build time).
import type { FC } from "react";
import type { CalculateMetadataFunction } from "remotion";
import type { CaptionsProps } from "./types.js";

export interface MediaMeta {
  width?: number;
  height?: number;
  fps?: number;
  /** length of the video; when 0 the captions' own length is used */
  durationMs?: number;
  rotation?: number;
}

/** Input of the CaptionedVideo composition. `doc`, `style` and `settings` come from buildCaptions(). */
export interface CaptionedVideoInput {
  /** video URL (staticFile(), http...). null renders captions only */
  src?: string | null;
  media?: MediaMeta;
  doc?: CaptionsProps["doc"];
  style?: CaptionsProps["style"];
  settings?: CaptionsProps["settings"];
  /** "burn" (default): over the video. "overlay": transparent captions only */
  mode?: "burn" | "overlay";
  /** CSS background when there is no video in burn mode */
  backdrop?: string | null;
  /** "offthread" (default). "media" is accepted and falls back to OffthreadVideo in this package */
  videoEngine?: "offthread" | "media";
}

/** The captions (and optionally the video under them). Size/fps/duration come from your <Composition>. */
export declare const CaptionedVideo: FC<CaptionedVideoInput>;
/** Captions only, transparent background. */
export declare const CaptionsOverlay: FC<Omit<CaptionedVideoInput, "mode" | "src">>;
/** Duration/size/fps from `media` (or the last word) for a <Composition calculateMetadata={...}>. */
export declare const calculateMetadata: CalculateMetadataFunction<Record<string, unknown>>;
/** Registers two compositions, "CaptionedVideo" and "CaptionsOverlay" (use it as a Remotion root or inside yours). */
export declare const CaptionsEasyCompositions: FC;
/** zod schema of CaptionedVideoInput (bundled zod v3), usable as a <Composition schema>. */
export declare const CaptionedVideoProps: unknown;
export declare const MediaMetaSchema: unknown;
