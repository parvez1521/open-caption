import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Overlay-only compositions (Motion Studio standalone export, Wave 3): CaptionedVideo with
// NO video (src null, no segments, an empty caption doc) and ONE social overlay over a solid
// `backdrop`. This is the render-level proof that the composition handles empty segments:
// no video element is emitted, the backdrop paints the solid colour, and the overlay still
// renders in its own full-duration Sequence. The companion alpha path (mode "overlay") is
// pinned too: overlays render there as well — only the video/backdrop are burn-only.
// Same stand-in harness as segments.test.tsx (Sequence windows as data attributes, fonts ready).

vi.mock("remotion", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    Img: (props: Record<string, unknown>) => React.createElement("img", props),
    useVideoConfig: () => ({ fps: 30, width: 1080, height: 1920, durationInFrames: 120 }),
    useCurrentFrame: () => 0,
    useRemotionEnvironment: () => ({ isClientSideRendering: true, isRendering: false, isStudio: false, isPlayer: false }),
    Sequence: (props: { from?: number; durationInFrames?: number; children?: React.ReactNode }) =>
      React.createElement("div", { "data-sequence-from": props.from, "data-sequence-duration": props.durationInFrames }, props.children),
    OffthreadVideo: (props: Record<string, unknown>) =>
      React.createElement("video", { src: props.src as string, "data-engine": "offthread" }),
  };
});
vi.mock("@remotion/media", () => ({
  Video: (props: Record<string, unknown>) => React.createElement("video", { src: props.src as string, "data-engine": "media" }),
}));
vi.mock("@remotion/transitions", () => {
  const Series = (props: { children?: React.ReactNode }) => React.createElement("div", { "data-transition-series": "true" }, props.children);
  const SequenceMock = (props: { durationInFrames?: number; children?: React.ReactNode }) =>
    React.createElement("div", { "data-ts-duration": props.durationInFrames }, props.children);
  const TransitionMock = () => React.createElement("div", { "data-ts-transition": "true" });
  return {
    TransitionSeries: Object.assign(Series, { Sequence: SequenceMock, Transition: TransitionMock, Overlay: () => null }),
    linearTiming: ({ durationInFrames }: { durationInFrames: number }) => ({
      getDurationInFrames: () => durationInFrames,
      getProgress: () => 0,
    }),
  };
});
vi.mock("@remotion/transitions/fade", () => ({ fade: () => ({ component: () => null, props: { kind: "fade" } }) }));
vi.mock("@remotion/transitions/slide", () => ({
  slide: (props: Record<string, unknown> = {}) => ({ component: () => null, props: { kind: "slide", ...props } }),
}));
vi.mock("@remotion/transitions/wipe", () => ({ wipe: () => ({ component: () => null, props: { kind: "wipe" } }) }));
vi.mock("@capseasy/templates", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    useFontsReady: () => ({ ready: true, epoch: 0 }),
    PageView: () => React.createElement("div", { "data-caption-page": "true" }),
  };
});

import { ProjectSettingsSchema, type OverlayItem } from "@capseasy/shared";
import { CaptionedVideo } from "./CaptionedVideo";
import { calculateMetadata } from "./Root";
import { CaptionedVideoProps } from "./props";

const ITEM: OverlayItem = {
  id: "ov-standalone",
  kind: "social",
  variant: "subscribe-pill",
  text: "Subscribe\nSubscribed",
  startMs: 0,
  endMs: 4000,
  x: 0.5,
  y: 0.5,
  scale: 1.419,
  rotation: 0,
  color: "#FF4D2E",
};
const settings = () => ProjectSettingsSchema.parse({ overlays: [ITEM] });
const sequenceWindows = (html: string) =>
  [...html.matchAll(/data-sequence-from="(\d+)" data-sequence-duration="(\d+)"/g)].map((m) => ({ from: Number(m[1]), durationInFrames: Number(m[2]) }));

describe("CaptionedVideo overlay-only (no video, no segments, empty doc)", () => {
  it("paints the solid backdrop, emits no video element, and renders the overlay for its full window", () => {
    const html = renderToStaticMarkup(
      <CaptionedVideo src={null} backdrop="#00FF00" doc={{ version: 2, words: [] }} settings={settings()} overlays={[ITEM]} videoEngine="media" />,
    );
    expect(html.match(/<video[^>]*>/g) ?? []).toHaveLength(0);
    expect(html).toContain("#00FF00"); // the backdrop AbsoluteFill's background
    expect(html).not.toContain("data-caption-page"); // empty doc -> no caption pages
    // the overlay's Sequence spans the whole item: 4000 ms at the mocked 30 fps = 120 frames from 0
    expect(sequenceWindows(html)).toEqual([{ from: 0, durationInFrames: 120 }]);
    expect(html).toContain("Subscribe"); // the social graphic itself drew
  });

  it("mode 'overlay' (the companion alpha path) renders the same overlay with no backdrop and no video", () => {
    const html = renderToStaticMarkup(
      <CaptionedVideo src={null} mode="overlay" doc={{ version: 2, words: [] }} settings={settings()} overlays={[ITEM]} />,
    );
    expect(html.match(/<video[^>]*>/g) ?? []).toHaveLength(0);
    expect(html).not.toContain("#00FF00");
    expect(sequenceWindows(html)).toEqual([{ from: 0, durationInFrames: 120 }]);
    expect(html).toContain("Subscribe");
  });

  it("calculateMetadata: duration comes from the media meta (the animation's length), frames scale with output fps", async () => {
    const meta = async (input: Record<string, unknown>) => {
      const props = CaptionedVideoProps.parse(input);
      return calculateMetadata({
        props,
        defaultProps: props,
        compositionId: "CaptionedVideo",
        abortSignal: new AbortController().signal,
        isRendering: false,
      } as Parameters<typeof calculateMetadata>[0]);
    };
    const base = { src: null, media: { width: 1080, height: 1920, fps: 30, durationMs: 4000, rotation: 0 }, doc: { version: 2, words: [] } };
    const at30 = await meta(base);
    expect(at30).toMatchObject({ width: 1080, height: 1920, fps: 30, durationInFrames: 120 });
    const at60 = await meta({ ...base, outputFps: 60 });
    expect(at60).toMatchObject({ fps: 60, durationInFrames: 240 });
  });
});
