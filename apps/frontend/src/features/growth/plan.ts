/**
 * Growth Studio — routed weekly plan (Phase 6 slice 6.3), pure.
 *
 * A weekly plan is a saved content-library item (kind "weekly-plan") whose
 * body is the WeeklyPlanBody below. The plan's day titles come from the
 * shared generation routing (runChatTurn with the "calendar" output type,
 * driven by the page); everything wrapped around them — the week dates,
 * the suggested times, the recommendations and the report snapshot — is
 * assembled here deterministically from the weekly report, so every extra
 * line on the plan can be traced to a stored number. Days the generator
 * did not fill stay empty: no title is ever invented here.
 */
import type { GeneratedItem, Source } from "@/features/create/model";
import { METRIC_KEYS, type MetricKey } from "./model";
import type { WeeklyReport } from "./report";

export interface PlanRecommendation {
  text: string;
  basis: string;
}

export interface PlanDayItem {
  title: string;
  detail?: string;
  suggestedTime?: string;
  timeBasis?: string;
}

export interface PlanDay {
  date: string;
  items: PlanDayItem[];
}

export interface WeeklyPlanBody {
  version: 1;
  weekStart: string;
  generatedAt: string;
  source: Source;
  fellBack: boolean;
  note?: string;
  recommendations: PlanRecommendation[];
  days: PlanDay[];
  reportSnapshot: {
    postsAnalysed: number;
    sourceMix: { manual: number; csv: number };
    bestHours: { hour: number; posts: number; avgEngagement: number }[];
  };
}

// ---------------------------------------------------------------------------
// Dates (local, YYYY-MM-DD)
// ---------------------------------------------------------------------------

const pad2 = (n: number): string => String(n).padStart(2, "0");

const formatLocalDate = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const parseLocalDate = (value: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) {
    return null;
  }
  return d;
};

/** The Monday of NEXT week, as YYYY-MM-DD in local dates. A Monday input moves +7 days. */
export function nextWeekMonday(from: Date): string {
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const day = base.getDay(); // 0 Sun .. 6 Sat
  const daysBackToMonday = (day + 6) % 7;
  const mondayThisWeek = new Date(base);
  mondayThisWeek.setDate(base.getDate() - daysBackToMonday);
  const next = new Date(mondayThisWeek);
  next.setDate(mondayThisWeek.getDate() + 7);
  return formatLocalDate(next);
}

/** The 7 dates Mon..Sun starting at weekStart (YYYY-MM-DD). */
export function planDates(weekStart: string): string[] {
  const start = parseLocalDate(weekStart);
  if (!start) return [];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return formatLocalDate(d);
  });
}

// ---------------------------------------------------------------------------
// Brief + draft gate
// ---------------------------------------------------------------------------

/** A plan needs at least some user data: one stored post in any window. */
export function canDraftPlan(report: WeeklyReport, totalPosts: number): boolean {
  void report;
  return totalPosts >= 1;
}

const METRIC_LABELS: Record<MetricKey, { label: string; verb: string }> = {
  views: { label: "Views", verb: "are" },
  reach: { label: "Reach", verb: "is" },
  likes: { label: "Likes", verb: "are" },
  comments: { label: "Comments", verb: "are" },
  shares: { label: "Shares", verb: "are" },
  saves: { label: "Saves", verb: "are" },
};

/** The metric with the largest absolute trend change, when any metric has a baseline. */
export function dominantTrend(
  report: WeeklyReport,
): { key: MetricKey; deltaPct: number; currentTotal: number; priorTotal: number } | null {
  let best: { key: MetricKey; deltaPct: number; currentTotal: number; priorTotal: number } | null = null;
  for (const key of METRIC_KEYS) {
    const entry = report.trend.metrics[key];
    if (entry.deltaPct === null) continue;
    if (!best || Math.abs(entry.deltaPct) > Math.abs(best.deltaPct)) {
      best = { key, deltaPct: entry.deltaPct, currentTotal: entry.currentTotal, priorTotal: entry.priorTotal };
    }
  }
  return best;
}

/**
 * The userText for runChatTurn("calendar", ...): compact, and built ONLY
 * from report facts. Returns "" when there are no posts at all — the page
 * must not call generation in that state (canDraftPlan gates the button).
 */
