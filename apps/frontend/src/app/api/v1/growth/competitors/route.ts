import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import {
  COMPETITOR_PROFILE_COLUMNS,
  isMissingTableError,
  throwIfMissingTable,
  toApiCompetitorProfile,
  type CompetitorProfileRow,
} from "@/lib/api/growth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";

/**
 * The caller's competitor profiles (Phase 6, Growth Studio): accounts the
 * creator wants to keep notes on. These are the owner's own notes only —
 * nothing is fetched, scraped or synced from any platform. RLS scopes every
 * query to the caller; the explicit owner filters are belt-and-braces.
 *
 * Until the owner applies supabase/APPLY-GROWTH-STUDIO.sql the table does
 * not exist: GET answers ready:false with an empty list, POST fails with a
 * plain pending-setup message — never a raw 500.
 */

export const GET = route(async (req: Request) => {
  const user = await requireUser(req);
  const { data, error } = await user.db
    .from("competitor_profiles")
    .select(COMPETITOR_PROFILE_COLUMNS)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTableError(error)) return ok({ ready: false, competitors: [] });
    throw new ApiFailure("INTERNAL", "Could not load your competitor profiles", error.message);
  }
  return ok({
    ready: true,
    competitors: ((data ?? []) as CompetitorProfileRow[]).map(toApiCompetitorProfile),
  });
});

const CreateBody = z.object({
  name: z.string().trim().min(1).max(80),
  platform: z.string().trim().max(40).default(""),
  handle: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

const emptyToNull = (value: string | null | undefined): string | null =>
  value === undefined || value === null || value === "" ? null : value;

export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  const body = await parseBody(req, CreateBody);
  const { data, error } = await user.db
    .from("competitor_profiles")
    .insert({
      owner_id: user.id,
      name: body.name,
      platform: body.platform,
      handle: emptyToNull(body.handle),
      notes: emptyToNull(body.notes),
    })
    .select(COMPETITOR_PROFILE_COLUMNS)
    .single();
  throwIfMissingTable(error);
  if (error || !data) throw new ApiFailure("INTERNAL", "Could not save the competitor profile", error?.message);
  return ok(toApiCompetitorProfile(data as CompetitorProfileRow), 201);
});
