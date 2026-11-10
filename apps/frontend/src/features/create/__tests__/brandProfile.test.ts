import { describe, expect, it } from "vitest";
import {
  EMPTY_VOICE,
  containsAvoidedWord,
  normalizeVoice,
  profilePromptBlock,
  type BrandProfile,
} from "../brandProfile";

const makeProfile = (voice: Partial<BrandProfile["voice"]>): BrandProfile => ({
  id: "profile-1",
  name: "Test profile",
  isActive: true,
  colors: [],
  fontId: null,
  voice: { ...EMPTY_VOICE, ...voice },
  createdAt: "2026-11-10T00:00:00.000Z",
  updatedAt: "2026-11-10T00:00:00.000Z",
});

describe("brandProfile contract", () => {
  it("EMPTY_VOICE is all empty strings and empty arrays", () => {
    expect(EMPTY_VOICE).toEqual({
      niche: "",
      audience: "",
      language: "",
      tone: "",
      writingStyle: "",
      wordsToUse: [],
      wordsToAvoid: [],
      sampleCaptions: [],
      preferredCtas: [],
    });
  });

  it("normalizeVoice defensively coerces untrusted data", () => {
    expect(normalizeVoice(null)).toEqual(EMPTY_VOICE);
    expect(normalizeVoice("nope")).toEqual(EMPTY_VOICE);
    expect(normalizeVoice(42)).toEqual(EMPTY_VOICE);
    const voice = normalizeVoice({
      niche: "fitness",
      audience: 42,
      wordsToUse: ["honest", 7, "  clear  ", ""],
      wordsToAvoid: "not-an-array",
      preferredCtas: ["Save this"],
    });
    expect(voice.niche).toBe("fitness");
    expect(voice.audience).toBe("");
    expect(voice.wordsToUse).toEqual(["honest", "clear"]);
    expect(voice.wordsToAvoid).toEqual([]);
    expect(voice.preferredCtas).toEqual(["Save this"]);
  });

  it("profilePromptBlock is empty for an empty voice", () => {
    expect(profilePromptBlock(makeProfile({}))).toBe("");
  });

  it("profilePromptBlock describes the voice and names the AVOID list explicitly", () => {
    const block = profilePromptBlock(
      makeProfile({ niche: "home workouts", tone: "direct", wordsToAvoid: ["guaranteed", "miracle cure"] }),
    );
    expect(block).toContain("home workouts");
    expect(block).toContain("direct");
    expect(block).toContain("AVOID");
    expect(block).toContain("guaranteed");
    expect(block).toContain("miracle cure");
  });

  it("containsAvoidedWord matches whole words and phrases, case-insensitively", () => {
    const voice = { ...EMPTY_VOICE, wordsToAvoid: ["Cheap", "miracle cure"] };
    expect(containsAvoidedWord("This is CHEAP and cheerful", voice)).toBe(true);
    expect(containsAvoidedWord("A Miracle Cure for everything", voice)).toBe(true);
    expect(containsAvoidedWord("cheaper options exist", voice)).toBe(false);
    expect(containsAvoidedWord("a miracle, cured at last", voice)).toBe(false);
    expect(containsAvoidedWord("nothing relevant here", voice)).toBe(false);
    expect(containsAvoidedWord("anything", EMPTY_VOICE)).toBe(false);
  });
});
