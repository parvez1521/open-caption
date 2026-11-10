import { describe, expect, it } from "vitest";
import {
  CTA_LIBRARY,
  appendCta,
  applySponsored,
  applyTagGroup,
  ctaOptions,
  hashtagGroupBody,
  tagsFromGroupBody,
} from "../captionStudio";
import { generateCaptions } from "../templates";
import { itemCopyText, type GeneratedItem, type SponsoredInput } from "../model";
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

const sponsored: SponsoredInput = {
  talkingPoints: ["Made with real sourdough starter", "Baked fresh every morning"],
  requiredTags: ["#adpartner", "#freshbread"],
  disclosure: "#ad — paid partnership with Test Bakery",
};

describe("applySponsored", () => {
  const items: GeneratedItem[] = [
    { title: "First caption", hashtags: ["#bread", "#adpartner"] },
    { title: "Second caption\nA profile CTA", hashtags: ["#baking"] },
    { title: "No tags here" },
  ];

  it("appends every talking point verbatim as its own line, on every item", () => {
    const out = applySponsored(items, sponsored);
    for (const item of out) {
      expect(item.title).toContain("\nMade with real sourdough starter\n");
      expect(item.title).toContain("\nBaked fresh every morning\n");
    }
  });

  it("puts the disclosure verbatim as the FINAL line of every item", () => {
    const out = applySponsored(items, sponsored);
    for (const item of out) {
      expect(item.title.split("\n").pop()).toBe("#ad — paid partnership with Test Bakery");
    }
    // The profile-CTA item keeps its CTA above the sponsored block, not below it.
    expect(out[1]!.title).toContain("A profile CTA\nMade with real sourdough starter");
  });

  it("merges required tags, deduplicated, existing tags first", () => {
    const out = applySponsored(items, sponsored);
    expect(out[0]!.hashtags).toEqual(["#bread", "#adpartner", "#freshbread"]);
    expect(out[1]!.hashtags).toEqual(["#baking", "#adpartner", "#freshbread"]);
    expect(out[2]!.hashtags).toEqual(["#adpartner", "#freshbread"]);
  });

  it("is pure: the input items are not mutated", () => {
    const copy = JSON.parse(JSON.stringify(items)) as GeneratedItem[];
    applySponsored(items, sponsored);
    expect(items).toEqual(copy);
  });

  it("works on items from any source (hand-made model-style items included)", () => {
    const modelItems: GeneratedItem[] = [{ title: "Cloud wrote this", hashtags: ["#cloud"] }];
    const out = applySponsored(modelItems, { talkingPoints: [], requiredTags: [], disclosure: "Ad." });
    expect(out[0]!.title).toBe("Cloud wrote this\nAd.");
  });
});

describe("CTA library", () => {
  it("has at least 12 original general CTAs, with no outcome promises", () => {
    expect(CTA_LIBRARY.length).toBeGreaterThanOrEqual(12);
    const all = CTA_LIBRARY.join(" ").toLowerCase();
    expect(all).not.toContain("viral");
    expect(all).not.toContain("guarantee");
  });

  it("ctaOptions puts profile CTAs first, then the library, deduplicated", () => {
    const profile = makeProfile({ preferredCtas: ["Save this for later.", "Join the waitlist"] });
    const options = ctaOptions(profile);
    expect(options[0]).toBe("Save this for later.");
    expect(options[1]).toBe("Join the waitlist");
    expect(options.filter((o) => o === "Save this for later.")).toHaveLength(1);
    expect(options.length).toBe(CTA_LIBRARY.length + 1);
    expect(ctaOptions(null)).toEqual(CTA_LIBRARY);
    expect(ctaOptions()).toEqual(CTA_LIBRARY);
  });

  it("appendCta adds the CTA as a new final line without mutating the item", () => {
    const item: GeneratedItem = { title: "Caption text", hashtags: ["#a"] };
    const out = appendCta(item, "Follow for more like this.");
    expect(out.title).toBe("Caption text\nFollow for more like this.");
    expect(item.title).toBe("Caption text");
    expect(appendCta(item, "   ").title).toBe("Caption text");
  });
});

