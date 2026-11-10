/**
 * Creator Analytics — pure analytics core (Phase 8 slice 8.1).
 *
 * Everything here derives from the Phase 6 Growth Studio store: posts the
 * creator entered by hand or imported via CSV themselves (GrowthPost[]).
 * Nothing is pulled from a connected account (none exists), nothing is
 * scraped, projected or estimated, and no figure is platform-verified —
 * the page says so, and every section carries the source footnote built
 * by `sourceFootnote` so a reader can always see what a number rests on.
 *
 * Honesty rules, following the house pattern from features/growth/report.ts:
 * - Every section returns { status, basis } and degrades to
 *   status "insufficient" with a basis naming what was used and what is
 *   missing, instead of rendering a confident number from thin data.
 * - A metric nobody entered stays missing. Totals sum PRESENT values only
 *   and always travel with their coverage count ("views totalled X across
 *   11 of 14 posts — 3 posts have no views figure"). A metric reported by
 *   no post has total null, never 0.
 * - Engagement for ranking / rates means a COMPLETE engagement figure:
 *   all four components (likes + comments + shares + saves) present. A
 *   post missing any of them would have an understated total, so it is
 *   excluded and the exclusion count is part of the section's basis —
 *   unlike growth/model's per-post `engagementOf`, which documents its
 *   own treat-missing-as-0 definition for single-post display.
 * - Weeks with no posts are gaps (null figures), never zero weeks.
 */
import {
  METRIC_KEYS,
  summariseMetric,
  type GrowthPost,
  type MetricKey,
} from "@/features/growth/model";
import { growthCsvTemplate } from "@/features/growth/csv";

export type SectionStatus = "ok" | "insufficient";

const round1 = (n: number): number => Math.round(n * 10) / 10;

const plural = (n: number, singular: string, pluralForm = `${singular}s`): string =>
  n === 1 ? singular : pluralForm;

// ---------------------------------------------------------------------------
// Source footnote — attached to every section / visual on the page.
// ---------------------------------------------------------------------------

export interface SourceMix {
  manual: number;
  csv: number;
}

export function sourceMixOf(posts: ReadonlyArray<GrowthPost>): SourceMix {
  return {
    manual: posts.filter((p) => p.source === "manual").length,
    csv: posts.filter((p) => p.source === "csv").length,
  };
}

/**
 * The footnote every visual carries, e.g.
 * "Based on 14 posts you entered: 9 by hand, 5 via CSV import".
 */
export function sourceFootnote(posts: ReadonlyArray<GrowthPost>): string {
  const mix = sourceMixOf(posts);
  return (
    `Based on ${posts.length} ${plural(posts.length, "post")} you entered: ` +
    `${mix.manual} by hand, ${mix.csv} via CSV import`
  );
}

// ---------------------------------------------------------------------------
// Page-level decision: not-ready store / empty store / dashboard.
// Mirrors the /growth page's ready:false degradation — the page renders
// exactly one of these three states from this decision.
// ---------------------------------------------------------------------------

export type AnalyticsView = "not-ready" | "empty" | "dashboard";

export function resolveAnalyticsView(ready: boolean, postCount: number): AnalyticsView {
  if (!ready) return "not-ready";
  if (postCount === 0) return "empty";
  return "dashboard";
}

/**
 * The columns the empty state teaches, taken from the real CSV template's
 * header row so the lesson can never drift from the actual import format.
 */
export const ANALYTICS_CSV_COLUMNS: readonly string[] = growthCsvTemplate()
  .split("\n")[0]!
  .split(",")
  .map((c) => c.trim());

// ---------------------------------------------------------------------------
// Totals — sums over present values only, with coverage.
// ---------------------------------------------------------------------------

export interface MetricTotal {
  key: MetricKey;
  /** Sum of present values; null when no post reported this metric. */
  total: number | null;
  reportedCount: number;
  missingCount: number;
  /** e.g. "views totalled 350 across 2 of 3 posts — 1 post has no views figure". */
  coverageText: string;
}

