import { describe, expect, it } from "vitest";
import {
  assignTimings,
  buildScriptPrompt,
  generateScript,
  parseScriptOutput,
  scriptToText,
  type ScriptInput,
} from "../scripts";
import { SCRIPT_FORMATS } from "../model";
import { EMPTY_VOICE, containsAvoidedWord, type BrandProfile } from "../brandProfile";

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

const base: ScriptInput = { topic: "morning stretches", format: "reel", durationSec: 30, tone: "friendly" };

describe("Script Studio: template generation", () => {
  it("exposes all eight formats with labels", () => {
    expect(SCRIPT_FORMATS.map((f) => f.id)).toEqual([
      "reel",
      "short",
      "long-form",
      "tutorial",
      "demo",
      "story",
      "educational",
      "brand-collab",
    ]);
  });

  it("is deterministic and reflects the topic in title, dialogue and caption", () => {
    const a = generateScript(base);
    expect(a).toEqual(generateScript(base));
    expect(a.title.toLowerCase()).toContain("morning stretches");
    expect(a.beats.every((b) => b.dialogue.toLowerCase().includes("morning stretches"))).toBe(true);
    expect(a.caption.toLowerCase()).toContain("morning stretches");
    expect(a.hashtags.length).toBeGreaterThan(0);
    for (const tag of a.hashtags) expect(tag.startsWith("#")).toBe(true);
  });

  it("scaffolds short forms as Hook → middles → Payoff → CTA", () => {
    for (const format of ["reel", "short", "tutorial", "demo", "story", "educational", "brand-collab"] as const) {
      const doc = generateScript({ ...base, format, durationSec: 45 });
      expect(doc.beats[0]!.label).toBe("Hook");
      expect(doc.beats[doc.beats.length - 2]!.label).toBe("Payoff");
      expect(doc.beats[doc.beats.length - 1]!.label).toBe("CTA");
      const middles = doc.beats.slice(1, -2);
      expect(middles.length).toBeGreaterThanOrEqual(2);
      expect(middles.length).toBeLessThanOrEqual(4);
      expect(middles.map((b) => b.label)).toEqual(["Setup", "Main point", "Example"].slice(0, middles.length));
    }
  });

  it("scaffolds long-form as Hook → Context → chapters → Recap → CTA", () => {
    const doc = generateScript({ ...base, format: "long-form", durationSec: 300 });
    const labels = doc.beats.map((b) => b.label);
    expect(labels[0]).toBe("Hook");
    expect(labels[1]).toBe("Context");
    expect(labels[labels.length - 2]).toBe("Recap");
    expect(labels[labels.length - 1]).toBe("CTA");
    const chapters = labels.filter((l) => l.startsWith("Chapter"));
    expect(chapters.length).toBeGreaterThanOrEqual(3);
    expect(chapters.length).toBeLessThanOrEqual(5);
  });

  it("every beat carries dialogue, on-screen text and a concrete B-roll line", () => {
    const doc = generateScript({ ...base, format: "long-form", durationSec: 240 });
    for (const beat of doc.beats) {
      expect(beat.dialogue.length).toBeGreaterThan(15);
      expect(beat.onScreenText.length).toBeGreaterThan(3);
      expect(beat.onScreenText.length).toBeLessThanOrEqual(48);
      expect(beat.broll.length).toBeGreaterThan(15);
    }
  });

  it("uses the profile's first preferred CTA when one is saved, else a default-bank CTA", () => {
    const profile = makeProfile({ preferredCtas: ["Join the waitlist today", "Second CTA"] });
    expect(generateScript({ ...base, profile }).cta).toBe("Join the waitlist today");
    const plain = generateScript(base);
    expect(plain.cta.length).toBeGreaterThan(5);
    expect(plain.beats[plain.beats.length - 1]!.label).toBe("CTA");
  });

  it("caption platform mapping: long-form reads as a YouTube caption, short forms as Reels", () => {
    // generateCaptions is seeded by platform, so the two mappings produce the
    // hashtag sets of their respective platforms; at minimum both produce tags
    // and the long-form caption differs from the reel caption for same inputs.
    const reelDoc = generateScript({ ...base, format: "reel" });
    const longDoc = generateScript({ ...base, format: "long-form", durationSec: 300 });
    expect(reelDoc.hashtags.length).toBeGreaterThan(0);
    expect(longDoc.hashtags.length).toBeGreaterThan(0);
    expect(longDoc.caption).not.toBe(reelDoc.caption);
  });
});

