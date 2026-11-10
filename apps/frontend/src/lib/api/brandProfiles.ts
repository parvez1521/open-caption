import "server-only";

import { ApiFailure } from "./http";
import { normalizeVoice, type BrandProfile } from "@/features/create/brandProfile";

/**
 * Shared row plumbing for the Brand Voice profile routes (/api/v1/brand/profiles).
 * A profile is one brand_kits row: colours + font_ids[0] as the kit, the `voice`
 * jsonb as the Brand Voice, and `is_active` marking the owner's one active
 * profile. The legacy single-kit route (/api/v1/brand) keeps its own queries and
 * is untouched by everything here.
 */

export const PROFILE_COLUMNS = "id, name, colors, font_ids, voice, is_active, created_at, updated_at";
/** What brand_kits had before the voice migration — the degraded GET reads only this. */
export const LEGACY_PROFILE_COLUMNS = "id, name, colors, font_ids, created_at, updated_at";

/** The exact refusal writes give until the voice columns exist on the server. */
export const VOICE_NOT_READY_MESSAGE =
  "Brand voice profiles are not set up on the server yet — a database update is pending. Your colours and font still save from the Brand Kit page.";

export const voiceNotReady = (): ApiFailure => new ApiFailure("INTERNAL", VOICE_NOT_READY_MESSAGE);

export interface BrandKitRow {
  id: string;
  name?: string | null;
  colors?: unknown;
  font_ids?: unknown;
  voice?: unknown;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** Row → API profile. `forceActive` synthesises the flag for legacy rows (see the degraded GET). */
export function toBrandProfile(row: BrandKitRow, forceActive?: boolean): BrandProfile {
  const fontIds = stringList(row.font_ids);
  return {
    id: row.id,
    name: typeof row.name === "string" && row.name.trim() ? row.name : "My brand",
    isActive: forceActive ?? row.is_active === true,
    colors: stringList(row.colors),
    fontId: fontIds[0] ?? null,
    voice: normalizeVoice(row.voice),
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : typeof row.created_at === "string" ? row.created_at : "",
  };
}

interface DbErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * True when a PostgREST/Supabase error is really "the voice columns are not in
 * the database yet": Postgres undefined-column (42703), PostgREST's schema-cache
 * miss (PGRST204 / "could not find … in the schema cache"), or a message naming
 * `voice` / `is_active` together with "does not exist". Anything else is a real
 * failure and must not be dressed up as a pending migration.
 */
export function isMissingVoiceColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as DbErrorLike;
  if (e.code === "42703" || e.code === "PGRST204") return true;
  const text = `${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`.toLowerCase();
  const namesColumn = text.includes("voice") || text.includes("is_active");
  if (!namesColumn) return false;
  return text.includes("does not exist") || text.includes("schema cache") || text.includes("could not find");
}
