import { describe, expect, it } from "vitest";
import {
  CATEGORY_FORMATS,
  generateCaptions,
  generateHooks,
  generateIdeas,
  HOOK_FRAMES,
  HOOK_MECHANISMS,
  LIBRARY_COUNTS,
} from "../templates";
import { CAPTION_TONES, HOOK_STYLES, IDEA_CATEGORIES, PLATFORMS } from "../model";
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

describe("template engine: ideas", () => {
  const input = { niche: "home workouts", platform: "reels" as const, audience: "busy parents", count: 5 };

  it("honours the requested count, clamped to 1..10", () => {
    expect(generateIdeas(input)).toHaveLength(5);
    expect(generateIdeas({ ...input, count: 1 })).toHaveLength(1);
    expect(generateIdeas({ ...input, count: 99 })).toHaveLength(10);
  });

  it("reflects the niche and audience in the text", () => {
    for (const item of generateIdeas(input)) {
      expect(item.title.toLowerCase()).toContain("home workouts");
      expect(item.detail).toContain("busy parents");
    }
  });

  it("is deterministic: same inputs, same batch", () => {
    expect(generateIdeas(input)).toEqual(generateIdeas(input));
  });

  it("different inputs produce different batches", () => {
    expect(generateIdeas(input)).not.toEqual(generateIdeas({ ...input, niche: "sourdough baking" }));
  });

  it("works for every platform with well-formed items", () => {
    for (const p of PLATFORMS) {
      const items = generateIdeas({ ...input, platform: p.id });
      expect(items).toHaveLength(5);
      for (const item of items) {
        expect(item.title.length).toBeGreaterThan(10);
        expect(item.detail).toBeTruthy();
      }
    }
  });

  it("never emits placeholder text", () => {
    const all = generateIdeas(input).map((i) => `${i.title} ${i.detail}`).join(" ");
    expect(all.toLowerCase()).not.toContain("lorem");
    expect(all).not.toContain("{niche}");
    expect(all).not.toContain("{audience}");
  });
});

describe("template engine: hooks", () => {
  it("covers every style with at least 8 frames each", () => {
    for (const s of HOOK_STYLES) {
      expect(HOOK_FRAMES[s.id].length).toBeGreaterThanOrEqual(8);
      expect(LIBRARY_COUNTS.hookFramesPerStyle[s.id]).toBe(HOOK_FRAMES[s.id].length);
    }
  });

  it("reflects the topic in every hook, for every style", () => {
    for (const s of HOOK_STYLES) {
      const items = generateHooks({ topic: "morning routines", style: s.id, platform: "shorts", count: 6 });
      expect(items).toHaveLength(6);
      for (const item of items) expect(item.title.toLowerCase()).toContain("morning routines");
    }
  });

  it("honours counts above the frame count by varying delivery notes", () => {
    const items = generateHooks({ topic: "chess", style: "curiosity", platform: "reels", count: 10 });
    expect(items).toHaveLength(10);
    expect(new Set(items.map((i) => i.title)).size).toBe(8);
  });
});

describe("template engine: captions", () => {
  it("returns three options, each with caption text and a hashtag set", () => {
    const items = generateCaptions({ topic: "trail running", platform: "reels", tone: "friendly" });
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.title.toLowerCase()).toContain("trail running");
      expect(item.hashtags?.length).toBeGreaterThanOrEqual(5);
      for (const tag of item.hashtags!) expect(tag.startsWith("#")).toBe(true);
    }
  });

  it("works for every tone and platform", () => {
    for (const t of CAPTION_TONES) {
      for (const p of PLATFORMS) {
        const items = generateCaptions({ topic: "pottery classes", platform: p.id, tone: t.id });
        expect(items).toHaveLength(3);
        expect(items[0]!.hashtags!.length).toBeGreaterThan(0);
      }
    }
  });

  it("pulls hashtags from the matching topic cluster", () => {
    const items = generateCaptions({ topic: "home gym workouts", platform: "shorts", tone: "bold" });
    const all = items.flatMap((i) => i.hashtags!);
    expect(all.some((t) => ["#fitness", "#gymlife", "#workoutmotivation", "#fitfam"].includes(t))).toBe(true);
  });

  it("falls back to generic tags for an unclustered topic", () => {
    const items = generateCaptions({ topic: "competitive duck herding", platform: "tiktok", tone: "minimal" });
    const all = items.flatMap((i) => i.hashtags!);
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((t) => t.toLowerCase().includes("duck"))).toBe(true);
  });
});

