import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import {
  COMPETITOR_PROFILE_COLUMNS,
  throwIfMissingTable,
  toApiCompetitorProfile,
  type CompetitorProfileRow,
} from "@/lib/api/growth";
import { ApiFailure, notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";

/**
 * One competitor profile. Ownership is enforced by RLS plus the explicit
 * owner filter: another user's profile is indistinguishable from a missing
 * one, so both surface as the same 404.
 */

/** Allow-list: unknown keys are stripped, so owner_id can never be rewritten by a client. */
const PatchBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    platform: z.string().trim().max(40),
    handle: z.string().trim().max(80).nullable(),
    notes: z.string().trim().max(500).nullable(),
  })
  .partial();

const emptyToNull = (value: string | null): string | null => (value === "" ? null : value);

export const PATCH = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id } = await params;
  const patch = await parseBody(req, PatchBody);
  if (Object.keys(patch).length === 0) throw new ApiFailure("VALIDATION", "No editable fields provided");

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.platform !== undefined) row.platform = patch.platform;
  if (patch.handle !== undefined) row.handle = patch.handle === null ? null : emptyToNull(patch.handle);
  if (patch.notes !== undefined) row.notes = patch.notes === null ? null : emptyToNull(patch.notes);

  const { data, error } = await user.db
    .from("competitor_profiles")
    .update(row)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select(COMPETITOR_PROFILE_COLUMNS)
    .maybeSingle();
  throwIfMissingTable(error);
  if (error) throw new ApiFailure("INTERNAL", "Could not save the competitor profile", error.message);
  if (!data) throw notFound("Competitor profile");
  return ok(toApiCompetitorProfile(data as CompetitorProfileRow));
});

export const DELETE = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id } = await params;
  const { data, error } = await user.db
    .from("competitor_profiles")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();
  throwIfMissingTable(error);
  if (error) throw new ApiFailure("INTERNAL", "Could not delete the competitor profile", error.message);
  if (!data) throw notFound("Competitor profile");
  return ok({ deleted: true });
});