export interface TotalsSection {
  status: SectionStatus;
  basis: string;
  totalPosts: number;
  sourceMix: SourceMix;
  metrics: Record<MetricKey, MetricTotal>;
}

const METRIC_NOUN: Record<MetricKey, string> = {
  views: "views",
  reach: "reach",
  likes: "likes",
  comments: "comments",
  shares: "shares",
  saves: "saves",
};

export function coverageText(
  key: MetricKey,
  total: number | null,
  reportedCount: number,
  totalPosts: number,
): string {
  const noun = METRIC_NOUN[key];
  if (reportedCount === 0) {
    return `No post has a ${noun} figure — ${noun} stays missing, not zero`;
  }
  const missing = totalPosts - reportedCount;
  const head = `${noun} totalled ${total} across ${reportedCount} of ${totalPosts} ${plural(totalPosts, "post")}`;
  return missing > 0
    ? `${head} — ${missing} ${plural(missing, "post")} ${missing === 1 ? "has" : "have"} no ${noun} figure`
    : `${head} — every post reported ${noun}`;
}

export function computeTotals(posts: ReadonlyArray<GrowthPost>): TotalsSection {
  const metrics = {} as Record<MetricKey, MetricTotal>;
  for (const key of METRIC_KEYS) {
    const { total, reportedCount } = summariseMetric(posts, key);
    metrics[key] = {
      key,
      total: reportedCount > 0 ? total : null,
      reportedCount,
      missingCount: posts.length - reportedCount,
      coverageText: coverageText(key, reportedCount > 0 ? total : null, reportedCount, posts.length),
    };
  }
  const anyReported = METRIC_KEYS.some((key) => metrics[key].reportedCount > 0);
  return {
    status: posts.length > 0 && anyReported ? "ok" : "insufficient",
    basis:
      posts.length === 0
        ? "Based on 0 posts — add or import posts in Growth Studio and their totals will appear here"
        : anyReported
          ? `${sourceFootnote(posts)}. Totals sum only the figures that were entered; the coverage line under each metric says how many posts reported it`
          : `${sourceFootnote(posts)}, but no post has any metric figure entered — totals need at least one entered figure`,
    totalPosts: posts.length,
    sourceMix: sourceMixOf(posts),
    metrics,
  };
}

// ---------------------------------------------------------------------------
// Engagement rate — by views, over posts with complete figures only.
// ---------------------------------------------------------------------------

/** A post whose engagement total is complete: all four components entered. */
export const hasCompleteEngagement = (
  post: Pick<GrowthPost, "likes" | "comments" | "shares" | "saves">,
): boolean =>
  post.likes !== null && post.comments !== null && post.shares !== null && post.saves !== null;

/** Complete engagement sum. Callers must check hasCompleteEngagement first. */
export const completeEngagementOf = (
  post: Pick<GrowthPost, "likes" | "comments" | "shares" | "saves">,
): number => (post.likes ?? 0) + (post.comments ?? 0) + (post.shares ?? 0) + (post.saves ?? 0);

export const ENGAGEMENT_RATE_FORMULA =
  "Engagement = likes + comments + shares + saves. Engagement rate = total engagement ÷ total views × 100";

export interface EngagementRateSection {
  status: SectionStatus;
  basis: string;
  formula: string;
  /** Aggregate rate in percent (1 dp); null when it cannot be computed honestly. */
  ratePct: number | null;
  totalEngagement: number;
  /** The denominator, named: total views over the eligible posts. */
  totalViews: number;
  denominator: "views";
  eligiblePosts: number;
  excludedPosts: number;
}