export function buildPlanBrief(report: WeeklyReport, totalPosts: number): string {
  if (totalPosts < 1) return "";
  const parts: string[] = [
    `Plan next week's content based on my own stored post numbers (${totalPosts} posts in total, ${report.overview.postsInWindow} in the last 7 days).`,
  ];
  const topTitles = report.topBottom.top.slice(0, 3).map((p) => p.title).filter(Boolean);
  if (topTitles.length) {
    parts.push(`Top posts this period: ${topTitles.map((t) => `"${t}"`).join(", ")}.`);
  }
  if (report.bestHours.status === "ok" && report.bestHours.hours.length) {
    parts.push(
      `Best posting hours: ${report.bestHours.hours
        .map((h) => `${h.hour}:00 (avg ${h.avgEngagement} engagement across ${h.posts} posts)`)
        .join(", ")}.`,
    );
  }
  if (report.trend.status === "ok") {
    const dominant = dominantTrend(report);
    if (dominant) {
      const { label } = METRIC_LABELS[dominant.key];
      const direction = dominant.deltaPct >= 0 ? "up" : "down";
      parts.push(`${label} ${direction} ${Math.abs(dominant.deltaPct).toFixed(1)}% on the prior 7 days.`);
    }
  }
  if (report.niche.status === "ok" && report.niche.commonCtas.length) {
    parts.push(
      `Competitor calls to action seen in analysed videos: ${report.niche.commonCtas
        .slice(0, 3)
        .map((c) => `"${c.phrase}" (${c.count})`)
        .join(", ")}.`,
    );
  }
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export interface AssemblePlanInput {
  weekStart: string;
  items: GeneratedItem[];
  report: WeeklyReport;
  source: Source;
  fellBack: boolean;
  note?: string;
  generatedAt: string;
}

export function assemblePlan(input: AssemblePlanInput): WeeklyPlanBody {
  const { report } = input;
  const dates = planDates(input.weekStart);
  const bestHours = report.bestHours.status === "ok" ? report.bestHours.hours : [];

  const cleanDays: PlanDay[] = dates.map((date) => ({ date, items: [] }));
  input.items.forEach((item, i) => {
    const dayIndex = i % 7;
    const day = cleanDays[dayIndex];
    if (!day) return;
    const bucket = bestHours.length ? bestHours[dayIndex % bestHours.length] : undefined;
    const planItem: PlanDayItem = {
      title: item.title,
      ...(item.detail ? { detail: item.detail } : {}),
      ...(bucket
        ? {
            suggestedTime: `${pad2(bucket.hour)}:00`,
            timeBasis: `Your posts at ${bucket.hour}:00 averaged ${bucket.avgEngagement} engagement across ${bucket.posts} posts`,
          }
        : {}),
    };
    day.items.push(planItem);
  });

  const recommendations: PlanRecommendation[] = [];

  if (report.bestHours.status === "ok" && report.bestHours.hours.length) {
    const top = report.bestHours.hours[0]!;
    recommendations.push({
      text: `Post around ${top.hour}:00 — your best-performing slot`,
      basis: `Your posts at ${top.hour}:00 averaged ${top.avgEngagement} engagement across ${top.posts} posts`,
    });
  }

  if (report.trend.status === "ok") {
    const dominant = dominantTrend(report);
    if (dominant && dominant.deltaPct !== 0) {
      const { label, verb } = METRIC_LABELS[dominant.key];
      const magnitude = Math.abs(dominant.deltaPct).toFixed(1);
      recommendations.push(
        dominant.deltaPct > 0
          ? {
              text: `${label} ${verb} up ${magnitude}% on the prior 7 days — keep the current cadence`,
              basis: `${label} totalled ${dominant.currentTotal} in the last 7 days vs ${dominant.priorTotal} in the prior 7 days`,
            }
          : {
              text: `${label} ${verb} down ${magnitude}% on the prior 7 days — consider refreshing the format`,
              basis: `${label} totalled ${dominant.currentTotal} in the last 7 days vs ${dominant.priorTotal} in the prior 7 days`,
            },
      );
    } else if (dominant && dominant.deltaPct === 0) {
      const { label, verb } = METRIC_LABELS[dominant.key];
      recommendations.push({
        text: `${label} ${verb} unchanged on the prior 7 days — keep the current cadence`,
        basis: `${label} totalled ${dominant.currentTotal} in the last 7 days vs ${dominant.priorTotal} in the prior 7 days`,
      });
    }
  }

  if (report.topBottom.top.length) {
    const topPost = report.topBottom.top[0]!;
    const engagement =
      (topPost.likes ?? 0) + (topPost.comments ?? 0) + (topPost.shares ?? 0) + (topPost.saves ?? 0);
    const sourceLabel = topPost.source === "csv" ? "CSV" : "Manual";
    recommendations.push({
      text: `Your best post this period was '${topPost.title}' — plan a follow-up in the same format`,
      basis: `${engagement} engagement · ${sourceLabel} entry`,
    });
  }

  if (report.niche.status === "ok" && report.niche.commonCtas.length) {
    const first = report.niche.commonCtas[0]!;
    recommendations.push({
      text: `Competitor videos you analysed used a call to action in ${report.niche.breakdownsWithCta} of ${report.niche.totalCompetitorBreakdowns} breakdowns — most common: '${first.phrase}'`,
      basis: `'${first.phrase}' appeared in ${first.count} competitor breakdowns`,
    });
  }

  return {
    version: 1,
    weekStart: input.weekStart,
    generatedAt: input.generatedAt,
    source: input.source,
    fellBack: input.fellBack,
    ...(input.note ? { note: input.note } : {}),
    recommendations: recommendations.slice(0, 4),
    days: cleanDays,
    reportSnapshot: {
      postsAnalysed: report.overview.postsInWindow,
      sourceMix: { ...report.overview.sourceMix },
      bestHours: bestHours.map((h) => ({ hour: h.hour, posts: h.posts, avgEngagement: h.avgEngagement })),
    },
  };
}

// ---------------------------------------------------------------------------
// Defensive reader for stored plan bodies
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const SOURCES: readonly Source[] = ["template", "model", "cloud"];

export function readWeeklyPlan(body: unknown): WeeklyPlanBody | null {
  if (!isRecord(body)) return null;
  if (body.version !== 1) return null;
  if (typeof body.weekStart !== "string" || !parseLocalDate(body.weekStart)) return null;
  if (typeof body.generatedAt !== "string" || !body.generatedAt) return null;
  if (!SOURCES.includes(body.source as Source)) return null;
  if (typeof body.fellBack !== "boolean") return null;
  if (!Array.isArray(body.recommendations)) return null;
  const recommendations: PlanRecommendation[] = [];
  for (const rec of body.recommendations) {
    if (!isRecord(rec) || typeof rec.text !== "string" || typeof rec.basis !== "string") return null;
    recommendations.push({ text: rec.text, basis: rec.basis });
  }
  if (!Array.isArray(body.days) || body.days.length !== 7) return null;
  const days: PlanDay[] = [];
  for (const day of body.days) {
    if (!isRecord(day) || typeof day.date !== "string" || !parseLocalDate(day.date)) return null;
    if (!Array.isArray(day.items)) return null;
    const items: PlanDayItem[] = [];
    for (const item of day.items) {
      if (!isRecord(item) || typeof item.title !== "string" || !item.title) return null;
      items.push({
        title: item.title,
        ...(typeof item.detail === "string" ? { detail: item.detail } : {}),
        ...(typeof item.suggestedTime === "string" ? { suggestedTime: item.suggestedTime } : {}),
        ...(typeof item.timeBasis === "string" ? { timeBasis: item.timeBasis } : {}),
      });
    }
    days.push({ date: day.date, items });
  }
  if (!isRecord(body.reportSnapshot)) return null;
  const snap = body.reportSnapshot;
  if (typeof snap.postsAnalysed !== "number" || !Number.isFinite(snap.postsAnalysed)) return null;
  if (!isRecord(snap.sourceMix)) return null;
  if (typeof snap.sourceMix.manual !== "number" || typeof snap.sourceMix.csv !== "number") return null;
  if (!Array.isArray(snap.bestHours)) return null;
  const bestHours: WeeklyPlanBody["reportSnapshot"]["bestHours"] = [];
  for (const h of snap.bestHours) {
    if (!isRecord(h) || typeof h.hour !== "number" || typeof h.posts !== "number" || typeof h.avgEngagement !== "number") {
      return null;
    }
    bestHours.push({ hour: h.hour, posts: h.posts, avgEngagement: h.avgEngagement });
  }
  return {
    version: 1,
    weekStart: body.weekStart,
    generatedAt: body.generatedAt,
    source: body.source as Source,
    fellBack: body.fellBack,
    ...(typeof body.note === "string" ? { note: body.note } : {}),
    recommendations,
    days,
    reportSnapshot: {
      postsAnalysed: snap.postsAnalysed,
      sourceMix: { manual: snap.sourceMix.manual, csv: snap.sourceMix.csv },
      bestHours,
    },
  };
}
