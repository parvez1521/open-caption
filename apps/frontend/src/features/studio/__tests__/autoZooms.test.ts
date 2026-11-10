import { describe, expect, it } from "vitest";
import { ProjectSettingsSchema, type ProjectSettings, type Word } from "@capseasy/shared";
import { toComposition, type CompositionInput } from "../composition";
import { buildEditorComposition, projectComposition, type EditorComposition } from "../compositionDoc";
import {
  AUTO_ZOOM_INTENSITY_SCALE,
  applyAutoZooms,
  detectAutoZoomSignals,
  generateAutoZoomPlan,
  removeAutoZoomKeyframes,
  type AutoZoomClipLike,
  type AutoZoomWordLike,
} from "../autoZooms";

/**
 * A4 — auto punch-in zooms: deterministic signals (emphasised words, sentence
 * starts after a ≥600 ms pause, waveform volume peaks) → ordinary 4.7 scale
 * keyframes, segment-local via the composition mapping, with the stated
 * collision rule, applied through compositionOps in one composition, and
 * fully removable (delete-all restores the untouched projection).
 */

const word = (id: string, text: string, startMs: number, endMs: number, extra: Partial<AutoZoomWordLike> = {}): AutoZoomWordLike => ({
  id, text, startMs, endMs, ...extra,
});
const clip = (id: string, startMs: number, durationMs: number, extra: Partial<AutoZoomClipLike> = {}): AutoZoomClipLike => ({
  id, startMs, durationMs, transform: { scale: 1 }, keyframes: [], ...extra,
});

/** peaks fixture: hop 100 ms, a single local maximum of 0.9 at t=5000, low elsewhere */
function peaksFixture(): { peaks: Float32Array; hopMs: number } {
  const peaks = new Float32Array(200).fill(0.2);
  peaks[49] = 0.5; peaks[50] = 0.9; peaks[51] = 0.5;
  return { peaks, hopMs: 100 };
}

const baseWords: AutoZoomWordLike[] = [
  word("w1", "hello", 0, 400),
  word("w2", "amazing", 1000, 1400, { emphasis: "hero" }),
  word("w3", "world", 2100, 2500), // starts 700 ms after w2 ends → pause signal
  word("w4", "secret", 3000, 3400, { hidden: true, emphasis: "hero" }), // hidden: never a signal
];

describe("detectAutoZoomSignals", () => {
  it("finds emphasis, pause-start and volume-peak signals; hidden words never signal", () => {
    const signals = detectAutoZoomSignals({ words: baseWords, peaks: peaksFixture() });
    expect(signals).toEqual([
      { kind: "emphasis", atMs: 1000 },
      { kind: "pause", atMs: 2100 },
      { kind: "volume", atMs: 5000 },
    ]);
  });

  it("a gap below the stated 600 ms threshold is not a pause signal", () => {
    const signals = detectAutoZoomSignals({
      words: [word("a", "one", 0, 400), word("b", "two", 999, 1300)],
    });
    expect(signals).toEqual([]);
  });

  it("peaks below threshold, and flat/non-maximum samples, are not volume signals", () => {
    const peaks = new Float32Array(50).fill(0.84);
    peaks[10] = 0.84; // below 0.85 everywhere
    expect(detectAutoZoomSignals({ words: [], peaks: { peaks, hopMs: 100 } })).toEqual([]);
  });

  it("the same moment offered by two signals keeps the stronger kind (emphasis over volume)", () => {
    const peaks = new Float32Array(100).fill(0.1);
    peaks[9] = 0.4; peaks[10] = 0.95; peaks[11] = 0.4; // volume peak at t=1000
    const signals = detectAutoZoomSignals({
      words: [word("w", "big", 1000, 1400, { emphasis: "strong" })],
      peaks: { peaks, hopMs: 100 },
    });
    expect(signals).toEqual([{ kind: "emphasis", atMs: 1000 }]);
  });
});

