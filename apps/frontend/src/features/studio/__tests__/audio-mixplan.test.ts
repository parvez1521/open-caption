import { describe, expect, it } from "vitest";
import { ProjectSettingsSchema, type ProjectSettings } from "@capseasy/shared";
import { toComposition, type CompositionInput } from "../composition";
import { buildEditorComposition, type EditorComposition } from "../compositionDoc";
import { buildMixPlan, mixIsActive } from "../audio/mixPlan";

function compFor(settings: ProjectSettings, sourceDurationMs: number, viewDurationMs: number): EditorComposition {
  const input: CompositionInput = {
    media: { videoId: "vid-1", filename: "clip.mp4", size: 1, width: 1080, height: 1920, fps: 30, durationMs: sourceDurationMs },
    doc: null,
    pages: [],
    settings,
    durationMs: viewDurationMs,
  };
  return buildEditorComposition({ view: toComposition(input), settings, sourceDurationMs });
}

const baseTracks = {
  video: { locked: false, visible: true, muted: false },
  captions: { locked: false, visible: true, muted: false },
  text: { locked: false, visible: true, muted: false },
  graphics: { locked: false, visible: true, muted: false },
};

const segmented = ProjectSettingsSchema.parse({
  composition: {
    version: 1,
    videoSegments: [
      { id: "seg-1", sourceInMs: 0, sourceOutMs: 10_000 },
      { id: "seg-2", sourceInMs: 20_000, sourceOutMs: 30_000, playbackRate: 2 },
      { id: "seg-still", sourceInMs: 40_000, sourceOutMs: 45_000, still: true },
    ],
    markers: [],
    tracks: baseTracks,
  },
});

describe("buildMixPlan — video items", () => {
  it("makes one item per non-still segment, carrying rate and source range", () => {
    const comp = compFor(segmented, 60_000, 25_000);
    const plan = buildMixPlan(comp, comp.durationMs);
    const video = plan.items.filter((i) => i.kind === "video");
    expect(video.map((i) => i.key)).toEqual(["video:seg-1", "video:seg-2"]); // still skipped
    expect(video[0]).toMatchObject({
      assetId: null, timelineStartMs: 0, sourceStartMs: 0, sourceDurationMs: 10_000, rate: 1,
      baseGain: 1, voice: true, duck: false, trackId: null,
    });
    // seg-2: 10000ms of source at rate 2 → 5000ms of timeline, starting after seg-1
    expect(video[1]).toMatchObject({ timelineStartMs: 10_000, sourceStartMs: 20_000, sourceDurationMs: 5000, rate: 2 });
  });

  it("uses master.videoVolume as the video items' base gain", () => {
    const settings = ProjectSettingsSchema.parse({
      composition: {
        version: 1,
        videoSegments: [{ id: "seg-1", sourceInMs: 0, sourceOutMs: 10_000 }],
        markers: [],
        tracks: baseTracks,
        audio: { tracks: [], clips: [], master: { volume: 1, videoVolume: 0.5, compressor: { enabled: false, thresholdDb: -18, ratio: 3, kneeDb: 12, attackMs: 10, releaseMs: 200 } } },
      },
    });
    const plan = buildMixPlan(compFor(settings, 60_000, 10_000), 10_000);
    expect(plan.items[0]!.baseGain).toBe(0.5);
    expect(plan.master.videoVolume).toBe(0.5);
  });

  it("makes NO video items when the video track is muted", () => {
    const settings = ProjectSettingsSchema.parse({
      composition: {
        version: 1,
        videoSegments: [{ id: "seg-1", sourceInMs: 0, sourceOutMs: 10_000 }],
        markers: [],
        tracks: { ...baseTracks, video: { locked: false, visible: true, muted: true } },
      },
    });
    const plan = buildMixPlan(compFor(settings, 60_000, 10_000), 10_000);
    expect(plan.items.filter((i) => i.kind === "video")).toEqual([]);
  });
});

function withAudio(audio: unknown): ProjectSettings {
  return ProjectSettingsSchema.parse({
    composition: {
      version: 1,
      videoSegments: [{ id: "seg-1", sourceInMs: 0, sourceOutMs: 10_000 }],
      markers: [],
      tracks: baseTracks,
      audio,
    },
  });
}

const audioFixture = {
  tracks: [
    { id: "tr-music", name: "Music", role: "music", volume: 0.5, muted: false, locked: false, ducking: { enabled: true, amountDb: 12, thresholdDb: -42 } },
    { id: "tr-voice", name: "VO", role: "voice", volume: 1, muted: false, locked: false, ducking: { enabled: false, amountDb: 12, thresholdDb: -42 } },
    { id: "tr-muted", name: "Muted", role: "other", volume: 1, muted: true, locked: false, ducking: { enabled: false, amountDb: 12, thresholdDb: -42 } },
  ],
  clips: [
    { id: "cl-music", assetId: "asset-music", assetName: "song.mp3", trackId: "tr-music", startMs: 1000, sourceInMs: 2000, sourceOutMs: 6000, volume: 0.8, fadeInMs: 100, fadeOutMs: 200, processors: { eq: { lowDb: 3, midDb: 0, highDb: 0 }, cleanup: { enabled: false, highPassHz: 80, gateDb: -50 }, reverb: 0.2 } },
    { id: "cl-voice", assetId: "asset-vo", assetName: "vo.wav", trackId: "tr-voice", startMs: 0, sourceInMs: 0, sourceOutMs: 3000, volume: 1, fadeInMs: 0, fadeOutMs: 0, processors: { eq: { lowDb: 0, midDb: 0, highDb: 0 }, cleanup: { enabled: false, highPassHz: 80, gateDb: -50 }, reverb: 0 } },
    { id: "cl-muted", assetId: "asset-x", assetName: "x.wav", trackId: "tr-muted", startMs: 0, sourceInMs: 0, sourceOutMs: 3000, volume: 1, fadeInMs: 0, fadeOutMs: 0, processors: { eq: { lowDb: 0, midDb: 0, highDb: 0 }, cleanup: { enabled: false, highPassHz: 80, gateDb: -50 }, reverb: 0 } },
    { id: "cl-orphan", assetId: "asset-y", assetName: "y.wav", trackId: "tr-gone", startMs: 0, sourceInMs: 0, sourceOutMs: 3000, volume: 1, fadeInMs: 0, fadeOutMs: 0, processors: { eq: { lowDb: 0, midDb: 0, highDb: 0 }, cleanup: { enabled: false, highPassHz: 80, gateDb: -50 }, reverb: 0 } },
  ],
  master: { volume: 1, videoVolume: 1, compressor: { enabled: false, thresholdDb: -18, ratio: 3, kneeDb: 12, attackMs: 10, releaseMs: 200 } },
};

