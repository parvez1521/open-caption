import { describe, expect, it } from "vitest";
import {
  generateRepurposed,
  repurposePartLabel,
  splitUnits,
  type RepurposeInput,
} from "../repurpose";
import { REPURPOSE_TRANSFORMS } from "../model";
import { generateContent, templateBatch, type ModelRunner } from "../service";
import { buildPrompt, parseModelOutput } from "../prompts";
import { EMPTY_VOICE, type BrandProfile } from "../brandProfile";

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

const scriptText = [
  "Nobody tells you this about sourdough.",
  "Your starter needs food, not hope.",
  "Feed it equal parts flour and water.",
  "Wait for the rise before you mix.",
  "That rise is the whole secret.",
].join("\n");

const run = (transform: RepurposeInput["transform"], sourceText = scriptText, profile?: BrandProfile | null) =>
  generateRepurposed({ transform, sourceText, profile });

describe("repurposing: splitting", () => {
  it("exposes all five transforms with labels", () => {
    expect(REPURPOSE_TRANSFORMS.map((t) => t.id)).toEqual([
      "reel-to-short",
      "long-to-shorts",
      "script-to-linkedin",
      "script-to-x-thread",
      "script-to-carousel",
    ]);
  });

  it("splits script-like input by lines, and a single block by sentences", () => {
    expect(splitUnits(scriptText)).toHaveLength(5);
    expect(splitUnits("First sentence here. Second one follows! And a third?")).toEqual([
      "First sentence here.",
      "Second one follows!",
      "And a third?",
    ]);
    expect(splitUnits("   \n \n ")).toEqual([]);
  });

  it("empty or whitespace source returns [] for every transform — nothing is invented", () => {
    for (const t of REPURPOSE_TRANSFORMS) {
      expect(run(t.id, "")).toEqual([]);
      expect(run(t.id, "   \n  ")).toEqual([]);
    }
  });
});

describe("repurposing: script-to-x-thread (meaning preservation)", () => {
  it("joined posts contain every source unit, in order, and each post is within the limit", () => {
    const items = run("script-to-x-thread");
    expect(items.length).toBeGreaterThanOrEqual(1);
    const joined = items.map((i) => i.title).join(" ");
    let cursor = 0;
    for (const unit of splitUnits(scriptText)) {
      const at = joined.indexOf(unit, cursor);
      expect(at).toBeGreaterThanOrEqual(cursor);
      cursor = at + unit.length;
    }
    for (const item of items) {
      expect(item.title.length).toBeLessThanOrEqual(280);
      expect(item.detail).toMatch(/^Post \d+ of \d+$/);
    }
    expect(items[0]!.title).toContain("Nobody tells you this about sourdough.");
  });

  it("packs short units together, never splitting a unit that fits", () => {
    const items = run("script-to-x-thread", "Short one.\nAlso short.\nThird short line.");
    // All three fit comfortably in one packed post each after the hook post.
    expect(items.length).toBeLessThanOrEqual(2);
    expect(items.map((i) => i.title).join(" ")).toContain("Also short. Third short line.");
  });

  it("hard-splits a single oversized unit at word boundaries", () => {
    const big = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const items = run("script-to-x-thread", big);
    expect(items.length).toBeGreaterThan(1);
    for (const item of items) expect(item.title.length).toBeLessThanOrEqual(270);
    expect(items.map((i) => i.title).join(" ")).toBe(big);
  });

  it("appends the profile CTA as a final, labelled post — the only added text", () => {
    const profile = makeProfile({ preferredCtas: ["Follow for part two."] });
    const items = run("script-to-x-thread", scriptText, profile);
    const last = items[items.length - 1]!;
    expect(last.title).toBe("Follow for part two.");
    expect(last.detail).toContain("CTA");
    expect(last.detail).toBe(`Post ${items.length} of ${items.length} · CTA`);
    const withoutProfile = run("script-to-x-thread");
    expect(withoutProfile.map((i) => i.title)).not.toContain("Follow for part two.");
  });
});

describe("repurposing: script-to-carousel (meaning preservation)", () => {
  it("slides are the source units, in order, labelled with roles", () => {
    const items = run("script-to-carousel");
    expect(items.map((i) => i.title)).toEqual(splitUnits(scriptText));
    expect(items[0]!.detail).toBe("Slide 1 of 5 · Hook");
    expect(items[items.length - 1]!.detail).toBe("Slide 5 of 5 · CTA");
    expect(items[1]!.detail).toContain("Point");
  });

  it("caps at 10 slides, merging overflow units into the last slide", () => {
    const many = Array.from({ length: 14 }, (_, i) => `Unit number ${i + 1} stands alone.`).join("\n");
    const items = run("script-to-carousel", many);
    expect(items).toHaveLength(10);
    expect(items[9]!.title).toContain("Unit number 10 stands alone.");
    expect(items[9]!.title).toContain("Unit number 14 stands alone.");
    expect(items[9]!.detail).toContain("CTA");
  });
});