describe("Hook Lab completion: nine styles with mechanisms", () => {
  it("exposes nine styles with the brief's labels", () => {
    expect(HOOK_STYLES).toHaveLength(9);
    expect(HOOK_STYLES.map((s) => s.id)).toEqual([
      "curiosity",
      "problem-solution",
      "story",
      "controversial",
      "pattern-interrupt",
      "contrarian",
      "numbers",
      "open-loop",
      "unexpected",
    ]);
    const labels = Object.fromEntries(HOOK_STYLES.map((s) => [s.id, s.label]));
    expect(labels["contrarian"]).toBe("Contrarian");
    expect(labels["numbers"]).toBe("Numbers and statistics");
    expect(labels["open-loop"]).toBe("Open loop");
    expect(labels["unexpected"]).toBe("Unexpected statement");
    expect(labels["story"]).toBe("Storytelling");
    expect(labels["problem-solution"]).toBe("Problem-based");
  });

  it("has 8 frames and a mechanism for every new style", () => {
    for (const id of ["contrarian", "numbers", "open-loop", "unexpected"] as const) {
      expect(HOOK_FRAMES[id]).toHaveLength(8);
      expect(HOOK_MECHANISMS[id].length).toBeGreaterThan(40);
    }
    expect(LIBRARY_COUNTS.hookMechanisms).toBe(9);
  });

  it("attaches the style mechanism to every generated hook, with no outcome promises", () => {
    for (const s of HOOK_STYLES) {
      const items = generateHooks({ topic: "morning routines", style: s.id, platform: "reels", count: 4 });
      for (const item of items) {
        expect(item.mechanism).toBe(HOOK_MECHANISMS[s.id]);
        expect(item.detail).toBeTruthy();
      }
      const mechanism = HOOK_MECHANISMS[s.id].toLowerCase();
      expect(mechanism).not.toContain("will go viral");
      expect(mechanism).not.toContain("guarantee");
      expect(mechanism).not.toContain("viral");
    }
  });
});

describe("Ideas completion: category, difficulty, duration and objective", () => {
  const base = { niche: "home workouts", platform: "reels" as const, audience: "busy parents", count: 5 };

  it("has 4 category frames per category, 28 total, counted in LIBRARY_COUNTS", () => {
    expect(IDEA_CATEGORIES).toHaveLength(7);
    for (const c of IDEA_CATEGORIES) {
      expect(CATEGORY_FORMATS[c.id]).toHaveLength(4);
      expect(LIBRARY_COUNTS.categoryFormatsPerCategory[c.id]).toBe(4);
    }
    expect(LIBRARY_COUNTS.categoryFormats).toBe(28);
  });

  it("category really changes the title set for the same niche and platform", () => {
    const educational = generateIdeas({ ...base, category: "educational" });
    const entertainment = generateIdeas({ ...base, category: "entertainment" });
    expect(entertainment).not.toEqual(educational);
    const eduTitles = new Set(educational.map((i) => i.title));
    const entTitles = entertainment.map((i) => i.title);
    expect(entTitles.some((t) => !eduTitles.has(t))).toBe(true);
    // Category frames are interleaved in, so each batch contains at least one category title.
    const eduFrames = new Set(CATEGORY_FORMATS.educational.map((f) => f.title));
    expect(educational.some((i) => [...eduFrames].some((frame) => frame.replace("{Niche}", "Home workouts").replace("{niche}", "home workouts") === i.title))).toBe(true);
  });

  it("difficulty changes the production note in the detail", () => {
    const easy = generateIdeas({ ...base, difficulty: "easy" });
    const advanced = generateIdeas({ ...base, difficulty: "advanced" });
    for (const item of easy) expect(item.detail).toContain("Easy to film (one take, no props)");
    for (const item of advanced) expect(item.detail).toContain("Advanced to film");
    expect(easy.map((i) => i.detail)).not.toEqual(advanced.map((i) => i.detail));
  });

  it("duration label appears in the detail for every duration", () => {
    expect(generateIdeas({ ...base, duration: "under-30s" })[0]!.detail).toContain("Under 30 seconds");
    expect(generateIdeas({ ...base, duration: "30-60s" })[0]!.detail).toContain("30–60 seconds");
    expect(generateIdeas({ ...base, duration: "1-3min" })[0]!.detail).toContain("1–3 minutes");
    expect(generateIdeas({ ...base, duration: "long-form" })[0]!.detail).toContain("Long-form");
  });

  it("objective phrase appears in the detail for every objective", () => {
    expect(generateIdeas({ ...base, objective: "reach" })[0]!.detail).toContain("Goal: reach");
    expect(generateIdeas({ ...base, objective: "engagement" })[0]!.detail).toContain("Goal: engagement");
    expect(generateIdeas({ ...base, objective: "followers" })[0]!.detail).toContain("Goal: grow your followers");
    expect(generateIdeas({ ...base, objective: "sales" })[0]!.detail).toContain("Goal: sales");
    expect(generateIdeas({ ...base, objective: "authority" })[0]!.detail).toContain("Goal: build authority");
  });

  it("changing any one of the four fields changes the batch, and defaults are deterministic", () => {
    const plain = generateIdeas(base);
    expect(plain).toEqual(generateIdeas(base));
    expect(plain).toEqual(
      generateIdeas({ ...base, category: "educational", difficulty: "medium", duration: "30-60s", objective: "engagement" }),
    );
    expect(generateIdeas({ ...base, category: "series" })).not.toEqual(plain);
    expect(generateIdeas({ ...base, difficulty: "easy" })).not.toEqual(plain);
    expect(generateIdeas({ ...base, duration: "long-form" })).not.toEqual(plain);
    expect(generateIdeas({ ...base, objective: "sales" })).not.toEqual(plain);
  });
});

