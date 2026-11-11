import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rateLimit";
import { cloudAiConfig, cloudAiStatus, runCloudChat } from "@/lib/api/cloudAi";
import {
  GROWTH_POST_COLUMNS,
  isMissingTableError,
  toApiGrowthPost,
  type GrowthPostRow,
} from "@/lib/api/growth";
import type { CompetitorProfile, GrowthPost } from "@/features/growth/model";
import {
  computeBestHours,
  computeOverview,
  computeTopBottom,
  computeTrend,
} from "@/features/growth/report";
import { buildCoachPrompt, buildGrowthContext, starterQuestions, type CoachSections } from "@/features/growth/coach";

/**
 * Growth Coach chat (P2, 2026-11-11): answers about the caller's OWN growth
 * data, nothing else.
 *
 * Grounding is enforced structurally, not by politeness: the dataset is
 * assembled HERE from the caller's stored rows (RLS-scoped client + explicit
 * owner filter, same as the posts routes) — the client sends only the
 * question and recent turns, never numbers. The prompt contract
 * (features/growth/coach.ts) forbids inventing figures and requires naming
 * what to add/connect when the data is missing.
 *
 * Free AI only: the same Groq path as /create (runCloudChat), the same
 * per-user limit shape (30/hour in its own bucket) and the SHARED site-wide
 * daily bucket, so the free quota is one pool across surfaces. When no key
 * is configured the route answers configured:false and the panel shows its
 * not-switched-on state — there are no canned answers behind this panel.
 *
 * History is session-local (panel state); see coach.ts for the decision.
 */

export const GET = route(async (req: Request) => {
  await requireUser(req);
  return ok(cloudAiStatus());
});

const Body = z.object({
  question: z.string().trim().min(1).max(500),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) }))
    .max(10)
    .optional(),
});

interface CompetitorRow {
  id: string;
  name: string;
  platform: string;
  handle: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const toCompetitor = (r: CompetitorRow): CompetitorProfile => ({
  id: r.id,
  name: r.name,
  platform: r.platform,
  handle: r.handle ?? null,
  notes: r.notes ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  const body = await parseBody(req, Body);
  if (!cloudAiConfig()) return ok({ configured: false as const });
  await rateLimit(user.id, "growth_ai", 30, 3600);
  await rateLimit("site", "create_ai_global", 600, 86_400);

  const postsRes = await user.db
    .from("growth_posts")
    .select(GROWTH_POST_COLUMNS)
    .eq("owner_id", user.id)
    .order("posted_at", { ascending: false })
    .limit(500);
  let posts: GrowthPost[] = [];
  if (postsRes.error) {
    if (!isMissingTableError(postsRes.error)) {
      throw new ApiFailure("INTERNAL", "Could not load your growth posts", postsRes.error.message);
    }
  } else {
    posts = ((postsRes.data ?? []) as GrowthPostRow[]).map(toApiGrowthPost);
  }

  const competitorsRes = await user.db
    .from("competitor_profiles")
    .select("id, name, platform, handle, notes, created_at, updated_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const competitors: CompetitorProfile[] =
    !competitorsRes.error && competitorsRes.data
      ? (competitorsRes.data as CompetitorRow[]).map(toCompetitor)
      : [];

  const now = Date.now();
  const sections: CoachSections = {
    overview: computeOverview(posts, now),
    bestHours: computeBestHours(posts),
    topBottom: computeTopBottom(posts, now),
    trend: computeTrend(posts, now),
  };
  const context = buildGrowthContext(posts, sections, competitors);
  const prompt = buildCoachPrompt(body.question, context, body.history ?? []);
  let answer: string;
  try {
    answer = await runCloudChat(prompt);
  } catch {
    throw new ApiFailure("UPSTREAM_FAILED", "The free AI service could not be reached. Please try again in a moment.");
  }
  return ok({ configured: true as const, answer, starters: starterQuestions(posts, sections) });
});