describe("repurposing: script-to-linkedin (meaning preservation)", () => {
  it("produces one item containing all units in order, hook first, short paragraphs", () => {
    const items = run("script-to-linkedin");
    expect(items).toHaveLength(1);
    const title = items[0]!.title;
    let cursor = -1;
    for (const unit of splitUnits(scriptText)) {
      const at = title.indexOf(unit, cursor + 1);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
    expect(title.startsWith("Nobody tells you this about sourdough.")).toBe(true);
    expect(title).toContain("\n\n");
    expect(items[0]!.detail).toBe("LinkedIn post — your words, restructured: hook first, short paragraphs");
  });

  it("adds a CTA line only when a profile CTA exists — no invented CTA otherwise", () => {
    const plain = run("script-to-linkedin");
    expect(plain[0]!.title.endsWith("That rise is the whole secret.")).toBe(true);
    const profile = makeProfile({ preferredCtas: ["Follow for more sourdough."] });
    const withProfile = run("script-to-linkedin", scriptText, profile);
    expect(withProfile[0]!.title.endsWith("\n\nFollow for more sourdough.")).toBe(true);
  });
});

describe("repurposing: reel-to-short and long-to-shorts", () => {
  it("reel-to-short outlines hook, beats and a final CTA/payoff from a 30s split", () => {
    const items = run("reel-to-short");
    expect(items[0]).toMatchObject({ title: "Nobody tells you this about sourdough.", detail: "0–3s · Hook" });
    const last = items[items.length - 1]!;
    expect(last.title).toBe("That rise is the whole secret.");
    expect(last.detail).toBe("0:27–0:30 · CTA / payoff");
    for (const middle of items.slice(1, -1)) expect(middle.detail).toContain("Beat");
  });

  it("long-to-shorts titles each item with the unit's first sentence and caps at 6", () => {
    const source = [
      "Alpha opens the story. Then it wanders.",
      "Bravo is a full unit on its own.",
      "Charlie starts here. More follows.",
    ].join("\n");
    const items = run("long-to-shorts", source);
    expect(items.map((i) => i.title)).toEqual([
      "Alpha opens the story.",
      "Bravo is a full unit on its own.",
      "Charlie starts here.",
    ]);
    for (const item of items) {
      expect(item.detail).toBe("Short concept — film this part on its own (20–40 seconds), opening with its first line");
    }
    const many = Array.from({ length: 9 }, (_, i) => `Concept ${i + 1} in one line.`).join("\n");
    expect(run("long-to-shorts", many)).toHaveLength(6);
  });
});

describe("repurposing: prompts, parsing and service integration", () => {
  it("buildPrompt instructs restructure-only, one part per line, and carries the profile block", () => {
    const prompt = buildPrompt("repurpose", { transform: "script-to-carousel", sourceText: scriptText });
    expect(prompt.user).toContain("Restructure ONLY");
    expect(prompt.user).toContain("no new facts");
    expect(prompt.user).toContain("one part per line");
    expect(prompt.user).toContain("Nobody tells you this about sourdough.");
    const profile = makeProfile({ niche: "baking", wordsToAvoid: ["cheap"] });
    const withProfile = buildPrompt("repurpose", { transform: "script-to-carousel", sourceText: scriptText }, profile);
    expect(withProfile.user).toContain("Brand voice");
    expect(withProfile.user).toContain("AVOID");
  });

  it("parseModelOutput labels repurpose lines with the shared part labels", () => {
    const items = parseModelOutput("repurpose", "Slide text one\nSlide text two\nSlide text three", 10, "script-to-carousel");
    expect(items).toHaveLength(3);
    expect(items[0]!.detail).toBe(repurposePartLabel("script-to-carousel", 0, 3));
    expect(items[2]!.detail).toBe("Slide 3 of 3 · CTA");
  });

  it("templateBatch and generateContent route repurpose through the template engine", async () => {
    const input = { transform: "script-to-carousel" as const, sourceText: scriptText };
    expect(templateBatch("repurpose", input).map((i) => i.title)).toEqual(splitUnits(scriptText));
    const out = await generateContent("repurpose", input, { modelEnabled: false });
    expect(out.source).toBe("template");
    expect(out.items).toHaveLength(5);
  });

  it("the model path is used when it returns parts, labelled consistently", async () => {
    const runCloud: ModelRunner = async () => "First model part\nSecond model part";
    const out = await generateContent(
      "repurpose",
      { transform: "script-to-x-thread", sourceText: scriptText },
      { runCloud, modelEnabled: false },
    );
    expect(out.source).toBe("cloud");
    expect(out.items).toHaveLength(2);
    expect(out.items[0]!.detail).toBe("Post 1 of 2");
  });

  it("an empty template batch surfaces empty (the page must require source text)", async () => {
    const out = await generateContent(
      "repurpose",
      { transform: "script-to-x-thread", sourceText: "   " },
      { modelEnabled: false },
    );
    expect(out.source).toBe("template");
    expect(out.items).toEqual([]);
  });
});