describe("generateAutoZoomPlan — placement and shape", () => {
  it("proposes the four-keyframe punch (base → target → target → base) at segment-local times", () => {
    const plan = generateAutoZoomPlan({
      words: baseWords, clips: [clip("seg-1", 0, 20_000)], peaks: peaksFixture(), intensity: "medium",
    });
    expect(plan.skipped).toEqual([]);
    expect(plan.zooms.map((z) => [z.kind, z.signalAtMs])).toEqual([
      ["emphasis", 1000], ["pause", 2100], ["volume", 5000],
    ]);
    expect(plan.zooms[0]!.keyframes).toEqual([
      { atMs: 850, value: 1 },
      { atMs: 1000, value: 1.3 },
      { atMs: 1400, value: 1.3 },
      { atMs: 1550, value: 1 },
    ]);
  });

  it("maps the intensity choice to concrete scale multipliers of the segment's base scale", () => {
    expect(AUTO_ZOOM_INTENSITY_SCALE).toEqual({ subtle: 1.15, medium: 1.3, strong: 1.5 });
    const one = [word("w", "big", 1000, 1400, { emphasis: "hero" })];
    const subtle = generateAutoZoomPlan({ words: one, clips: [clip("s", 0, 10_000)], intensity: "subtle" });
    expect(subtle.zooms[0]!.keyframes[1]!.value).toBe(1.15);
    const strong = generateAutoZoomPlan({ words: one, clips: [clip("s", 0, 10_000)], intensity: "strong" });
    expect(strong.zooms[0]!.keyframes[1]!.value).toBe(1.5);
    // a segment already scaled 2× punches to 2 × 1.3, not to an absolute 1.3
    const based = generateAutoZoomPlan({ words: one, clips: [clip("s", 0, 10_000, { transform: { scale: 2 } })], intensity: "medium" });
    expect(based.zooms[0]!.keyframes).toEqual([
      { atMs: 850, value: 2 }, { atMs: 1000, value: 2.6 }, { atMs: 1400, value: 2.6 }, { atMs: 1550, value: 2 },
    ]);
  });

  it("maps doc time to segment-local time across a multi-segment composition", () => {
    const plan = generateAutoZoomPlan({
      words: [word("w", "later", 16_000, 16_400, { emphasis: "hero" })],
      clips: [clip("seg-1", 0, 15_000), clip("seg-2", 15_000, 15_000)],
      intensity: "medium",
    });
    expect(plan.zooms).toHaveLength(1);
    expect(plan.zooms[0]!.clipId).toBe("seg-2");
    // doc 16000 − segment start 15000 = local 1000, shaped exactly like a local punch
    expect(plan.zooms[0]!.keyframes.map((k) => k.atMs)).toEqual([850, 1000, 1400, 1550]);
  });
});

describe("generateAutoZoomPlan — the stated collision / skip rules", () => {
  it("colliding windows: the higher-priority signal wins, the other is reported skipped", () => {
    const plan = generateAutoZoomPlan({
      words: [
        word("a", "first", 1000, 1300, { emphasis: "hero" }),
        word("c", "close", 1700, 2000, { emphasis: "strong" }), // window [1550,2250] overlaps the first zoom's window [850,1550] under the gap rule
      ],
      clips: [clip("s", 0, 20_000)],
      intensity: "medium",
    });
    const placed = plan.zooms.map((z) => z.signalAtMs);
    expect(placed).toContain(1000);
    expect(placed).not.toContain(1700);
    expect(plan.skipped).toContainEqual({ kind: "emphasis", signalAtMs: 1700, reason: "collision" });
  });

  it("a zoom whose window would run past the segment end is skipped, not clamped", () => {
    const plan = generateAutoZoomPlan({
      words: [word("w", "late", 9700, 9900, { emphasis: "hero" })],
      clips: [clip("s", 0, 10_000)],
      intensity: "medium",
    });
    expect(plan.zooms).toEqual([]);
    expect(plan.skipped).toEqual([{ kind: "emphasis", signalAtMs: 9700, reason: "past-segment-end" }]);
  });

  it("a segment's existing scale keyframes inside the window veto the zoom; stills and no-segment signals skip too", () => {
    const withKf = generateAutoZoomPlan({
      words: [word("w", "big", 1000, 1400, { emphasis: "hero" })],
      clips: [clip("s", 0, 10_000, { keyframes: [{ id: "k1", atMs: 1100, property: "scale", value: 2, easing: "linear" }] })],
      intensity: "medium",
    });
    expect(withKf.skipped).toEqual([{ kind: "emphasis", signalAtMs: 1000, reason: "existing-keyframes" }]);

    const still = generateAutoZoomPlan({
      words: [word("w", "big", 1000, 1400, { emphasis: "hero" })],
      clips: [clip("s", 0, 10_000, { still: true })],
      intensity: "medium",
    });
    expect(still.skipped[0]!.reason).toBe("still-segment");

    const outside = generateAutoZoomPlan({
      words: [word("w", "big", 30_000, 30_400, { emphasis: "hero" })],
      clips: [clip("s", 0, 10_000)],
      intensity: "medium",
    });
    expect(outside.skipped[0]!.reason).toBe("no-segment");
  });
});

