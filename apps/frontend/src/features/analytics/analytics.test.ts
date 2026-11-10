import { describe, expect, it } from "vitest";
import type { GrowthPost } from "@/features/growth/model";
import { growthCsvTemplate } from "@/features/growth/csv";
import {
  ANALYTICS_CSV_COLUMNS,
  computeBestContent,
  computeCreatorAnalytics,
  computeEngagementRate,
  computeTotals,
  computeWeeklyTrend,
  resolveAnalyticsView,
  sourceFootnote,
} from "./analytics";

let seq = 0;
const post = (over: Partial<GrowthPost>): GrowthPost => ({
  id: `p${++seq}`,
  platform: "instagram",
  title: "",
  postUrl: null,
  postedAt: "2026-02-04T12:00:00.000Z",
  views: null,
  reach: null,
  likes: null,
  comments: null,
  shares: null,
  saves: null,
  source: "manual",
  createdAt: "2026-02-18T12:00:00.000Z",
  updatedAt: "2026-02-18T12:00:00.000Z",
  ...over,
});

describe("sourceFootnote", () => {
  it("names the total and the manual / CSV mix exactly", () => {
    const posts = [
      ...Array.from({ length: 9 }, () => post({ source: "manual" })),
      ...Array.from({ length: 5 }, () => post({ source: "csv" })),
    ];
    expect(sourceFootnote(posts)).toBe("Based on 14 posts you entered: 9 by hand, 5 via CSV import");
  });

  it("uses the singular for a single post", () => {
    expect(sourceFootnote([post({ source: "manual" })])).toBe(
      "Based on 1 post you entered: 1 by hand, 0 via CSV import",
    );
  });
});

describe("resolveAnalyticsView (empty-state decision)", () => {
  it("shows the not-ready state when the growth store reports ready:false", () => {
    expect(resolveAnalyticsView(false, 0)).toBe("not-ready");
    expect(resolveAnalyticsView(false, 5)).toBe("not-ready");
  });

  it("shows the teaching empty state when the store is ready but holds zero posts", () => {
    expect(resolveAnalyticsView(true, 0)).toBe("empty");
  });

  it("shows the dashboard when at least one post exists", () => {
    expect(resolveAnalyticsView(true, 1)).toBe("dashboard");
    expect(resolveAnalyticsView(true, 14)).toBe("dashboard");
  });
});

describe("ANALYTICS_CSV_COLUMNS", () => {
  it("matches the real growth CSV template header, required columns included", () => {
    const header = growthCsvTemplate().split("\n")[0]!.split(",").map((c) => c.trim());
    expect([...ANALYTICS_CSV_COLUMNS]).toEqual(header);
    expect(ANALYTICS_CSV_COLUMNS).toContain("platform");
    expect(ANALYTICS_CSV_COLUMNS).toContain("posted_at");
  });
});

describe("computeTotals", () => {
  const posts = [
    post({ source: "manual", views: 100, reach: 50, likes: 10 }),
    post({ source: "csv", views: null, likes: 5 }),
    post({ source: "csv", views: 250, likes: null }),
  ];

  it("sums present values only and reports coverage per metric", () => {
    const totals = computeTotals(posts);
    expect(totals.status).toBe("ok");
    expect(totals.totalPosts).toBe(3);
    expect(totals.sourceMix).toEqual({ manual: 1, csv: 2 });
    expect(totals.metrics.views).toMatchObject({ total: 350, reportedCount: 2, missingCount: 1 });
    expect(totals.metrics.likes).toMatchObject({ total: 15, reportedCount: 2, missingCount: 1 });
    expect(totals.metrics.reach).toMatchObject({ total: 50, reportedCount: 1, missingCount: 2 });
  });

  it("writes the coverage line in the 'totalled X across N of M posts' form", () => {
    const totals = computeTotals(posts);
    expect(totals.metrics.views.coverageText).toBe(
      "views totalled 350 across 2 of 3 posts — 1 post has no views figure",
    );
    expect(totals.metrics.reach.coverageText).toBe(
      "reach totalled 50 across 1 of 3 posts — 2 posts have no reach figure",
    );
  });

  it("keeps a metric nobody reported missing (total null), never zero", () => {
    const totals = computeTotals(posts);
    expect(totals.metrics.saves.total).toBeNull();
    expect(totals.metrics.saves.reportedCount).toBe(0);
    expect(totals.metrics.saves.coverageText).toContain("stays missing, not zero");
  });

  it("is insufficient with zero posts or with posts but no figures at all", () => {
    expect(computeTotals([]).status).toBe("insufficient");
    expect(computeTotals([post({}), post({})]).status).toBe("insufficient");
  });
});

