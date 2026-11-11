import "server-only";
import { ApiFailure } from "./http";

/**
 * Server side of Growth Studio (Phase 6 slice 6.2; migration
 * 20261110050000_growth_studio.sql; paste-ready copy:
 * supabase/APPLY-GROWTH-STUDIO.sql). The shared types + validator live in
 * features/growth/model.ts, the CSV parser in features/growth/csv.ts and
 * the client fetch helpers in features/growth/api.ts.
 *
 * Honesty rules carried from the brief (§11): Growth Studio is manual /
 * CSV-first — `source` on a post is stamped here by the routes ('manual'
 * from the posts route, 'csv' from the import route, 'youtube'/'instagram'
 * from the connected-account sync in lib/api/connections), never taken from
 * the client; metric columns are nullable because a metric the creator did
 * not enter (or the platform did not report) is missing data, not zero.
 *
 * Honest degradation: there is no Supabase CLI/token in the build pipeline,
 * so the schema lands when the owner pastes the APPLY file into the SQL
 * Editor. Until then the tables simply do not exist and every query fails
 * with a PostgREST "table missing" error. List routes catch that and answer
 * ready:false with an empty list; write routes turn it into a plain
 * "not set up yet" message. A raw PostgREST error never reaches the user.
 */

export const GROWTH_POST_COLUMNS =
  "id, platform, title, post_url, posted_at, views, reach, likes, comments, shares, saves, source, created_at, updated_at";
export const COMPETITOR_PROFILE_COLUMNS = "id, name, platform, handle, notes, created_at, updated_at";

export const GROWTH_NOT_READY_MESSAGE =
  "Growth Studio is not set up on the server yet — a database update is pending.";

/** The loose shape of a PostgREST / Postgres error at this boundary. */
export interface DbErrorLike {
  code?: string | null;
  message?: string | null;
}

/**
 * Is this error "the table does not exist yet"? PostgREST reports a missing
 * relation as code PGRST205 with a "Could not find the table" message; a
 * direct Postgres 42P01 says the relation "does not exist". Either wording
 * means the same operational fact here: the APPLY file has not been run.
 */
export function isMissingTableError(error: DbErrorLike | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  const message = error.message ?? "";
  return (
    message.includes("Could not find the table") ||
    (message.includes("does not exist") &&
      (message.includes("growth_posts") ||
        message.includes("competitor_profiles") ||
        message.includes("relation")))
  );
}

/** For write routes: missing table → the honest pending-setup failure; anything else passes through. */
export function throwIfMissingTable(error: DbErrorLike | null | undefined): void {
  if (isMissingTableError(error)) throw new ApiFailure("INTERNAL", GROWTH_NOT_READY_MESSAGE);
}

// ---------------------------------------------------------------------------
// Row → API mapping. Rows arrive snake_cased from PostgREST; the API (and
// the client helpers) speak the camelCase shapes in features/growth/model.ts.
// ---------------------------------------------------------------------------

export interface GrowthPostRow {
  id: string;
  platform: string;
  title: string;
  post_url: string | null;
  posted_at: string;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface CompetitorProfileRow {
  id: string;
  name: string;
  platform: string;
  handle: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const toApiGrowthPost = (row: GrowthPostRow) => ({
  id: row.id,
  platform: row.platform,
  title: row.title,
  postUrl: row.post_url ?? null,
  postedAt: row.posted_at,
  views: row.views ?? null,
  reach: row.reach ?? null,
  likes: row.likes ?? null,
  comments: row.comments ?? null,
  shares: row.shares ?? null,
  saves: row.saves ?? null,
  // The routes only ever stamp 'manual' | 'csv' | 'youtube' | 'instagram'
  // (the last two by the connected-account sync); anything unexpected in the
  // DB reads back as 'manual' rather than leaking a free-text source through.
  source:
    row.source === "csv" || row.source === "youtube" || row.source === "instagram"
      ? (row.source as "csv" | "youtube" | "instagram")
      : ("manual" as const),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const toApiCompetitorProfile = (row: CompetitorProfileRow) => ({
  id: row.id,
  name: row.name,
  platform: row.platform,
  handle: row.handle ?? null,
  notes: row.notes ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
