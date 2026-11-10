import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, route, type Ctx } from "@/lib/api/http";
import { PROFILE_COLUMNS, isMissingVoiceColumn, voiceNotReady, type BrandKitRow } from "@/lib/api/brandProfiles";

/**
 * Make one Brand Voice profile THE active one.
 *
 * Two updates, deliberately simple: clear `is_active` on every other profile the
 * caller owns, then set it on the target. All rows are the caller's and RLS scopes
 * every write to them, so there is no cross-user state to protect; doing the
 * clear first means the account never briefly shows two active profiles.
 *
 * Same degradation rule as the other profile writes: the existence check names
 * the voice columns, so before the migration lands it fails missing-column and
 * the caller gets the plain "database update is pending" refusal, with nothing
 * half-updated.
 */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id } = await params;
  const { data: target, error: readError } = await user.db
    .from("brand_kits")
    .select(PROFILE_COLUMNS)
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (readError) {
    if (isMissingVoiceColumn(readError)) throw voiceNotReady();
    throw new ApiFailure("INTERNAL", "Could not activate your brand profile", readError.message);
  }
  if (!target) throw notFound("Brand profile");
  const { error: offError } = await user.db
    .from("brand_kits")
    .update({ is_active: false })
    .eq("owner_id", user.id)
    .neq("id", (target as BrandKitRow).id);
  if (offError) {
    if (isMissingVoiceColumn(offError)) throw voiceNotReady();
    throw new ApiFailure("INTERNAL", "Could not activate your brand profile", offError.message);
  }
  const { error: onError } = await user.db
    .from("brand_kits")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id);
  if (onError) {
    if (isMissingVoiceColumn(onError)) throw voiceNotReady();
    throw new ApiFailure("INTERNAL", "Could not activate your brand profile", onError.message);
  }
  return ok({ activeId: id });
});