describe("computeEngagementRate", () => {
  const complete = { likes: 10, comments: 5, shares: 3, saves: 2 }; // engagement 20

  it("computes the aggregate rate only over posts with views + complete engagement, denominator named", () => {
    const posts = [
      post({ views: 200, ...complete }),
      post({ views: 300, likes: 15, comments: 5, shares: 5, saves: 5 }), // engagement 30
      post({ views: 100, likes: 9, comments: 1, shares: 1, saves: null }), // incomplete — excluded
      post({ views: null, ...complete }), // no denominator — excluded
    ];
    const rate = computeEngagementRate(posts);
    expect(rate.status).toBe("ok");
    expect(rate.ratePct).toBe(10); // (20 + 30) / (200 + 300) * 100
    expect(rate.totalEngagement).toBe(50);
    expect(rate.totalViews).toBe(500);
    expect(rate.denominator).toBe("views");
    expect(rate.eligiblePosts).toBe(2);
    expect(rate.excludedPosts).toBe(2);
    expect(rate.basis).toContain("likes + comments + shares + saves");
    expect(rate.basis).toContain("Denominator: total views (500)");
    expect(rate.basis).toContain("2 posts excluded");
  });

  it("is insufficient when no post qualifies, and when the views denominator is zero", () => {
    expect(computeEngagementRate([post({ views: 100, likes: 1 })]).status).toBe("insufficient");
    const zeroViews = computeEngagementRate([post({ views: 0, ...complete })]);
    expect(zeroViews.status).toBe("insufficient");
    expect(zeroViews.ratePct).toBeNull();
  });
});

describe("computeBestContent", () => {
  it("ranks by complete engagement, breaks ties by views, and counts exclusions", () => {
    const posts = [
      post({ title: "mid", likes: 30, comments: 10, shares: 5, saves: 5, views: 900 }), // 50
      post({ title: "tie-low-views", likes: 50, comments: 10, shares: 10, saves: 10, views: 100 }), // 80
      post({ title: "tie-high-views", likes: 50, comments: 10, shares: 10, saves: 10, views: 400 }), // 80
      post({ title: "huge-but-incomplete", likes: 999, comments: null, shares: 0, saves: 0 }),
    ];
    const best = computeBestContent(posts);
    expect(best.status).toBe("ok");
    expect(best.entries.map((e) => e.post.title)).toEqual(["tie-high-views", "tie-low-views", "mid"]);
    expect(best.entries[0]?.engagement).toBe(80);
    expect(best.eligiblePosts).toBe(3);
    expect(best.excludedPosts).toBe(1);
    expect(best.basis).toContain("1 post excluded");
    expect(best.basis).toContain("likes + comments + shares + saves");
  });

  it("respects the limit and is insufficient when no post has complete engagement", () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      post({ likes: i, comments: 0, shares: 0, saves: 0 }),
    );
    expect(computeBestContent(many).entries).toHaveLength(5);
    expect(computeBestContent(many, 3).entries).toHaveLength(3);
    const none = computeBestContent([post({ likes: 5 }), post({})]);
    expect(none.status).toBe("insufficient");
    expect(none.entries).toEqual([]);
    expect(none.excludedPosts).toBe(2);
  });
});