describe("profile consumption in the template engine", () => {
  it("ideas: no item contains an avoided word, including case variants, and the count is refilled", () => {
    const profile = makeProfile({ wordsToAvoid: ["CHECKLIST"] });
    const items = generateIdeas({
      niche: "home workouts",
      platform: "reels",
      audience: "busy parents",
      count: 5,
      profile,
    });
    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(containsAvoidedWord(item.title, profile.voice)).toBe(false);
      expect(containsAvoidedWord(item.detail ?? "", profile.voice)).toBe(false);
      expect(item.title.toLowerCase()).not.toContain("checklist");
    }
  });

  it("hooks: no item contains an avoided word, including case variants, and the count is refilled", () => {
    const profile = makeProfile({ wordsToAvoid: ["NOBODY"] });
    const items = generateHooks({ topic: "morning routines", style: "curiosity", platform: "reels", count: 6, profile });
    expect(items).toHaveLength(6);
    for (const item of items) {
      expect(containsAvoidedWord(item.title, profile.voice)).toBe(false);
      expect(item.title.toLowerCase()).not.toContain("nobody");
      expect(item.mechanism).toBe(HOOK_MECHANISMS.curiosity);
    }
  });

  it("captions: no item contains an avoided word, including case variants", () => {
    const profile = makeProfile({ wordsToAvoid: ["HYPE"] });
    const items = generateCaptions({ topic: "trail running", platform: "reels", tone: "friendly", profile });
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(containsAvoidedWord(item.title, profile.voice)).toBe(false);
      expect(item.title.toLowerCase()).not.toContain("hype");
    }
  });

  it("captions: appends preferred CTAs as a final line, rotating by index", () => {
    const profile = makeProfile({ preferredCtas: ["Follow for more", "Save this post"] });
    const items = generateCaptions({ topic: "trail running", platform: "reels", tone: "friendly", profile });
    expect(items).toHaveLength(3);
    expect(items[0]!.title.endsWith("\nFollow for more")).toBe(true);
    expect(items[1]!.title.endsWith("\nSave this post")).toBe(true);
    expect(items[2]!.title.endsWith("\nFollow for more")).toBe(true);
  });

  it("ideas: empty niche and audience fall back to the profile voice", () => {
    const profile = makeProfile({ niche: "urban gardening", audience: "apartment renters" });
    const items = generateIdeas({ niche: "", platform: "reels", audience: "", count: 4, profile });
    expect(items).toHaveLength(4);
    for (const item of items) {
      expect(item.title.toLowerCase()).toContain("urban gardening");
      expect(item.detail).toContain("apartment renters");
    }
  });

  it("ideas: explicit niche and audience win over the profile", () => {
    const profile = makeProfile({ niche: "urban gardening", audience: "apartment renters" });
    const items = generateIdeas({
      niche: "home workouts",
      platform: "reels",
      audience: "busy parents",
      count: 3,
      profile,
    });
    for (const item of items) expect(item.title.toLowerCase()).toContain("home workouts");
  });
});