export function computeEngagementRate(posts: ReadonlyArray<GrowthPost>): EngagementRateSection {
  const eligible = posts.filter((p) => hasCompleteEngagement(p) && p.views !== null);
  const totalEngagement = eligible.reduce((sum, p) => sum + completeEngagementOf(p), 0);
  const totalViews = eligible.reduce((sum, p) => sum + (p.views ?? 0), 0);
  const excluded = posts.length - eligible.length;
  const ok = eligible.length > 0 && totalViews > 0;
  return {
    status: ok ? "ok" : "insufficient",
    basis: ok
      ? `${ENGAGEMENT_RATE_FORMULA}, computed over the ${eligible.length} ${plural(eligible.length, "post")} that reported views and all four engagement figures. Denominator: total views (${totalViews}) across those posts. ${excluded} ${plural(excluded, "post")} excluded — each is missing views or at least one engagement figure, so its rate would be understated`
      : `${ENGAGEMENT_RATE_FORMULA}. Not enough data yet — a rate needs at least 1 post that reported views and all four engagement figures, with a views total above zero. ${eligible.length} of ${posts.length} ${plural(posts.length, "post")} qualify so far`,
    formula: ENGAGEMENT_RATE_FORMULA,
    ratePct: ok ? round1((totalEngagement / totalViews) * 100) : null,
    totalEngagement,
    totalViews,
    denominator: "views",
    eligiblePosts: eligible.length,
    excludedPosts: excluded,
  };
}

// ---------------------------------------------------------------------------
// Best-performing content — ranked by complete engagement.
// ---------------------------------------------------------------------------

export interface BestContentEntry {
  post: GrowthPost;
  engagement: number;
}

export interface BestContentSection {
  status: SectionStatus;
  basis: string;
  entries: BestContentEntry[];
  eligiblePosts: number;
  excludedPosts: number;
}

export function computeBestContent(
  posts: ReadonlyArray<GrowthPost>,
  limit = 5,
): BestContentSection {
  const eligible = posts.filter(hasCompleteEngagement);
  const excluded = posts.length - eligible.length;
  const entries = eligible
    .map((post) => ({ post, engagement: completeEngagementOf(post) }))
    .sort((a, b) => {
      if (b.engagement !== a.engagement) return b.engagement - a.engagement;
      const byViews = (b.post.views ?? -1) - (a.post.views ?? -1);
      if (byViews !== 0) return byViews;
      const byDate = Date.parse(b.post.postedAt) - Date.parse(a.post.postedAt);
      if (byDate !== 0) return byDate;
      return a.post.id.localeCompare(b.post.id);
    })
    .slice(0, Math.max(0, limit));
  return {
    status: entries.length > 0 ? "ok" : "insufficient",
    basis:
      entries.length > 0
        ? `Ranked by engagement (likes + comments + shares + saves) over the ${eligible.length} ${plural(eligible.length, "post")} with all four engagement figures entered. ${excluded} ${plural(excluded, "post")} excluded — each is missing at least one engagement figure, so its total would be understated`
        : `Ranked by engagement (likes + comments + shares + saves). Not enough data yet — no post has all four engagement figures entered, so no honest ranking exists. ${excluded} of ${posts.length} ${plural(posts.length, "post")} excluded for missing engagement figures`,
    entries,
    eligiblePosts: eligible.length,
    excludedPosts: excluded,
  };
}

// ---------------------------------------------------------------------------
// Weekly trend — Monday-start (UTC) buckets; empty weeks are gaps.
// ---------------------------------------------------------------------------

export interface WeekBucket {
  /** Monday of the week, YYYY-MM-DD (UTC). */
  weekStart: string;
  postCount: number;
  /** True when no post falls in this week: figures are null, never zero. */
  isGap: boolean;
  /** Sum of present views; null when no post in the week reported views. */
  viewsTotal: number | null;
  viewsReportedCount: number;
  /** Sum over posts with complete engagement; null when none qualify. */
  engagementTotal: number | null;
  engagementEligibleCount: number;
}

