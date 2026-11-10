/**
 * Growth Studio — weekly report engine (Phase 6 slices 6.2 UI + 6.3), pure.
 *
 * Every number here derives from posts the creator entered or imported
 * themselves (GrowthPost[]) plus, for the niche section, competitor
 * breakdowns they saved from the Reel Analyzer. Nothing is estimated,
 * projected, scraped or filled in: a metric nobody reported stays a
 * reported-count next to its total, and a section without enough data
 * returns status "insufficient" with a basis that says what was used.
 *
 * Windows are rolling and age-based, bucketed by Date.parse(postedAt):
 * a post whose age is [0, 7d) is in the current window and [7d, 14d) is
 * in the prior window — so a post exactly 7 days old lands in the prior
 * window, and future-dated posts land in neither.
 */
import {
  METRIC_KEYS,
  engagementOf,
  summariseMetric,
  type CompetitorProfile,
  type GrowthPost,
  type MetricKey,
} from "./model";

export type SectionStatus = "ok" | "insufficient";

const DAY_MS = 24 * 60 * 60 * 1000;

const round1 = (n: number): number => Math.round(n * 10) / 10;

const sourceMixOf = (posts: ReadonlyArray<GrowthPost>): { manual: number; csv: number } => ({
  manual: posts.filter((p) => p.source === "manual").length,
  csv: posts.filter((p) => p.source === "csv").length,
});

const mixLabel = (mix: { manual: number; csv: number }): string =>
  `${mix.manual} manual, ${mix.csv} CSV`;

type Window = "current" | "prior" | null;

function windowOf(postedAt: string, now: number): Window {
  const t = Date.parse(postedAt);
  if (Number.isNaN(t)) return null;
  const age = now - t;
  if (age >= 0 && age < 7 * DAY_MS) return "current";
  if (age >= 7 * DAY_MS && age < 14 * DAY_MS) return "prior";
  return null;
}

