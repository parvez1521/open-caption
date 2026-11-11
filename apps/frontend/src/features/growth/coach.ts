import {
  engagementOf,
  sourceLabelOf,
  type CompetitorProfile,
  type GrowthPost,
} from "./model";
import {
  sourceMixOf,
  type BestHoursSection,
  type OverviewSection,
  type TopBottomSection,
  type TrendSection,
} from "./report";

/**
 * Growth Coach (P2, 2026-11-11): the grounding layer for the AI chat panel.
 *
 * Everything in this module is PURE and deterministic. The route assembles
 * the signed-in user's OWN stored growth dataset (their posts — manual, CSV
 * or synced from a connected account — plus the weekly-report sections
 * computed from those same rows) and this module renders it into a compact
 * text dataset. The chat route sends that dataset, and only that dataset,
 * as the model's context: the system prompt forbids inventing figures and
 * requires the answer to name what to add/connect when the data is missing.
 * No number can appear in an answer that is not first computed here from
 * the user's rows.
 *
 * Chat history is SESSION-LOCAL by decision (documented in the mission
 * log): the panel keeps the thread in component state and sends the last
 * few turns with each question; nothing is persisted server-side. The
 * content-library chat threads are a different, structured surface
 * (saved generations), and growth Q&A is an ephemeral lens on data that
 * itself is already stored — re-asking after a reload loses nothing.
 */

export interface CoachSections {
  overview: OverviewSection;
  bestHours: BestHoursSection;
  topBottom: TopBottomSection;
  trend: TrendSection;
}

const fmt = (value: number): string => value.toLocaleString("en-US");
const fmtMetric = (value: number | null): string => (value === null ? "not entered" : fmt(value));
const fmtDate = (iso: string): string => iso.slice(0, 10);

function postLine(post: GrowthPost): string {
  const title = post.title.trim() ? `"${post.title.trim()}"` : "(untitled post)";
  return (
    `- ${fmtDate(post.postedAt)} · ${post.platform} · ${title} — views ${fmtMetric(post.views)} · reach ${fmtMetric(post.reach)}` +
    ` · likes ${fmtMetric(post.likes)} · comments ${fmtMetric(post.comments)} · shares ${fmtMetric(post.shares)} · saves ${fmtMetric(post.saves)}` +
    ` · engagement ${fmt(engagementOf(post))} (${sourceLabelOf(post.source)})`
  );
}

const byEngagementDesc = (a: GrowthPost, b: GrowthPost): number =>
  engagementOf(b) - engagementOf(a) || Date.parse(b.postedAt) - Date.parse(a.postedAt);