export interface WeeklyTrendSection {
  status: SectionStatus;
  basis: string;
  buckets: WeekBucket[];
  /** Distinct weeks that contain at least one post. */
  activeWeeks: number;
  gapWeeks: number;
  /** Posts skipped because their postedAt did not parse. */
  undatedPosts: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const weekStartOf = (t: number): number => {
  const d = new Date(t);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const daysBackToMonday = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return midnight - daysBackToMonday * DAY_MS;
};

const weekLabel = (weekStartMs: number): string => new Date(weekStartMs).toISOString().slice(0, 10);

export function computeWeeklyTrend(posts: ReadonlyArray<GrowthPost>): WeeklyTrendSection {
  const byWeek = new Map<number, GrowthPost[]>();
  let undated = 0;
  for (const post of posts) {
    const t = Date.parse(post.postedAt);
    if (Number.isNaN(t)) {
      undated += 1;
      continue;
    }
    const start = weekStartOf(t);
    const list = byWeek.get(start) ?? [];
    list.push(post);
    byWeek.set(start, list);
  }

  const starts = [...byWeek.keys()].sort((a, b) => a - b);
  const buckets: WeekBucket[] = [];
  if (starts.length > 0) {
    const first = starts[0]!;
    const last = starts[starts.length - 1]!;
    for (let w = first; w <= last; w += 7 * DAY_MS) {
      const weekPosts = byWeek.get(w);
      if (!weekPosts || weekPosts.length === 0) {
        buckets.push({
          weekStart: weekLabel(w),
          postCount: 0,
          isGap: true,
          viewsTotal: null,
          viewsReportedCount: 0,
          engagementTotal: null,
          engagementEligibleCount: 0,
        });
        continue;
      }
      const views = summariseMetric(weekPosts, "views");
      const complete = weekPosts.filter(hasCompleteEngagement);
      buckets.push({
        weekStart: weekLabel(w),
        postCount: weekPosts.length,
        isGap: false,
        viewsTotal: views.reportedCount > 0 ? views.total : null,
        viewsReportedCount: views.reportedCount,
        engagementTotal:
          complete.length > 0 ? complete.reduce((s, p) => s + completeEngagementOf(p), 0) : null,
        engagementEligibleCount: complete.length,
      });
    }
  }

  const activeWeeks = buckets.filter((b) => !b.isGap).length;
  const gapWeeks = buckets.length - activeWeeks;
  const ok = activeWeeks >= 2;
  return {
    status: ok ? "ok" : "insufficient",
    basis: ok
      ? `Posts bucketed by week (weeks start on Monday, UTC) from your earliest to your latest post. ${gapWeeks} ${plural(gapWeeks, "week")} in that span ${gapWeeks === 1 ? "has" : "have"} no posts — shown as a gap, not a zero${undated > 0 ? `. ${undated} ${plural(undated, "post")} skipped: posted date did not parse` : ""}`
      : `Posts bucketed by week (weeks start on Monday, UTC). A trend needs posts in at least 2 different weeks — so far they span ${activeWeeks} ${plural(activeWeeks, "week")}${undated > 0 ? `. ${undated} ${plural(undated, "post")} skipped: posted date did not parse` : ""}`,
    buckets,
    activeWeeks,
    gapWeeks,
    undatedPosts: undated,
  };
}

// ---------------------------------------------------------------------------
// Assembled dashboard
// ---------------------------------------------------------------------------

export interface CreatorAnalytics {
  totalPosts: number;
  sourceMix: SourceMix;
  sourceFootnote: string;
  totals: TotalsSection;
  engagementRate: EngagementRateSection;
  bestContent: BestContentSection;
  weeklyTrend: WeeklyTrendSection;
}

export function computeCreatorAnalytics(posts: ReadonlyArray<GrowthPost>): CreatorAnalytics {
  return {
    totalPosts: posts.length,
    sourceMix: sourceMixOf(posts),
    sourceFootnote: sourceFootnote(posts),
    totals: computeTotals(posts),
    engagementRate: computeEngagementRate(posts),
    bestContent: computeBestContent(posts),
    weeklyTrend: computeWeeklyTrend(posts),
  };
}