describe("buildMixPlan — clip items", () => {
  it("carries placement, processors and clip.volume × track.volume as baseGain", () => {
    const plan = buildMixPlan(compFor(withAudio(audioFixture), 60_000, 10_000), 10_000);
    const music = plan.items.find((i) => i.key === "clip:cl-music")!;
    expect(music).toMatchObject({
      kind: "clip", assetId: "asset-music", timelineStartMs: 1000, sourceStartMs: 2000,
      sourceDurationMs: 4000, rate: 1, fadeInMs: 100, fadeOutMs: 200, reverb: 0.2, trackId: "tr-music",
    });
    expect(music.baseGain).toBeCloseTo(0.8 * 0.5, 12);
    expect(music.eq.lowDb).toBe(3);
  });

  it("sets voice/duck flags from the track role and ducking", () => {
    const plan = buildMixPlan(compFor(withAudio(audioFixture), 60_000, 10_000), 10_000);
    const music = plan.items.find((i) => i.key === "clip:cl-music")!;
    expect(music.voice).toBe(false); // music role
    expect(music.duck).toBe(true);
    expect(music.ducking).toEqual({ enabled: true, amountDb: 12, thresholdDb: -42 });
    const vo = plan.items.find((i) => i.key === "clip:cl-voice")!;
    expect(vo.voice).toBe(true);
    expect(vo.duck).toBe(false);
    expect(vo.ducking).toBeUndefined();
  });

  it("excludes clips on muted tracks and clips whose track is gone", () => {
    const plan = buildMixPlan(compFor(withAudio(audioFixture), 60_000, 10_000), 10_000);
    expect(plan.items.some((i) => i.key === "clip:cl-muted")).toBe(false);
    expect(plan.items.some((i) => i.key === "clip:cl-orphan")).toBe(false);
  });
});

describe("buildMixPlan — clamping", () => {
  it("reduces an item running past durationMs and drops items starting at/after it", () => {
    const plan = buildMixPlan(compFor(withAudio(audioFixture), 60_000, 10_000), 3000);
    const music = plan.items.find((i) => i.key === "clip:cl-music")!;
    expect(music.sourceDurationMs).toBe(2000); // 1000 start + 2000 = 3000 exactly
    const video = plan.items.find((i) => i.key === "video:seg-1")!;
    expect(video.sourceDurationMs).toBe(3000);
  });
});

describe("mixIsActive — truth table", () => {
  const plain = compFor(ProjectSettingsSchema.parse({}), 60_000, 60_000);
  it("is false for a plain project", () => {
    expect(mixIsActive(plain)).toBe(false);
  });
  it("is true when there is any audio clip", () => {
    expect(mixIsActive(compFor(withAudio(audioFixture), 60_000, 10_000))).toBe(true);
  });
  it("is true for a non-default track volume / mute / ducking, false for role alone", () => {
    const mk = (track: Record<string, unknown>) =>
      compFor(
        withAudio({
          tracks: [{ id: "t1", name: "A", role: "other", volume: 1, muted: false, locked: false, ducking: { enabled: false, amountDb: 12, thresholdDb: -42 }, ...track }],
          clips: [],
          master: audioFixture.master,
        }),
        60_000,
        10_000,
      );
    expect(mixIsActive(mk({}))).toBe(false);
    expect(mixIsActive(mk({ role: "voice" }))).toBe(false); // role ALONE does nothing audible
    expect(mixIsActive(mk({ role: "music" }))).toBe(false);
    expect(mixIsActive(mk({ volume: 0.5 }))).toBe(true);
    expect(mixIsActive(mk({ muted: true }))).toBe(true);
    expect(mixIsActive(mk({ ducking: { enabled: true, amountDb: 12, thresholdDb: -42 } }))).toBe(true);
  });
  it("is true when the master differs (volume / videoVolume / compressor enabled)", () => {
    const mk = (master: Record<string, unknown>) =>
      compFor(
        withAudio({ tracks: [], clips: [], master: { ...audioFixture.master, ...master } }),
        60_000,
        10_000,
      );
    expect(mixIsActive(mk({}))).toBe(false);
    expect(mixIsActive(mk({ volume: 0.9 }))).toBe(true);
    expect(mixIsActive(mk({ videoVolume: 1.5 }))).toBe(true);
    expect(
      mixIsActive(mk({ compressor: { enabled: true, thresholdDb: -18, ratio: 3, kneeDb: 12, attackMs: 10, releaseMs: 200 } })),
    ).toBe(true);
  });
});
