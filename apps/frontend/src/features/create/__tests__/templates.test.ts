import { describe, expect, it } from "vitest";
import { generateCaptions, generateHooks, generateIdeas, HOOK_FRAMES, LIBRARY_COUNTS } from "../templates";
import { CAPTION_TONES, HOOK_STYLES, PLATFORMS } from "../model";

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
