import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { framesForDurationMs } from "@capseasy/shared";
import { CaptionedVideo } from "./CaptionedVideo";
import { CaptionedVideoProps } from "./props";

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Duration/size/fps come from the media itself, never from hardcoded constants — UNLESS the renderer
 * passed an export output override (outputWidth/outputHeight/outputFps, from the project's export
 * settings), in which case the composition is authored at the chosen export size and frame rate.
 * Duration stays the same number of MILLISECONDS either way; only the frame count scales with fps.
 */
export const calculateMetadata: CalculateMetadataFunction<CaptionedVideoProps> = ({ props: raw }) => {
  const props = CaptionedVideoProps.parse(raw);
  const fps = Math.max(1, Math.round(props.outputFps || props.media.fps || 30));
  const lastWordEnd = props.doc.words.reduce((m, w) => Math.max(m, w.endMs), 0);
  const durationMs = props.media.durationMs > 0 ? props.media.durationMs : lastWordEnd + 500;
  const base = {
    durationInFrames: framesForDurationMs(durationMs, fps),
    fps,
    width: even(props.outputWidth ?? props.media.width),
    height: even(props.outputHeight ?? props.media.height),
  };
  if (props.mode === "overlay") {
    return { ...base, defaultCodec: "prores" as const, defaultProResProfile: "4444" as const, defaultPixelFormat: "yuva444p10le" as const, defaultVideoImageFormat: "png" as const };
  }
  return { ...base, defaultCodec: "h264" as const, defaultPixelFormat: "yuv420p" as const };
};

export const Root: React.FC = () => (
  <>
    <Composition
      id="CaptionedVideo"
      component={CaptionedVideo as React.FC<Record<string, unknown>>}
      schema={CaptionedVideoProps}
      durationInFrames={90}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={CaptionedVideoProps.parse({})}
      calculateMetadata={calculateMetadata as unknown as CalculateMetadataFunction<Record<string, unknown>>}
    />
    <Composition
      id="CaptionsOverlay"
      component={CaptionedVideo as React.FC<Record<string, unknown>>}
      schema={CaptionedVideoProps}
      durationInFrames={90}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={CaptionedVideoProps.parse({ mode: "overlay" })}
      calculateMetadata={calculateMetadata as unknown as CalculateMetadataFunction<Record<string, unknown>>}
    />
  </>
);
