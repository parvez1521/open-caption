import React, { useMemo } from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, useCurrentFrame, useRemotionEnvironment, useVideoConfig } from "remotion";
import { Video as MediaVideo } from "@remotion/media";
import { CaptionDocSchema, type CaptionStyleV2, OverlayItemSchema, ProjectSettingsSchema, VideoAdjustSchema, type CaptionDoc, type Page, type ProjectSettings } from "@capseasy/shared";
import { applyFillerFilter, applyProfanity, derivePages } from "@motion-ai/caption-engine/core";
import { EMOJI_FONT, PageView, VideoFrameBus, VideoFrameContext, famCss, getTemplate, layoutBox, measure, resolveStyle, scaleOf, useFontsReady, wordGapEm, wordGapPx, type Canvas } from "@capseasy/templates";
import type { CaptionedVideoInput } from "./props";
import { buildVideoFilter, overlayFrames, resolveClipRange, resolveOverlays, resolveTrackState, resolveVideoAdjust, resolveVideoSegments, videoSegmentFrames, videoTrimFrames } from "./overlayMath";
import { OverlayView } from "./overlays";

/** Doc -> what the audience should see (filters are display-time, so the stored doc is never mutated). */
export function prepareDoc(doc: CaptionDoc, settings: ProjectSettings): CaptionDoc {
  let d = doc;
  if (settings.removeFillers) d = applyFillerFilter(d, settings.fillerList.length ? settings.fillerList : undefined, true);
  if (settings.profanity !== "off") d = applyProfanity(d, settings.profanity);
  return d;
}

/**
 * doc + settings + style -> pages, using real font metrics. The render, the Player AND the editor's caption
 * list all call this, so what is listed is exactly what is shown. Call only after fonts have loaded.
 */
export function computePages(doc: CaptionDoc, settings: ProjectSettings, style: CaptionStyleV2, canvas: Canvas): Page[] {
  const sc = scaleOf(canvas);
  const box = layoutBox(style, canvas);
  const spec = { fontFamily: famCss(style.fontId), fontWeight: style.fontWeight, fontStyle: style.fontStyle, letterSpacing: style.letterSpacing * sc };
  const size = style.fontSize * sc;
  const at = { ...spec, fontSize: size };
  // words render as separate boxes with an explicit gap (see wordGapCss), not a space glyph: measure the same way
  const space = Math.max(0, measure("a a", at) - measure("aa", at));
  const gap = wordGapEm(style) * size + wordGapPx(style, sc);
  return derivePages(prepareDoc(doc, settings), settings, {
    measure: (text) => measure(text, at) + (text.split(" ").length - 1) * (gap - space),
    maxLineWidth: box.width,
  });
}

/** One overlay inside its Sequence: local time comes from the frame (never a wall clock), so animated
 *  social overlays phase identically in the Player, the browser export and the server render. */
