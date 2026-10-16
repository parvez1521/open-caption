/**
 * `captionseasy/remotion`: the CaptionsEasy caption composition as React components for your own Remotion project
 * (the same code the CaptionsEasy studio previews and exports). Feed it the props from buildCaptions().
 *
 *   <CaptionedVideo src={videoUrl} media={{ width, height, fps, durationMs }} {...props} />   captions over a video
 *   <CaptionsOverlay media={{ width, height, fps, durationMs }} {...props} />                transparent captions only
 *
 * react and remotion are peer dependencies (your copies are used). Fonts load from Google Fonts at render time.
 */
import React from "react";
import { CaptionedVideo } from "@capseasy/compositions/src/CaptionedVideo";
import type { CaptionedVideoInput } from "@capseasy/compositions/src/props";

export { CaptionedVideo };
export { calculateMetadata, Root as CaptionsEasyCompositions } from "@capseasy/compositions/src/Root";
export { CaptionedVideoProps, MediaMetaSchema } from "@capseasy/compositions/src/props";

/** Captions only on a transparent background: put it on a track above your video. */
export const CaptionsOverlay: React.FC<Omit<CaptionedVideoInput, "mode" | "src">> = (props) => React.createElement(CaptionedVideo, { ...props, src: null, mode: "overlay" });
