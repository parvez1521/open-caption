import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Render-level harness, copied from segments.test.tsx: the Remotion primitives are
// stood in with plain elements so the video layer's structure is assertable without
// a composition context. What matters here is the transform wrapper SegmentFx paints
// around the segment's element — its geometry IS the crop.
vi.mock("remotion", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    Img: (props: Record<string, unknown>) => React.createElement("img", props),
    useVideoConfig: () => ({ fps: 30, width: 608, height: 1080, durationInFrames: 300 }),
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
      }),
  };
});
vi.mock("@remotion/media", () => ({
  Video: (props: Record<string, unknown>) =>
    React.createElement("video", {
      src: props.src as string,
      "data-engine": "media",
      ...(props.trimBefore !== undefined ? { "data-trim-before": props.trimBefore } : {}),
      ...(props.trimAfter !== undefined ? { "data-trim-after": props.trimAfter } : {}),
    }),
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

import { ProjectSettingsSchema } from "@capseasy/shared";
import { CaptionedVideo } from "./CaptionedVideo";

/**
 * Slice 5.4 at the composition level: a reframed clip project is a 9:16 canvas plus
 * ONE stored segment whose transform is the crop window (here: the exact values the
 * frontend mapping produces for a centred window on a 1920×1080 source —
 * cropLeft = cropRight = 0.341796875, keeping a 0.31640625 width fraction).
 * The render must paint the crop: an overflow-hidden stage whose inner box is
 * enlarged to 100 / 0.31640625 ≈ 316.05% wide and shifted left by the crop's share,
 * so the surviving 9:16 region fills the (mocked) 608×1080 canvas exactly.
 */
const reframedSettings = (transform: Record<string, unknown>) => {
  const settings = ProjectSettingsSchema.parse({
    clipRange: { startMs: 32_000, endMs: 65_000 },
    canvas: { aspect: "9:16", background: "blur" },
    composition: { videoSegments: [{ id: "main-video", sourceInMs: 32_000, sourceOutMs: 65_000 }] },
  });
  Object.assign(settings.composition.videoSegments[0] as Record<string, unknown>, { transform });
  return settings;
};

const CENTRE = { cropLeft: 0.341796875, cropRight: 0.341796875, cropTop: 0, cropBottom: 0 };

describe("CaptionedVideo — a reframed clip's composition renders its crop window (5.4)", () => {
  it("paints the centred crop: inner box ≈316.05% wide, shifted by the left crop's share", () => {
    const html = renderToStaticMarkup(
      <CaptionedVideo src="long.mp4" settings={reframedSettings(CENTRE)} />,
    );
    expect(html).toContain("overflow:hidden");
    // width = 100 / (1 − 0.341796875 − 0.341796875) % and left = −cropLeft / kept × 100 %
    expect(html).toContain("width:316.04938271604937%");
    expect(html).toContain("left:-108.02469135802468%");
    // the single stored segment rides the single-layer path: clipRange trims, no Sequence chain
    expect(html).toContain('data-trim-before="960"'); // 32s at 30fps
    expect(html).toContain('data-trim-after="1950"'); // 65s at 30fps
    expect(html).not.toContain("data-sequence-from");
  });

  it("an off-centre window (x = 1) shifts the inner box fully left", () => {
    const html = renderToStaticMarkup(
      <CaptionedVideo src="long.mp4" settings={reframedSettings({ ...CENTRE, cropLeft: 0.68359375, cropRight: 0 })} />,
    );
    expect(html).toContain("width:316.04938271604937%");
    expect(html).toContain("left:-216.04938271604937%");
  });

  it("the same segment WITHOUT the crop transform renders no wrapper at all (identity = untouched)", () => {
    const html = renderToStaticMarkup(
      <CaptionedVideo src="long.mp4" settings={reframedSettings({ cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0 })} />,
    );
    expect(html).not.toContain("overflow:hidden");
    expect(html).not.toContain("316.049");
  });
});
