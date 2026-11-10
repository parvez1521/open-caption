import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import {
  LEGACY_PROFILE_COLUMNS,
  PROFILE_COLUMNS,
  isMissingVoiceColumn,
  toBrandProfile,
  voiceNotReady,
  type BrandKitRow,
} from "@/lib/api/brandProfiles";
import { normalizeVoice } from "@/features/create/brandProfile";

/**
 * Brand Voice profiles: the caller's brand_kits rows, oldest first.
 *
 * GET lists them with the active profile's id and a `voiceReady` flag. Until the
 * migration adding `voice` / `is_active` is applied, the full select cannot work;
 * GET then falls back to the legacy columns and synthesises profiles (empty voice,
 * the oldest kit counts as active) with `voiceReady: false`, so the page can say
 * honestly that voices are pending instead of breaking. Writes get no fallback:
 * POST attempts the insert and translates the missing-column failure into a plain
 * "database update is pending" message (see the activate / [id] routes, same rule).
 */

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const VoiceBody = z.object({
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

const CreateBody = z.object({
  name: z.string().trim().min(1).max(80),
  colors: z.array(Hex).max(12).default([]),
  fontId: z.string().max(60).nullable().default(null),
  voice: VoiceBody.default({}),
  makeActive: z.boolean().optional().default(false),
});

export const GET = route(async (req: Request) => {
  const user = await requireUser(req);
  const full = await user.db
    .from("brand_kits")
    .select(PROFILE_COLUMNS)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });
  if (!full.error) {
    const profiles = ((full.data ?? []) as BrandKitRow[]).map((row) => toBrandProfile(row));
    return ok({ profiles, activeId: profiles.find((p) => p.isActive)?.id ?? null, voiceReady: true });
  }
  if (!isMissingVoiceColumn(full.error)) {
    throw new ApiFailure("INTERNAL", "Could not load your brand profiles", full.error.message);
  }
  // Degraded: the voice columns are not in the database yet. The kits themselves
  // still exist, so list them in the legacy shape rather than failing the page.
  const legacy = await user.db
    .from("brand_kits")
    .select(LEGACY_PROFILE_COLUMNS)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });
  if (legacy.error) throw new ApiFailure("INTERNAL", "Could not load your brand profiles", legacy.error.message);
  const profiles = ((legacy.data ?? []) as BrandKitRow[]).map((row, i) => toBrandProfile(row, i === 0));
  return ok({ profiles, activeId: profiles[0]?.id ?? null, voiceReady: false });
});

export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  const body = await parseBody(req, CreateBody);
  // Counted with an id-only select, which works whether or not the voice
  // migration has landed — the insert below is the write that can hit it.
  const existing = await user.db.from("brand_kits").select("id").eq("owner_id", user.id);
  if (existing.error) throw new ApiFailure("INTERNAL", "Could not save your brand profile", existing.error.message);
  const isFirst = (existing.data ?? []).length === 0;
  const makeActive = isFirst || body.makeActive;
  const colors = [...new Set(body.colors.map((c) => c.toUpperCase()))];
  const { data, error } = await user.db
    .from("brand_kits")
    .insert({
      owner_id: user.id,
      name: body.name,
      colors,
      font_ids: body.fontId ? [body.fontId] : [],
      voice: normalizeVoice(body.voice),
      is_active: makeActive,
    })
    .select(PROFILE_COLUMNS)
    .single();
  if (error || !data) {
    if (error && isMissingVoiceColumn(error)) throw voiceNotReady();
    throw new ApiFailure("INTERNAL", "Could not save your brand profile", error?.message);
  }
  if (makeActive && !isFirst) {
    const { error: offError } = await user.db
      .from("brand_kits")
      .update({ is_active: false })
      .eq("owner_id", user.id)
      .neq("id", (data as BrandKitRow).id);
    if (offError) {
      if (isMissingVoiceColumn(offError)) throw voiceNotReady();
      throw new ApiFailure("INTERNAL", "Could not save your brand profile", offError.message);
    }
  }
  return ok(toBrandProfile(data as BrandKitRow), 201);
});
