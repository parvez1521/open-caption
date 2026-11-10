import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Render-level harness for CaptionedVideo's video layer. The real Remotion primitives need a
// composition context (absent in a static-markup render), so the context-bound pieces are stood
// in with plain elements that expose exactly what this test asserts: Sequence windows as data
// attributes, and the video elements as <video> tags carrying their trim / mute props. Font
// loading is stood in as ready so caption pages compute; PageView is a marker — page CONTENT is
// the templates package's own test surface, what matters here is whether pages render at all.
vi.mock("remotion", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    Img: (props: Record<string, unknown>) => React.createElement("img", props),
    useVideoConfig: () => ({ fps: 30, width: 1080, height: 1920, durationInFrames: 300 }),
    useCurrentFrame: () => 0,
    useRemotionEnvironment: () => ({ isClientSideRendering: true, isRendering: false, isStudio: false, isPlayer: false }),
    Sequence: (props: { from?: number; durationInFrames?: number; children?: React.ReactNode }) =>
      React.createElement("div", { "data-sequence-from": props.from, "data-sequence-duration": props.durationInFrames }, props.children),
    OffthreadVideo: (props: Record<string, unknown>) =>
      React.createElement("video", {
        src: props.src as string,
        "data-engine": "offthread",
        ...(props.trimBefore !== undefined ? { "data-trim-before": props.trimBefore } : {}),
        ...(props.trimAfter !== undefined ? { "data-trim-after": props.trimAfter } : {}),
        ...(props.muted ? { "data-muted": "true" } : {}),
      }),
  };
});
vi.mock("@remotion/media", () => ({
  Video: (props: Record<string, unknown>) =>
    React.createElement("video", {
      src: props.src as string,
      "data-engine": "media",
      "data-on-video-frame": typeof props.onVideoFrame === "function" ? "fn" : "none",
      ...(props.trimBefore !== undefined ? { "data-trim-before": props.trimBefore } : {}),
      ...(props.trimAfter !== undefined ? { "data-trim-after": props.trimAfter } : {}),
      ...(props.muted ? { "data-muted": "true" } : {}),
    }),
}));
vi.mock("@capseasy/templates", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    useFontsReady: () => ({ ready: true, epoch: 0 }),
    PageView: () => React.createElement("div", { "data-caption-page": "true" }),
  };
});

import { ProjectSettingsSchema } from "@capseasy/shared";
import { CaptionedVideo } from "./CaptionedVideo";

const SEGMENTS = [
  { id: "seg-1", sourceInMs: 2000, sourceOutMs: 3040 },
  { id: "seg-2", sourceInMs: 3040, sourceOutMs: 4080 },
];
// The Stage-B invariant: the segments' span IS the clipRange span (2000..4080, 2080ms).
const segmentedSettings = (extra: Record<string, unknown> = {}) =>
  ProjectSettingsSchema.parse({
    clipRange: { startMs: 2000, endMs: 4080 },
    composition: { videoSegments: SEGMENTS, ...extra },
  });

const videoTags = (html: string) => html.match(/<video[^>]*>/g) ?? [];
const sequenceWindows = (html: string) =>
  [...html.matchAll(/data-sequence-from="(\d+)" data-sequence-duration="(\d+)"/g)].map((m) => ({ from: Number(m[1]), durationInFrames: Number(m[2]) }));

const DOC = { version: 2 as const, words: [{ id: "w1", text: "hello", startMs: 0, endMs: 1000, confidence: 1 }] };

