import { describe, expect, it } from "vitest";
import {
  TUTORIAL_NEVER_KEY,
  TUTORIAL_SEEN_KEY,
  TUTORIAL_STEPS,
  isFirstStep,
  isLastStep,
  markTutorialNever,
  markTutorialSeen,
  shouldShowTutorial,
  shouldStartTutorial,
  stepIndexAfter,
  tutorialNeverShown,
} from "../tutorial";

const fakeStorage = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  };
};

describe("tutorial seen flag", () => {
  it("shows the tour only when the flag is unset", () => {
    expect(shouldShowTutorial(fakeStorage())).toBe(true);
    expect(shouldShowTutorial(fakeStorage({ [TUTORIAL_SEEN_KEY]: "1" }))).toBe(false);
    expect(TUTORIAL_SEEN_KEY).toBe("ce:tutorial-seen:v3");
  });

  it("marking seen sets the versioned flag so it never shows again", () => {
    const s = fakeStorage();
    markTutorialSeen(s);
    expect(s.map.get(TUTORIAL_SEEN_KEY)).toBe("1");
    expect(shouldShowTutorial(s)).toBe(false);
  });

  it("is safe without storage (SSR / blocked localStorage)", () => {
    expect(shouldShowTutorial(null)).toBe(false);
    expect(() => markTutorialSeen(null)).not.toThrow();
    expect(tutorialNeverShown(null)).toBe(false);
    expect(() => markTutorialNever(null)).not.toThrow();
    expect(shouldStartTutorial({ phase: "saved", hasWords: true, videoReady: false })).toBe(false);
  });
});

describe("tutorial start gate (owner 2026-11-25: never on the upload screen)", () => {
  it("never starts while no video is on this device, even with captions saved", () => {
    expect(shouldStartTutorial({ phase: "saved", hasWords: true, videoReady: false })).toBe(false);
    expect(shouldStartTutorial({ phase: "running", hasWords: true, videoReady: false })).toBe(false);
    expect(shouldStartTutorial({ phase: undefined, hasWords: true, videoReady: false })).toBe(false);
  });

  it("starts once a video is ready and captions have landed", () => {
    expect(shouldStartTutorial({ phase: "saved", hasWords: false, videoReady: true })).toBe(true);
    expect(shouldStartTutorial({ phase: "running", hasWords: true, videoReady: true })).toBe(true);
    expect(shouldStartTutorial({ phase: undefined, hasWords: true, videoReady: true })).toBe(true);
  });

  it("does not start with a video but no captions yet", () => {
    expect(shouldStartTutorial({ phase: "running", hasWords: false, videoReady: true })).toBe(false);
    expect(shouldStartTutorial({ phase: undefined, hasWords: false, videoReady: true })).toBe(false);
  });
});

describe("tutorial never-show opt-out (owner 2026-11-25)", () => {
  it("the never flag suppresses the tour even when the seen flag is unset", () => {
    expect(shouldShowTutorial(fakeStorage({ [TUTORIAL_NEVER_KEY]: "1" }))).toBe(false);
    expect(tutorialNeverShown(fakeStorage({ [TUTORIAL_NEVER_KEY]: "1" }))).toBe(true);
    expect(tutorialNeverShown(fakeStorage())).toBe(false);
    expect(TUTORIAL_NEVER_KEY).toBe("ce:tutorial-never-show");
  });

  it("marking never sets only the never key, and it survives a seen-flag bump", () => {
    const s = fakeStorage();
    markTutorialNever(s);
    expect(s.map.get(TUTORIAL_NEVER_KEY)).toBe("1");
    expect(s.map.get(TUTORIAL_SEEN_KEY)).toBeUndefined();
    expect(shouldShowTutorial(s)).toBe(false);
    // a future seen-flag version (v4) would re-show everyone else — never users stay out
    expect(shouldShowTutorial(fakeStorage({ [TUTORIAL_NEVER_KEY]: "1" }))).toBe(false);
  });

  it("marking seen does not set the never flag", () => {
    const s = fakeStorage();
    markTutorialSeen(s);
    expect(s.map.get(TUTORIAL_NEVER_KEY)).toBeUndefined();
    expect(tutorialNeverShown(s)).toBe(false);
  });

  it("the final step is still the export step, so the opt-out sits on Export", () => {
    const last = TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1]!;
    expect(last.id).toBe("export");
    expect(last.anchor).toBe("export");
  });
});

describe("tutorial steps", () => {
  it("has nine steps in the brief's order with the studio anchors", () => {
    expect(TUTORIAL_STEPS).toHaveLength(9);
    expect(TUTORIAL_STEPS.map((s) => s.anchor)).toEqual(["captions", "captions", "templates", "shift-all", "move-caption", "select-all-captions", "multi-select-captions", "style", "export"]);
    // the timing step spotlights the shift-all block and covers both ways to retime
    const timing = TUTORIAL_STEPS.find((s) => s.id === "timing")!;
    expect(timing.anchor).toBe("shift-all");
    expect(timing.body).toMatch(/shift every caption at once/i);
    expect(timing.body).toMatch(/drag/i);
    // positioning steps (owner 2026-11-25): single move, then Select All, then multi drag-select
    const move = TUTORIAL_STEPS.find((s) => s.id === "move-caption")!;
    expect(move.anchor).toBe("move-caption");
    expect(move.body).toMatch(/drag/i);
    const selectAll = TUTORIAL_STEPS.find((s) => s.id === "select-all-captions")!;
    expect(selectAll.anchor).toBe("select-all-captions");
    expect(selectAll.body).toMatch(/every caption/i);
    const multi = TUTORIAL_STEPS.find((s) => s.id === "multi-select-captions")!;
    expect(multi.anchor).toBe("multi-select-captions");
    expect(multi.body).toMatch(/drag/i);
    expect(TUTORIAL_STEPS.map((s) => s.title)).toEqual([
      "Your captions are ready",
      "Fix any word",
      "Pick a template",
      "Nudge the timing",
      "Move one caption",
      "Select all captions",
      "Move several captions",
      "Make it yours",
      "Export",
    ]);
    for (const s of TUTORIAL_STEPS) {
      expect(s.body.length).toBeGreaterThan(20);
      expect(s.title).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u); // no emojis in headings
    }
  });

  it("the export step says a free account is needed — guests meet the wall there, not after the work (PER-01-B)", () => {
    const exportStep = TUTORIAL_STEPS.find((s) => s.id === "export")!;
    expect(exportStep.body).toMatch(/free account/i);
    expect(exportStep.body).toMatch(/export/i);
  });

  it("navigation clamps at both ends", () => {
    expect(stepIndexAfter(0, 1)).toBe(1);
    expect(stepIndexAfter(7, 1)).toBe(8);
    expect(stepIndexAfter(8, 1)).toBe(8);
    expect(stepIndexAfter(0, -1)).toBe(0);
    expect(stepIndexAfter(3, -1)).toBe(2);
    expect(isFirstStep(0)).toBe(true);
    expect(isFirstStep(1)).toBe(false);
    expect(isLastStep(8)).toBe(true);
    expect(isLastStep(7)).toBe(false);
  });
});
