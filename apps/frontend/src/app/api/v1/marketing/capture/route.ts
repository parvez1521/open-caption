import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, route } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rateLimit";
import { toSubscriberSource } from "@/lib/marketing/subscribers";
import { getAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/v1/marketing/capture — record the signed-in account's email on
 * the subscriber list. Called once per session from /start, right after the
 * session is established (signup and every login, Google + email).
 *
 * Semantics (consent is never invented here):
 * - row missing → insert, opted OUT unless the signup form stored
 *   marketing_opt_in=true in user_metadata (email signups only; Google
 *   signups carry no such key and start opted out);
 * - row present → refresh email + source only. An existing opt-in is NEVER
 *   overwritten with false, and marketing_opt_in_at is NEVER touched.
 * The Settings toggle (PATCH /marketing/preference) is the only writer of
 * the flag after first capture. Guests have no email: 403, like the
 * guest-claim route. Capture failures are swallowed client-side — a
 * missing table must never break sign-in.
 */
export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  if (user.guest) throw new ApiFailure("FORBIDDEN", "Sign in to an account first");
  await rateLimit(user.id, "marketing_capture", 20, 3600);

  const email = user.email;
  if (!email) return ok({ captured: false, marketingOptIn: false });

  // provider ('google' | 'email') + a signup-time opt-in live on the auth
  // user, not on the token requireUser already verified.
  const { data: authUser } = await getAdmin().auth.getUser(user.token);
  const source = toSubscriberSource(authUser.user?.app_metadata?.provider ?? null);
  const signupOptIn = authUser.user?.user_metadata?.marketing_opt_in === true;

  const db = getAdmin();
  const { data: existing, error: readError } = await db
    .from("marketing_subscribers")
    .select("user_id, marketing_opt_in")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) throw new ApiFailure("INTERNAL", "Could not record your email", readError.message);

  const now = new Date().toISOString();
  if (existing) {
    const { error } = await db
      .from("marketing_subscribers")
      .update({ email, source, updated_at: now })
      .eq("user_id", user.id);
    if (error) throw new ApiFailure("INTERNAL", "Could not record your email", error.message);
    return ok({ captured: true, marketingOptIn: (existing as { marketing_opt_in: boolean }).marketing_opt_in });
  }

  const { error: insertError } = await db.from("marketing_subscribers").insert({
    user_id: user.id,
    email,
    source,
    marketing_opt_in: signupOptIn,
    marketing_opt_in_at: signupOptIn ? now : null,
  });
  if (insertError) {
    // A row appeared between the select and the insert (double sign-in):
    // refresh it and report the flag it already holds.
    if (insertError.code === "23505") {
      await db.from("marketing_subscribers").update({ email, source, updated_at: now }).eq("user_id", user.id);
      const { data: raced } = await db
        .from("marketing_subscribers")
        .select("marketing_opt_in")
        .eq("user_id", user.id)
        .maybeSingle();
      return ok({ captured: true, marketingOptIn: (raced as { marketing_opt_in: boolean } | null)?.marketing_opt_in ?? false });
    }
    throw new ApiFailure("INTERNAL", "Could not record your email", insertError.message);
  }
  return ok({ captured: true, marketingOptIn: signupOptIn });
});