describe("hashtag groups (content-library storage shapes)", () => {
  it("round-trips through hashtagGroupBody / tagsFromGroupBody, cleaned and deduplicated", () => {
    const body = hashtagGroupBody([" #fitness ", "#fitness", "", "#gym"]);
    expect(body).toEqual({ tags: ["#fitness", "#gym"] });
    expect(tagsFromGroupBody(body)).toEqual(["#fitness", "#gym"]);
    // The library body shape itself: { tags } under the hashtag-group kind.
    expect(tagsFromGroupBody(JSON.parse(JSON.stringify(body)))).toEqual(["#fitness", "#gym"]);
  });

  it("tagsFromGroupBody is defensive about untrusted bodies", () => {
    expect(tagsFromGroupBody(null)).toEqual([]);
    expect(tagsFromGroupBody("tags")).toEqual([]);
    expect(tagsFromGroupBody([])).toEqual([]);
    expect(tagsFromGroupBody({})).toEqual([]);
    expect(tagsFromGroupBody({ tags: "not-an-array" })).toEqual([]);
    expect(tagsFromGroupBody({ tags: [1, "#ok", null, " #two "] })).toEqual(["#ok", "#two"]);
  });

  it("applyTagGroup merges, deduplicates and caps at 30 tags", () => {
    const item: GeneratedItem = { title: "Post", hashtags: ["#one", "#two"] };
    const out = applyTagGroup(item, ["#two", "#three"]);
    expect(out.hashtags).toEqual(["#one", "#two", "#three"]);
    const many = Array.from({ length: 40 }, (_, i) => `#tag${i}`);
    const capped = applyTagGroup(item, many);
    expect(capped.hashtags).toHaveLength(30);
    expect(capped.hashtags![0]).toBe("#one");
    expect(item.hashtags).toEqual(["#one", "#two"]);
  });
});

describe("caption formats (3.6)", () => {
  it("youtube: multi-line descriptions with a chapters block and 3–5 tags", () => {
    const items = generateCaptions({ topic: "sourdough basics", platform: "youtube", tone: "friendly", format: "youtube" });
    expect(items.length).toBeGreaterThanOrEqual(1);
    for (const item of items) {
      expect(item.title.split("\n").length).toBeGreaterThanOrEqual(6);
      expect(item.title).toContain("Chapters:");
      expect(item.title).toContain("00:00");
      expect(item.title.toLowerCase()).toContain("subscribe");
      expect(item.title.toLowerCase()).toContain("sourdough basics");
      expect(item.hashtags!.length).toBeGreaterThanOrEqual(3);
      expect(item.hashtags!.length).toBeLessThanOrEqual(5);
    }
  });

  it("linkedin: strong first line, paragraph body, closing question/takeaway, 3–5 professional tags", () => {
    const items = generateCaptions({ topic: "remote team rituals", platform: "reels", tone: "professional", format: "linkedin" });
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.title).toContain("\n\n");
      expect(item.title.toLowerCase()).toContain("remote team rituals");
      expect(item.hashtags!.length).toBeGreaterThanOrEqual(3);
      expect(item.hashtags!.length).toBeLessThanOrEqual(5);
    }
    const allTags = items.flatMap((i) => i.hashtags!);
    expect(allTags.some((t) => ["#smallbusiness", "#entrepreneur", "#marketingtips", "#startuplife", "#businesstips", "#branding"].includes(t))).toBe(true);
  });

  it("x: every post fits 280 characters via itemCopyText, including hashtags, even with a very long topic", () => {
    const longTopic = `an extremely long and detailed topic about ${"sourdough bread baking at home ".repeat(20)}for complete beginners`;
    const items = generateCaptions({ topic: longTopic, platform: "reels", tone: "friendly", format: "x" });
    expect(items.length).toBeGreaterThanOrEqual(1);
    for (const item of items) {
      expect(itemCopyText(item).length).toBeLessThanOrEqual(280);
      expect((item.hashtags ?? []).length).toBeLessThanOrEqual(2);
    }
  });

  it("x: short topics still produce recognisable posts with the topic in them", () => {
    const items = generateCaptions({ topic: "trail running", platform: "shorts", tone: "bold", format: "x" });
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.title.toLowerCase()).toContain("trail running");
      expect(itemCopyText(item).length).toBeLessThanOrEqual(280);
    }
  });

  it("instagram: the default format is byte-identical to passing no format", () => {
    const plain = generateCaptions({ topic: "trail running", platform: "reels", tone: "friendly" });
    const explicit = generateCaptions({ topic: "trail running", platform: "reels", tone: "friendly", format: "instagram" });
    expect(explicit).toEqual(plain);
    expect(plain).toHaveLength(3);
  });
});