/** The dataset text the model may reason over. Only the user's rows, only computed figures. */
export function buildGrowthContext(
  posts: ReadonlyArray<GrowthPost>,
  sections: CoachSections,
  competitors: ReadonlyArray<CompetitorProfile>,
): string {
  const lines: string[] = [];
  if (posts.length === 0) {
    lines.push("The user has NO posts tracked in Growth Studio yet — no manual entries, no CSV imports, no connected-account syncs.");
    lines.push("Any performance question must be answered by saying there is no data yet and naming what to add: enter posts by hand, import a CSV, or connect their YouTube or Instagram account.");
  } else {
    const mix = sourceMixOf(posts);
    const dates = posts.map((p) => p.postedAt).sort();
    lines.push(
      `Posts tracked: ${posts.length} (${mix.manual} Manual, ${mix.csv} CSV, ${mix.youtube} YouTube, ${mix.instagram} Instagram), from ${fmtDate(dates[0]!)} to ${fmtDate(dates[dates.length - 1]!)}.`,
    );
    // All-history totals over figures actually entered (a metric nobody entered is missing, not zero).
    const totals: Array<[string, number | null]> = (["views", "reach", "likes", "comments", "shares", "saves"] as const).map((key) => {
      let total = 0;
      let reported = 0;
      for (const post of posts) {
        const value = post[key];
        if (value !== null) {
          total += value;
          reported += 1;
        }
      }
      return [key, reported > 0 ? total : null];
    });
    lines.push(`All-time totals (entered figures only): ${totals.map(([k, v]) => `${k} ${fmtMetric(v)}`).join(" · ")}.`);
    // Last 7 days vs the 7 days before, from the report's trend section.
    const trend = sections.trend;
    const trendBits: string[] = [`posts ${trend.postCount.current} vs ${trend.postCount.prior}`];
    for (const key of ["views", "reach", "likes", "comments", "shares", "saves"] as const) {
      const entry = trend.metrics[key];
      if (entry.currentReportedCount === 0 && entry.priorReportedCount === 0) continue;
      const delta = entry.deltaPct === null ? "no comparable prior figure" : `${entry.deltaPct > 0 ? "+" : ""}${entry.deltaPct}% vs prior`;
      trendBits.push(`${key} ${fmt(entry.currentTotal)} vs ${fmt(entry.priorTotal)} (${delta})`);
    }
    lines.push(`Last 7 days vs the 7 days before: ${trendBits.join(" · ")}.`);
    // Per-platform aggregates, all history.
    const platforms = new Map<string, { count: number; views: number; viewsReported: number; engagement: number }>();
    for (const post of posts) {
      const agg = platforms.get(post.platform) ?? { count: 0, views: 0, viewsReported: 0, engagement: 0 };
      agg.count += 1;
      if (post.views !== null) {
        agg.views += post.views;
        agg.viewsReported += 1;
      }
      agg.engagement += engagementOf(post);
      platforms.set(post.platform, agg);
    }
    for (const [platform, agg] of [...platforms.entries()].sort((a, b) => b[1].engagement - a[1].engagement)) {
      lines.push(
        `Platform ${platform}: ${agg.count} posts · views ${agg.viewsReported > 0 ? fmt(agg.views) : "not entered"} · average engagement ${fmt(Math.round(agg.engagement / agg.count))} per post.`,
      );
    }
    // Best posting hours (all history), or the honest gap.
    if (sections.bestHours.status === "ok") {
      const hours = sections.bestHours.hours
        .map((h) => `${String(h.hour).padStart(2, "0")}:00 (avg engagement ${fmt(h.avgEngagement)} across ${h.posts} posts)`)
        .join("; ");
      lines.push(`Best posting hours from the user's data: ${hours}.`);
    } else {
      lines.push("Best posting hours: not enough data yet (needs at least 3 posts with one hour repeated).");
    }
    // Ranked lists, all history.
    const sorted = [...posts].sort(byEngagementDesc);
    lines.push("Top posts by engagement (all history):");
    for (const post of sorted.slice(0, 5)) lines.push(postLine(post));
    if (sorted.length >= 7) {
      lines.push("Lowest posts by engagement (all history):");
      for (const post of sorted.slice(-3)) lines.push(postLine(post));
    }
    if (sections.topBottom.status === "ok" && sections.topBottom.top.length > 0) {
      lines.push(`This week's top post: ${postLine(sections.topBottom.top[0]!).replace(/^- /, "")}`);
    }
  }
  if (competitors.length > 0) {
    lines.push("Competitor profiles the user tracks (their own notes — no metrics were fetched):");
    for (const c of competitors.slice(0, 10)) {
      lines.push(`- ${c.name}${c.handle ? ` (${c.handle})` : ""} on ${c.platform}${c.notes ? ` — note: ${c.notes}` : ""}`);
    }
  }
  return lines.join("\n");
}

/**
 * The VERIFIED UI map: where things actually are in Growth Studio, with the
 * exact on-screen labels. Read off app/(dashboard)/growth/page.tsx and
 * features/growth/ConnectAccounts.tsx on 2026-11-11, after the coach sent
 * the owner to places that do not exist ("Settings → Platforms", a "Data
 * section", an "Import CSV" button — none of which the product has: there
 * is no Settings surface for growth data and the CSV button carries the
 * row count, not the words "Import CSV"). coach.test.ts pins every label
 * below against the real components, so a future rename breaks the test
 * instead of silently making the coach lie again.
 */
