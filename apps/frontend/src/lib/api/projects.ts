import "server-only";

export const PROJECT_COLUMNS = "id, title, description, status, style, look_id, template_id, thumbnail_url, language, aspect_ratio, platform, created_at, updated_at, archived_at, composition_json";

/** Collapse legacy + v2 status strings into the five states the UI knows. */
export function normalizeStatus(s: string | null | undefined): "CREATED" | "UPLOADED" | "PROCESSING" | "COMPLETED" | "FAILED" {
  switch ((s ?? "").toUpperCase()) {
    case "UPLOADED":
    case "UPLOADING":
      return "UPLOADED";
    case "PROCESSING":
    case "RENDERING":
      return "PROCESSING";
    case "READY":
    case "COMPLETED":
      return "COMPLETED";
    case "FAILED":
      return "FAILED";
    default:
      return "CREATED";
  }
}

/** The row is spread, so every selected column — including `composition_json` (Stage C) — passes through untouched; only the status is normalised. */
export const toApiProject = <T extends { status?: string | null }>(p: T) => ({ ...p, status: normalizeStatus(p.status) });

// ---------------------------------------------------------------------------
// A15 project organisation: folder + tags (Phase 8 slice 8.3;
// migration 20261110060000_project_folders_tags.sql; paste-ready copy:
// supabase/APPLY-PROJECT-FOLDERS-TAGS.sql).
//
// Storage shape: two columns ON public.projects — `folder text` (a single
// optional label, the exact precedent set by content_items.folder in
// 20261110020000) and `tags text[] not null default '{}'` (the codebase's
// tag shape everywhere else is a plain string array — hashtag-group bodies
// in features/create/captionStudio.ts — and a text[] column is that shape
// in Postgres). No join table: tags have no identity of their own, are
// always read/written with their project, and a join table would need its
// own RLS policy + grants for zero extra capability. The columns ride the
// EXISTING projects owner_all RLS policy, so ownership needs no new rule.
//
// Honest degradation (the Phase-6 growth pattern): until the owner pastes
// the APPLY file the columns do not exist and any query naming them fails
// with a PostgREST "column missing" error. PROJECT_COLUMNS therefore does
// NOT include folder/tags — every other consumer (studio, duplicate,
// archive…) keeps working exactly as before. Only the projects list /
// detail / create / patch routes opt into PROJECT_COLUMNS_WITH_ORG and
// fall back to the base columns on a missing-column error: listing keeps
// working and reports org_ready:false; writes that NAME folder/tags fail
// with the plain pending message instead of a raw 500.
// ---------------------------------------------------------------------------

export const PROJECT_COLUMNS_WITH_ORG = `${PROJECT_COLUMNS}, folder, tags`;

export const PROJECT_ORG_PENDING_MESSAGE =
  "Project folders and tags are not set up on the server yet — a database update is pending.";

export const MAX_PROJECT_TAGS = 12;
export const MAX_PROJECT_TAG_LENGTH = 40;
export const MAX_PROJECT_FOLDER_LENGTH = 80;

/** The loose shape of a PostgREST / Postgres error at this boundary. */
export interface DbErrorLike {
  code?: string | null;
  message?: string | null;
}

/**
 * Is this error "the folder/tags columns do not exist yet"? PostgREST
 * reports a missing column as code PGRST204 ("Could not find the 'folder'
 * column…") in some paths and surfaces the Postgres 42703
 * "column projects.folder does not exist" in others. Either wording, when
 * it names folder or tags, means the APPLY file has not been run.
 */
export function isMissingOrgColumnError(error: DbErrorLike | null | undefined): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  const namesOrgColumn = message.includes("folder") || message.includes("tags");
  if (!namesOrgColumn) return false;
  if (error.code === "PGRST204" || error.code === "42703") return true;
  return message.includes("does not exist") || message.includes("Could not find");
}

/** Canonical tag list: trimmed, empties dropped, case-insensitively deduped, capped. Order preserved. */
export function normalizeProjectTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim().slice(0, MAX_PROJECT_TAG_LENGTH);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_PROJECT_TAGS) break;
  }
  return out;
}

/** Canonical folder label: trimmed string, or null for "no folder". */
export function normalizeProjectFolder(folder: unknown): string | null {
  if (typeof folder !== "string") return null;
  const trimmed = folder.trim().slice(0, MAX_PROJECT_FOLDER_LENGTH);
  return trimmed ? trimmed : null;
}

/** Ensure a project row always carries folder/tags keys (null / [] when the org columns were not selected). */
export function withOrgDefaults<T extends object>(p: T): T & { folder: string | null; tags: string[] } {
  const row = p as { folder?: unknown; tags?: unknown };
  return { ...p, folder: normalizeProjectFolder(row.folder), tags: normalizeProjectTags(row.tags) };
}