describe("Script Studio: timing invariant", () => {
  const combos: ScriptInput[] = [
    { topic: "a", format: "reel", durationSec: 15, tone: "bold" },
    { topic: "b", format: "short", durationSec: 30, tone: "friendly" },
    { topic: "c", format: "tutorial", durationSec: 60, tone: "professional" },
    { topic: "d", format: "demo", durationSec: 90, tone: "minimal" },
    { topic: "e", format: "story", durationSec: 45, tone: "funny" },
    { topic: "f", format: "long-form", durationSec: 180, tone: "friendly" },
    { topic: "g", format: "long-form", durationSec: 600, tone: "professional" },
    { topic: "h", format: "long-form", durationSec: 1500, tone: "bold" },
    { topic: "i", format: "brand-collab", durationSec: 20, tone: "friendly" },
  ];

  it("beats are contiguous, start at 0, end at durationSec and sum exactly to it", () => {
    for (const input of combos) {
      const doc = generateScript(input);
      expect(doc.beats[0]!.startSec).toBe(0);
      expect(doc.beats[doc.beats.length - 1]!.endSec).toBe(input.durationSec);
      let sum = 0;
      doc.beats.forEach((beat, i) => {
        expect(beat.index).toBe(i);
        if (i > 0) expect(beat.startSec).toBe(doc.beats[i - 1]!.endSec);
        expect(beat.endSec).toBeGreaterThan(beat.startSec);
        sum += beat.endSec - beat.startSec;
      });
      expect(Math.abs(sum - input.durationSec)).toBeLessThan(0.001);
    }
  });

  it("assignTimings sums exactly for uneven weights", () => {
    const timings = assignTimings([1, 3, 2, 7], 47);
    expect(timings[0]!.startSec).toBe(0);
    expect(timings[timings.length - 1]!.endSec).toBe(47);
    const sum = timings.reduce((s, t) => s + (t.endSec - t.startSec), 0);
    expect(Math.abs(sum - 47)).toBeLessThan(0.001);
  });
});

describe("Script Studio: profile avoid words in template frames", () => {
  it("dialogue substitutes a clean frame where one exists, and CTA/caption stay clean", () => {
    // "skip" appears in exactly one Point frame and one Proof frame; a clean
    // substitute exists in each bank, so no beat dialogue should contain it.
    const profile = makeProfile({ wordsToAvoid: ["skip"] });
    const doc = generateScript({ topic: "home workouts", format: "tutorial", durationSec: 60, tone: "professional", profile });
    for (const beat of doc.beats) {
      expect(containsAvoidedWord(beat.dialogue, profile.voice)).toBe(false);
    }
    expect(containsAvoidedWord(doc.cta, profile.voice)).toBe(false);
    expect(containsAvoidedWord(doc.caption, profile.voice)).toBe(false);
  });
});

describe("Script Studio: scriptToText", () => {
  it("renders title, timed beat blocks, CTA, caption and hashtags", () => {
    const doc = generateScript({ ...base, durationSec: 60 });
    const text = scriptToText(doc);
    const lines = text.split("\n");
    expect(lines[0]).toBe(doc.title);
    expect(text).toContain("[00:00–");
    for (const beat of doc.beats) expect(text).toContain(beat.dialogue);
    expect(text).toContain(`CTA: ${doc.cta}`);
    expect(text).toContain(doc.caption);
    expect(text).toContain(doc.hashtags.join(" "));
    // Beat headers use mm:ss on both sides.
    expect(text).toMatch(/\[\d{2}:\d{2}–\d{2}:\d{2}\] Hook/);
  });

  it("is pure: same doc, same text", () => {
    const doc = generateScript(base);
    expect(scriptToText(doc)).toBe(scriptToText(doc));
  });
});

