import React, { useMemo } from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, useCurrentFrame, useRemotionEnvironment, useVideoConfig } from "remotion";
import { Video as MediaVideo } from "@remotion/media";
import { TransitionSeries, linearTiming, type TransitionPresentation } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { CaptionDocSchema, type CaptionStyleV2, OverlayItemSchema, ProjectSettingsSchema, VideoAdjustSchema, type CaptionDoc, type Page, type ProjectSettings } from "@capseasy/shared";
import { applyFillerFilter, applyProfanity, derivePages } from "@motion-ai/caption-engine/core";
import { EMOJI_FONT, PageView, VideoFrameBus, VideoFrameContext, famCss, getTemplate, layoutBox, measure, resolveStyle, scaleOf, useFontsReady, wordGapEm, wordGapPx, type Canvas } from "@capseasy/templates";
import type { CaptionedVideoInput } from "./props";
import {
  buildVideoFilter,
  overlayFrames,
  resolveCanvasSettings,
  resolveClipRange,
  resolveOverlays,
  resolveTrackState,
  resolveVideoAdjust,
  resolveVideoSegments,
  segmentPlaybackRate,
  segmentTransformStyle,
  videoSegmentFrames,
  videoTransitionLayout,
  videoTrimFrames,
  withRawSegmentExtensions,
  type RenderVideoSegment,
  type SegmentTransitionType,
} from "./overlayMath";
import { OverlayView } from "./overlays";
import { blurPresentation, zoomPresentation } from "./transitions";