describe("computeWeeklyTrend", () => {
  it("buckets by Monday-start week and leaves the empty week a gap, not a zero", () => {
    const posts = [
      post({ postedAt: "2026-02-04T12:00:00.000Z", views: 100, likes: 10, comments: 0, shares: 0, saves: 0 }), // Wed, week of Mon 2 Feb
      post({ postedAt: "2026-02-08T12:00:00.000Z", views: 50 }), // Sun — same Monday-start week
      post({ postedAt: "2026-02-18T12:00:00.000Z", views: 300, likes: 30, comments: 0, shares: 0, saves: 0 }), // week of Mon 16 Feb
    ];
    const trend = computeWeeklyTrend(posts);
    expect(trend.status).toBe("ok");
    expect(trend.buckets.map((b) => b.weekStart)).toEqual(["2026-02-02", "2026-02-09", "2026-02-16"]);
    expect(trend.buckets[0]).toMatchObject({ postCount: 2, isGap: false, viewsTotal: 150, viewsReportedCount: 2, engagementTotal: 10, engagementEligibleCount: 1 });
    expect(trend.buckets[1]).toMatchObject({ postCount: 0, isGap: true, viewsTotal: null, engagementTotal: null });
    expect(trend.buckets[2]).toMatchObject({ postCount: 1, isGap: false, viewsTotal: 300 });
    expect(trend.activeWeeks).toBe(2);
    expect(trend.gapWeeks).toBe(1);
    expect(trend.basis).toContain("shown as a gap, not a zero");
  });

  it("keeps a week's views missing (null) when its posts reported none — not a zero, not a gap", () => {
    const posts = [
      post({ postedAt: "2026-02-04T12:00:00.000Z" }),
      post({ postedAt: "2026-02-11T12:00:00.000Z", views: 70 }),
    ];
    const trend = computeWeeklyTrend(posts);
    expect(trend.buckets[0]).toMatchObject({ isGap: false, postCount: 1, viewsTotal: null, viewsReportedCount: 0, engagementTotal: null });
    expect(trend.buckets[1]?.viewsTotal).toBe(70);
  });

  it("is insufficient when posts span a single week, and skips undated posts honestly", () => {
    const trend = computeWeeklyTrend([
      post({ postedAt: "2026-02-04T12:00:00.000Z" }),
      post({ postedAt: "not-a-date" }),
    ]);
    expect(trend.status).toBe("insufficient");
    expect(trend.activeWeeks).toBe(1);
    expect(trend.undatedPosts).toBe(1);
    expect(trend.basis).toContain("skipped");
  });

  it("returns no buckets for no posts", () => {
    const trend = computeWeeklyTrend([]);
    expect(trend.buckets).toEqual([]);
    expect(trend.status).toBe("insufficient");
  });
});

describe("computeCreatorAnalytics", () => {
  it("assembles every section on the same source footnote", () => {
    const posts = [
      post({ source: "manual", views: 200, likes: 10, comments: 5, shares: 3, saves: 2 }),
      post({ source: "csv", postedAt: "2026-02-18T12:00:00.000Z", views: 300, likes: 15, comments: 5, shares: 5, saves: 5 }),
    ];
    const analytics = computeCreatorAnalytics(posts);
    expect(analytics.totalPosts).toBe(2);
    expect(analytics.sourceMix).toEqual({ manual: 1, csv: 1 });
    expect(analytics.sourceFootnote).toBe("Based on 2 posts you entered: 1 by hand, 1 via CSV import");
    expect(analytics.totals.basis).toContain(analytics.sourceFootnote);
    expect(analytics.engagementRate.ratePct).toBe(10);
    expect(analytics.bestContent.entries).toHaveLength(2);
    expect(analytics.weeklyTrend.status).toBe("ok");
  });
});