describe("Script Studio: model prompt + parser", () => {
  const goodRaw = [
    "TITLE: Morning stretches, simply",
    "BEAT | 0-5 | Hook | Stop guessing at morning stretches. | Stretches: stop guessing | Close-up speaking to camera",
    "BEAT | 5-20 | Main point | The order matters more than intensity. | Order first | Demonstration of the first stretch",
    "BEAT | 20-30 | CTA | Try it tomorrow morning. | Try it tomorrow | Speaker to camera",
    "CTA: Follow for part two.",
    "CAPTION: Morning stretches, documented. :: #stretching #morning",
  ].join("\n");

  it("buildScriptPrompt demands the exact line format and carries the profile block", () => {
    const prompt = buildScriptPrompt(base);
    expect(prompt.user).toContain("TITLE: <title>");
    expect(prompt.user).toContain("BEAT | <startSec>-<endSec> | <label> | <dialogue> | <on-screen text> | <b-roll>");
    expect(prompt.user).toContain("CTA: <cta>");
    expect(prompt.user).toContain("CAPTION: <caption text> :: <hashtags space-separated>");
    expect(prompt.user).not.toContain("Brand voice");
    const profile = makeProfile({ niche: "fitness", wordsToAvoid: ["guaranteed"] });
    const withProfile = buildScriptPrompt({ ...base, profile });
    expect(withProfile.user).toContain("Brand voice");
    expect(withProfile.user).toContain("AVOID");
  });

  it("parses a well-formed script, trusting usable timings", () => {
    const doc = parseScriptOutput(goodRaw, base);
    expect(doc).not.toBeNull();
    expect(doc!.title).toBe("Morning stretches, simply");
    expect(doc!.beats).toHaveLength(3);
    expect(doc!.beats[0]).toMatchObject({ startSec: 0, endSec: 5, label: "Hook" });
    expect(doc!.beats[2]!.endSec).toBe(30);
    expect(doc!.cta).toBe("Follow for part two.");
    expect(doc!.caption).toBe("Morning stretches, documented.");
    expect(doc!.hashtags).toEqual(["#stretching", "#morning"]);
  });

  it("returns null when fewer than two beats parse", () => {
    expect(parseScriptOutput("TITLE: Only a title", base)).toBeNull();
    expect(parseScriptOutput("BEAT | 0-5 | Hook | One lonely beat line here | Text | B-roll", base)).toBeNull();
    expect(parseScriptOutput("", base)).toBeNull();
    expect(parseScriptOutput("random prose\nmore prose", base)).toBeNull();
  });

  it("repairs timings that do not sum to durationSec by rescaling proportionally", () => {
    const raw = [
      "TITLE: Repair me",
      "BEAT | 0-10 | Hook | First beat dialogue here. | One | Camera",
      "BEAT | 10-20 | Point | Second beat dialogue here. | Two | Demo",
      "CTA: Do the thing.",
      "CAPTION: A caption :: #tag",
    ].join("\n");
    // Beats cover 0-20 but the script must last 60s: equal durations rescale to 30s each.
    const doc = parseScriptOutput(raw, { ...base, durationSec: 60 });
    expect(doc).not.toBeNull();
    expect(doc!.beats[0]).toMatchObject({ startSec: 0, endSec: 30 });
    expect(doc!.beats[1]).toMatchObject({ startSec: 30, endSec: 60 });
    const sum = doc!.beats.reduce((s, b) => s + (b.endSec - b.startSec), 0);
    expect(sum).toBe(60);
  });

  it("repairs unusable timings (gaps, wrong start) the same way", () => {
    const raw = [
      "BEAT | 5-9 | Hook | First beat dialogue here. | One | Camera",
      "BEAT | 30-33 | Point | Second beat dialogue here. | Two | Demo",
    ].join("\n");
    const doc = parseScriptOutput(raw, base);
    expect(doc).not.toBeNull();
    expect(doc!.beats[0]!.startSec).toBe(0);
    expect(doc!.beats[doc!.beats.length - 1]!.endSec).toBe(30);
  });

  it("fills a missing CTA from the profile rule and a missing caption from the caption generator", () => {
    const raw = [
      "BEAT | 0-15 | Hook | First beat dialogue here. | One | Camera",
      "BEAT | 15-30 | Point | Second beat dialogue here. | Two | Demo",
    ].join("\n");
    const profile = makeProfile({ preferredCtas: ["Join the waitlist today"] });
    const doc = parseScriptOutput(raw, { ...base, profile });
    expect(doc).not.toBeNull();
    expect(doc!.cta).toBe("Join the waitlist today");
    expect(doc!.caption.toLowerCase()).toContain("morning stretches");
    expect(doc!.hashtags.length).toBeGreaterThan(0);
    expect(doc!.title.length).toBeGreaterThan(3);
  });
});
