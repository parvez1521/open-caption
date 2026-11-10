"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import StudioShell from "@/components/studio/StudioShell";
import { METRIC_KEYS, type GrowthPost, type MetricKey } from "@/features/growth/model";
import { fetchGrowthPosts } from "@/features/growth/api";
import {
  ANALYTICS_CSV_COLUMNS,
  computeCreatorAnalytics,
  resolveAnalyticsView,
} from "@/features/analytics/analytics";

/**
 * Creator Analytics (Phase 8, slice 8.1): a dashboard over the Phase 6
 * Growth Studio store — totals with coverage, an engagement rate with its
 * formula and denominator stated, best-performing content, and a weekly
 * trend where empty weeks are gaps, not zeros.
 *
 * Every figure here is a figure the creator entered or imported
 * themselves — not pulled from their accounts. No account is connected,
 * nothing is scraped or platform-verified, and a metric that was never
 * entered stays missing in every total, rate and ranking. All math lives
 * in the pure core (features/analytics/analytics.ts); this page renders
 * its sections and their bases/footnotes verbatim.
 */

const primaryBtn =
  "rounded-full bg-ink px-6 py-2.5 font-sora text-[12px] font-semibold text-dune-white hover:bg-sand-800 disabled:opacity-60 transition-all cursor-pointer";
const ghostBtn =
  "rounded-full border border-sand-300 px-4 py-2 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink disabled:opacity-50 transition-colors cursor-pointer";
const sectionTitleCls = "font-sora text-[13px] font-bold uppercase tracking-wider text-sand-600";
const cardCls = "rounded-xl border border-sand-200 bg-white p-5";
const footnoteCls = "mt-3 border-t border-sand-200 pt-3 text-[12px] leading-relaxed text-sand-600";

const METRIC_LABELS: Record<MetricKey, string> = {
  views: "Views",
  reach: "Reach",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
  saves: "Saves",
};

const fmt = (n: number): string => n.toLocaleString();

function formatPostedAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

const errText = (e: unknown, fallback: string): string =>
  e instanceof Error ? e.message : fallback;

