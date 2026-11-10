import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Render-level harness for Run-3 segment FX (keyframes / effects / colour washes), following
// segments.test.tsx's technique: Remotion's context-bound primitives are stood in with plain
// elements, EXCEPT useCurrentFrame reads a test-controlled frame so a keyframed segment can
// be rendered at a chosen frame. NOTE: the mocked Sequence does not reset the frame the way
// a real Remotion Sequence does, so the keyframe assertions use the single-segment path —
// there the composition frame IS the segment-local frame, exactly as in the real renderer.
const testState = vi.hoisted(() => ({ frame: 0 }));
vi.mock("remotion", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    Img: (props: Record<string, unknown>) => React.createElement("img", props),
    useVideoConfig: () => ({ fps: 30, width: 1080, height: 1920, durationInFrames: 300 }),
    useCurrentFrame: () => testState.frame,
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
      ...(props.muted ? { "data-muted": "true" } : {}),
    }),
}));
vi.mock("@remotion/transitions", () => {
  const Series = (props: { children?: React.ReactNode }) => React.createElement("div", { "data-transition-series": "true" }, props.children);
  const SequenceMock = (props: { durationInFrames?: number; children?: React.ReactNode }) =>
    React.createElement("div", { "data-ts-duration": props.durationInFrames }, props.children);
  const TransitionMock = () => React.createElement("div", { "data-ts-transition": "true" });
  return {
    TransitionSeries: Object.assign(Series, { Sequence: SequenceMock, Transition: TransitionMock, Overlay: () => null }),
    linearTiming: ({ durationInFrames }: { durationInFrames: number }) => ({ getDurationInFrames: () => durationInFrames, getProgress: () => 0 }),
  };
});
vi.mock("@remotion/transitions/fade", () => ({ fade: () => ({ component: () => null, props: { kind: "fade" } }) }));
vi.mock("@remotion/transitions/slide", () => ({ slide: () => ({ component: () => null, props: { kind: "slide" } }) }));
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
import { CaptionedVideo, SegmentFx } from "./CaptionedVideo";
import type { RenderVideoSegment } from "./overlayMath";

const singleSegmentSettings = (segment: Record<string, unknown>) =>
  ProjectSettingsSchema.parse({
    clipRange: { startMs: 2000, endMs: 4080 },
    composition: { videoSegments: [{ id: "seg-1", sourceInMs: 2000, sourceOutMs: 3040, ...segment }] },
  });

const KEYFRAMES = [
  { id: "k-scale-0", atMs: 0, property: "scale" as const, value: 1, easing: "linear" as const },
  { id: "k-scale-1", atMs: 1000, property: "scale" as const, value: 2, easing: "linear" as const },
  { id: "k-op-0", atMs: 0, property: "opacity" as const, value: 1, easing: "linear" as const },
  { id: "k-op-1", atMs: 1000, property: "opacity" as const, value: 0, easing: "linear" as const },
];

describe("SegmentFx regression pin (a): untouched segments render pre-Run-3 structure", () => {
  it("a single untouched segment is byte-identical to the no-segment single-layer render", () => {
    testState.frame = 0;
    const withSegment = renderToStaticMarkup(<CaptionedVideo src="video.mp4" settings={singleSegmentSettings({})} />);
    const plain = renderToStaticMarkup(
      <CaptionedVideo src="video.mp4" settings={ProjectSettingsSchema.parse({ clipRange: { startMs: 2000, endMs: 4080 } })} />,
    );
    expect(withSegment).toBe(plain);
    expect(withSegment).not.toContain("overflow:hidden");
    expect(withSegment).not.toContain("opacity:");
    expect(withSegment).not.toContain("radial-gradient");
    expect(withSegment).not.toContain("data:image/svg");
  });

  it("a statically transformed segment keeps the old wrapper and gains nothing", () => {
    testState.frame = 0;
    const html = renderToStaticMarkup(
      <CaptionedVideo src="video.mp4" settings={singleSegmentSettings({ transform: { rotateDeg: 15, scale: 2 } })} />,
    );
    expect(html).toContain("rotate(15deg) scale(2, 2)");
    expect(html).not.toContain("opacity:");
    expect(html).not.toContain("radial-gradient");
  });

  it("a segment whose ONLY non-identity field is a static opacity does get the opacity painted", () => {
    testState.frame = 0;
    const html = renderToStaticMarkup(
      <CaptionedVideo src="video.mp4" settings={singleSegmentSettings({ transform: { opacity: 0.5 } })} />,
    );
    expect(html).toContain("opacity:0.5");
  });
});

