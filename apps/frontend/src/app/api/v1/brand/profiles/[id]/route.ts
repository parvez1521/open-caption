import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";
import { PROFILE_COLUMNS, isMissingVoiceColumn, toBrandProfile, voiceNotReady, type BrandKitRow } from "@/lib/api/brandProfiles";
import { normalizeVoice } from "@/features/create/brandProfile";

/**
 * One Brand Voice profile: update its fields, or delete it.
 *
 * PUT is a partial update — only the fields sent change. A sent `voice` is merged
 * over the stored voice, so a client can patch one voice field without resending
 * (and silently wiping) the rest. Activation is not done here; that is the
 * /activate route's one job.
 *
 * DELETE removes the row. If it was the active profile, the oldest remaining
 * profile is promoted, so a user with any profiles left always has exactly one
 * active; deleting the last profile is allowed and leaves none.
 *
 * Both writes follow the profiles-wide degradation rule: until the voice
 * migration is applied, the first query that names `voice` / `is_active` fails,
 * and that failure becomes the plain "database update is pending" refusal
 * instead of a raw database error.
 */

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const VoicePatch = z.object({
  niche: z.string().max(500).optional(),
  audience: z.string().max(500).optional(),
  language: z.string().max(500).optional(),
  tone: z.string().max(500).optional(),
  writingStyle: z.string().max(500).optional(),
  wordsToUse: z.array(z.string().max(120)).max(30).optional(),
  wordsToAvoid: z.array(z.string().max(120)).max(30).optional(),
  sampleCaptions: z.array(z.string().max(120)).max(30).optional(),
  preferredCtas: z.array(z.string().max(120)).max(30).optional(),
});

const UpdateBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  colors: z.array(Hex).max(12).optional(),
  fontId: z.string().max(60).nullable().optional(),
  voice: VoicePatch.optional(),
});

export const PUT = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id } = await params;
  const body = await parseBody(req, UpdateBody);
  if (Object.keys(body).length === 0) throw new ApiFailure("VALIDATION", "No editable fields provided");
  const { data: existing, error: readError } = await user.db
    .from("brand_kits")
    .select(PROFILE_COLUMNS)
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (readError) {
    if (isMissingVoiceColumn(readError)) throw voiceNotReady();
    throw new ApiFailure("INTERNAL", "Could not save your brand profile", readError.message);
  }
  if (!existing) throw notFound("Brand profile");
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.colors !== undefined) patch.colors = [...new Set(body.colors.map((c) => c.toUpperCase()))];
  if (body.fontId !== undefined) patch.font_ids = body.fontId ? [body.fontId] : [];
  if (body.voice !== undefined) {
    // Merge over the stored voice: keys the client did not send keep their values.
    patch.voice = normalizeVoice({ ...normalizeVoice((existing as BrandKitRow).voice), ...body.voice });
  }
  const { data, error } = await user.db
    .from("brand_kits")
    .update(patch)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select(PROFILE_COLUMNS)
    .maybeSingle();
  if (error) {
    if (isMissingVoiceColumn(error)) throw voiceNotReady();
    throw new ApiFailure("INTERNAL", "Could not save your brand profile", error.message);
  }
  if (!data) throw notFound("Brand profile");
  return ok(toBrandProfile(data as BrandKitRow));
});

export const DELETE = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
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
    throw new ApiFailure("INTERNAL", "Could not delete your brand profile", readError.message);
  }
  if (!target) throw notFound("Brand profile");
  const wasActive = (target as BrandKitRow).is_active === true;
  const { error: deleteError } = await user.db.from("brand_kits").delete().eq("id", id).eq("owner_id", user.id);
  if (deleteError) {
    if (isMissingVoiceColumn(deleteError)) throw voiceNotReady();
    throw new ApiFailure("INTERNAL", "Could not delete your brand profile", deleteError.message);
  }
  if (wasActive) {
    // Promote the oldest remaining profile so the owner keeps exactly one active.
    const { data: remaining, error: remainingError } = await user.db
      .from("brand_kits")
      .select("id")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1);
    if (remainingError) throw new ApiFailure("INTERNAL", "Could not delete your brand profile", remainingError.message);
    const next = ((remaining ?? []) as BrandKitRow[])[0];
    if (next) {
      const { error: promoteError } = await user.db
        .from("brand_kits")
        .update({ is_active: true })
        .eq("id", next.id)
        .eq("owner_id", user.id);
      if (promoteError) {
        if (isMissingVoiceColumn(promoteError)) throw voiceNotReady();
        throw new ApiFailure("INTERNAL", "Could not delete your brand profile", promoteError.message);
      }
    }
  }
  return ok({ deleted: true as const });
});
