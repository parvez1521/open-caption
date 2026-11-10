import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import {
  CONTENT_ITEM_COLUMNS,
  throwIfMissingTable,
  toApiContentItem,
  type ContentItemRow,
} from "@/lib/api/content";
import { ApiFailure, notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";

/**
 * One library item. Ownership is enforced by RLS plus the explicit owner
 * filter: another user's item is indistinguishable from a missing one, so
 * both surface as the same 404.
 */

/** Allow-list: unknown keys are stripped, so kind/owner_id can never be rewritten by a client. */
const PatchBody = z
  .object({
    title: z.string().trim().max(200),
    folder: z.string().trim().max(80).nullable(),
    body: z.record(z.unknown()),
    projectId: z.string().uuid().nullable(),
  })
  .partial();

export const PATCH = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id } = await params;
  const patch = await parseBody(req, PatchBody);
  if (Object.keys(patch).length === 0) throw new ApiFailure("VALIDATION", "No editable fields provided");

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.folder !== undefined) row.folder = patch.folder;
  if (patch.body !== undefined) row.body = patch.body;
  if (patch.projectId !== undefined) row.project_id = patch.projectId;

  const { data, error } = await user.db
    .from("content_items")
    .update(row)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select(CONTENT_ITEM_COLUMNS)
    .maybeSingle();
  throwIfMissingTable(error);
  if (error) throw new ApiFailure("INTERNAL", "Could not save the content item", error.message);
  if (!data) throw notFound("Content item");
  return ok(toApiContentItem(data as ContentItemRow));
});

export const DELETE = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id } = await params;
  const { data, error } = await user.db
    .from("content_items")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();
  throwIfMissingTable(error);
  if (error) throw new ApiFailure("INTERNAL", "Could not delete the content item", error.message);
  if (!data) throw notFound("Content item");
  return ok({ deleted: true });
});
