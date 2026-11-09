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
