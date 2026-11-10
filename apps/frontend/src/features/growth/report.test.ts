import { describe, expect, it } from "vitest";
import type { CompetitorProfile, GrowthPost } from "./model";
import {
  computeBestHours,
  computeNiche,
  computeOverview,
  computeTopBottom,
  computeTrend,
  computeWeeklyReport,
  readAnalysisForReport,
  type AnalysisForReport,
} from "./report";

// Fixed now: Wed 2026-02-18 12:00 local-ish (UTC used for fixtures).
const NOW = Date.parse("2026-02-18T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

let seq = 0;
const post = (over: Partial<GrowthPost>): GrowthPost => ({
  id: `p${++seq}`,
  platform: "instagram",
  title: "",
  postUrl: null,
  postedAt: iso(NOW - DAY),
  views: null,
  reach: null,
  likes: null,
  comments: null,
  shares: null,
  saves: null,
  source: "manual",
  createdAt: iso(NOW),
  updatedAt: iso(NOW),
  ...over,
});

const competitor = (name: string): CompetitorProfile => ({
  id: `c-${name}`,
  name,
  platform: "instagram",
  handle: null,
  notes: null,
  createdAt: iso(NOW),
  updatedAt: iso(NOW),
});

describe("window bucketing", () => {
  it("puts a post exactly 7 days old in the prior window, not the current one", () => {
    const posts = [
      post({ postedAt: iso(NOW - 7 * DAY), views: 700 }),
      post({ postedAt: iso(NOW - 6 * DAY), views: 600 }),
      post({ postedAt: iso(NOW - 13 * DAY), views: 1300 }),
      post({ postedAt: iso(NOW - 20 * DAY), views: 2000 }),
      post({ postedAt: iso(NOW + DAY), views: 9999 }),
    ];
    const overview = computeOverview(posts, NOW);
    expect(overview.postsInWindow).toBe(1);
    expect(overview.priorWindowPosts).toBe(2);
    expect(overview.metrics.views).toEqual({ total: 600, reportedCount: 1 });
  });

  it("includes a post at exactly now and 6 days 23h ago in the current window", () => {
    const posts = [post({ postedAt: iso(NOW) }), post({ postedAt: iso(NOW - 7 * DAY + 60_000) })];
    // Note: a post at exactly `now` has age 0 — windowOf treats age <7d as current.
    // Date.parse(iso(NOW)) equals NOW, so it is current.
    expect(computeOverview(posts, NOW).postsInWindow).toBe(2);
  });
});

describe("overview", () => {
  it("summarises metrics with nulls and reports the source mix for the window", () => {
    const posts = [
      post({ source: "manual", views: 100, likes: 10 }),
      post({ source: "csv", views: null, likes: 5 }),
      post({ source: "csv", views: 250, likes: null }),
      post({ postedAt: iso(NOW - 10 * DAY), views: 9999 }),
    ];
    const o = computeOverview(posts, NOW);
    expect(o.status).toBe("ok");
    expect(o.postsInWindow).toBe(3);
    expect(o.sourceMix).toEqual({ manual: 1, csv: 2 });
    expect(o.metrics.views).toEqual({ total: 350, reportedCount: 2 });
    expect(o.metrics.likes).toEqual({ total: 15, reportedCount: 2 });
    expect(o.metrics.reach).toEqual({ total: 0, reportedCount: 0 });
    expect(o.basis).toContain("3 posts");
    expect(o.basis).toContain("1 manual, 2 CSV");
  });

  it("is insufficient with no window posts", () => {
    expect(computeOverview([], NOW).status).toBe("insufficient");
    expect(computeOverview([post({ postedAt: iso(NOW - 30 * DAY) })], NOW).status).toBe("insufficient");
  });
});

describe("bestHours", () => {
  it("qualifies buckets with >= 2 posts, ranks by avg engagement, returns top 3", () => {
    // Use local-hour construction: build dates at known local hours.
    const atHour = (daysAgo: number, hour: number, likes: number) => {
      const d = new Date(NOW - daysAgo * DAY);
      d.setHours(hour, 0, 0, 0);
      return post({ postedAt: d.toISOString(), likes });
    };
    const posts = [
      atHour(1, 18, 100), atHour(2, 18, 60), // 18:00 avg 80
      atHour(1, 9, 30), atHour(3, 9, 10), // 9:00 avg 20
      atHour(2, 21, 50), // single post — does not qualify
      atHour(4, 12, 40), atHour(5, 12, 20), // 12:00 avg 30
    ];
    const section = computeBestHours(posts);
    expect(section.status).toBe("ok");
    expect(section.hours.map((h) => h.hour)).toEqual([18, 12, 9]);
    expect(section.hours[0]).toEqual({ hour: 18, posts: 2, avgEngagement: 80 });
    expect(section.basis).toContain("history");
  });

  it("rounds avg engagement to 1 dp", () => {
    const atHour = (daysAgo: number, likes: number) => {
      const d = new Date(NOW - daysAgo * DAY);
      d.setHours(10, 0, 0, 0);
      return post({ postedAt: d.toISOString(), likes });
    };
    const section = computeBestHours([atHour(1, 10), atHour(2, 11), atHour(3, 11)]);
    expect(section.hours[0]?.avgEngagement).toBe(10.7);
  });

  it("is insufficient with fewer than 3 total posts", () => {
    const d = new Date(NOW); d.setHours(10, 0, 0, 0);
    const p = post({ postedAt: d.toISOString(), likes: 5 });
    expect(computeBestHours([p, p]).status).toBe("insufficient");
    expect(computeBestHours([p, p]).hours).toEqual([]);
  });

  it("is insufficient when no hour has 2 posts", () => {
    const mk = (hour: number) => {
      const d = new Date(NOW); d.setHours(hour, 0, 0, 0);
      return post({ postedAt: d.toISOString(), likes: 5 });
    };
    expect(computeBestHours([mk(8), mk(12), mk(20)]).status).toBe("insufficient");
  });
});

describe("topBottom", () => {
  it("sorts by engagement desc with later postedAt winning ties", () => {
    const posts = [
      post({ title: "low", likes: 1, postedAt: iso(NOW - DAY) }),
      post({ title: "tie-early", likes: 50, postedAt: iso(NOW - 3 * DAY) }),
      post({ title: "tie-late", likes: 50, postedAt: iso(NOW - 2 * DAY) }),
      post({ title: "mid", likes: 20, postedAt: iso(NOW - DAY) }),
    ];
    const section = computeTopBottom(posts, NOW);
    expect(section.top.map((p) => p.title)).toEqual(["tie-late", "tie-early", "mid"]);
    expect(section.bottom.map((p) => p.title)).toEqual(["low"]);
  });

  it("excludes overlap between top and bottom when window count is 4", () => {
    const posts = [10, 40, 30, 20].map((likes, i) =>
      post({ title: `t${i}`, likes, postedAt: iso(NOW - DAY) }),
    );
    const section = computeTopBottom(posts, NOW);
    const topIds = new Set(section.top.map((p) => p.id));
    expect(section.bottom.every((p) => !topIds.has(p.id))).toBe(true);
  });

  it("returns top only with 1-3 posts and notes the missing bottom list", () => {
    const section = computeTopBottom([post({ likes: 5 }), post({ likes: 9 })], NOW);
    expect(section.status).toBe("ok");
    expect(section.top).toHaveLength(2);
    expect(section.bottom).toEqual([]);
    expect(section.basis).toContain("not enough posts this week for a bottom list");
  });

  it("is insufficient with no window posts", () => {
    const section = computeTopBottom([], NOW);
    expect(section.status).toBe("insufficient");
    expect(section.top).toEqual([]);
  });
});

describe("trend", () => {
  it("computes deltaPct per metric and for post count", () => {
    const posts = [
      post({ postedAt: iso(NOW - DAY), views: 150 }),
      post({ postedAt: iso(NOW - 2 * DAY), views: 100 }),
      post({ postedAt: iso(NOW - 8 * DAY), views: 200 }),
    ];
    const section = computeTrend(posts, NOW);
    expect(section.status).toBe("ok");
    expect(section.metrics.views.currentTotal).toBe(250);
    expect(section.metrics.views.priorTotal).toBe(200);
    expect(section.metrics.views.deltaPct).toBe(25);
    expect(section.postCount).toEqual({ current: 2, prior: 1, deltaPct: 100 });
  });

  it("returns null delta when the prior period reported nothing for a metric", () => {
    const posts = [
      post({ postedAt: iso(NOW - DAY), views: 100, likes: 10 }),
      post({ postedAt: iso(NOW - 8 * DAY), views: 50, likes: null }),
    ];
    const section = computeTrend(posts, NOW);
    expect(section.metrics.views.deltaPct).toBe(100);
    expect(section.metrics.likes.deltaPct).toBeNull();
    expect(section.basis).toContain("no prior-period baseline");
  });

  it("is insufficient when either window is empty", () => {
    expect(computeTrend([post({})], NOW).status).toBe("insufficient");
    expect(computeTrend([post({ postedAt: iso(NOW - 9 * DAY) })], NOW).status).toBe("insufficient");
  });
});

describe("readAnalysisForReport", () => {
  const body = {
    version: 1,
    subject: { type: "competitor", name: "Rival" },
    sourceProjectId: "x",
    videoTitle: "Rival video",
    durationMs: 30000,
    breakdown: {
      hook: { text: "Stop scrolling", hasQuestion: false, hasNumber: false },
      beats: [],
      cta: { found: [{ phrase: "follow for more", atMs: 1000 }], hasCta: true },
      pacing: { wordsPerMin: 150.4, cutsPerMin: 12 },
    },
    editedFields: [],
    notes: "",
  };

  it("extracts competitor name, hook, wpm and CTA phrases", () => {
    expect(readAnalysisForReport(body)).toEqual({
      competitorName: "Rival",
      videoTitle: "Rival video",
      hookText: "Stop scrolling",
      wordsPerMin: 150.4,
      ctaPhrases: ["follow for more"],
    });
  });

  it("maps own analyses to a null competitor name", () => {
    expect(readAnalysisForReport({ ...body, subject: { type: "own" } })?.competitorName).toBeNull();
  });

  it("rejects malformed bodies", () => {
    expect(readAnalysisForReport(null)).toBeNull();
    expect(readAnalysisForReport({ version: 2 })).toBeNull();
    expect(readAnalysisForReport({ version: 1, subject: { type: "alien" }, breakdown: {} })).toBeNull();
    expect(readAnalysisForReport({ version: 1, subject: { type: "own" } })).toBeNull();
  });
});

describe("niche", () => {
  const analyses: AnalysisForReport[] = [
    { competitorName: "Rival", videoTitle: "A", hookText: "h1", wordsPerMin: 150, ctaPhrases: ["subscribe", "link in bio"] },
    { competitorName: "Rival", videoTitle: "B", hookText: "h2", wordsPerMin: 170, ctaPhrases: ["subscribe"] },
    { competitorName: "Other", videoTitle: "C", hookText: "h3", wordsPerMin: null, ctaPhrases: [] },
    { competitorName: null, videoTitle: "Mine", hookText: "h4", wordsPerMin: 120, ctaPhrases: ["subscribe"] },
  ];

  it("aggregates per competitor, common CTAs and own wpm", () => {
    const section = computeNiche({ competitors: [competitor("Rival"), competitor("Other")], analyses });
    expect(section.status).toBe("ok");
    expect(section.perCompetitor[0]).toEqual({
      name: "Rival", breakdowns: 2, avgWordsPerMin: 160, ctaPhrases: ["subscribe", "link in bio"],
    });
    expect(section.perCompetitor[1]?.avgWordsPerMin).toBeNull();
    expect(section.commonCtas).toEqual([
      { phrase: "subscribe", count: 2 },
      { phrase: "link in bio", count: 1 },
    ]);
    expect(section.ownAvgWordsPerMin).toBe(120);
    expect(section.totalCompetitorBreakdowns).toBe(3);
    expect(section.breakdownsWithCta).toBe(2);
  });

  it("is insufficient with zero competitor breakdowns", () => {
    const ownOnly = analyses.filter((a) => a.competitorName === null);
    expect(computeNiche({ competitors: [], analyses: ownOnly }).status).toBe("insufficient");
    expect(computeNiche({ competitors: [], analyses: [] }).status).toBe("insufficient");
  });
});

describe("computeWeeklyReport", () => {
  it("assembles all sections with bases naming counts and sources", () => {
    const posts = [
      post({ source: "manual", views: 100 }),
      post({ source: "csv", views: 200 }),
      post({ source: "csv", views: 300 }),
      post({ postedAt: iso(NOW - 9 * DAY), views: 100 }),
    ];
    const report = computeWeeklyReport(posts, NOW, { competitors: [], analyses: [] });
    expect(report.overview.postsInWindow).toBe(3);
    expect(report.overview.basis).toContain("1 manual, 2 CSV");
    expect(report.trend.status).toBe("ok");
    expect(report.niche.status).toBe("insufficient");
    expect(report.generatedAt).toBe(NOW);
  });
});
