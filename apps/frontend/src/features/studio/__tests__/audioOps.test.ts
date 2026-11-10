import { describe, expect, it } from "vitest";
import {
  ProjectSettingsSchema,
  type Page,
  type ProjectSettings,
  type Word,
} from "@capseasy/shared";
import { toComposition, type CompositionInput } from "../composition";
import { buildEditorComposition, isPartition, projectComposition, type EditorComposition } from "../compositionDoc";
import {
  MIN_AUDIO_MS,
  addAudioTrack,
  duplicateAudioClip,
  moveAudioClip,
  placeAudioClip,
  removeAudioClip,
  removeAudioTrack,
  setAudioDucking,
  splitAudioClipAt,
  trimAudioClip,
  updateAudioClip,
  updateAudioClipProcessors,
  updateAudioMaster,
  updateAudioTrack,
} from "../audioOps";

/**
 * Audio op tests (Phase 4 Run 3, slice 4.8): fixtures via
 * ProjectSettingsSchema.parse + buildEditorComposition, exactly like
 * compositionOps.test.ts. Every op is checked for input immutability
 * (snapshot + a deep-frozen fixture) and every result is run through
 * projectComposition — audio ops must never disturb the video partition,
 * and the projected settings must carry the audio slice round-trip.
 */

const word = (id: string, text: string, startMs: number, endMs: number): Word => ({ id, text, startMs, endMs });
const page = (id: string, words: Word[]): Page => ({
  id,
  startMs: words[0]?.startMs ?? 0,
  endMs: words[words.length - 1]?.endMs ?? 0,
  words,
  lines: [words],
  heroIndex: -1,
  emotion: "neutral",
  position: null,
  styleOverride: null,
});
const pages = [page("p1", [word("w1", "hello", 0, 400), word("w2", "there", 450, 900)])];

function viewFor(settings: ProjectSettings, sourceDurationMs: number, viewDurationMs: number) {
  const input: CompositionInput = {
    media: { videoId: "vid-1", filename: "clip.mp4", size: 12345, width: 1080, height: 1920, fps: 30, durationMs: sourceDurationMs },
    doc: null,
    pages,
    settings,
    durationMs: viewDurationMs,
  };
  return toComposition(input);
}