export function splitWindows(
  posts: ReadonlyArray<GrowthPost>,
  now: number,
): { current: GrowthPost[]; prior: GrowthPost[] } {
  const current: GrowthPost[] = [];
  const prior: GrowthPost[] = [];
  for (const post of posts) {
    const w = windowOf(post.postedAt, now);
    if (w === "current") current.push(post);
    else if (w === "prior") prior.push(post);
  }
  return { current, prior };
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export interface OverviewSection {
  status: SectionStatus;
  basis: string;
  postsInWindow: number;
  priorWindowPosts: number;
  metrics: Record<MetricKey, { total: number; reportedCount: number }>;
  sourceMix: { manual: number; csv: number };
}

export function computeOverview(
  posts: ReadonlyArray<GrowthPost>,
  now: number,
): OverviewSection {
  const { current, prior } = splitWindows(posts, now);
  const mix = sourceMixOf(current);
  const metrics = {} as Record<MetricKey, { total: number; reportedCount: number }>;
  for (const key of METRIC_KEYS) metrics[key] = summariseMetric(current, key);
  return {
    status: current.length > 0 ? "ok" : "insufficient",
    basis:
      current.length > 0
        ? `Based on ${current.length} posts from the last 7 days (${mixLabel(mix)})`
        : `Based on 0 posts from the last 7 days (${mixLabel(mix)})`,
    postsInWindow: current.length,
    priorWindowPosts: prior.length,
    metrics,
    sourceMix: mix,
  };
}

// ---------------------------------------------------------------------------
// Best hours (all history)
// ---------------------------------------------------------------------------

export interface BestHourBucket {
  hour: number;
  posts: number;
  avgEngagement: number;
}

export interface BestHoursSection {
  status: SectionStatus;
  basis: string;
  hours: BestHourBucket[];
  totalPosts: number;
}

export function computeBestHours(posts: ReadonlyArray<GrowthPost>): BestHoursSection {
  const buckets = new Map<number, { posts: number; engagement: number }>();
  let total = 0;
  for (const post of posts) {
    const t = Date.parse(post.postedAt);
    if (Number.isNaN(t)) continue;
    total += 1;
    const hour = new Date(post.postedAt).getHours();
    const bucket = buckets.get(hour) ?? { posts: 0, engagement: 0 };
    bucket.posts += 1;
    bucket.engagement += engagementOf(post);
    buckets.set(hour, bucket);
  }
  const qualifying: BestHourBucket[] = [...buckets.entries()]
    .filter(([, b]) => b.posts >= 2)
    .map(([hour, b]) => ({ hour, posts: b.posts, avgEngagement: round1(b.engagement / b.posts) }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement || b.posts - a.posts || a.hour - b.hour)
    .slice(0, 3);
  const ok = total >= 3 && qualifying.length >= 1;
  return {
    status: ok ? "ok" : "insufficient",
    basis: ok
      ? `Based on all ${total} posts in your history, grouped by the hour each was posted`
      : `Based on all ${total} posts in your history — a best-hours list needs at least 3 posts and one hour with at least 2 posts`,
    hours: ok ? qualifying : [],
    totalPosts: total,
  };
}

// ---------------------------------------------------------------------------
// Top / bottom posts (current window)
// ---------------------------------------------------------------------------

export interface TopBottomSection {
  status: SectionStatus;
  basis: string;
  top: GrowthPost[];
  bottom: GrowthPost[];
}

export function computeTopBottom(posts: ReadonlyArray<GrowthPost>, now: number): TopBottomSection {
  const { current } = splitWindows(posts, now);
  const sorted = [...current].sort((a, b) => {
    const byEngagement = engagementOf(b) - engagementOf(a);
    if (byEngagement !== 0) return byEngagement;
    return Date.parse(b.postedAt) - Date.parse(a.postedAt);
  });
  if (sorted.length === 0) {
    return {
      status: "insufficient",
      basis: "Based on 0 posts from the last 7 days — no posts to rank yet",
      top: [],
      bottom: [],
    };
  }
  const top = sorted.slice(0, 3);
  if (sorted.length < 4) {
    return {
      status: "ok",
      basis: `Based on ${sorted.length} posts from the last 7 days — not enough posts this week for a bottom list`,
      top,
      bottom: [],
    };
  }
  const topIds = new Set(top.map((p) => p.id));
  const bottom = sorted.slice(-3).filter((p) => !topIds.has(p.id));
  return {
    status: "ok",
    basis: `Based on ${sorted.length} posts from the last 7 days, ranked by engagement (likes + comments + shares + saves)`,
    top,
    bottom,
  };
}

// ---------------------------------------------------------------------------
// Trend (current vs prior)
// ---------------------------------------------------------------------------

export interface TrendEntry {
  currentTotal: number;
  priorTotal: number;
  currentReportedCount: number;
  priorReportedCount: number;
  deltaPct: number | null;
}

export interface PostCountTrend {
  current: number;
  prior: number;
  deltaPct: number | null;
}

export interface TrendSection {
  status: SectionStatus;
  basis: string;
  metrics: Record<MetricKey, TrendEntry>;
  postCount: PostCountTrend;
}

function deltaPct(current: number, prior: number, priorReported: boolean): number | null {
  if (!priorReported || prior === 0) return null;
  return round1(((current - prior) / prior) * 100);
}

export function computeTrend(posts: ReadonlyArray<GrowthPost>, now: number): TrendSection {
  const { current, prior } = splitWindows(posts, now);
  const metrics = {} as Record<MetricKey, TrendEntry>;
  let anyMissingBaseline = false;
  for (const key of METRIC_KEYS) {
    const cur = summariseMetric(current, key);
    const pri = summariseMetric(prior, key);
    const delta = deltaPct(cur.total, pri.total, pri.reportedCount > 0);
    if (delta === null) anyMissingBaseline = true;
    metrics[key] = {
      currentTotal: cur.total,
      priorTotal: pri.total,
      currentReportedCount: cur.reportedCount,
      priorReportedCount: pri.reportedCount,
      deltaPct: delta,
    };
  }
  const postDelta =
    prior.length === 0 ? null : round1(((current.length - prior.length) / prior.length) * 100);
  if (postDelta === null) anyMissingBaseline = true;
  const ok = current.length >= 1 && prior.length >= 1;
  const baselineNote = anyMissingBaseline
    ? " Some metrics have no prior-period baseline (the prior 7 days reported nothing for them), so no change can be shown for those."
    : "";
  return {
    status: ok ? "ok" : "insufficient",
    basis:
      `Based on ${current.length} posts from the last 7 days against ${prior.length} posts from the prior 7 days.` +
      (ok ? baselineNote : " A trend needs at least 1 post in each 7-day window." + baselineNote),
    metrics,
    postCount: { current: current.length, prior: prior.length, deltaPct: postDelta },
  };
}

// ---------------------------------------------------------------------------
// Niche — competitor breakdowns from saved Reel Analyzer items
// ---------------------------------------------------------------------------

/**
 * One analysis, defensively extracted from a saved content item's body.
 * `competitorName` is null for the creator's own videos.
 */
export interface AnalysisForReport {
  competitorName: string | null;
  videoTitle: string;
  hookText: string;
  wordsPerMin: number | null;
  ctaPhrases: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const asFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Read one saved analysis body (the W3 contract) into the flat shape the
 * report needs. Returns null for anything that is not a recognisable
 * analysis — malformed or older rows are skipped, never guessed at.
 * This reader lives here, not in features/analyzer, by design: the growth
 * report owns its defensive read of the stored contract.
 */
export function readAnalysisForReport(body: unknown): AnalysisForReport | null {
  if (!isRecord(body)) return null;
  if (body.version !== 1) return null;
  if (!isRecord(body.subject)) return null;
  let competitorName: string | null = null;
  if (body.subject.type === "competitor") {
    if (typeof body.subject.name !== "string" || !body.subject.name.trim()) return null;
    competitorName = body.subject.name;
  } else if (body.subject.type !== "own") {
    return null;
  }
  if (!isRecord(body.breakdown)) return null;
  const breakdown = body.breakdown;
  const hookText =
    isRecord(breakdown.hook) && typeof breakdown.hook.text === "string" ? breakdown.hook.text : "";
  const wordsPerMin = isRecord(breakdown.pacing) ? asFiniteNumber(breakdown.pacing.wordsPerMin) : null;
  const ctaPhrases: string[] = [];
  if (isRecord(breakdown.cta) && Array.isArray(breakdown.cta.found)) {
    for (const entry of breakdown.cta.found) {
      if (isRecord(entry) && typeof entry.phrase === "string" && entry.phrase) {
        if (!ctaPhrases.includes(entry.phrase)) ctaPhrases.push(entry.phrase);
      }
    }
  }
  return {
    competitorName,
    videoTitle: typeof body.videoTitle === "string" ? body.videoTitle : "",
    hookText,
    wordsPerMin,
    ctaPhrases,
  };
}

export interface CompetitorBreakdownSummary {
  name: string;
  breakdowns: number;
  avgWordsPerMin: number | null;
  ctaPhrases: string[];
}

export interface NicheSection {
  status: SectionStatus;
  basis: string;
  perCompetitor: CompetitorBreakdownSummary[];
  commonCtas: Array<{ phrase: string; count: number }>;
  ownAvgWordsPerMin: number | null;
  totalCompetitorBreakdowns: number;
  breakdownsWithCta: number;
}

export interface NicheInputs {
  competitors: CompetitorProfile[];
  analyses: AnalysisForReport[];
}

const avgOrNull = (values: number[]): number | null =>
  values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null;

export function computeNiche(inputs: NicheInputs): NicheSection {
  const competitorAnalyses = inputs.analyses.filter((a) => a.competitorName !== null);
  const ownAnalyses = inputs.analyses.filter((a) => a.competitorName === null);

  const byName = new Map<string, AnalysisForReport[]>();
  for (const analysis of competitorAnalyses) {
    const name = analysis.competitorName as string;
    const list = byName.get(name) ?? [];
    list.push(analysis);
    byName.set(name, list);
  }

  const perCompetitor: CompetitorBreakdownSummary[] = [...byName.entries()]
    .map(([name, list]) => {
      const ctaPhrases: string[] = [];
      for (const item of list) {
        for (const phrase of item.ctaPhrases) {
          if (!ctaPhrases.includes(phrase)) ctaPhrases.push(phrase);
        }
      }
      return {
        name,
        breakdowns: list.length,
        avgWordsPerMin: avgOrNull(
          list.map((i) => i.wordsPerMin).filter((v): v is number => v !== null),
        ),
        ctaPhrases,
      };
    })
    .sort((a, b) => b.breakdowns - a.breakdowns || a.name.localeCompare(b.name));

  const ctaCounts = new Map<string, number>();
  const ctaOrder: string[] = [];
  let breakdownsWithCta = 0;
  for (const analysis of competitorAnalyses) {
    if (analysis.ctaPhrases.length > 0) breakdownsWithCta += 1;
    for (const phrase of analysis.ctaPhrases) {
      if (!ctaCounts.has(phrase)) ctaOrder.push(phrase);
      ctaCounts.set(phrase, (ctaCounts.get(phrase) ?? 0) + 1);
    }
  }
  const commonCtas = ctaOrder
    .map((phrase) => ({ phrase, count: ctaCounts.get(phrase) ?? 0 }))
    .sort((a, b) => b.count - a.count || ctaOrder.indexOf(a.phrase) - ctaOrder.indexOf(b.phrase));

  const ownAvgWordsPerMin = avgOrNull(
    ownAnalyses.map((i) => i.wordsPerMin).filter((v): v is number => v !== null),
  );

  const ok = competitorAnalyses.length > 0;
  return {
    status: ok ? "ok" : "insufficient",
    basis: ok
      ? `Based on ${competitorAnalyses.length} competitor breakdowns you saved from the Reel Analyzer (${inputs.competitors.length} competitor profiles)`
      : "Based on 0 competitor breakdowns — analyse a competitor video in the Reel Analyzer and save it to fill this section",
    perCompetitor,
    commonCtas,
    ownAvgWordsPerMin,
    totalCompetitorBreakdowns: competitorAnalyses.length,
    breakdownsWithCta,
  };
}

// ---------------------------------------------------------------------------
// Assembled report
// ---------------------------------------------------------------------------

export interface WeeklyReport {
  generatedAt: number;
  overview: OverviewSection;
  bestHours: BestHoursSection;
  topBottom: TopBottomSection;
  trend: TrendSection;
  niche: NicheSection;
}

export function computeWeeklyReport(
  posts: ReadonlyArray<GrowthPost>,
  now: number,
  nicheInputs: NicheInputs,
): WeeklyReport {
  return {
    generatedAt: now,
    overview: computeOverview(posts, now),
    bestHours: computeBestHours(posts),
    topBottom: computeTopBottom(posts, now),
    trend: computeTrend(posts, now),
    niche: computeNiche(nicheInputs),
  };
}
