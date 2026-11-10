import { describe, expect, it } from "vitest";
import {
  EMPTY_BRAND_KIT_FORM,
  brandKitMode,
  formFromProfile,
  listToLines,
  parseLineList,
  updateInputFromForm,
  voiceFromForm,
  type BrandKitForm,
} from "../brandKitForm";
import { EMPTY_VOICE, type BrandProfile } from "@/features/create/brandProfile";

const profile: BrandProfile = {
  id: "p1",
  name: "Main account",
  isActive: true,
  colors: ["#FFA946", "#123456"],
  fontId: "Sora",
  voice: {
    niche: "home workouts",
    audience: "busy parents",
    language: "Hinglish",
    tone: "friendly",
    writingStyle: "short lines",
    wordsToUse: ["simple", "step by step"],
    wordsToAvoid: ["guaranteed"],
    sampleCaptions: ["Day 1 of 30. No equipment."],
    preferredCtas: ["Save this for later"],
  },
  createdAt: "2026-11-10T00:00:00Z",
  updatedAt: "2026-11-10T00:00:00Z",
};

describe("parseLineList", () => {
  it("splits one-per-line text into items", () => {
    expect(parseLineList("alpha\nbeta\ngamma")).toEqual(["alpha", "beta", "gamma"]);
  });

  it("trims each line and drops empty lines", () => {
    expect(parseLineList("  alpha  \n\n   \n beta \n")).toEqual(["alpha", "beta"]);
  });

  it("handles CRLF line endings", () => {
    expect(parseLineList("alpha\r\nbeta")).toEqual(["alpha", "beta"]);
  });

  it("drops exact duplicates, keeping the first occurrence in order", () => {
    expect(parseLineList("beta\nalpha\nbeta\nalpha")).toEqual(["beta", "alpha"]);
  });

  it("returns an empty list for empty or whitespace-only text", () => {
    expect(parseLineList("")).toEqual([]);
    expect(parseLineList("  \n \n")).toEqual([]);
  });
});

describe("listToLines", () => {
  it("joins items one per line, trimming and dropping empties", () => {
    expect(listToLines([" alpha ", "", "beta"])).toBe("alpha\nbeta");
  });

  it("round-trips with parseLineList", () => {
    const items = ["one", "two words", "three"];
    expect(parseLineList(listToLines(items))).toEqual(items);
  });
});

describe("brandKitMode", () => {
  it("is voice mode only when the server says voices are ready", () => {
    expect(brandKitMode(true)).toBe("voice");
    expect(brandKitMode(false)).toBe("legacy");
  });
});

describe("formFromProfile", () => {
  it("maps a profile into form state with voice lists as one-per-line text", () => {
    const form = formFromProfile(profile);
    expect(form.name).toBe("Main account");
    expect(form.colors).toEqual(["#FFA946", "#123456"]);
    expect(form.fontId).toBe("Sora");
    expect(form.niche).toBe("home workouts");
    expect(form.wordsToUseText).toBe("simple\nstep by step");
    expect(form.wordsToAvoidText).toBe("guaranteed");
    expect(form.sampleCaptionsText).toBe("Day 1 of 30. No equipment.");
    expect(form.preferredCtasText).toBe("Save this for later");
  });

  it("copies the colours array so form edits never mutate the profile", () => {
    const form = formFromProfile(profile);
    form.colors.push("#000000");
    expect(profile.colors).toEqual(["#FFA946", "#123456"]);
  });

  it("survives a profile with an empty voice", () => {
    const form = formFromProfile({ ...profile, voice: { ...EMPTY_VOICE } });
    expect(form.niche).toBe("");
    expect(form.wordsToUseText).toBe("");
  });
});

describe("voiceFromForm / updateInputFromForm", () => {
  const form: BrandKitForm = {
    ...EMPTY_BRAND_KIT_FORM,
    name: "Main account",
    colors: ["#FFA946"],
    fontId: null,
    niche: "home workouts",
    wordsToUseText: " simple \n\nstep by step\nsimple",
    wordsToAvoidText: "guaranteed",
    sampleCaptionsText: "",
    preferredCtasText: "Save this\nFollow for day 2",
  };

  it("parses the textarea lists back into a voice (trimmed, no empties, deduped)", () => {
    const voice = voiceFromForm(form);
    expect(voice.niche).toBe("home workouts");
    expect(voice.wordsToUse).toEqual(["simple", "step by step"]);
    expect(voice.wordsToAvoid).toEqual(["guaranteed"]);
    expect(voice.sampleCaptions).toEqual([]);
    expect(voice.preferredCtas).toEqual(["Save this", "Follow for day 2"]);
  });

  it("builds the full update payload: name, colours, font and voice", () => {
    const input = updateInputFromForm(form);
    expect(input.name).toBe("Main account");
    expect(input.colors).toEqual(["#FFA946"]);
    expect(input.fontId).toBeNull();
    expect(input.voice?.wordsToUse).toEqual(["simple", "step by step"]);
  });

  it("round-trips profile → form → update payload", () => {
    const input = updateInputFromForm(formFromProfile(profile));
    expect(input.name).toBe(profile.name);
    expect(input.colors).toEqual(profile.colors);
    expect(input.fontId).toBe(profile.fontId);
    expect(input.voice).toEqual(profile.voice);
  });
});