const snapshot = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;
const deepFreeze = <T>(v: T): T => {
  if (v && typeof v === "object") {
    for (const child of Object.values(v as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(v);
  }
  return v;
};

const audioSettings = ProjectSettingsSchema.parse({
  composition: {
    audio: {
      tracks: [
        { id: "tr-music", name: "Music", role: "music" },
        { id: "tr-voice", name: "Voice", role: "voice" },
      ],
      clips: [
        { id: "cl-1", assetId: "asset-music", assetName: "song.mp3", trackId: "tr-music", startMs: 1000, sourceInMs: 2000, sourceOutMs: 12000, volume: 0.8, fadeInMs: 500, fadeOutMs: 700 },
        { id: "cl-2", assetId: "asset-voice", assetName: "vo.wav", trackId: "tr-voice", startMs: 20000, sourceInMs: 0, sourceOutMs: 5000 },
      ],
      master: { volume: 1, videoVolume: 1 },
    },
  },
});
const audioComp = (): EditorComposition =>
  buildEditorComposition({ view: viewFor(audioSettings, 60_000, 60_000), settings: audioSettings, sourceDurationMs: 60_000 });

const plainSettings = ProjectSettingsSchema.parse({});
const plainComp = (): EditorComposition =>
  buildEditorComposition({ view: viewFor(plainSettings, 60_000, 60_000), settings: plainSettings, sourceDurationMs: 60_000 });

function expectRoundTrip(comp: EditorComposition, base: ProjectSettings = audioSettings) {
  expect(isPartition(comp.videoClips)).toBe(true);
  const projected = projectComposition(comp, base);
  expect(projected.composition.audio.tracks).toEqual(comp.audioTracks);
  expect(projected.composition.audio.clips).toEqual(comp.audioClips);
  expect(projected.composition.audio.master).toEqual(comp.audioMaster);
  // the projected settings parse back into the same audio slice
  const reparsed = ProjectSettingsSchema.parse(projected);
  const rebuilt = buildEditorComposition({ view: viewFor(reparsed, 60_000, 60_000), settings: reparsed, sourceDurationMs: 60_000 });
  expect(rebuilt.audioTracks).toEqual(comp.audioTracks);
  expect(rebuilt.audioClips).toEqual(comp.audioClips);
  expect(rebuilt.audioMaster).toEqual(comp.audioMaster);
}

describe("addAudioTrack", () => {
  it("appends with role default names and neutral defaults", () => {
    const comp = plainComp();
    const before = snapshot(comp);
    const music = addAudioTrack(comp, "music");
    expect(music.audioTracks).toHaveLength(1);
    expect(music.audioTracks[0]).toMatchObject({ name: "Music", role: "music", volume: 1, muted: false, locked: false, ducking: { enabled: false, amountDb: 12, thresholdDb: -42 } });
    expect(music.audioTracks[0]!.id.length).toBeGreaterThan(0);
    expect(addAudioTrack(comp, "voice").audioTracks[0]!.name).toBe("Voice");
    expect(addAudioTrack(comp).audioTracks[0]).toMatchObject({ name: "Audio 1", role: "other" });
    expect(addAudioTrack(comp, "other", "SFX").audioTracks[0]!.name).toBe("SFX");
    expect(comp).toEqual(before);
    expectRoundTrip(music, plainSettings);
  });
});

describe("updateAudioTrack / setAudioDucking", () => {
  it("patches fields, clamps volume, no-ops on no-change and unknown id", () => {
    const comp = audioComp();
    const before = snapshot(comp);
    const out = updateAudioTrack(comp, "tr-music", { name: "Bed", volume: 99, muted: true });
    expect(out.audioTracks[0]).toMatchObject({ name: "Bed", volume: 2, muted: true });
    expect(out.audioTracks[1]).toBe(comp.audioTracks[1]);
    expect(updateAudioTrack(comp, "tr-music", { name: "Music" })).toBe(comp);
    expect(updateAudioTrack(comp, "nope", { name: "x" })).toBe(comp);
    expect(comp).toEqual(before);
    expectRoundTrip(out);
  });

  it("ducking patches clamp to the schema ranges", () => {
    const comp = audioComp();
    const out = setAudioDucking(comp, "tr-music", { enabled: true, amountDb: 99, thresholdDb: 0 });
    expect(out.audioTracks[0]!.ducking).toEqual({ enabled: true, amountDb: 24, thresholdDb: -20 });
    expect(setAudioDucking(comp, "tr-music", { enabled: false })).toBe(comp);
    expect(setAudioDucking(comp, "nope", { enabled: true })).toBe(comp);
    expectRoundTrip(out);
  });
});

describe("removeAudioTrack", () => {
  it("removes the track and its clips in one result", () => {
    const comp = audioComp();
    const out = removeAudioTrack(comp, "tr-music");
    expect(out.audioTracks.map((t) => t.id)).toEqual(["tr-voice"]);
    expect(out.audioClips.map((c) => c.id)).toEqual(["cl-2"]);
    expect(out.videoClips).toBe(comp.videoClips);
    expectRoundTrip(out);
  });

  it("refuses a locked track and unknown ids", () => {
    const locked = updateAudioTrack(audioComp(), "tr-music", { locked: true });
    expect(removeAudioTrack(locked, "tr-music")).toBe(locked);
    const comp = audioComp();
    expect(removeAudioTrack(comp, "nope")).toBe(comp);
  });
});

describe("placeAudioClip", () => {
  it("places with defaults, clamps start/span, and refuses unknown or locked tracks", () => {
    const comp = audioComp();
    const before = snapshot(comp);
    const out = placeAudioClip(comp, { assetId: "a1", assetName: "loop.mp3", trackId: "tr-music", startMs: -50, sourceInMs: 100, sourceOutMs: 150 });
    const clip = out.audioClips[out.audioClips.length - 1]!;
    expect(clip).toMatchObject({ assetId: "a1", assetName: "loop.mp3", trackId: "tr-music", startMs: 0, sourceInMs: 100, sourceOutMs: 100 + MIN_AUDIO_MS, volume: 1, fadeInMs: 0, fadeOutMs: 0 });
    expect(clip.processors).toEqual({ eq: { lowDb: 0, midDb: 0, highDb: 0 }, cleanup: { enabled: false, highPassHz: 80, gateDb: -50 }, reverb: 0 });
    expect(placeAudioClip(comp, { assetId: "a1", assetName: "x", trackId: "nope", startMs: 0, sourceInMs: 0, sourceOutMs: 1000 })).toBe(comp);
    const locked = updateAudioTrack(comp, "tr-music", { locked: true });
    expect(placeAudioClip(locked, { assetId: "a1", assetName: "x", trackId: "tr-music", startMs: 0, sourceInMs: 0, sourceOutMs: 1000 })).toBe(locked);
    expect(comp).toEqual(before);
    expectRoundTrip(out);
  });
});

describe("moveAudioClip", () => {
  it("moves in time (clamped at 0) and between tracks; no-ops when unchanged", () => {
    const comp = audioComp();
    expect(moveAudioClip(comp, "cl-1", { startMs: 3000 }).audioClips[0]).toMatchObject({ startMs: 3000 });
    expect(moveAudioClip(comp, "cl-1", { startMs: -10 }).audioClips[0]).toMatchObject({ startMs: 0 });
    expect(moveAudioClip(comp, "cl-1", { trackId: "tr-voice" }).audioClips[0]).toMatchObject({ trackId: "tr-voice" });
    expect(moveAudioClip(comp, "cl-1", { startMs: 1000 })).toBe(comp);
    expect(moveAudioClip(comp, "cl-1", { trackId: "nope" })).toBe(comp);
    expect(moveAudioClip(comp, "nope", { startMs: 0 })).toBe(comp);
  });

  it("refuses when the source track or the target track is locked", () => {
    const comp = audioComp();
    const srcLocked = updateAudioTrack(comp, "tr-music", { locked: true });
    expect(moveAudioClip(srcLocked, "cl-1", { startMs: 5 })).toBe(srcLocked);
    const dstLocked = updateAudioTrack(comp, "tr-voice", { locked: true });
    expect(moveAudioClip(dstLocked, "cl-1", { trackId: "tr-voice" })).toBe(dstLocked);
  });
});

describe("trimAudioClip", () => {
  it("start edge moves startMs and sourceInMs together, clamped by source, timeline and span", () => {
    const comp = audioComp(); // cl-1: start 1000, source 2000..12000 (span 10000)
    const fwd = trimAudioClip(comp, "cl-1", "start", 3000);
    expect(fwd.audioClips[0]).toMatchObject({ startMs: 3000, sourceInMs: 4000, sourceOutMs: 12000 });
    const back = trimAudioClip(comp, "cl-1", "start", -9999); // delta clamped to -min(1000, 2000)
    expect(back.audioClips[0]).toMatchObject({ startMs: 0, sourceInMs: 1000 });
    const maxFwd = trimAudioClip(comp, "cl-1", "start", 999_999);
    expect(maxFwd.audioClips[0]!.sourceOutMs - maxFwd.audioClips[0]!.sourceInMs).toBe(MIN_AUDIO_MS);
    expect(trimAudioClip(comp, "cl-1", "start", 1000)).toBe(comp);
    expectRoundTrip(fwd);
  });

  it("end edge moves sourceOutMs by the timeline delta, keeping the minimum span", () => {
    const comp = audioComp();
    const out = trimAudioClip(comp, "cl-1", "end", 8000); // timeline end was 11000
    expect(out.audioClips[0]).toMatchObject({ startMs: 1000, sourceInMs: 2000, sourceOutMs: 9000 });
    const min = trimAudioClip(comp, "cl-1", "end", 0);
    expect(min.audioClips[0]!.sourceOutMs - min.audioClips[0]!.sourceInMs).toBe(MIN_AUDIO_MS);
    expect(trimAudioClip(comp, "cl-1", "end", 11000)).toBe(comp);
  });
});

describe("splitAudioClipAt / duplicateAudioClip / removeAudioClip", () => {
  it("splits strictly inside: fades and processors follow the documented rule", () => {
    const comp = updateAudioClipProcessors(audioComp(), "cl-1", { eq: { lowDb: 3 }, reverb: 0.4 });
    const before = snapshot(comp);
    const out = splitAudioClipAt(comp, "cl-1", 6000); // 5000 into the clip
    expect(out.audioClips).toHaveLength(3);
    const first = out.audioClips[0]!;
    const second = out.audioClips[1]!;
    expect(first).toMatchObject({ id: "cl-1", startMs: 1000, sourceInMs: 2000, sourceOutMs: 7000, fadeInMs: 500, fadeOutMs: 0 });
    expect(second.id).not.toBe("cl-1");
    expect(second).toMatchObject({ startMs: 6000, sourceInMs: 7000, sourceOutMs: 12000, fadeInMs: 0, fadeOutMs: 700 });
    expect(second.processors).toEqual(first.processors);
    expect(second.processors).not.toBe(first.processors);
    expect(second.processors.eq).not.toBe(first.processors.eq);
    expect(comp).toEqual(before);
    expectRoundTrip(out);
  });

  it("split refuses outside, at edges and within MIN_AUDIO_MS of an edge", () => {
    const comp = audioComp();
    expect(splitAudioClipAt(comp, "cl-1", 1000)).toBe(comp);
    expect(splitAudioClipAt(comp, "cl-1", 11000)).toBe(comp);
    expect(splitAudioClipAt(comp, "cl-1", 1050)).toBe(comp);
    expect(splitAudioClipAt(comp, "cl-1", 10950)).toBe(comp);
    expect(splitAudioClipAt(comp, "cl-1", 500)).toBe(comp);
    expect(splitAudioClipAt(comp, "nope", 5000)).toBe(comp);
  });

  it("duplicate lands immediately after the original with a fresh id", () => {
    const comp = audioComp();
    const out = duplicateAudioClip(comp, "cl-1");
    expect(out.audioClips).toHaveLength(3);
    const copy = out.audioClips[1]!;
    expect(copy.id).not.toBe("cl-1");
    expect(copy).toMatchObject({ startMs: 11000, sourceInMs: 2000, sourceOutMs: 12000, trackId: "tr-music" });
    expect(copy.processors).not.toBe(comp.audioClips[0]!.processors);
    expect(duplicateAudioClip(comp, "nope")).toBe(comp);
    expectRoundTrip(out);
  });

  it("remove deletes exactly that clip", () => {
    const comp = audioComp();
    expect(removeAudioClip(comp, "cl-1").audioClips.map((c) => c.id)).toEqual(["cl-2"]);
    expect(removeAudioClip(comp, "nope")).toBe(comp);
  });

  it("clip ops refuse when the clip's track is locked", () => {
    const locked = updateAudioTrack(audioComp(), "tr-music", { locked: true });
    expect(trimAudioClip(locked, "cl-1", "end", 5000)).toBe(locked);
    expect(splitAudioClipAt(locked, "cl-1", 5000)).toBe(locked);
    expect(duplicateAudioClip(locked, "cl-1")).toBe(locked);
    expect(removeAudioClip(locked, "cl-1")).toBe(locked);
    expect(updateAudioClip(locked, "cl-1", { volume: 0.5 })).toBe(locked);
    expect(updateAudioClipProcessors(locked, "cl-1", { reverb: 0.5 })).toBe(locked);
  });
});

describe("updateAudioClip / updateAudioClipProcessors", () => {
  it("volume clamps 0..2 and fades clamp to the span", () => {
    const comp = audioComp();
    const out = updateAudioClip(comp, "cl-1", { volume: 5, fadeInMs: 999_999, fadeOutMs: -5 });
    expect(out.audioClips[0]).toMatchObject({ volume: 2, fadeInMs: 10000, fadeOutMs: 0 });
    expect(updateAudioClip(comp, "cl-1", { volume: 0.8 })).toBe(comp);
    expectRoundTrip(out);
  });

  it("processors clamp to the schema ranges", () => {
    const comp = audioComp();
    const out = updateAudioClipProcessors(comp, "cl-1", {
      eq: { lowDb: -99, highDb: 99 },
      cleanup: { enabled: true, highPassHz: 9999, gateDb: 0 },
      reverb: 2,
    });
    expect(out.audioClips[0]!.processors).toEqual({
      eq: { lowDb: -15, midDb: 0, highDb: 15 },
      cleanup: { enabled: true, highPassHz: 400, gateDb: -20 },
      reverb: 1,
    });
    expect(updateAudioClipProcessors(comp, "cl-1", {})).toBe(comp);
    expectRoundTrip(out);
  });
});

describe("updateAudioMaster", () => {
  it("patches volumes and compressor with clamps; no-change is a no-op", () => {
    const comp = audioComp();
    const out = updateAudioMaster(comp, { volume: 3, videoVolume: 0.5, compressor: { enabled: true, thresholdDb: -30, ratio: 99 } });
    expect(out.audioMaster).toMatchObject({ volume: 2, videoVolume: 0.5 });
    expect(out.audioMaster.compressor).toMatchObject({ enabled: true, thresholdDb: -30, ratio: 20 });
    expect(updateAudioMaster(comp, { volume: 1 })).toBe(comp);
    expect(updateAudioMaster(comp, {})).toBe(comp);
    expectRoundTrip(out);
  });
});

describe("partition unaffected + purity", () => {
  it("audio ops never touch videoClips (same reference) and round-trip", () => {
    const comp = audioComp();
    const out = removeAudioTrack(addAudioTrack(comp, "music"), comp.audioTracks[0]!.id);
    expect(out.videoClips).toBe(comp.videoClips);
    expectRoundTrip(out);
  });

  it("no op mutates (or throws on) frozen input", () => {
    const comp = deepFreeze(audioComp());
    const before = snapshot(comp);
    addAudioTrack(comp, "voice");
    updateAudioTrack(comp, "tr-music", { name: "X", volume: 0.5 });
    setAudioDucking(comp, "tr-music", { enabled: true });
    removeAudioTrack(comp, "tr-voice");
    placeAudioClip(comp, { assetId: "a", assetName: "a.mp3", trackId: "tr-music", startMs: 0, sourceInMs: 0, sourceOutMs: 3000 });
    moveAudioClip(comp, "cl-1", { startMs: 2000 });
    trimAudioClip(comp, "cl-1", "start", 2000);
    trimAudioClip(comp, "cl-1", "end", 9000);
    splitAudioClipAt(comp, "cl-1", 5000);
    duplicateAudioClip(comp, "cl-1");
    removeAudioClip(comp, "cl-2");
    updateAudioClip(comp, "cl-1", { volume: 1.5, fadeInMs: 100 });
    updateAudioClipProcessors(comp, "cl-1", { eq: { midDb: 2 }, cleanup: { enabled: true }, reverb: 0.2 });
    updateAudioMaster(comp, { volume: 0.9, compressor: { ratio: 4 } });
    expect(comp).toEqual(before);
  });
});