describe("SegmentFx keyframes (b)", () => {
  it("at frame 15 (500ms at 30fps) the sampled scale and opacity are in the markup", () => {
    testState.frame = 15;
    try {
      const html = renderToStaticMarkup(<CaptionedVideo src="video.mp4" settings={singleSegmentSettings({ keyframes: KEYFRAMES })} />);
      expect(html).toContain("scale(1.5, 1.5)"); // lerp(1, 2, 0.5)
      expect(html).toContain("opacity:0.5"); // lerp(1, 0, 0.5)
    } finally {
      testState.frame = 0;
    }
  });
});

describe("SegmentFx effects (c)", () => {
  it("blur filter + vignette gradient + grain data-uri render at the expected values; a disabled effect is absent", () => {
    testState.frame = 0;
    const effects = [
      { id: "e-blur", type: "blur" as const, enabled: true, amount: 0.5, color: "#FFA946" },
      { id: "e-glow", type: "glow" as const, enabled: false, amount: 1, color: "#FF0000" },
      { id: "e-vig", type: "vignette" as const, enabled: true, amount: 0.5, color: "#FFA946" },
      { id: "e-grain", type: "grain" as const, enabled: true, amount: 0.5, color: "#FFA946" },
    ];
    const html = renderToStaticMarkup(<CaptionedVideo src="video.mp4" settings={singleSegmentSettings({ effects })} />);
    expect(html).toContain("blur(10px)"); // 0.5 * 20
    expect(html).not.toContain("drop-shadow"); // the glow is disabled
    expect(html).toContain("radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.425) 100%)"); // 0.5 * 0.85
    expect(html).toContain("data:image/svg+xml");
    expect(html).toContain("seed%3D%220%22"); // grain seed = frame 0 % 8, inside the encoded SVG
    expect(html).toContain("opacity:0.25"); // grain layer: 0.5 * 0.5
  });
});

describe("SegmentFx background variant (d)", () => {
  it("applies the transform sampling ONLY — no opacity, no effects layers, no filter", () => {
    testState.frame = 15;
    try {
      const segment = {
        id: "seg-1",
        sourceInMs: 0,
        sourceOutMs: 1040,
        keyframes: KEYFRAMES,
        effects: [
          { id: "e-blur", type: "blur", enabled: true, amount: 0.5, color: "#FFA946" },
          { id: "e-vig", type: "vignette", enabled: true, amount: 0.5, color: "#FFA946" },
          { id: "e-grain", type: "grain", enabled: true, amount: 0.5, color: "#FFA946" },
        ],
      } as unknown as RenderVideoSegment;
      const html = renderToStaticMarkup(
        <SegmentFx segment={segment} variant="background">
          <div>media</div>
        </SegmentFx>,
      );
      expect(html).toContain("scale(1.5, 1.5)"); // sampled transform applies
      expect(html).not.toContain("opacity");
      expect(html).not.toContain("radial-gradient");
      expect(html).not.toContain("data:image/svg");
      expect(html).not.toContain("blur(10px)");
    } finally {
      testState.frame = 0;
    }
  });
});

describe("CaptionedVideo 4.9 colour washes", () => {
  it("renders one overlay div per wash colour inside the main chain; neutral renders none", () => {
    testState.frame = 0;
    const washed = renderToStaticMarkup(
      <CaptionedVideo src="video.mp4" settings={ProjectSettingsSchema.parse({ videoAdjust: { temperature: -1, tint: 1 } })} />,
    );
    expect(washed).toContain("background:rgba(96, 150, 255, 0.16)");
    expect(washed).toContain("background:rgba(80, 255, 150, 0.1)");
    const neutral = renderToStaticMarkup(<CaptionedVideo src="video.mp4" settings={ProjectSettingsSchema.parse({})} />);
    expect(neutral).not.toContain("rgba(96, 150, 255");
    expect(neutral).not.toContain("rgba(80, 255, 150");
    expect(neutral).not.toContain("rgba(255, 80, 190");
  });
});
