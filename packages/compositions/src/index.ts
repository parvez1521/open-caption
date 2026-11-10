export { CaptionedVideo, prepareDoc, computePages } from "./CaptionedVideo";
export { Root, calculateMetadata } from "./Root";
export { CaptionedVideoProps, MediaMetaSchema } from "./props";
export type { CaptionedVideoInput } from "./props";
export { buildVideoFilter, compositionDurationMs, overlayFrames, overlayTrackKind, overlayVisibleAt, resolveCanvasSettings, resolveOverlays, resolveTrackState, resolveVideoAdjust, resolveVideoSegments, segmentPlaybackRate, segmentTimelineDurationMs, segmentTransformStyle, videoSegmentFrames, videoTransitionLayout, withRawSegmentExtensions } from "./overlayMath";
export type { CanvasSettings, RenderVideoSegment, SegmentTransform, SegmentTransition } from "./overlayMath";
export { BlurPresentation, blurPresentation, ZoomPresentation, zoomPresentation } from "./transitions";
export { OVERLAY_SHAPE_META, OverlayShapeSvg, OverlayView, SHAPE_BASE_PX, TEXT_DEFAULT_FONT_PX } from "./overlays";
export { SOCIAL_META, SocialOverlayView, overlayPhase, bellRingDeg, counterAt, chatStackAt, orbitAngle, searchBarAt, socialSeededUnit, shade } from "./social";
