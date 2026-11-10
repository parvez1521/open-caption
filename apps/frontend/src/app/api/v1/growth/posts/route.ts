import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import {
  GROWTH_POST_COLUMNS,
  isMissingTableError,
  throwIfMissingTable,
  toApiGrowthPost,
  type GrowthPostRow,
} from "@/lib/api/growth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { validatePostRow, type GrowthPostInput } from "@/features/growth/model";

/**
 * The caller's growth posts (Phase 6, Growth Studio): posts they published,
 * with the metrics THEY entered. RLS scopes every query to the caller; the
 * explicit owner filters below are belt-and-braces and keep the intent
 * obvious at the query site.
 *
 * Source labelling: this route is the manual-entry route, so `source` is
 * FORCED to 'manual' here — a body claiming 'csv' is ignored, never stored.
 * CSV rows arrive only through posts/import, which stamps 'csv' itself.
 *
 * Until the owner applies supabase/APPLY-GROWTH-STUDIO.sql the table does
 * not exist: GET answers ready:false with an empty list, POST fails with a
 * plain pending-setup message (lib/api/growth.ts) — never a raw 500.
 */

export const GET = route(async (req: Request) => {
  const user = await requireUser(req);
  const { data, error } = await user.db
    .from("growth_posts")
    .select(GROWTH_POST_COLUMNS)
    .eq("owner_id", user.id)
    .order("posted_at", { ascending: false })
    .limit(500);
  if (error) {
    if (isMissingTableError(error)) return ok({ ready: false, posts: [] });
    throw new ApiFailure("INTERNAL", "Could not load your growth posts", error.message);
  }
  return ok({ ready: true, posts: ((data ?? []) as GrowthPostRow[]).map(toApiGrowthPost) });
});

/** Zod checks only the envelope (a JSON object); the field RULES live in the shared validator. */
const Envelope = z.record(z.unknown());

export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  const body = await parseBody(req, Envelope);
  const validated = validatePostRow(body);
  if (!validated.ok) throw new ApiFailure("VALIDATION", validated.errors.join("; "), validated.errors);
  const input: GrowthPostInput = validated.value;

  const { data, error } = await user.db
    .from("growth_posts")
    .insert({
      owner_id: user.id,
      platform: input.platform,
      title: input.title,
      post_url: input.postUrl,
      posted_at: input.postedAt,
      views: input.views,
      reach: input.reach,
      likes: input.likes,
      comments: input.comments,
      shares: input.shares,
      saves: input.saves,
      source: "manual",
    })
    .select(GROWTH_POST_COLUMNS)
    .single();
  throwIfMissingTable(error);
  if (error || !data) throw new ApiFailure("INTERNAL", "Could not save the growth post", error?.message);
  return ok(toApiGrowthPost(data as GrowthPostRow), 201);
});
