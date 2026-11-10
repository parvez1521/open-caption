import { describe, expect, it } from "vitest";
import { ProjectSettingsSchema, type Page, type ProjectSettings, type Word } from "@capseasy/shared";
import { toComposition, type CompositionInput } from "../composition";
import { buildEditorComposition, projectComposition, type EditorComposition } from "../compositionDoc";
import {
  PROFANITY_TERMS,
  approvedBleepRanges,
  findProfanityMatches,
  normalizeWordText,
} from "../audio/bleep";
import { addAudioBleeps, removeAudioBleep, setNoiseSuppressionAsset, updateAudioBleep } from "../audioOps";
import { buildMixPlan, mixIsActive } from "../audio/mixPlan";

/**
 * A6 bleep tests: matching (English + Roman Hinglish + Devanagari fixtures),
 * the approval gate (unapproved matches produce NOTHING), and the audioOps
 * storage path (pure/immutable, one composition per apply = one undo step,
 * round-trips through projectComposition).
 */

const word = (id: string, text: string, startMs: number, endMs: number): Word => ({ id, text, startMs, endMs });

describe("normalizeWordText", () => {
  it("lowercases and strips punctuation, quotes and emoji", () => {
    expect(normalizeWordText("Fuck!")).toBe("fuck");
    expect(normalizeWordText("“Shit.”")).toBe("shit");
    expect(normalizeWordText("BITCH")).toBe("bitch");
  });
  it("keeps Devanagari combining signs (vowel marks) intact", () => {
    expect(normalizeWordText("चूतिया।")).toBe("चूतिया");
    expect(normalizeWordText("मादरचोद!")).toBe("मादरचोद");
  });
});

describe("findProfanityMatches", () => {
  it("matches English words case/punctuation-insensitively, in order, with timestamps", () => {
    const words = [
      word("w1", "this", 0, 200),
      word("w2", "Fuck!", 250, 600),
      word("w3", "is", 650, 800),
      word("w4", "bullshit.", 850, 1400),
    ];
    const matches = findProfanityMatches(words);
    expect(matches.map((m) => [m.wordId, m.normalized, m.startMs, m.endMs])).toEqual([
      ["w2", "fuck", 250, 600],
      ["w4", "bullshit", 850, 1400],
    ]);
  });

  it("is whole-word only: substrings of innocent words never match", () => {
    const words = [
      word("w1", "class", 0, 300),
      word("w2", "shitake", 350, 800),
      word("w3", "cocktail", 850, 1300),
      word("w4", "Scunthorpe", 1350, 1900),
      word("w5", "assistant", 1950, 2400),
    ];
    expect(findProfanityMatches(words)).toEqual([]);
  });

  it("matches Roman-script Hindi/Hinglish profanity", () => {
    const words = [
      word("w1", "yeh", 0, 200),
      word("w2", "chutiya", 250, 700),
      word("w3", "hai", 750, 950),
      word("w4", "Madarchod", 1000, 1600),
    ];
    expect(findProfanityMatches(words).map((m) => m.normalized)).toEqual(["chutiya", "madarchod"]);
  });

  it("matches Devanagari-script profanity", () => {
    const words = [
      word("w1", "यह", 0, 200),
      word("w2", "चूतिया", 250, 700),
      word("w3", "है", 750, 950),
      word("w4", "मादरचोद।", 1000, 1600),
    ];
    expect(findProfanityMatches(words).map((m) => m.normalized)).toEqual(["चूतिया", "मादरचोद"]);
  });

  it("skips degenerate words and empty text", () => {
    const words = [word("w1", "fuck", 500, 500), word("w2", "", 600, 900), word("w3", "hello", 950, 1200)];
    expect(findProfanityMatches(words)).toEqual([]);
  });

  it("the shipped list is the small in-repo list (provenance guard)", () => {
    // authored in-repo (see bleep.ts header) — if this grows past a small hand
    // list, someone imported an external list and the provenance claim is void
    expect(PROFANITY_TERMS.length).toBeGreaterThan(30);
    expect(PROFANITY_TERMS.length).toBeLessThanOrEqual(80);
    expect(new Set(PROFANITY_TERMS).size).toBe(PROFANITY_TERMS.length);
  });
});

describe("the approval gate", () => {
  const words = [
    word("w1", "fuck", 100, 500),
    word("w2", "okay", 550, 900),
    word("w3", "shit", 950, 1300),
  ];
  const matches = findProfanityMatches(words);

  it("no approvals → no ranges at all", () => {
    expect(approvedBleepRanges(matches, new Set())).toEqual([]);
  });

  it("only the approved word produces a range", () => {
    expect(approvedBleepRanges(matches, new Set(["w3"]))).toEqual([
      { startMs: 950, endMs: 1300, wordText: "shit" },
    ]);
  });

  it("unknown approval ids are ignored", () => {
    expect(approvedBleepRanges(matches, new Set(["nope"]))).toEqual([]);
  });

  it("back-to-back approved words merge into one range (no tone stutter)", () => {
    const adjacent = findProfanityMatches([word("a", "fuck", 0, 400), word("b", "shit", 400, 800)]);
    expect(approvedBleepRanges(adjacent, new Set(["a", "b"]))).toEqual([
      { startMs: 0, endMs: 800, wordText: "fuck shit" },
    ]);
  });
});

/* ---------------- audioOps storage path ---------------- */

