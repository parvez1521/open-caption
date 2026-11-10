import { describe, expect, it } from "vitest";
import { calculateMetadata } from "./Root";
import { CaptionedVideoProps } from "./props";

/** calculateMetadata with a minimal Remotion context (only `props` is read). */
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

const MEDIA = { width: 1080, height: 1920, fps: 30, durationMs: 10_000, rotation: 0 };

describe("calculateMetadata: export output override", () => {
  it("without an override, size/fps/duration come from the source media", async () => {
    const m = await meta({ media: MEDIA });
    expect(m).toMatchObject({ width: 1080, height: 1920, fps: 30, durationInFrames: 300 });
  });

  it("with an override, the composition is authored at the chosen export size and fps", async () => {
    const m = await meta({ media: MEDIA, outputWidth: 720, outputHeight: 1280, outputFps: 60 });
    expect(m).toMatchObject({ width: 720, height: 1280, fps: 60, durationInFrames: 600 });
  });

  it("60fps doubles the frame count for the same milliseconds (timing does not drift)", async () => {
    const at30 = await meta({ media: { ...MEDIA, durationMs: 2_500 } });
    const at60 = await meta({ media: { ...MEDIA, durationMs: 2_500 }, outputFps: 60 });
    expect(at30.durationInFrames).toBe(75);
    expect(at60.durationInFrames).toBe(150);
    // same real duration either way
    expect((at30.durationInFrames ?? 0) / (at30.fps ?? 1)).toBeCloseTo((at60.durationInFrames ?? 0) / (at60.fps ?? 1));
  });

  it("an fps-only override keeps the source size; a size-only override keeps the source fps", async () => {
    expect(await meta({ media: MEDIA, outputFps: 60 })).toMatchObject({ width: 1080, height: 1920, fps: 60 });
    expect(await meta({ media: MEDIA, outputWidth: 2160, outputHeight: 3840 })).toMatchObject({ width: 2160, height: 3840, fps: 30, durationInFrames: 300 });
  });

  it("falls back to the last word's end when the media has no duration, at the export fps", async () => {
    const m = await meta({
      media: { ...MEDIA, durationMs: 0 },
      outputFps: 60,
      doc: { version: 2, words: [{ id: "w1", text: "hi", startMs: 0, endMs: 2000, confidence: 1 }] },
    });
    // (2000 + 500) ms at 60fps
    expect(m.durationInFrames).toBe(150);
    expect(m.fps).toBe(60);
  });
});

describe("calculateMetadata: clip range (Clipper projects)", () => {
  it("authors only the segment when the project carries a clipRange", async () => {
    const m = await meta({ media: { ...MEDIA, durationMs: 120_000 }, settings: { clipRange: { startMs: 32_000, endMs: 65_000 } } });
    // 33s of segment at 30fps, NOT the 120s source
    expect(m.durationInFrames).toBe(990);
    expect(m.fps).toBe(30);
  });

  it("the segment duration scales with the export fps like everything else", async () => {
    const m = await meta({ media: { ...MEDIA, durationMs: 120_000 }, outputFps: 60, settings: { clipRange: { startMs: 32_000, endMs: 65_000 } } });
    expect(m.durationInFrames).toBe(1980);
  });

  it("a null clipRange keeps the full source duration", async () => {
    const m = await meta({ media: { ...MEDIA, durationMs: 120_000 }, settings: { clipRange: null } });
    expect(m.durationInFrames).toBe(3600);
  });
});

describe("calculateMetadata: segment chain duration (Phase 4 Run 2)", () => {
  // RAW props (not pre-parsed): calculateMetadata parses internally, and the segment
  // extension fields must be read from the raw props (see Root.tsx) — pre-parsing through
  // the current shared schema would strip rate/transition fields before the call.
  const rawMeta = async (input: Record<string, unknown>) =>
    calculateMetadata({
      props: input,
      defaultProps: CaptionedVideoProps.parse({}),
      compositionId: "CaptionedVideo",
      abortSignal: new AbortController().signal,
      isRendering: false,
    } as unknown as Parameters<typeof calculateMetadata>[0]);

  it("duration comes from the segments, not the source media (jump-cut chain)", async () => {
    const m = await rawMeta({
      media: { ...MEDIA, durationMs: 120_000 },
      settings: {
        composition: {
          videoSegments: [
            { id: "a", sourceInMs: 0, sourceOutMs: 2000 },
            { id: "b", sourceInMs: 5000, sourceOutMs: 7000 },
          ],
        },
      },
    });
    expect(m.durationInFrames).toBe(120); // 4000ms of chain at 30fps, NOT the 120s source
  });

  it("playbackRate shortens the authored duration", async () => {
    const m = await rawMeta({
      media: MEDIA,
      settings: {
        composition: {
          videoSegments: [
            { id: "a", sourceInMs: 0, sourceOutMs: 4000, playbackRate: 2 },
            { id: "b", sourceInMs: 4000, sourceOutMs: 6000 },
          ],
        },
      },
    });
    expect(m.durationInFrames).toBe(120); // 2000 (rate 2) + 2000 = 4000ms
  });

  it("boundary transitions subtract from the authored duration", async () => {
    const m = await rawMeta({
      media: MEDIA,
      settings: {
        composition: {
          videoSegments: [
            { id: "a", sourceInMs: 0, sourceOutMs: 2000 },
            { id: "b", sourceInMs: 2000, sourceOutMs: 4000, transitionIn: { type: "fade", durationMs: 500 } },
          ],
        },
      },
    });
    expect(m.durationInFrames).toBe(105); // (4000 - 500)ms at 30fps
  });

  it("a single stored segment also authors the duration (rate applied)", async () => {
    const m = await rawMeta({
      media: { ...MEDIA, durationMs: 120_000 },
      settings: { composition: { videoSegments: [{ id: "a", sourceInMs: 0, sourceOutMs: 6000, playbackRate: 2 }] } },
    });
    expect(m.durationInFrames).toBe(90); // 3000ms
  });

  it("no segments keeps the legacy media/clipRange duration path unchanged", async () => {
    const m = await rawMeta({ media: { ...MEDIA, durationMs: 120_000 }, settings: { clipRange: { startMs: 32_000, endMs: 65_000 } } });
    expect(m.durationInFrames).toBe(990);
    const plain = await rawMeta({ media: MEDIA });
    expect(plain.durationInFrames).toBe(300);
  });
});