export const COACH_UI_MAP = [
  "Growth Studio is ONE page — everything below is on that page, in this order. Growth data has no separate settings or data page; never send the user to one.",
  '- "Connect your accounts" (top of the page): a YouTube card and an Instagram card. An account that is not connected shows a "Connect YouTube" or "Connect Instagram" button; a connected account shows "Sync now" and "Disconnect" buttons.',
  '- "Growth Coach": this chat, directly under "Connect your accounts".',
  '- "Your posts": the "Add a post" form (fields: Platform, Posted at, Title, Post URL, Views, Reach, Likes, Comments, Shares, Saves) with an "Add post" button. Each listed post has "Edit" and "Delete" buttons; while editing, the form\'s button reads "Save changes".',
  '- "Import from CSV": a "Download the template" button and a "Choose a CSV file" picker; after a file is chosen, an import button labelled with the row count (for example "Import 12 posts").',
  '- "Competitors": an "Add a competitor" form with an "Add competitor" button.',
  '- "Weekly report" and "Weekly plan": read-only report cards, plus a "Draft next week\'s plan" button in the plan section.',
].join("\n");

/** The no-invention contract, pinned by tests. */
export const COACH_SYSTEM_PROMPT = [
  "You are the Growth Coach inside Open Caption's Growth Studio, answering questions about the signed-in creator's OWN post performance.",
  "You are given a DATASET below, computed from the creator's stored posts. It is the only source you may use.",
  "Rules you must follow:",
  "- Use ONLY figures that appear in the dataset. Never invent, estimate, or extrapolate a number that is not there.",
  "- A figure described as 'not entered' was never recorded: treat it as missing, never as zero.",
  "- If the dataset does not contain what a question needs, say so plainly and name what the user can add (more posts, a CSV import) or connect (their YouTube or Instagram account) to answer it.",
  "- Do not quote generic social-media statistics, benchmarks, or other creators' numbers — only this user's data.",
  "- When you tell the user where to do something in the product, cite ONLY the sections and labels in the UI MAP included below the dataset, exactly as written there. If the map does not cover what they need, describe what they are trying to do WITHOUT naming a place — never invent a section, page, or button.",
  "- Be brief and concrete: lead with the answer, then cite the posts or figures it rests on.",
].join("\n");

export interface CoachPrompt {
  system: string;
  user: string;
}

export function buildCoachPrompt(
  question: string,
  context: string,
  history: ReadonlyArray<{ role: "user" | "assistant"; content: string }> = [],
): CoachPrompt {
  const turns = history
    .slice(-6)
    .map((turn) => `${turn.role === "user" ? "User" : "Coach"}: ${turn.content}`)
    .join("\n");
  const user = [
    "DATASET:",
    context,
    `\nUI MAP (the only places and labels you may cite):\n${COACH_UI_MAP}`,
    turns ? `\nEarlier in this conversation:\n${turns}` : "",
    `\nQuestion: ${question}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { system: COACH_SYSTEM_PROMPT, user };
}

/**
 * Starter questions computed from data presence — a starter is only offered
 * when the dataset can actually speak to it (the reach starter needs reach
 * reported in BOTH windows; the posting-time starter needs the best-hours
 * section to be ok).
 */
export function starterQuestions(posts: ReadonlyArray<GrowthPost>, sections: CoachSections): string[] {
  if (posts.length === 0) {
    return [
      "What should I start tracking?",
      "How do I bring in my past posts?",
      "What does connecting YouTube or Instagram add?",
    ];
  }
  const out: string[] = [];
  const reach = sections.trend.metrics.reach;
  const views = sections.trend.metrics.views;
  if (reach.currentReportedCount > 0 && reach.priorReportedCount > 0 && reach.deltaPct !== null) {
    out.push(reach.deltaPct < 0 ? "Why did reach drop last week?" : "What drove reach up last week?");
  } else if (views.currentReportedCount > 0 && views.priorReportedCount > 0 && views.deltaPct !== null) {
    out.push(views.deltaPct < 0 ? "Why did views drop last week?" : "What drove views up last week?");
  }
  if (posts.length >= 3) out.push("Which post type performs best?");
  if (sections.bestHours.status === "ok") out.push("Best posting time from my data?");
  if (out.length < 3) out.push("What should I post next based on my data?");
  return out.slice(0, 4);
}