const page = (id: string, words: Word[]): Page => ({
  id, startMs: words[0]?.startMs ?? 0, endMs: words[words.length - 1]?.endMs ?? 0,
  words, lines: [words], heroIndex: -1, emotion: "neutral", position: null, styleOverride: null,
});
const pages = [page("p1", [word("w1", "hello", 0, 400)])];

function compFor(settings: ProjectSettings): EditorComposition {
  const input: CompositionInput = {
    media: { videoId: "vid-1", filename: "clip.mp4", size: 1, width: 1080, height: 1920, fps: 30, durationMs: 10_000 },
    doc: null, pages, settings, durationMs: 10_000,
  };
  return buildEditorComposition({ view: toComposition(input), settings, sourceDurationMs: 10_000 });
}
const emptyComp = () => compFor(ProjectSettingsSchema.parse({}));
const snapshot = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;

describe("audioOps bleep storage", () => {
  it("addAudioBleeps stores sorted, clamped ranges and never mutates the input", () => {
    const comp = emptyComp();
    const before = snapshot(comp);
    const next = addAudioBleeps(comp, [
      { startMs: 2000, endMs: 2600, wordText: "shit" },
      { startMs: 500, endMs: 900, wordText: "fuck", toneHz: 99_999, level: 7 },
    ]);
    expect(snapshot(comp)).toEqual(before);
    expect(next).not.toBe(comp);
    expect(next.audioBleeps.map((b) => [b.startMs, b.endMs])).toEqual([[500, 900], [2000, 2600]]);
    expect(next.audioBleeps[0]!.toneHz).toBe(4000); // clamped to the schema range
    expect(next.audioBleeps[0]!.level).toBe(1);
    expect(next.audioBleeps[1]!.toneHz).toBe(1000); // defaults
    expect(next.audioBleeps[1]!.level).toBe(0.5);
  });

  it("adding an identical range again, or an invalid one, is a same-reference no-op", () => {
    const comp = addAudioBleeps(emptyComp(), [{ startMs: 100, endMs: 400 }]);
    expect(addAudioBleeps(comp, [{ startMs: 100, endMs: 400 }])).toBe(comp);
    expect(addAudioBleeps(comp, [{ startMs: 500, endMs: 500 }])).toBe(comp);
    expect(addAudioBleeps(comp, [])).toBe(comp);
  });

  it("remove + update patch one bleep; unknown ids are no-ops", () => {
    const comp = addAudioBleeps(emptyComp(), [{ startMs: 100, endMs: 400 }]);
    const id = comp.audioBleeps[0]!.id;
    const updated = updateAudioBleep(comp, id, { toneHz: 880, level: 0.25 });
    expect(updated.audioBleeps[0]).toMatchObject({ toneHz: 880, level: 0.25 });
    expect(updateAudioBleep(comp, id, { toneHz: 1000 })).toBe(comp);
    expect(updateAudioBleep(comp, "nope", { level: 0.1 })).toBe(comp);
    expect(removeAudioBleep(updated, id).audioBleeps).toEqual([]);
    expect(removeAudioBleep(comp, "nope")).toBe(comp);
  });

  it("bleeps round-trip through projectComposition → settings → build, and activate the mix", () => {
    const base = ProjectSettingsSchema.parse({});
    const comp = addAudioBleeps(emptyComp(), [{ startMs: 100, endMs: 400, wordText: "fuck" }]);
    const projected = projectComposition(comp, base);
    expect(projected.composition.audio.bleeps).toHaveLength(1);
    expect(projected.composition.audio.bleeps[0]).toMatchObject({ startMs: 100, endMs: 400, wordText: "fuck", toneHz: 1000, level: 0.5 });
    const rebuilt = compFor(projected);
    expect(rebuilt.audioBleeps).toEqual(comp.audioBleeps);
    expect(mixIsActive(rebuilt)).toBe(true);
    const plan = buildMixPlan(rebuilt, 10_000);
    expect(plan.bleeps).toHaveLength(1);
    // bleeps are clamped to the plan duration
    const long = addAudioBleeps(emptyComp(), [{ startMs: 9000, endMs: 99_000 }]);
    expect(buildMixPlan(long, 10_000).bleeps[0]).toMatchObject({ startMs: 9000, endMs: 10_000 });
  });

  it("setNoiseSuppressionAsset sets/clears the derived-asset reference, no-op when unchanged", () => {
    const comp = emptyComp();
    expect(comp.audioNoiseSuppressionAssetId).toBeNull();
    const on = setNoiseSuppressionAsset(comp, "asset-1");
    expect(on.audioNoiseSuppressionAssetId).toBe("asset-1");
    expect(setNoiseSuppressionAsset(on, "asset-1")).toBe(on);
    expect(setNoiseSuppressionAsset(on, null).audioNoiseSuppressionAssetId).toBeNull();
    expect(mixIsActive(on)).toBe(true);
    const projected = projectComposition(on, ProjectSettingsSchema.parse({}));
    expect(projected.composition.audio.noiseSuppressionAssetId).toBe("asset-1");
    expect(compFor(projected).audioNoiseSuppressionAssetId).toBe("asset-1");
  });

  it("with noise suppression set, the mix plan reads video audio from the derived asset", () => {
    const comp = setNoiseSuppressionAsset(emptyComp(), "denoised-wav");
    const plan = buildMixPlan(comp, 10_000);
    const videoItems = plan.items.filter((i) => i.kind === "video");
    expect(videoItems.length).toBeGreaterThan(0);
    expect(videoItems.every((i) => i.assetId === "denoised-wav")).toBe(true);
  });
});
