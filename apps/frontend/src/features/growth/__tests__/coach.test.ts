import { describe, expect, it } from "vitest";
import type { GrowthPost } from "../model";
import {
  computeBestHours,
  computeOverview,
  computeTopBottom,
  computeTrend,
} from "../report";
import {
  COACH_SYSTEM_PROMPT,
  buildCoachPrompt,
  buildGrowthContext,
  starterQuestions,
  type CoachSections,
} from "../coach";

/**
 * Growth Coach grounding (P2): the context builder may only ever surface
 * figures computed from the rows it is handed, missing metrics stay missing
 * (never zero), the prompt carries the no-invention contract, and starter
 * questions appear only when the data can actually answer them.
 */

const NOW = Date.parse("2026-11-11T12:00:00.000Z");

const post = (over: Partial<GrowthPost> = {}): GrowthPost => ({
  id: "p1",
  platform: "instagram",
  title: "Launch reel",
  postUrl: null,
  postedAt: "2026-11-08T10:00:00.000Z",
  views: 1000,
  reach: 800,
  likes: 90,
  comments: 10,
  shares: 5,
  saves: 20,
  source: "manual",
  createdAt: "2026-11-08T11:00:00.000Z",
  updatedAt: "2026-11-08T11:00:00.000Z",
  ...over,
});

const sectionsOf = (posts: GrowthPost[]): CoachSections => ({
  overview: computeOverview(posts, NOW),
  bestHours: computeBestHours(posts),
  topBottom: computeTopBottom(posts, NOW),
  trend: computeTrend(posts, NOW),
});

describe("buildGrowthContext", () => {
  it("renders computed figures from the given rows, with source labels", () => {
    const posts = [
      post({ id: "a", title: "Synced video", platform: "youtube", source: "youtube", views: 5000, likes: 200 }),
      post({ id: "b", title: "Launch reel", views: 1000, likes: 90 }),
    ];
    const ctx = buildGrowthContext(posts, sectionsOf(posts), []);
    expect(ctx).toContain("Posts tracked: 2 (1 Manual, 0 CSV, 1 YouTube, 0 Instagram)");
    expect(ctx).toContain("views 6,000");
    expect(ctx).toContain('"Synced video"');
    expect(ctx).toContain("(YouTube)");
    expect(ctx).toContain("Platform youtube: 1 posts");
  });

  it("keeps a never-entered metric missing — 'not entered', never a zero total", () => {
    const posts = [post({ saves: null }), post({ id: "b", saves: null })];
    const ctx = buildGrowthContext(posts, sectionsOf(posts), []);
    expect(ctx).toContain("saves not entered");
    expect(ctx).not.toContain("saves 0");
  });

  it("empty dataset: says there is no data and names what to add or connect", () => {
    const ctx = buildGrowthContext([], sectionsOf([]), []);
    expect(ctx).toContain("NO posts tracked");
    expect(ctx).toContain("connect their YouTube or Instagram account");
  });

  it("includes competitor notes as the user's own notes, with no fetched metrics", () => {
    const ctx = buildGrowthContext([], sectionsOf([]), [
      { id: "c1", name: "Rival", platform: "instagram", handle: "@rival", notes: "posts daily", createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" },
    ]);
    expect(ctx).toContain("Rival (@rival) on instagram");
    expect(ctx).toContain("no metrics were fetched");
  });
});

describe("the no-invention contract", () => {
  it("the system prompt forbids inventing figures and treats 'not entered' as missing", () => {
    expect(COACH_SYSTEM_PROMPT).toContain("Never invent, estimate, or extrapolate");
    expect(COACH_SYSTEM_PROMPT).toContain("treat it as missing, never as zero");
    expect(COACH_SYSTEM_PROMPT).toContain("say so plainly");
    expect(COACH_SYSTEM_PROMPT).toContain("connect (their YouTube or Instagram account)");
  });

  it("the prompt embeds the dataset and the question, with recent turns labelled", () => {
    const prompt = buildCoachPrompt("Why did reach drop?", "DATASET-TEXT", [
      { role: "user", content: "Earlier question" },
      { role: "assistant", content: "Earlier answer" },
    ]);
    expect(prompt.system).toBe(COACH_SYSTEM_PROMPT);
    expect(prompt.user).toContain("DATASET-TEXT");
    expect(prompt.user).toContain("Question: Why did reach drop?");
    expect(prompt.user).toContain("User: Earlier question");
    expect(prompt.user).toContain("Coach: Earlier answer");
  });
});

describe("starterQuestions", () => {
  it("empty data offers the getting-started set", () => {
    expect(starterQuestions([], sectionsOf([]))).toEqual([
      "What should I start tracking?",
      "How do I bring in my past posts?",
      "What does connecting YouTube or Instagram add?",
    ]);
  });

  it("offers 'Why did reach drop last week?' only when reach fell across both windows", () => {
    const posts = [
      post({ id: "new", postedAt: "2026-11-08T10:00:00.000Z", reach: 400 }),
      post({ id: "old", postedAt: "2026-11-01T10:00:00.000Z", reach: 1000 }),
    ];
    const starters = starterQuestions(posts, sectionsOf(posts));
    expect(starters).toContain("Why did reach drop last week?");
  });

  it("does not offer the reach starter when reach was never entered (falls back to views)", () => {
    const posts = [
      post({ id: "new", postedAt: "2026-11-08T10:00:00.000Z", reach: null, views: 300 }),
      post({ id: "old", postedAt: "2026-11-01T10:00:00.000Z", reach: null, views: 900 }),
    ];
    const starters = starterQuestions(posts, sectionsOf(posts));
    expect(starters.some((s) => s.includes("reach"))).toBe(false);
    expect(starters).toContain("Why did views drop last week?");
  });

  it("gates the post-type and posting-time starters on data presence", () => {
    const two = [post({ id: "a" }), post({ id: "b", postedAt: "2026-11-09T10:00:00.000Z" })];
    const small = starterQuestions(two, sectionsOf(two));
    expect(small).not.toContain("Which post type performs best?");
    expect(small).not.toContain("Best posting time from my data?");

    const hourly = [
      post({ id: "a", postedAt: "2026-11-02T18:00:00.000Z" }),
      post({ id: "b", postedAt: "2026-11-04T18:30:00.000Z" }),
      post({ id: "c", postedAt: "2026-11-06T09:00:00.000Z" }),
      post({ id: "d", postedAt: "2026-11-08T18:15:00.000Z" }),
    ];
    const rich = starterQuestions(hourly, sectionsOf(hourly));
    expect(rich).toContain("Which post type performs best?");
    expect(rich).toContain("Best posting time from my data?");
  });
});
