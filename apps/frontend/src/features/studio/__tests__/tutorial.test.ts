import { describe, expect, it } from "vitest";
import {
  TUTORIAL_SEEN_KEY,
  TUTORIAL_STEPS,
  isFirstStep,
  isLastStep,
  markTutorialSeen,
  shouldShowTutorial,
  stepIndexAfter,
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
    expect(TUTORIAL_SEEN_KEY).toBe("ce:tutorial-seen:v1");
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
  });
});

describe("tutorial steps", () => {
  it("has six steps in the brief's order with the studio anchors", () => {
    expect(TUTORIAL_STEPS).toHaveLength(6);
    expect(TUTORIAL_STEPS.map((s) => s.anchor)).toEqual(["captions", "captions", "templates", "captions", "style", "export"]);
    expect(TUTORIAL_STEPS.map((s) => s.title)).toEqual([
      "Your captions are ready",
      "Fix any word",
      "Pick a template",
      "Nudge the timing",
      "Make it yours",
      "Export",
    ]);
    for (const s of TUTORIAL_STEPS) {
      expect(s.body.length).toBeGreaterThan(20);
      expect(s.title).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u); // no emojis in headings
    }
  });

  it("navigation clamps at both ends", () => {
    expect(stepIndexAfter(0, 1)).toBe(1);
    expect(stepIndexAfter(4, 1)).toBe(5);
    expect(stepIndexAfter(5, 1)).toBe(5);
    expect(stepIndexAfter(0, -1)).toBe(0);
    expect(stepIndexAfter(3, -1)).toBe(2);
    expect(isFirstStep(0)).toBe(true);
    expect(isFirstStep(1)).toBe(false);
    expect(isLastStep(5)).toBe(true);
    expect(isLastStep(4)).toBe(false);
  });
});
