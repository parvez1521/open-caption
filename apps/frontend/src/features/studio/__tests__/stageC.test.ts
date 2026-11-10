import { describe, expect, it } from "vitest";
import { EMPTY_COMPOSITION_SETTINGS, type CompositionSettings } from "@capseasy/shared";
import {
  STAGE_C_ENABLED,
  buildStageCWritePatch,
  compositionColumnForm,
  readCompositionSettings,
} from "../stageC";

/**
 * Stage-C guard tests. Stage C is PREPARED, not activated (Gate G4): the
 * migration is unapplied, stageC.ts is imported by nothing in the app, and
 * these tests pin the inertness — if any of them fails, something has
 * started switching behaviour before the owner's go-ahead.
 */

/** Run-2 segment defaults (Phase 4 Run 2): the schema fills these on parse, so the fixture carries them explicitly. */
const SEG_DEFAULTS = {
  playbackRate: 1,
  transform: {
    cropLeft: 0, cropTop: 0, cropRight: 0, cropBottom: 0, rotateDeg: 0,
    flipH: false, flipV: false, scale: 1, offsetX: 0, offsetY: 0, opacity: 1,
  },
  transitionIn: null,
  assetId: null,
  still: false,
  keyframes: [] as { id: string; atMs: number; property: "offsetX" | "offsetY" | "scale" | "rotateDeg" | "opacity"; value: number; easing: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "hold" }[],
  effects: [] as { id: string; type: "blur" | "glow" | "vignette" | "grain"; enabled: boolean; amount: number; color: string }[],
} as const;

/** A rich, fully-populated slice: 3 contiguous segments, markers, non-default track states. */
const rich: CompositionSettings = {
  version: 1,
  videoSegments: [
    { id: "seg-1", sourceInMs: 0, sourceOutMs: 12_000, ...SEG_DEFAULTS },
    { id: "seg-2", sourceInMs: 12_000, sourceOutMs: 31_500, ...SEG_DEFAULTS },
    { id: "seg-3", sourceInMs: 31_500, sourceOutMs: 60_000, ...SEG_DEFAULTS },
  ],
  markers: [
    { id: "mk-1", atMs: 4_250, label: "Hook lands" },
    { id: "mk-2", atMs: 31_500, label: "" },
  ],
  tracks: {
    video: { locked: true, visible: true, muted: true },
    captions: { locked: false, visible: false, muted: false },
    text: { locked: false, visible: true, muted: true },
    graphics: { locked: true, visible: false, muted: false },
  },
  audio: {
    tracks: [],
    clips: [],
    master: { volume: 1, videoVolume: 1, compressor: { enabled: false, thresholdDb: -18, ratio: 3, kneeDb: 12, attackMs: 10, releaseMs: 200 } },
  },
};

describe("Stage C gate", () => {
  it("STAGE_C_ENABLED is true — Stage C was ACTIVATED under Gate G4 (2026-11-10)", () => {
    expect(STAGE_C_ENABLED).toBe(true);
  });
});

describe("compositionColumnForm — the projection is a bijection over JSON", () => {
  it("survives a JSON round trip deep-equal (the column stores JSON)", () => {
    const columnForm = compositionColumnForm(rich);
    const roundTripped = JSON.parse(JSON.stringify(columnForm)) as CompositionSettings;
    expect(roundTripped).toEqual(columnForm);
    expect(columnForm).toEqual(rich);
  });

  it("settings form → column form → read (no column value) returns the settings form deep-equal", () => {
    const columnForm = compositionColumnForm(rich);
    const read = readCompositionSettings({ settingsComposition: columnForm });
    expect(read.source).toBe("settings");
    expect(read.settings).toEqual(rich);
  });

  it("is idempotent: normalising the normalised form changes nothing", () => {
    expect(compositionColumnForm(compositionColumnForm(rich))).toEqual(compositionColumnForm(rich));
  });
});

describe("readCompositionSettings — old-project compatibility", () => {
  it("empty source → EMPTY_COMPOSITION_SETTINGS from settings, no throw", () => {
    const read = readCompositionSettings({});
    expect(read.source).toBe("settings");
    expect(read.settings).toEqual(EMPTY_COMPOSITION_SETTINGS);
  });

  it("explicit nulls → EMPTY_COMPOSITION_SETTINGS from settings, no throw", () => {
    const read = readCompositionSettings({ settingsComposition: null, compositionJson: null });
    expect(read.source).toBe("settings");
    expect(read.settings).toEqual(EMPTY_COMPOSITION_SETTINGS);
  });

  it.each([["nope"], [42], [{ version: 99 }]])(
    "garbage compositionJson (%j) → settings fallback, no throw",
    (garbage) => {
      const read = readCompositionSettings({ settingsComposition: rich, compositionJson: garbage });
      expect(read.source).toBe("settings");
      expect(read.settings).toEqual(rich);
    },
  );

  it("garbage compositionJson and no settings slice → EMPTY, no throw", () => {
    const read = readCompositionSettings({ compositionJson: { version: 99 } });
    expect(read.source).toBe("settings");
    expect(read.settings).toEqual(EMPTY_COMPOSITION_SETTINGS);
  });
});

describe("readCompositionSettings — ACTIVE configuration pins (post-G4 activation)", () => {
  it("a valid column value WINS over a different settings slice", () => {
    const read = readCompositionSettings({
      settingsComposition: EMPTY_COMPOSITION_SETTINGS,
      compositionJson: compositionColumnForm(rich),
    });
    expect(read.source).toBe("column");
    expect(read.settings).toEqual(rich);
  });

  it("a valid column value alone is adopted", () => {
    const read = readCompositionSettings({ compositionJson: rich });
    expect(read.source).toBe("column");
    expect(read.settings).toEqual(rich);
  });

  it("a project saved post-activation reopens identically (column round trip)", () => {
    const written = buildStageCWritePatch(rich);
    const read = readCompositionSettings({
      settingsComposition: rich,
      compositionJson: JSON.parse(JSON.stringify(written.composition_json)) as unknown,
    });
    expect(read.source).toBe("column");
    expect(read.settings).toEqual(rich);
  });
});

describe("buildStageCWritePatch", () => {
  it("returns exactly { composition_json: <the normalised form> }", () => {
    const patch = buildStageCWritePatch(rich);
    expect(Object.keys(patch)).toEqual(["composition_json"]);
    expect(patch).toEqual({ composition_json: compositionColumnForm(rich) });
    expect(patch.composition_json).toEqual(rich);
  });
});
