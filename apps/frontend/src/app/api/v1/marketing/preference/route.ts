import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rateLimit";
import { toSubscriberSource } from "@/lib/marketing/subscribers";
import { getAdmin } from "@/lib/supabase/admin";

const Body = z.object({ marketingOptIn: z.boolean() });

/**
 * GET /api/v1/marketing/preference — the signed-in user's own opt-in state
 * (drives the Settings toggle). No row yet → opted out (the capture runs on
 * the next sign-in; the toggle itself creates the row on first save).
 *
 * PATCH /api/v1/marketing/preference — the Settings toggle. The ONLY writer
 * of the flag after first capture: it sets marketing_opt_in to the body's
 * value, and sets marketing_opt_in_at only when the user opts in and no
 * timestamp exists yet. Opting out never clears the timestamp, and a later
 * opt-in never overwrites the first consent time.
 */
export const GET = route(async (req: Request) => {
  const user = await requireUser(req);
  if (user.guest) throw new ApiFailure("FORBIDDEN", "Sign in to an account first");
  const { data: row, error } = await getAdmin()
    .from("marketing_subscribers")
    .select("marketing_opt_in, marketing_opt_in_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new ApiFailure("INTERNAL", "Could not load your email preference", error.message);
  return ok({
    email: user.email,
    marketingOptIn: (row as { marketing_opt_in: boolean } | null)?.marketing_opt_in ?? false,
    marketingOptInAt: (row as { marketing_opt_in_at: string | null } | null)?.marketing_opt_in_at ?? null,
  });
});

export const PATCH = route(async (req: Request) => {
  const user = await requireUser(req);
  if (user.guest) throw new ApiFailure("FORBIDDEN", "Sign in to an account first");
  await rateLimit(user.id, "marketing_preference", 20, 3600);
  const body = await parseBody(req, Body);
  if (!user.email) throw new ApiFailure("VALIDATION", "Your account has no email address");

  const db = getAdmin();
  const { data: existing, error: readError } = await db
    .from("marketing_subscribers")
    .select("user_id, marketing_opt_in, marketing_opt_in_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) throw new ApiFailure("INTERNAL", "Could not save your email preference", readError.message);

  const now = new Date().toISOString();
  if (existing) {
    const row = existing as { marketing_opt_in: boolean; marketing_opt_in_at: string | null };
    const { error } = await db
      .from("marketing_subscribers")
      .update({
        marketing_opt_in: body.marketingOptIn,
        // first consent time only; opting out keeps it, opting back in keeps the first one
        marketing_opt_in_at: body.marketingOptIn && !row.marketing_opt_in_at ? now : row.marketing_opt_in_at,
        updated_at: now,
      })
      .eq("user_id", user.id);
    if (error) throw new ApiFailure("INTERNAL", "Could not save your email preference", error.message);
    return ok({
      marketingOptIn: body.marketingOptIn,
      marketingOptInAt: body.marketingOptIn && !row.marketing_opt_in_at ? now : row.marketing_opt_in_at,
    });
  }

  const { data: authUser } = await db.auth.getUser(user.token);
  const { error: insertError } = await db.from("marketing_subscribers").insert({
    user_id: user.id,
    email: user.email,
    source: toSubscriberSource(authUser.user?.app_metadata?.provider ?? null),
    marketing_opt_in: body.marketingOptIn,
    marketing_opt_in_at: body.marketingOptIn ? now : null,
  });
  if (insertError) throw new ApiFailure("INTERNAL", "Could not save your email preference", insertError.message);
  return ok({ marketingOptIn: body.marketingOptIn, marketingOptInAt: body.marketingOptIn ? now : null });
});
