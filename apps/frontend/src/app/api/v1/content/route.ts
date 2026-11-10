import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import {
  CONTENT_ITEM_COLUMNS,
  CONTENT_KINDS,
  isMissingTableError,
  throwIfMissingTable,
  toApiContentItem,
  type ContentItemRow,
} from "@/lib/api/content";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";

/**
 * The caller's content library (Phase 3): saved Creator Studio output of
 * every kind, replacing the localStorage-only drafts. RLS scopes every query
 * to the caller; the explicit owner filters below are belt-and-braces and
 * keep the intent obvious at the query site.
 *
 * Until the owner applies supabase/APPLY-CONTENT-LIBRARY.sql the table does
 * not exist: GET answers ready:false with an empty list, POST fails with a
 * plain pending-setup message (lib/api/content.ts) — never a raw 500.
 */

export const GET = route(async (req: Request) => {
  const user = await requireUser(req);
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const folder = url.searchParams.get("folder");
  if (kind !== null && !(CONTENT_KINDS as readonly string[]).includes(kind)) {
    throw new ApiFailure("VALIDATION", `Unknown content kind: ${kind}`);
  }

  let query = user.db
    .from("content_items")
    .select(CONTENT_ITEM_COLUMNS)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (kind !== null) query = query.eq("kind", kind);
  if (folder !== null) query = query.eq("folder", folder);

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return ok({ ready: false, items: [] });
    throw new ApiFailure("INTERNAL", "Could not load your content library", error.message);
  }
  return ok({ ready: true, items: ((data ?? []) as ContentItemRow[]).map(toApiContentItem) });
});

const CreateBody = z.object({
  kind: z.enum(CONTENT_KINDS),
  title: z.string().trim().max(200).default(""),
  body: z.record(z.unknown()).default({}),
  source: z.string().trim().min(1).max(20).default("template"),
  folder: z.string().trim().max(80).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
});

export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  const body = await parseBody(req, CreateBody);
  const { data, error } = await user.db
    .from("content_items")
    .insert({
      owner_id: user.id,
      kind: body.kind,
      title: body.title,
      body: body.body,
      source: body.source,
      folder: body.folder ?? null,
      project_id: body.projectId ?? null,
    })
    .select(CONTENT_ITEM_COLUMNS)
    .single();
  throwIfMissingTable(error);
  if (error || !data) throw new ApiFailure("INTERNAL", "Could not save the content item", error?.message);
  return ok(toApiContentItem(data as ContentItemRow), 201);
});
