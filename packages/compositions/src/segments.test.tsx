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
        ...(props.playbackRate !== undefined ? { "data-playback-rate": props.playbackRate } : {}),
        ...((props.style as { filter?: string } | undefined)?.filter ? { "data-style-filter": (props.style as { filter?: string }).filter } : {}),
        ...((props.style as { transform?: string } | undefined)?.transform ? { "data-style-transform": (props.style as { transform?: string }).transform } : {}),
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
      ...(props.playbackRate !== undefined ? { "data-playback-rate": props.playbackRate } : {}),
      ...(props.objectFit ? { "data-object-fit": props.objectFit } : {}),
      ...((props.style as { filter?: string } | undefined)?.filter ? { "data-style-filter": (props.style as { filter?: string }).filter } : {}),
      ...((props.style as { transform?: string } | undefined)?.transform ? { "data-style-transform": (props.style as { transform?: string }).transform } : {}),
    }),
}));
// TransitionSeries stand-ins: Sequences expose their duration/offset, Transitions expose the
// timing's frame count (via the mocked linearTiming) and the presentation kind, so the chain
// STRUCTURE is assertable without a composition context.
vi.mock("@remotion/transitions", () => {
  const Series = (props: { children?: React.ReactNode }) => React.createElement("div", { "data-transition-series": "true" }, props.children);
  const SequenceMock = (props: { durationInFrames?: number; offset?: number; children?: React.ReactNode }) =>
    React.createElement("div", { "data-ts-duration": props.durationInFrames, "data-ts-offset": props.offset ?? 0 }, props.children);
  const TransitionMock = (props: { timing: { getDurationInFrames: (o: { fps: number }) => number }; presentation?: { props?: Record<string, unknown> } }) =>
    React.createElement("div", {
      "data-ts-transition-duration": props.timing.getDurationInFrames({ fps: 30 }),
      "data-ts-presentation": (props.presentation?.props?.kind as string) ?? "custom",
    });
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

describe("CaptionedVideo Run-2 segment features (render level, static markup)", () => {
  // Settings with Run-2 extension fields. NOTE (local shim): the current shared zod schema does
  // not know these fields yet and strips them when the settings object is built — so the fields
  // are assigned onto the parsed object afterwards; CaptionedVideo merges them back from the
  // raw prop at render time (withRawSegmentExtensions). On merged main the schema keeps them
  // and this helper is equivalent to plain data.
  const extSettings = (segments: Record<string, unknown>[], extra: Record<string, unknown> = {}) => {
    const settings = ProjectSettingsSchema.parse({
      clipRange: { startMs: 2000, endMs: 4080 },
      composition: { videoSegments: segments.map(({ id, sourceInMs, sourceOutMs }) => ({ id, sourceInMs, sourceOutMs })) },
      ...extra,
    });
    settings.composition.videoSegments.forEach((s, i) => Object.assign(s, segments[i]));
    if (extra.canvas) Object.assign(settings as Record<string, unknown>, { canvas: extra.canvas });
    return settings;
  };
  const TWO = [
    { id: "seg-1", sourceInMs: 2000, sourceOutMs: 3040 },
    { id: "seg-2", sourceInMs: 3040, sourceOutMs: 4080 },
  ];

  it("playbackRate reaches BOTH engines' elements, per segment, and only when !== 1", () => {
    const settings = extSettings([TWO[0], { ...TWO[1], playbackRate: 2 }]);
    for (const videoEngine of ["offthread", "media"] as const) {
      const videos = videoTags(renderToStaticMarkup(<CaptionedVideo src="video.mp4" videoEngine={videoEngine} settings={settings} />));
      expect(videos).toHaveLength(2);
      expect(videos[0]).not.toContain("data-playback-rate");
      expect(videos[1]).toContain('data-playback-rate="2"');
    }
  });

  it("per-segment assetId resolves through segmentAssets, falling back to the main src", () => {
    const settings = extSettings([{ ...TWO[0], assetId: "asset-b" }, TWO[1]]);
    const html = renderToStaticMarkup(<CaptionedVideo src="main.mp4" settings={settings} segmentAssets={{ "asset-b": "b-roll.mp4" }} />);
    const videos = videoTags(html);
    expect(videos[0]).toContain('src="b-roll.mp4"');
    expect(videos[1]).toContain('src="main.mp4"');
    // no segmentAssets at all -> the asset segment also falls back to the main src
    const fallback = videoTags(renderToStaticMarkup(<CaptionedVideo src="main.mp4" settings={settings} />));
    expect(fallback[0]).toContain('src="main.mp4"');
  });

  it("a still segment renders an Img (with its segmentAssets src), not a video element", () => {
    const settings = extSettings([{ ...TWO[0], still: true, assetId: "still-1" }, TWO[1]]);
    const html = renderToStaticMarkup(<CaptionedVideo src="main.mp4" settings={settings} segmentAssets={{ "still-1": "photo.jpg" }} />);
    expect(videoTags(html)).toHaveLength(1);
    expect(html).toContain('<img src="photo.jpg"');
  });

  it("a transformed segment renders wrapper/inner styles; identity segments render none", () => {
    const settings = extSettings([{ ...TWO[0], transform: { rotateDeg: 15, scale: 2 } }, TWO[1]]);
    const html = renderToStaticMarkup(<CaptionedVideo src="video.mp4" settings={settings} />);
    expect(html).toContain("overflow:hidden");
    expect(html).toContain("rotate(15deg) scale(2, 2)");
    const plain = renderToStaticMarkup(<CaptionedVideo src="video.mp4" settings={segmentedSettings()} />);
    expect(plain).not.toContain("overflow:hidden");
    expect(plain).not.toContain("rotate(");
  });

  it("a single stored segment now applies its rate + transform on the single-layer path (clipRange trims kept)", () => {
    const settings = extSettings([{ ...TWO[0], playbackRate: 0.5, transform: { flipH: true } }]);
    const html = renderToStaticMarkup(<CaptionedVideo src="video.mp4" settings={settings} />);
    const videos = videoTags(html);
    expect(videos).toHaveLength(1);
    expect(videos[0]).toContain('data-playback-rate="0.5"');
    expect(videos[0]).toContain('data-trim-before="60"');
    expect(videos[0]).toContain('data-trim-after="122"'); // clipRange end, NOT the segment's own end (91)
    expect(html).toContain("scale(-1, 1)");
    expect(sequenceWindows(html)).toEqual([]);
  });

  it("transition chain: TransitionSeries sequences + a Transition with the layout's frames and presentation", () => {
    const settings = extSettings([TWO[0], { ...TWO[1], transitionIn: { type: "fade", durationMs: 300 } }]);
    const html = renderToStaticMarkup(<CaptionedVideo src="video.mp4" settings={settings} />);
    expect(html).toContain('data-transition-series="true"');
    // layout at 30fps: timeline 1040+1040ms -> ceil sequences 32+31... duration sum check via attrs
    const tsDurations = [...html.matchAll(/data-ts-duration="(\d+)"/g)].map((m) => Number(m[1]));
    const transDurations = [...html.matchAll(/data-ts-transition-duration="(\d+)"/g)].map((m) => Number(m[1]));
    expect(tsDurations).toHaveLength(2);
    expect(transDurations).toEqual([9]); // 300ms at 30fps
    expect(html).toContain('data-ts-presentation="fade"');
    // parity: sequences - transitions == composition frames (1780ms -> ceil 54)
    expect(tsDurations.reduce((a, b) => a + b, 0) - transDurations.reduce((a, b) => a + b, 0)).toBe(54);
    // and the plain Sequence chain is gone in this mode
    expect(html).not.toContain("data-sequence-from");
  });

  it("zoom and blur transitions use the CUSTOM presentations (mock falls back to 'custom')", () => {
    for (const type of ["zoom", "blur"] as const) {
      const settings = extSettings([TWO[0], { ...TWO[1], transitionIn: { type, durationMs: 300 } }]);
      const html = renderToStaticMarkup(<CaptionedVideo src="video.mp4" settings={settings} />);
      expect(html).toContain('data-ts-presentation="custom"');
    }
  });

  it("canvas colour background paints the root instead of black when aspect is not source", () => {
    const settings = extSettings(TWO, { canvas: { aspect: "9:16", background: "#101418" } });
    const html = renderToStaticMarkup(<CaptionedVideo src="video.mp4" settings={settings} />);
    expect(html).toContain("background-color:#101418");
    expect(html).not.toContain("background-color:black");
  });

  it("canvas blur background renders a second, blurred cover chain behind the main chain", () => {
    const settings = extSettings(TWO, { canvas: { aspect: "1:1", background: "blur" } });
    const html = renderToStaticMarkup(<CaptionedVideo src="video.mp4" settings={settings} />);
    expect(videoTags(html)).toHaveLength(4); // 2 background + 2 main
    expect(html).toContain('data-style-filter="blur(48px) saturate(1.2)"');
    expect(html).toContain('data-style-transform="scale(1.15)"');
    // background elements are muted even though the main chain is not
    expect(videoTags(html).filter((v) => v.includes('data-muted="true"'))).toHaveLength(2);
  });

  it("aspect source keeps exactly the old black layer and no background chain", () => {
    const html = renderToStaticMarkup(<CaptionedVideo src="video.mp4" settings={segmentedSettings()} />);
    expect(videoTags(html)).toHaveLength(2);
    expect(html).toContain("background-color:black");
    expect(html).not.toContain("blur(48px)");
  });
});