export default function AnalyticsPage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [posts, setPosts] = useState<GrowthPost[]>([]);
  const [growthReady, setGrowthReady] = useState(true);

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push(isSupabaseConfigured() ? "/login" : "/start");
      return;
    }
    setSignedIn(true);
  }, [router]);

  const loadAll = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await fetchGrowthPosts();
      setPosts(list.posts);
      setGrowthReady(list.ready);
    } catch (e) {
      setLoadError(errText(e, "Couldn't load your analytics. Try again."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!signedIn) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const analytics = useMemo(() => computeCreatorAnalytics(posts), [posts]);
  const view = resolveAnalyticsView(growthReady, posts.length);

  const maxWeekViews = useMemo(() => {
    const values = analytics.weeklyTrend.buckets
      .map((b) => b.viewsTotal)
      .filter((v): v is number => v !== null);
    return values.length ? Math.max(...values) : 0;
  }, [analytics]);

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-5xl mx-auto">
        <div className="pb-8 border-b border-sand-200">
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink">
            Creator <em className="italic text-sand-600">Analytics</em>
          </h1>
          <p className="mt-2 text-[14px] text-sand-800 max-w-2xl">
            Totals, engagement and trends across everything you have posted — worked out from
            your Growth Studio numbers only, with the coverage of every figure stated next to it.
          </p>
          <p className="mt-3 max-w-[68ch] rounded-lg border border-sand-200 bg-sand-100 px-4 py-3 text-[13px] leading-relaxed text-sand-800">
            These are figures you entered or imported — not pulled from your accounts. No
            platform is connected and nothing here is platform-verified, scraped or estimated.
            A metric you did not enter stays missing: it is never counted as zero, and every
            total below says how many posts it actually covers.
          </p>
        </div>

        {loading ? (
          <p role="status" className="pt-8 text-[14px] text-sand-700">Loading your analytics…</p>
        ) : loadError ? (
          <div className="mt-8 rounded-xl border border-orange-accent/60 bg-orange-accent/10 p-8 text-center space-y-3">
            <p className="font-sora text-[14px] font-semibold text-obsidian">{loadError}</p>
            <button onClick={() => void loadAll()} className={ghostBtn}>Retry</button>
          </div>
        ) : view === "not-ready" ? (
          <p role="alert" className="mt-8 rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-4 py-3 text-[13px] leading-relaxed text-obsidian">
            Creator Analytics reads the Growth Studio store, which is not set up on the server
            yet — a database update is pending. Nothing can be shown until then, and nothing is
            stored on this device as a substitute.
          </p>
        ) : view === "empty" ? (
          <div className="mt-8 rounded-xl border border-dashed border-sand-300 bg-sand-50 px-8 py-12">
            <p className="font-serif text-2xl font-semibold text-ink text-center">
              No posts <em className="italic text-sand-600">yet.</em>
            </p>
            <p className="mx-auto mt-2 max-w-lg text-center text-[14px] text-sand-800">
              Analytics starts from the posts in your Growth Studio store. Add posts by hand
              there, or import a spreadsheet as a CSV with these columns:
            </p>
            <ul className="mx-auto mt-5 flex max-w-lg flex-wrap justify-center gap-2" aria-label="Expected CSV columns">
              {ANALYTICS_CSV_COLUMNS.map((col) => (
                <li
                  key={col}
                  className="rounded-full border border-sand-300 bg-sand-100 px-3 py-1 font-mono text-[12px] text-sand-800"
                >
                  {col}
                </li>
              ))}
            </ul>
            <p className="mx-auto mt-5 max-w-lg text-center text-[13px] leading-relaxed text-sand-700">
              Only <span className="font-mono">platform</span> and <span className="font-mono">posted_at</span> are
              required. Leave a metric blank when you did not record it — blank is stored as
              &ldquo;not entered&rdquo;, never as zero, and totals here will say how many posts
              each figure covers. Growth Studio has the downloadable template and the importer.
            </p>
            <div className="mt-6 text-center">
              <Link href="/growth" className={`${primaryBtn} inline-block`}>
                Open Growth Studio to add or import posts
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* -------------------------------------------------- Totals */}
            <section className="pt-10" aria-label="Totals">
              <h2 className={sectionTitleCls}>Totals — all posts</h2>
              <div className={`${cardCls} mt-4`}>
                {analytics.totals.status === "insufficient" ? (
                  <p className="text-[13px] text-sand-700">
                    Not enough data yet — your posts have no metric figures entered, so there is
                    nothing honest to total. Add figures to a post in Growth Studio and its
                    totals will appear here.
                  </p>
                ) : (
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {METRIC_KEYS.map((key) => {
                      const m = analytics.totals.metrics[key];
                      return (
                        <li key={key} className="rounded-lg border border-sand-200 bg-sand-50 px-3 py-3">
                          <p className="font-sora text-[12px] font-semibold text-sand-600">{METRIC_LABELS[key]}</p>
                          <p className="font-sora text-[20px] font-bold tabular-nums text-ink">
                            {m.total === null ? "—" : fmt(m.total)}
                          </p>
                          <p className="mt-1 text-[11px] leading-relaxed text-sand-600">{m.coverageText}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className={footnoteCls}>{analytics.sourceFootnote}. Totals sum only figures that were entered.</p>
              </div>
            </section>

            {/* -------------------------------------------------- Engagement rate */}
            <section className="pt-10" aria-label="Engagement rate">
              <h2 className={sectionTitleCls}>Engagement rate</h2>
              <div className={`${cardCls} mt-4`}>
                {analytics.engagementRate.status === "insufficient" ? (
                  <p className="text-[13px] text-sand-700">
                    Not enough data yet — a rate needs at least one post with views and all four
                    engagement figures (likes, comments, shares and saves) entered.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                    <p className="font-sora text-[36px] font-bold leading-none tabular-nums text-ink">
                      {analytics.engagementRate.ratePct?.toFixed(1)}%
                    </p>
                    <ul className="text-[13px] leading-relaxed text-sand-800">
                      <li>
                        <span className="font-semibold text-ink">Total engagement:</span>{" "}
                        {fmt(analytics.engagementRate.totalEngagement)} (likes + comments + shares + saves)
                      </li>
                      <li>
                        <span className="font-semibold text-ink">Denominator — total views:</span>{" "}
                        {fmt(analytics.engagementRate.totalViews)} across the{" "}
                        {analytics.engagementRate.eligiblePosts} posts that reported views and all
                        four engagement figures
                      </li>
                      <li>
                        <span className="font-semibold text-ink">Excluded:</span>{" "}
                        {analytics.engagementRate.excludedPosts} posts missing views or an
                        engagement figure
                      </li>
                    </ul>
                  </div>
                )}
                <p className={footnoteCls}>
                  {analytics.engagementRate.basis}. {analytics.sourceFootnote}.
                </p>
              </div>
            </section>

            {/* -------------------------------------------------- Best content */}
            <section className="pt-10" aria-label="Best-performing content">
              <h2 className={sectionTitleCls}>Best-performing content</h2>
              <div className={`${cardCls} mt-4`}>
                {analytics.bestContent.status === "insufficient" ? (
                  <p className="text-[13px] text-sand-700">
                    Not enough data yet — no post has all four engagement figures entered, so
                    there is no honest ranking yet. Posts missing a figure are excluded rather
                    than ranked on a partial total.
                  </p>
                ) : (
                  <ol className="divide-y divide-sand-200">
                    {analytics.bestContent.entries.map((entry, i) => (
                      <li key={entry.post.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
                        <span className="font-sora text-[14px] font-bold tabular-nums text-sand-600">{i + 1}.</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-sora text-[14px] font-bold text-ink" title={entry.post.title}>
                            {entry.post.title || "(untitled post)"}
                          </p>
                          <p className="mt-0.5 text-[12px] text-sand-600">
                            <span className="font-semibold uppercase tracking-wide">{entry.post.platform}</span>
                            {" · "}{formatPostedAt(entry.post.postedAt)}
                            {" · "}{entry.post.views === null ? "views not entered" : `${fmt(entry.post.views)} views`}
                            {entry.post.postUrl ? (
                              <>{" · "}<a href={entry.post.postUrl} target="_blank" rel="noreferrer" className="font-semibold text-sand-800 underline decoration-sand-300 underline-offset-2 hover:text-ink">Open post</a></>
                            ) : null}
                          </p>
                        </div>
                        <p className="font-sora text-[13px] font-bold tabular-nums text-ink">
                          {fmt(entry.engagement)} engagement
                        </p>
                        <span className="rounded-full border border-sand-300 bg-sand-100 px-2.5 py-1 font-sora text-[11px] font-semibold text-sand-800">
                          {entry.post.source === "csv" ? "CSV" : "Manual"}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
                <p className={footnoteCls}>
                  {analytics.bestContent.basis}. {analytics.sourceFootnote}.
                </p>
              </div>
            </section>

            {/* -------------------------------------------------- Weekly trend */}
            <section className="pt-10 pb-4" aria-label="Weekly trend">
              <h2 className={sectionTitleCls}>Growth trend — by week</h2>
              <div className={`${cardCls} mt-4`}>
                {analytics.weeklyTrend.status === "insufficient" ? (
                  <p className="text-[13px] text-sand-700">
                    Not enough data yet — a trend needs posts in at least two different weeks.
                    Your posts so far span {analytics.weeklyTrend.activeWeeks}{" "}
                    {analytics.weeklyTrend.activeWeeks === 1 ? "week" : "weeks"}.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {analytics.weeklyTrend.buckets.map((bucket) => (
                      <li
                        key={bucket.weekStart}
                        className={
                          bucket.isGap
                            ? "rounded-lg border border-dashed border-sand-300 px-3 py-2.5"
                            : "rounded-lg border border-sand-200 bg-sand-50 px-3 py-2.5"
                        }
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="font-sora text-[12px] font-semibold text-ink">
                            Week of {bucket.weekStart}
                          </p>
                          {bucket.isGap ? (
                            <p className="text-[12px] text-sand-600">Gap — no posts this week, so no figures. A gap is not a zero.</p>
                          ) : (
                            <p className="text-[12px] tabular-nums text-sand-700">
                              {bucket.postCount} {bucket.postCount === 1 ? "post" : "posts"}
                              {" · "}
                              {bucket.viewsTotal === null
                                ? "views not entered"
                                : `${fmt(bucket.viewsTotal)} views (reported on ${bucket.viewsReportedCount} of ${bucket.postCount})`}
                              {" · "}
                              {bucket.engagementTotal === null
                                ? "engagement not fully entered"
                                : `${fmt(bucket.engagementTotal)} engagement (complete on ${bucket.engagementEligibleCount} of ${bucket.postCount})`}
                            </p>
                          )}
                        </div>
                        {!bucket.isGap && bucket.viewsTotal !== null && maxWeekViews > 0 ? (
                          <div className="mt-2 h-2 rounded-full bg-sand-200" aria-hidden="true">
                            <div
                              className="h-2 rounded-full bg-ink"
                              style={{ width: `${Math.max(2, (bucket.viewsTotal / maxWeekViews) * 100)}%` }}
                            />
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                <p className={footnoteCls}>
                  {analytics.weeklyTrend.basis}. Bar length is each week&apos;s views total
                  relative to the biggest week shown. {analytics.sourceFootnote}.
                </p>
              </div>
            </section>
          </>
        )}
      </div>
    </StudioShell>
  );
}
