import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { throwIfMissingTable } from "@/lib/api/growth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { validatePostRow, type GrowthPostInput } from "@/features/growth/model";

/**
 * Bulk import for Growth Studio (Phase 6): the client parses the creator's
 * CSV with features/growth/csv.ts and posts the candidate rows here. Every
 * row is RE-validated server-side through the shared validator — the client
 * parse is never trusted — and only fully valid rows are inserted, each
 * stamped source 'csv' by this route (a row claiming any other source is
 * stored as 'csv', because that is how it arrived). A partially-valid row
 * is never inserted: it comes back in `rejected` with its input index and
 * the validator's errors, and the valid rows still import.
 *
 * If the table is missing the whole import fails with the plain
 * pending-setup message — an import is a write, so there is no ready:false
 * soft answer here.
 */

const ImportBody = z.object({
  rows: z.array(z.unknown()).max(500),
});

export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  const body = await parseBody(req, ImportBody);

  const valid: GrowthPostInput[] = [];
  const rejected: Array<{ index: number; errors: string[] }> = [];
  body.rows.forEach((raw, index) => {
    const res = validatePostRow(raw);
    if (res.ok) valid.push(res.value);
    else rejected.push({ index, errors: res.errors });
  });

  if (valid.length > 0) {
    const { error } = await user.db.from("growth_posts").insert(
      valid.map((input) => ({
        owner_id: user.id,
        platform: input.platform,
        title: input.title,
        post_url: input.postUrl,
        posted_at: input.postedAt,
        views: input.views,
        reach: input.reach,
        likes: input.likes,
        comments: input.comments,
        shares: input.shares,
        saves: input.saves,
        source: "csv",
      })),
    );
    throwIfMissingTable(error);
    if (error) throw new ApiFailure("INTERNAL", "Could not import the growth posts", error.message);
  }

  return ok({ ready: true, imported: valid.length, rejected });
});
