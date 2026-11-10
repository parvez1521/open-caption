import "server-only";
import { ApiFailure } from "./http";

/**
 * Server side of the Phase 3 content library + chat storage
 * (migration 20261110020000_content_library.sql; paste-ready copy:
 * supabase/APPLY-CONTENT-LIBRARY.sql). The client types and fetch helpers
 * live in features/create/library.ts — the kind list below mirrors the
 * ContentKind union there; change both together.
 *
 * Kinds: idea, hook, caption, script, repurpose, shot-list, calendar,
 * carousel, hashtag-group, chat-output, plus analysis and weekly-plan
 * (Phase 6 — Reel Analyzer breakdowns and weekly plans), plus planner-card
 * (Phase 7 — Content Planner cards). The DB column is
 * free text, so new kinds need no migration; this list is the validation.
 *
 * Honest degradation: there is no Supabase CLI/token in the build pipeline,
 * so the schema lands when the owner pastes the APPLY file into the SQL
 * Editor. Until then the tables simply do not exist and every query fails
 * with a PostgREST "table missing" error. List routes catch that and answer
 * ready:false with an empty list; write routes turn it into a plain
 * "not set up yet" message. A raw PostgREST error never reaches the user.
 */

export const CONTENT_KINDS = [
  "idea",
  "hook",
  "caption",
  "script",
  "repurpose",
  "shot-list",
  "calendar",
  "carousel",
  "hashtag-group",
  "chat-output",
  "analysis",
  "weekly-plan",
  "planner-card",
] as const;

export const CONTENT_ITEM_COLUMNS =
  "id, kind, title, body, source, folder, project_id, created_at, updated_at";
export const CHAT_THREAD_COLUMNS = "id, title, context_item_id, created_at, updated_at";
export const CHAT_MESSAGE_COLUMNS = "id, thread_id, role, content, source, created_at";

export const LIBRARY_NOT_READY_MESSAGE =
  "The content library is not set up on the server yet — a database update is pending.";

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
      (message.includes("content_items") ||
        message.includes("chat_threads") ||
        message.includes("chat_messages") ||
        message.includes("relation")))
  );
}

/** For write routes: missing table → the honest pending-setup failure; anything else passes through. */
export function throwIfMissingTable(error: DbErrorLike | null | undefined): void {
  if (isMissingTableError(error)) throw new ApiFailure("INTERNAL", LIBRARY_NOT_READY_MESSAGE);
}

// ---------------------------------------------------------------------------
// Row → API mapping. Rows arrive snake_cased from PostgREST; the API (and
// the client helpers) speak the camelCase shapes in features/create/library.ts.
// ---------------------------------------------------------------------------

export interface ContentItemRow {
  id: string;
  kind: string;
  title: string;
  body: unknown;
  source: string;
  folder: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatThreadRow {
  id: string;
  title: string;
  context_item_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRow {
  id: string;
  thread_id: string;
  role: string;
  content: unknown;
  source: string | null;
  created_at: string;
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const toApiContentItem = (row: ContentItemRow) => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  body: asRecord(row.body),
  source: row.source,
  folder: row.folder ?? null,
  projectId: row.project_id ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const toApiChatThread = (row: ChatThreadRow) => ({
  id: row.id,
  title: row.title,
  contextItemId: row.context_item_id ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const toApiChatMessage = (row: ChatMessageRow) => ({
  id: row.id,
  threadId: row.thread_id,
  role: row.role,
  content: asRecord(row.content),
  source: row.source ?? null,
  createdAt: row.created_at,
});