const OverlaySequenceInner: React.FC<{ item: import("@capseasy/shared").OverlayItem; sc: number; assetSrc?: string }> = ({ item, sc, assetSrc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return <OverlayView item={item} sc={sc} assetSrc={assetSrc} localMs={(frame / fps) * 1000} />;
};

const PageSequence: React.FC<{ page: Page; fromFrame: number; canvas: Canvas; style: CaptionStyleV2 }> = ({ page, fromFrame, canvas, style }) => {
  const frame = useCurrentFrame();
  // absolute media time, derived from frames only (never a wall clock)
  const timeMs = ((fromFrame + frame) / canvas.fps) * 1000;
  const pageStyle = page.styleOverride ? resolveStyle(style, page.styleOverride) : style;
  return <PageView page={page} timeMs={timeMs} style={pageStyle} canvas={canvas} measure={measure} />;
};

/**
 * Remotion does NOT run inputProps through the zod schema at render time, and the Player passes props
 * verbatim, so every surface must normalize here. Partial settings/styles are completed with defaults.
 */
export const CaptionedVideo: React.FC<CaptionedVideoInput> = ({ src = null, doc: docIn, style: styleIn, settings: settingsIn, mode = "burn", backdrop = null, videoEngine = "offthread", videoAdjust: videoAdjustIn, overlays: overlaysIn, overlayAssets }) => {
  const doc = useMemo(() => CaptionDocSchema.parse(docIn ?? { version: 2, words: [] }), [docIn]);
  const settings = useMemo(() => ProjectSettingsSchema.parse(settingsIn ?? {}), [settingsIn]);
  const style = styleIn ?? {};
  const { fps, width, height } = useVideoConfig();
  const canvas = useMemo<Canvas>(() => ({ width, height, fps }), [width, height, fps]);
  const resolved = useMemo(() => resolveStyle(style as Partial<CaptionStyleV2>), [style]);

  // editor elements: explicit props win, settings are the fallback (see overlayMath) — same picture everywhere.
  // Like doc/settings above, incoming props are normalized through the schemas first (the Player passes
  // props verbatim); an invalid top-level value falls back to the settings copy instead of breaking the render.
  const parsedAdjust = useMemo(() => (videoAdjustIn ? VideoAdjustSchema.safeParse(videoAdjustIn) : null), [videoAdjustIn]);
  const parsedOverlays = useMemo(() => (overlaysIn ? OverlayItemSchema.array().safeParse(overlaysIn) : null), [overlaysIn]);
  const videoAdjust = useMemo(
    () => resolveVideoAdjust({ videoAdjust: parsedAdjust?.success ? parsedAdjust.data : undefined, settings }),
    [parsedAdjust, settings],
  );
  const videoFilter = useMemo(() => buildVideoFilter(videoAdjust), [videoAdjust]);
  const overlays = useMemo(
    () => resolveOverlays({ overlays: parsedOverlays?.success ? parsedOverlays.data : undefined, settings }),
    [parsedOverlays, settings],
  );
  // Clipper projects: the video layer is trimmed to the project's clip range (both engines take
  // trimBefore/trimAfter as source frames), so preview, browser export and server render all show
  // ONLY the segment — the caption doc is already shifted to segment time, everything lines up at 0.
  const clipTrim = useMemo(() => videoTrimFrames(resolveClipRange({ settings }), fps), [settings, fps]);
  // Stage-B segmentation (Phase 4): >=2 stored segments render as a segment chain; null / a single
  // segment keeps EXACTLY today's single-layer path, so untouched projects are pixel-identical.
  // By the Stage-B invariant the segments' span equals the clipRange span, so the chain needs no
  // additional offset and the composition duration (Root.tsx) is unchanged.
  const videoSegments = useMemo(() => resolveVideoSegments({ settings }), [settings]);
  const segmentFrames = useMemo(
    () => (videoSegments && videoSegments.length >= 2 ? videoSegmentFrames(videoSegments, fps) : null),
    [videoSegments, fps],
  );
  // Track state (Stage B): video mute silences the video element(s); a hidden captions track
  // renders no caption pages at all. Both default to neutral, so legacy projects are unaffected.
  const videoMuted = useMemo(() => resolveTrackState({ settings }, "video").muted, [settings]);
  const videoVisible = useMemo(() => resolveTrackState({ settings }, "video").visible, [settings]);
  const captionsVisible = useMemo(() => resolveTrackState({ settings }, "captions").visible, [settings]);
  // Both engines accept a boolean `muted` prop (remotion OffthreadVideo OptionalOffthreadVideoProps.muted
  // and @remotion/media Video OptionalVideoProps.muted in the installed 4.0.484 types). It is only
  // spread in when actually muted, so an unmuted render carries no extra prop at all.
  const muteProps = videoMuted ? { muted: true as const } : {};
  const hasTextOverlay = overlays.some((o) => o.kind === "text" || o.kind === "social");

  const fontFamilies = useMemo(() => [resolved.fontId, resolved.hero.fontId ?? "", ...getTemplate(resolved.templateId).fonts, resolved.emoji.enabled ? EMOJI_FONT : "", hasTextOverlay ? "Plus Jakarta Sans" : ""], [resolved, hasTextOverlay]);
  // fontsEpoch bumps when a NEW family set finishes loading on a live component (a template switch in
  // the studio): pages recompute with the real metrics then, without ever blanking in between
  const { ready: fontsReady, epoch: fontsEpoch } = useFontsReady(fontFamilies);

  const pages = useMemo(() => (fontsReady ? computePages(doc, settings, resolved, canvas) : []), [fontsReady, fontsEpoch, doc, settings, resolved, canvas]);

  // The in-browser exporter redraws the DOM on a canvas and ignores mix-blend-mode, so a look that blends with the
  // picture (the difference look) composites it itself from the video layer's frames (see templates videoFrame.ts).
  // Only there: the Player and the server renderer blend natively.
  const { isClientSideRendering } = useRemotionEnvironment();
  const frameBus = useMemo(() => (isClientSideRendering && mode === "burn" && src ? new VideoFrameBus() : null), [isClientSideRendering, mode, src]);

  return (
    <AbsoluteFill>
      {mode === "burn" && src && videoVisible ? (
        <AbsoluteFill style={{ backgroundColor: "black", ...(videoFilter ? { filter: videoFilter } : {}) }}>
          {segmentFrames && videoSegments ? (
            // Segment chain: one Sequence per segment, tiling the composition exactly (see
            // videoSegmentFrames). The CSS-filter wrapper stays single and wraps the whole chain —
            // the filter is uniform across segments. Each segment's element carries that segment's
            // source trim, and the media engine keeps reporting frames to the frame bus per segment.
            segmentFrames.map((win, i) => (
              <Sequence key={videoSegments[i].id} from={win.from} durationInFrames={win.durationInFrames} layout="none">
                {videoEngine === "media" ? (
                  <MediaVideo src={src} objectFit="contain" style={{ width: "100%", height: "100%" }} onVideoFrame={frameBus?.emit} trimBefore={win.trimBefore} trimAfter={win.trimAfter} {...muteProps} />
                ) : (
                  <OffthreadVideo src={src} style={{ width: "100%", height: "100%", objectFit: "contain" }} trimBefore={win.trimBefore} trimAfter={win.trimAfter} {...muteProps} />
                )}
              </Sequence>
            ))
          ) : videoEngine === "media" ? (
            <MediaVideo src={src} objectFit="contain" style={{ width: "100%", height: "100%" }} onVideoFrame={frameBus?.emit} {...(clipTrim ?? {})} {...muteProps} />
          ) : (
            <OffthreadVideo src={src} style={{ width: "100%", height: "100%", objectFit: "contain" }} {...(clipTrim ?? {})} {...muteProps} />
          )}
        </AbsoluteFill>
      ) : mode === "burn" && !src && backdrop ? (
        <AbsoluteFill style={{ background: backdrop }} />
      ) : null}
      {/* overlays sit above the video, below the captions — timed Sequences, same in preview and export */}
      {overlays.map((item) => {
        const { from, durationInFrames } = overlayFrames(item, fps);
        return (
          <Sequence key={item.id} from={from} durationInFrames={durationInFrames} layout="none">
            <OverlaySequenceInner item={item} sc={scaleOf(canvas)} assetSrc={item.assetId ? overlayAssets?.[item.assetId] : undefined} />
          </Sequence>
        );
      })}
      <VideoFrameContext.Provider value={frameBus}>
        {(captionsVisible ? pages : []).map((page) => {
          const from = Math.floor((page.startMs / 1000) * fps);
          const duration = Math.max(1, Math.ceil(((page.endMs - page.startMs) / 1000) * fps));
          return (
            <Sequence key={page.id} from={from} durationInFrames={duration} layout="none">
              <PageSequence page={page} fromFrame={from} canvas={canvas} style={resolved} />
            </Sequence>
          );
        })}
      </VideoFrameContext.Provider>
    </AbsoluteFill>
  );
};