/* ---------- apply through compositionOps, on a real editor composition ---------- */

const baseSettings: ProjectSettings = ProjectSettingsSchema.parse({});
const segmentedSettings: ProjectSettings = ProjectSettingsSchema.parse({
  clipRange: { startMs: 10_000, endMs: 40_000 },
  composition: {
    version: 1,
    videoSegments: [
      { id: "seg-1", sourceInMs: 10_000, sourceOutMs: 25_000 },
      { id: "seg-2", sourceInMs: 25_000, sourceOutMs: 40_000 },
    ],
  },
});

function compFor(settings: ProjectSettings): EditorComposition {
  const input: CompositionInput = {
    media: { videoId: "vid-1", filename: "clip.mp4", size: 1, width: 1080, height: 1920, fps: 30, durationMs: 120_000 },
    doc: null,
    pages: [],
    settings,
    durationMs: 30_000,
  };
  return buildEditorComposition({ view: toComposition(input), settings, sourceDurationMs: 120_000 });
}

describe("applyAutoZooms — op-level application and removal", () => {
  it("creates ordinary scale keyframes on the right segments, in ONE composition", () => {
    const comp = compFor(segmentedSettings);
    const words: Word[] = [
      { id: "w1", text: "early", startMs: 1000, endMs: 1400, emphasis: "hero" },
      { id: "w2", text: "later", startMs: 16_000, endMs: 16_400, emphasis: "strong" },
    ];
    const plan = generateAutoZoomPlan({ words, clips: comp.videoClips, intensity: "medium" });
    const { comp: next, applied } = applyAutoZooms(comp, plan);
    expect(next).not.toBe(comp);
    expect(applied).toHaveLength(2);
    const seg1 = next.videoClips.find((c) => c.id === "seg-1")!;
    const seg2 = next.videoClips.find((c) => c.id === "seg-2")!;
    expect(seg1.keyframes.map((k) => [k.atMs, k.property, k.value])).toEqual([
      [850, "scale", 1], [1000, "scale", 1.3], [1400, "scale", 1.3], [1550, "scale", 1],
    ]);
    // doc 16000 lands on seg-2 at local 1000 — the same local shape
    expect(seg2.keyframes.map((k) => k.atMs)).toEqual([850, 1000, 1400, 1550]);
    expect(seg1.keyframes.every((k) => k.id.length > 0)).toBe(true);
    // the input composition was not mutated
    expect(comp.videoClips.every((c) => (c.keyframes ?? []).length === 0)).toBe(true);
    // the projected settings carry the keyframes (they persist like any keyframe)
    const projected = projectComposition(next, segmentedSettings);
    expect(projected.composition!.videoSegments[0]!.keyframes).toHaveLength(4);
  });

  it("deleting every generated keyframe restores the untouched render exactly", () => {
    const comp = compFor(segmentedSettings);
    const before = projectComposition(comp, segmentedSettings);
    const words: Word[] = [{ id: "w1", text: "early", startMs: 1000, endMs: 1400, emphasis: "hero" }];
    const plan = generateAutoZoomPlan({ words, clips: comp.videoClips, intensity: "strong" });
    const { comp: zoomed, applied } = applyAutoZooms(comp, plan);
    expect(zoomed.videoClips[0]!.keyframes).toHaveLength(4);
    const restored = removeAutoZoomKeyframes(zoomed, applied);
    expect(restored.videoClips.every((c) => (c.keyframes ?? []).length === 0)).toBe(true);
    expect(projectComposition(restored, segmentedSettings)).toEqual(before);
  });

  it("an empty plan is a same-reference no-op", () => {
    const comp = compFor(baseSettings);
    const { comp: next, applied } = applyAutoZooms(comp, { intensity: "medium", zooms: [], skipped: [] });
    expect(next).toBe(comp);
    expect(applied).toEqual([]);
  });
});