/** The installed @remotion/transitions 4.0.484 presentation for a stored transition type. */
function presentationFor(type: SegmentTransitionType): TransitionPresentation<Record<string, unknown>> {
  switch (type) {
    case "fade":
      return fade() as unknown as TransitionPresentation<Record<string, unknown>>;
    case "slide":
      return slide({ direction: "from-right" }) as unknown as TransitionPresentation<Record<string, unknown>>;
    case "wipe":
      return wipe() as unknown as TransitionPresentation<Record<string, unknown>>;
    case "zoom":
      return zoomPresentation();
    case "blur":
      return blurPresentation();
  }
}

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
export const CaptionedVideo: React.FC<CaptionedVideoInput> = ({ src = null, doc: docIn, style: styleIn, settings: settingsIn, mode = "burn", backdrop = null, videoEngine = "offthread", videoAdjust: videoAdjustIn, overlays: overlaysIn, overlayAssets, segmentAssets }) => {
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
  const videoSegments = useMemo(() => {
    const parsed = resolveVideoSegments({ settings });
    // Run-2 extension fields (rate / transform / transition / asset / still) are merged from the
    // RAW settings prop: a payload parsed through an older schema would otherwise lose them
    // (see withRawSegmentExtensions). On the current schema this merge is a no-op in effect.
    return parsed ? withRawSegmentExtensions(parsed, settingsIn) : null;
  }, [settings, settingsIn]);
  const segmentFrames = useMemo(
    () => (videoSegments && videoSegments.length >= 2 ? videoSegmentFrames(videoSegments, fps) : null),
    [videoSegments, fps],
  );
  // Transition chain layout, only when some segment at index >= 1 actually carries a
  // transitionIn; its frame identity (sequences − transitions = composition frames) is the
  // parity contract pinned in overlayMath.
  const transitionLayout = useMemo(
    () =>
      videoSegments && videoSegments.length >= 2 && videoSegments.some((s, i) => i >= 1 && (s.transitionIn?.durationMs ?? 0) > 0)
        ? videoTransitionLayout(videoSegments, fps)
        : null,
    [videoSegments, fps],
  );
  const hasTransitionChain = useMemo(
    () => (transitionLayout ? transitionLayout.transitions.some((t) => t.durationInFrames >= 1) : false),
    [transitionLayout],
  );
  // Canvas (Run 2): a non-"source" aspect paints a backdrop behind the contain-fit chain —
  // either a blurred cover copy of the same chain ("blur") or a flat CSS colour. "source"
  // keeps exactly today's black.
  const canvasSettings = useMemo(() => resolveCanvasSettings({ rawSettings: settingsIn, settings }), [settingsIn, settings]);
  const colourBackground = canvasSettings.aspect !== "source" && canvasSettings.background !== "blur" ? canvasSettings.background : null;
  const blurBackground = canvasSettings.aspect !== "source" && canvasSettings.background === "blur";
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

  /**
   * THE segment-element builder — every chain variant (plain Sequences, TransitionSeries, the
   * single-layer path and the blurred background chain) renders its media through here, so src
   * resolution, playbackRate, stills and transforms can never drift between variants.
   * `segment === null` is the legacy no-segmentation element (main src, rate 1, no transform).
   * The background variant is always muted, never reports to the frame bus, and paints a
   * blurred cover copy (the element-level style below); its trims/rates come from the caller
   * exactly like the main variant's.
   */
  const segmentElement = (
    segment: RenderVideoSegment | null,
    opts: { variant: "main" | "background"; trim?: { trimBefore: number; trimAfter: number } },
  ): React.ReactNode => {
    const background = opts.variant === "background";
    const segSrc = (segment?.assetId ? segmentAssets?.[segment.assetId] : undefined) ?? src;
    if (!segSrc) return null;
    const rate = segment ? segmentPlaybackRate(segment) : 1;
    // playbackRate exists on BOTH engines' installed 4.0.484 prop types (remotion
    // OptionalOffthreadVideoProps.playbackRate and @remotion/media Video's playbackRate);
    // it is only spread when !== 1, so rate-1 projects carry no extra prop at all.
    const rateProps = rate !== 1 ? { playbackRate: rate } : {};
    const segMuteProps = background ? { muted: true as const } : muteProps;
    const fillStyle: React.CSSProperties = background
      ? { width: "100%", height: "100%", objectFit: "cover", filter: "blur(48px) saturate(1.2)", transform: "scale(1.15)" }
      : { width: "100%", height: "100%", objectFit: "contain" };
    let element: React.ReactNode;
    if (segment?.still) {
      // Still segment: a Remotion Img for the segment's pseudo-span — no trims, no rate.
      element = <Img src={segSrc} style={fillStyle} />;
    } else if (videoEngine === "media") {
      element = (
        <MediaVideo
          src={segSrc}
          objectFit={background ? "cover" : "contain"}
          style={fillStyle}
          {...(background ? {} : { onVideoFrame: frameBus?.emit })}
          {...(opts.trim ?? {})}
          {...segMuteProps}
          {...rateProps}
        />
      );
    } else {
      element = <OffthreadVideo src={segSrc} style={fillStyle} {...(opts.trim ?? {})} {...segMuteProps} {...rateProps} />;
    }
    const tStyle = segment ? segmentTransformStyle(segment) : null;
    if (!tStyle) return element;
    return (
      <AbsoluteFill style={tStyle.wrapper}>
        <div style={tStyle.inner}>{element}</div>
      </AbsoluteFill>
    );
  };

  /** One full video chain (main or background variant) for the current segmentation state. */
  const renderChain = (variant: "main" | "background"): React.ReactNode => {
    if (videoSegments && videoSegments.length >= 2) {
      if (hasTransitionChain && transitionLayout) {
        // Transition chain: TransitionSeries sequences use the transition layout (NOT the
        // plain segmentFrames windows — the two layouts differ by design, see overlayMath);
        // each segment element still carries its own source trim from videoSegmentFrames.
        const children: React.ReactNode[] = [];
        videoSegments.forEach((segment, i) => {
          if (i >= 1) {
            const tFrames = transitionLayout.transitions[i - 1].durationInFrames;
            const transitionIn = segment.transitionIn;
            if (tFrames >= 1 && transitionIn) {
              children.push(
                <TransitionSeries.Transition
                  key={`t-${segment.id}`}
                  presentation={presentationFor(transitionIn.type)}
                  timing={linearTiming({ durationInFrames: tFrames })}
                />,
              );
            }
          }
          const win = segmentFrames![i];
          children.push(
            <TransitionSeries.Sequence key={segment.id} durationInFrames={transitionLayout.sequences[i].durationInFrames}>
              {segmentElement(segment, { variant, trim: { trimBefore: win.trimBefore, trimAfter: win.trimAfter } })}
            </TransitionSeries.Sequence>,
          );
        });
        return <TransitionSeries>{children}</TransitionSeries>;
      }
      // Plain segment chain: one Sequence per segment, tiling the composition exactly (see
      // videoSegmentFrames). Each segment's element carries that segment's source trim, and
      // the media engine keeps reporting frames to the frame bus per segment.
      return segmentFrames!.map((win, i) => (
        <Sequence key={videoSegments[i].id} from={win.from} durationInFrames={win.durationInFrames} layout="none">
          {segmentElement(videoSegments[i], { variant, trim: { trimBefore: win.trimBefore, trimAfter: win.trimAfter } })}
        </Sequence>
      ));
    }
    if (videoSegments && videoSegments.length === 1) {
      // Exactly one stored segment: the single-layer path (clipRange trims, as today) PLUS
      // that segment's own rate / transform / asset / still, which today were ignored here.
      const only = videoSegments[0];
      return segmentElement(only, { variant, trim: only.still ? undefined : clipTrim });
    }
    return segmentElement(null, { variant, trim: clipTrim });
  };

  return (
    <AbsoluteFill {...(colourBackground ? { style: { backgroundColor: colourBackground } } : {})}>
      {mode === "burn" && src && videoVisible ? (
        <>
          {/* Blurred-cover backdrop chain, BEHIND the main chain: the same builder and the
              same trims/rates/transitions, painted cover + blur. The main chain's wrapper is
              transparent in this mode so the backdrop shows around the contain-fit picture. */}
          {blurBackground ? <AbsoluteFill>{renderChain("background")}</AbsoluteFill> : null}
          <AbsoluteFill
            style={{
              ...(colourBackground ? { backgroundColor: colourBackground } : blurBackground ? {} : { backgroundColor: "black" }),
              ...(videoFilter ? { filter: videoFilter } : {}),
            }}
          >
            {renderChain("main")}
          </AbsoluteFill>
        </>
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
