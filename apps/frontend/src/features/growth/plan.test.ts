import { describe, expect, it } from "vitest";
import type { GeneratedItem } from "@/features/create/model";
import type { GrowthPost } from "./model";
import { computeWeeklyReport, type WeeklyReport } from "./report";
import { assemblePlan, buildPlanBrief, canDraftPlan, nextWeekMonday, planDates, readWeeklyPlan } from "./plan";

const NOW = Date.parse("2026-02-18T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();
let seq = 0;
const post = (over: Partial<GrowthPost>): GrowthPost => ({
  id: `p${++seq}`,
  platform: "instagram",
  title: "Post",
  postUrl: null,
  postedAt: iso(NOW - DAY),
  views: null, reach: null, likes: null, comments: null, shares: null, saves: null,
  source: "manual",
  createdAt: iso(NOW), updatedAt: iso(NOW),
  ...over,
});

function richReport(): WeeklyReport {
  const atHour = (daysAgo: number, hour: number, over: Partial<GrowthPost>) => {
    const d = new Date(NOW - daysAgo * DAY);
    d.setHours(hour, 0, 0, 0);
    return post({ postedAt: d.toISOString(), ...over });
  };
  const posts = [
    atHour(1, 18, { title: "Winner reel", views: 1230, likes: 100 }),
    atHour(2, 18, { title: "Second", views: 1000, likes: 60 }),
    post({ postedAt: iso(NOW - 8 * DAY), views: 1000, likes: 80 }),
  ];
  return computeWeeklyReport(posts, NOW, {
    competitors: [{ id: "c1", name: "Rival", platform: "instagram", handle: null, notes: null, createdAt: iso(NOW), updatedAt: iso(NOW) }],
    analyses: [
      { competitorName: "Rival", videoTitle: "RV", hookText: "h", wordsPerMin: 150, ctaPhrases: ["subscribe"] },
      { competitorName: "Rival", videoTitle: "RV2", hookText: "h2", wordsPerMin: 150, ctaPhrases: ["subscribe"] },
    ],
  });
}

function emptyReport(): WeeklyReport {
  return computeWeeklyReport([], NOW, { competitors: [], analyses: [] });
}

describe("nextWeekMonday", () => {
  it("moves a Wednesday to the following Monday", () => {
    expect(nextWeekMonday(new Date(2026, 1, 18))).toBe("2026-02-23"); // Wed 18 Feb 2026
  });
  it("moves a Monday +7 days (next week's Monday, not today)", () => {
    expect(nextWeekMonday(new Date(2026, 1, 16))).toBe("2026-02-23"); // Mon 16 Feb
  });
  it("moves a Sunday to tomorrow's Monday-of-next-week boundary correctly", () => {
    // Sun 22 Feb 2026 — Monday of its week is 16 Feb, next week is 23 Feb.
    expect(nextWeekMonday(new Date(2026, 1, 22))).toBe("2026-02-23");
  });
  it("crosses a month boundary", () => {
    // Fri 27 Feb 2026 -> Mon 2 Mar 2026
    expect(nextWeekMonday(new Date(2026, 1, 27))).toBe("2026-03-02");
    // Sat 28 Feb -> Mon 2 Mar
    expect(nextWeekMonday(new Date(2026, 1, 28))).toBe("2026-03-02");
  });
});

describe("planDates", () => {
  it("returns 7 consecutive dates Mon..Sun", () => {
    expect(planDates("2026-02-23")).toEqual([
      "2026-02-23", "2026-02-24", "2026-02-25", "2026-02-26", "2026-02-27", "2026-02-28", "2026-03-01",
    ]);
  });
  it("returns [] for a malformed start", () => {
    expect(planDates("not-a-date")).toEqual([]);
  });
});

describe("canDraftPlan + buildPlanBrief", () => {
  it("requires at least one total post", () => {
    expect(canDraftPlan(emptyReport(), 0)).toBe(false);
    expect(canDraftPlan(emptyReport(), 1)).toBe(true);
    expect(canDraftPlan(richReport(), 3)).toBe(true);
  });
  it("returns an empty brief when there are no posts at all", () => {
    expect(buildPlanBrief(emptyReport(), 0)).toBe("");
  });
  it("builds a brief only from report facts", () => {
    const brief = buildPlanBrief(richReport(), 3);
    expect(brief).toContain('"Winner reel"');
    expect(brief).toContain("18:00");
    expect(brief).toContain("subscribe");
    expect(brief.toLowerCase()).toContain("views");
  });
});

const items = (n: number): GeneratedItem[] =>
  Array.from({ length: n }, (_, i) => ({ title: `Item ${i + 1}`, detail: `Detail ${i + 1}` }));

const baseArgs = (report: WeeklyReport, generated: GeneratedItem[]) => ({
  weekStart: "2026-02-23",
  items: generated,
  report,
  source: "template" as const,
  fellBack: false,
  generatedAt: "2026-02-18T12:00:00.000Z",
});

describe("assemblePlan — item to day mapping", () => {
  it("maps 4 items to the first 4 days and leaves the rest empty", () => {
    const plan = assemblePlan(baseArgs(richReport(), items(4)));
    expect(plan.days).toHaveLength(7);
    expect(plan.days.map((d) => d.items.length)).toEqual([1, 1, 1, 1, 0, 0, 0]);
    expect(plan.days[0]?.items[0]?.title).toBe("Item 1");
    expect(plan.days[6]?.date).toBe("2026-03-01");
  });
  it("maps 7 items one per day", () => {
    const plan = assemblePlan(baseArgs(richReport(), items(7)));
    expect(plan.days.map((d) => d.items.length)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(plan.days[6]?.items[0]?.title).toBe("Item 7");
  });
  it("wraps items beyond 7 as second items on days (i % 7)", () => {
    const plan = assemblePlan(baseArgs(richReport(), items(9)));
    expect(plan.days.map((d) => d.items.length)).toEqual([2, 2, 1, 1, 1, 1, 1]);
    expect(plan.days[0]?.items[1]?.title).toBe("Item 8");
    expect(plan.days[1]?.items[1]?.title).toBe("Item 9");
  });
  it("never invents a title for an empty item list", () => {
    const plan = assemblePlan(baseArgs(richReport(), []));
    expect(plan.days.every((d) => d.items.length === 0)).toBe(true);
  });
});

describe("assemblePlan — suggested times", () => {
  it("attaches rotating best-hour times with a factual basis", () => {
    const plan = assemblePlan(baseArgs(richReport(), items(3)));
    const first = plan.days[0]?.items[0];
    expect(first?.suggestedTime).toBe("18:00");
    expect(first?.timeBasis).toContain("18:00");
    expect(first?.timeBasis).toContain("averaged 80");
  });
  it("attaches no time when bestHours is insufficient", () => {
    const plan = assemblePlan(baseArgs(emptyReport(), items(2)));
    expect(plan.days[0]?.items[0]?.suggestedTime).toBeUndefined();
    expect(plan.days[0]?.items[0]?.timeBasis).toBeUndefined();
  });
});

describe("assemblePlan — recommendations", () => {
  it("includes all four keyed recommendations when every section qualifies", () => {
    const plan = assemblePlan(baseArgs(richReport(), items(7)));
    expect(plan.recommendations.length).toBeLessThanOrEqual(4);
    const texts = plan.recommendations.map((r) => r.text).join(" | ");
    expect(texts).toContain("Post around 18:00");
    expect(texts).toContain("up 123.0%");
    expect(texts).toContain("Winner reel");
    expect(texts).toContain("call to action in 2 of 2 breakdowns");
    expect(texts).toContain("'subscribe'");
    for (const rec of plan.recommendations) expect(rec.basis.length).toBeGreaterThan(0);
  });
  it("omits every recommendation when the report has no data", () => {
    const plan = assemblePlan(baseArgs(emptyReport(), items(2)));
    expect(plan.recommendations).toEqual([]);
  });
  it("words a falling trend as a refresh suggestion", () => {
    const posts = [
      post({ postedAt: iso(NOW - DAY), views: 500 }),
      post({ postedAt: iso(NOW - 8 * DAY), views: 1000 }),
    ];
    const report = computeWeeklyReport(posts, NOW, { competitors: [], analyses: [] });
    const plan = assemblePlan(baseArgs(report, items(1)));
    const trendRec = plan.recommendations.find((r) => r.text.includes("Views"));
    expect(trendRec?.text).toContain("down 50.0%");
    expect(trendRec?.text).toContain("consider refreshing the format");
  });
});

describe("assemblePlan — snapshot", () => {
  it("snapshots window posts, source mix and best hours", () => {
    const report = richReport();
    const plan = assemblePlan(baseArgs(report, items(1)));
    expect(plan.reportSnapshot.postsAnalysed).toBe(report.overview.postsInWindow);
    expect(plan.reportSnapshot.sourceMix).toEqual(report.overview.sourceMix);
    expect(plan.reportSnapshot.bestHours[0]?.hour).toBe(18);
    expect(plan.version).toBe(1);
    expect(plan.weekStart).toBe("2026-02-23");
  });
  it("snapshots an empty best-hours list when the section is insufficient", () => {
    const plan = assemblePlan(baseArgs(emptyReport(), items(1)));
    expect(plan.reportSnapshot.bestHours).toEqual([]);
    expect(plan.reportSnapshot.postsAnalysed).toBe(0);
  });
});

describe("readWeeklyPlan", () => {
  it("round-trips an assembled plan", () => {
    const plan = assemblePlan({ ...baseArgs(richReport(), items(8)), note: "fell back" });
    expect(readWeeklyPlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
  });
  it("rejects malformed bodies", () => {
    expect(readWeeklyPlan(null)).toBeNull();
    expect(readWeeklyPlan({})).toBeNull();
    expect(readWeeklyPlan({ version: 2 })).toBeNull();
    const plan = assemblePlan(baseArgs(richReport(), items(2)));
    expect(readWeeklyPlan({ ...plan, source: "magic" })).toBeNull();
    expect(readWeeklyPlan({ ...plan, days: plan.days.slice(0, 3) })).toBeNull();
    expect(readWeeklyPlan({ ...plan, reportSnapshot: null })).toBeNull();
    expect(readWeeklyPlan({ ...plan, recommendations: [{ text: "x" }] })).toBeNull();
  });
});
