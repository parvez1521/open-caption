import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import {
  GROWTH_POST_COLUMNS,
  throwIfMissingTable,
  toApiGrowthPost,
  type GrowthPostRow,
} from "@/lib/api/growth";
import { ApiFailure, notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";
import { validatePostRow } from "@/features/growth/model";

/**
 * One growth post. Ownership is enforced by RLS plus the explicit owner
 * filter: another user's post is indistinguishable from a missing one, so
 * both surface as the same 404.
 *
 * `source` is NOT patchable: it records how the row arrived (stamped by the
 * create / import routes) and no edit may rewrite that history, so it is
 * simply absent from the patchable field list — a client sending it has it
 * stripped like any other unknown key.
 */

const PATCHABLE = ["platform", "title", "postUrl", "postedAt", "views", "reach", "likes", "comments", "shares", "saves"] as const;
type PatchableField = (typeof PATCHABLE)[number];

/** Zod checks only the envelope (a JSON object); the field RULES live in the shared validator. */
const Envelope = z.record(z.unknown());

export const PATCH = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id } = await params;
  const body = await parseBody(req, Envelope);

  const picked: Partial<Record<PatchableField, unknown>> = {};
  for (const field of PATCHABLE) {
    if (Object.prototype.hasOwnProperty.call(body, field)) picked[field] = body[field];
  }
  if (Object.keys(picked).length === 0) throw new ApiFailure("VALIDATION", "No editable fields provided");

  // Single rule source: validate the picked fields by running them through
  // validatePostRow on top of a known-valid base row — every error it can
  // produce then names a field the caller actually sent.
  const validated = validatePostRow({
    platform: "platform",
    postedAt: "1970-01-01T00:00:00.000Z",
    ...picked,
  });
  if (!validated.ok) throw new ApiFailure("VALIDATION", validated.errors.join("; "), validated.errors);
  const value = validated.value;

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("platform" in picked) row.platform = value.platform;
  if ("title" in picked) row.title = value.title;
  if ("postUrl" in picked) row.post_url = value.postUrl;
  if ("postedAt" in picked) row.posted_at = value.postedAt;
  if ("views" in picked) row.views = value.views;
  if ("reach" in picked) row.reach = value.reach;
  if ("likes" in picked) row.likes = value.likes;
  if ("comments" in picked) row.comments = value.comments;
  if ("shares" in picked) row.shares = value.shares;
  if ("saves" in picked) row.saves = value.saves;

  const { data, error } = await user.db
    .from("growth_posts")
    .update(row)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select(GROWTH_POST_COLUMNS)
    .maybeSingle();
  throwIfMissingTable(error);
  if (error) throw new ApiFailure("INTERNAL", "Could not save the growth post", error.message);
  if (!data) throw notFound("Growth post");
  return ok(toApiGrowthPost(data as GrowthPostRow));
});

export const DELETE = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id } = await params;
  const { data, error } = await user.db
    .from("growth_posts")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();
  throwIfMissingTable(error);
  if (error) throw new ApiFailure("INTERNAL", "Could not delete the growth post", error.message);
  if (!data) throw notFound("Growth post");
  return ok({ deleted: true });
});
