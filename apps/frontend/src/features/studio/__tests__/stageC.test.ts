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

/** A rich, fully-populated slice: 3 contiguous segments, markers, non-default track states. */
const rich: CompositionSettings = {
  version: 1,
  videoSegments: [
    { id: "seg-1", sourceInMs: 0, sourceOutMs: 12_000 },
    { id: "seg-2", sourceInMs: 12_000, sourceOutMs: 31_500 },
    { id: "seg-3", sourceInMs: 31_500, sourceOutMs: 60_000 },
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
};

describe("Stage C gate", () => {
  it("STAGE_C_ENABLED is false — the G4 gate stays shut until activation", () => {
    expect(STAGE_C_ENABLED).toBe(false);
  });
});

describe("compositionColumnForm — the projection is a bijection over JSON", () => {
  it("survives a JSON round trip deep-equal (the column stores JSON)", () => {
    const columnForm = compositionColumnForm(rich);
    const roundTripped = JSON.parse(JSON.stringify(columnForm)) as CompositionSettings;
    expect(roundTripped).toEqual(columnForm);
    expect(columnForm).toEqual(rich);
  });

  it("settings form → column form → read (flag off) returns the settings form deep-equal", () => {
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
    "garbage compositionJson (%j) with the flag off → settings source, no throw",
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

describe("readCompositionSettings — today's behaviour pin", () => {
  it("NEVER returns source 'column' while the flag is off, even with a perfectly valid compositionJson", () => {
    const read = readCompositionSettings({
      settingsComposition: EMPTY_COMPOSITION_SETTINGS,
      compositionJson: compositionColumnForm(rich),
    });
    expect(read.source).toBe("settings");
    expect(read.settings).toEqual(EMPTY_COMPOSITION_SETTINGS);
  });

  it("a valid column value is ignored entirely while the flag is off", () => {
    const read = readCompositionSettings({ compositionJson: rich });
    expect(read.source).toBe("settings");
    expect(read.settings).toEqual(EMPTY_COMPOSITION_SETTINGS);
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
