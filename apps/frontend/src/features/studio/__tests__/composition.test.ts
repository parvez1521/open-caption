import { describe, expect, it } from "vitest";
import { ProjectSettingsSchema, type Page, type Word } from "@capseasy/shared";
import { overlayClipsOf, overlayItemsOf, toComposition, trackOf, type CompositionInput } from "../composition";

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

const settings = ProjectSettingsSchema.parse({
  overlays: [
    { id: "ov-shape", kind: "shape", shape: "star", startMs: 5000, endMs: 8000 },
    { id: "ov-text", kind: "text", text: "Hi", startMs: 1000, endMs: 4000 },
    { id: "ov-img", kind: "image", assetId: "asset-1", assetName: "logo.png", startMs: 2000, endMs: 6000 },
  ],
});

const base: CompositionInput = {
  media: { videoId: "vid-1", filename: "clip.mp4", size: 12345, width: 1080, height: 1920, fps: 30, durationMs: 60_000 },
  doc: null,
  pages: [
    page("p2", [word("w3", "world", 3000, 3400)]),
    page("p1", [word("w1", "hello", 0, 400), word("w2", "there", 450, 900)]),
    page("p-empty", []),
  ],
  settings,
  durationMs: 60_000,
};

describe("toComposition (Stage-A read-side view)", () => {
  it("builds the four tracks in order: video, captions, text, graphics", () => {
    const comp = toComposition(base);
    expect(comp.version).toBe(1);
    expect(comp.tracks.map((t) => t.kind)).toEqual(["video", "captions", "text", "graphics"]);
    expect(comp.durationMs).toBe(60_000);
    expect(comp.canvas).toEqual({ width: 1080, height: 1920, fps: 30 });
  });

  it("makes the single main video clip span the whole duration from 0", () => {
    const clips = trackOf(toComposition(base), "video").clips;
    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({ id: "main-video", kind: "video", startMs: 0, endMs: 60_000, durationMs: 60_000 });
    expect(clips[0]!.kind === "video" && clips[0].source).toMatchObject({ type: "media", videoId: "vid-1", filename: "clip.mp4", size: 12345 });
  });

  it("derives caption clips from pages: sorted, word ids carried, empty pages dropped", () => {
    const clips = trackOf(toComposition(base), "captions").clips;
    expect(clips.map((c) => c.id)).toEqual(["p1", "p2"]);
    expect(clips[0]).toMatchObject({ kind: "caption", startMs: 0, endMs: 900, durationMs: 900, wordIds: ["w1", "w2"], text: "hello there" });
    expect(clips[1]).toMatchObject({ wordIds: ["w3"], text: "world" });
  });

  it("splits overlays into text (text+image) and graphics (shape) tracks, sorted by start", () => {
    const comp = toComposition(base);
    expect(trackOf(comp, "text").clips.map((c) => c.id)).toEqual(["ov-text", "ov-img"]);
    expect(trackOf(comp, "graphics").clips.map((c) => c.id)).toEqual(["ov-shape"]);
    const img = trackOf(comp, "text").clips[1]!;
    expect(img).toMatchObject({ kind: "image", startMs: 2000, endMs: 6000, durationMs: 4000 });
    // clips carry the stored overlay item by reference (read-side only)
    expect(img.kind !== "video" && img.kind !== "caption" && img.overlay).toBe(settings.overlays[2]);
  });

  it("overlayClipsOf combines both overlay tracks in timeline order", () => {
    expect(overlayClipsOf(toComposition(base)).map((c) => c.id)).toEqual(["ov-text", "ov-img", "ov-shape"]);
    expect(overlayItemsOf(toComposition(base), "shape").map((o) => o.id)).toEqual(["ov-shape"]);
    expect(overlayItemsOf(null, "text")).toEqual([]);
  });

  it("empty state: no media, no pages, no overlays — tracks exist, all clip lists empty", () => {
    const comp = toComposition({ media: null, doc: null, pages: [], settings: ProjectSettingsSchema.parse({}), durationMs: 0 });
    expect(comp.tracks.map((t) => t.kind)).toEqual(["video", "captions", "text", "graphics"]);
    expect(comp.tracks.every((t) => t.clips.length === 0)).toBe(true);
    expect(comp.durationMs).toBe(0);
    expect(comp.canvas).toEqual({ width: 1080, height: 1920, fps: 30 });
  });

  it("falls back to the media duration when the working duration is 0", () => {
    const comp = toComposition({ ...base, durationMs: 0 });
    expect(comp.durationMs).toBe(60_000);
    expect(trackOf(comp, "video").clips[0]).toMatchObject({ endMs: 60_000 });
  });

  it("no video clip when there is no media, even with captions present", () => {
    const comp = toComposition({ ...base, media: null });
    expect(trackOf(comp, "video").clips).toEqual([]);
    expect(trackOf(comp, "captions").clips).toHaveLength(2);
  });
});