describe("CaptionedVideo segment chain (render level, static markup)", () => {
  it("renders >=2 segments as a chain: one video element per segment inside tiling Sequences, each with its own source trim", () => {
    const html = renderToStaticMarkup(<CaptionedVideo src="video.mp4" settings={segmentedSettings()} />);
    const videos = videoTags(html);
    expect(videos).toHaveLength(2);
    expect(videos[0]).toContain('data-trim-before="60"');
    expect(videos[0]).toContain('data-trim-after="91"');
    expect(videos[1]).toContain('data-trim-before="91"');
    expect(videos[1]).toContain('data-trim-after="122"');
    // segment windows tile the composition at the mocked 30fps (1040ms per segment)
    expect(sequenceWindows(html)).toEqual([
      { from: 0, durationInFrames: 31 },
      { from: 31, durationInFrames: 31 },
    ]);
    // unmuted by default: no mute marker anywhere
    expect(html).not.toContain("data-muted");
  });

  it("keeps the @remotion/media onVideoFrame handler on every segment's element", () => {
    const html = renderToStaticMarkup(<CaptionedVideo src="video.mp4" videoEngine="media" settings={segmentedSettings()} />);
    const videos = videoTags(html);
    expect(videos).toHaveLength(2);
    for (const v of videos) {
      expect(v).toContain('data-engine="media"');
      expect(v).toContain('data-on-video-frame="fn"');
    }
  });

  it("mutes every segment element when the video track is muted, on both engines", () => {
    const settings = segmentedSettings({ tracks: { video: { muted: true } } });
    for (const videoEngine of ["offthread", "media"] as const) {
      const html = renderToStaticMarkup(<CaptionedVideo src="video.mp4" videoEngine={videoEngine} settings={settings} />);
      const videos = videoTags(html);
      expect(videos).toHaveLength(2);
      for (const v of videos) expect(v).toContain('data-muted="true"');
    }
  });

  it("a single stored segment renders EXACTLY the single-layer path (clipRange trim, no Sequence)", () => {
    const settings = ProjectSettingsSchema.parse({
      clipRange: { startMs: 2000, endMs: 4080 },
      composition: { videoSegments: [SEGMENTS[0]] },
    });
    const html = renderToStaticMarkup(<CaptionedVideo src="video.mp4" settings={settings} />);
    const videos = videoTags(html);
    expect(videos).toHaveLength(1);
    expect(videos[0]).toContain('data-trim-before="60"');
    expect(videos[0]).toContain('data-trim-after="122"');
    expect(sequenceWindows(html)).toEqual([]);
  });

  it("no segments at all renders the single-layer path with no trim props (untouched project)", () => {
    const html = renderToStaticMarkup(<CaptionedVideo src="video.mp4" settings={ProjectSettingsSchema.parse({})} />);
    const videos = videoTags(html);
    expect(videos).toHaveLength(1);
    expect(videos[0]).not.toContain("data-trim");
    expect(html).not.toContain("data-muted");
  });

  it("mutes the single-layer element when the video track is muted", () => {
    const settings = ProjectSettingsSchema.parse({ composition: { tracks: { video: { muted: true } } } });
    const html = renderToStaticMarkup(<CaptionedVideo src="video.mp4" settings={settings} />);
    expect(videoTags(html)[0]).toContain('data-muted="true"');
  });

  it("renders NO video layer at all when the video track is hidden (single-layer and segment chain), captions unaffected", () => {
    const hiddenSingle = renderToStaticMarkup(
      <CaptionedVideo src="video.mp4" doc={DOC} settings={ProjectSettingsSchema.parse({ composition: { tracks: { video: { visible: false } } } })} />,
    );
    expect(videoTags(hiddenSingle)).toHaveLength(0);
    expect(hiddenSingle).toContain("data-caption-page");

    const hiddenChain = renderToStaticMarkup(
      <CaptionedVideo src="video.mp4" doc={DOC} settings={segmentedSettings({ tracks: { video: { visible: false } } })} />,
    );
    expect(videoTags(hiddenChain)).toHaveLength(0);
    // the only Sequence left is the caption page's — both segment windows are gone
    expect(sequenceWindows(hiddenChain)).toHaveLength(1);
    expect(hiddenChain).toContain("data-caption-page");
  });

  it("video visible by default: the single-layer and chain renders are unchanged", () => {
    const single = renderToStaticMarkup(<CaptionedVideo src="video.mp4" settings={ProjectSettingsSchema.parse({})} />);
    expect(videoTags(single)).toHaveLength(1);
    const chain = renderToStaticMarkup(<CaptionedVideo src="video.mp4" settings={segmentedSettings()} />);
    expect(videoTags(chain)).toHaveLength(2);
  });

  it("renders caption pages when the captions track is visible, and none when it is hidden", () => {
    const visible = renderToStaticMarkup(<CaptionedVideo src="video.mp4" doc={DOC} settings={segmentedSettings()} />);
    expect(visible).toContain("data-caption-page");
    const hidden = renderToStaticMarkup(
      <CaptionedVideo src="video.mp4" doc={DOC} settings={segmentedSettings({ tracks: { captions: { visible: false } } })} />,
    );
    expect(hidden).not.toContain("data-caption-page");
    // the video chain itself is unaffected by the captions track
    expect(videoTags(hidden)).toHaveLength(2);
  });
});
