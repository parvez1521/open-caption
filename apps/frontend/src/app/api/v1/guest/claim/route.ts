import { createClient, type User } from "@supabase/supabase-js";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rateLimit";
import { getAdmin } from "@/lib/supabase/admin";

const Body = z.object({ accessToken: z.string().min(10), refreshToken: z.string().min(5).optional() });

/** Tables whose rows a guest can own; everything moves to the signed-in account. */
const OWNED = ["projects", "videos", "transcripts", "caption_documents", "caption_document_versions", "caption_translations", "jobs", "exports", "user_looks", "brand_kits", "user_fonts", "usage_events"] as const;

const isGuest = (u: User | null | undefined): u is User => !!u?.is_anonymous && !u.email && !u.new_email;

/** Proves the caller held the guest session: its access token, or (if that expired) its refresh token. */
async function guestFromTokens(accessToken: string, refreshToken?: string): Promise<User | null> {
  const { data } = await getAdmin().auth.getUser(accessToken);
  if (isGuest(data.user)) return data.user;
  if (!refreshToken) return null;
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const r = await anon.auth.refreshSession({ refresh_token: refreshToken });
  return isGuest(r.data.user) ? r.data.user : null;
}

/**
 * A guest who signs in to an EXISTING account (instead of turning the guest into a new one) brings their work along:
 * the browser kept the guest's tokens before signing in, and here every row the guest owns moves to the real account.
 */
export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  if (user.guest) throw new ApiFailure("FORBIDDEN", "Sign in to an account first");
  await rateLimit(user.id, "guest_claim", 20, 3600);
  const body = await parseBody(req, Body);
  const guest = await guestFromTokens(body.accessToken, body.refreshToken);
  if (!guest) return ok({ moved: 0, projectIds: [] as string[] }); // expired or already claimed: nothing to do
  if (guest.id === user.id) return ok({ moved: 0, projectIds: [] as string[] });

  const db = getAdmin();
  const { data: projects } = await db.from("projects").select("id").eq("owner_id", guest.id);
  for (const t of OWNED) {
    const { error } = await db.from(t).update({ owner_id: user.id }).eq("owner_id", guest.id);
    if (error) throw new ApiFailure("INTERNAL", "Could not move your work to this account", `${t}: ${error.message}`);
  }
  const { data: favs } = await db.from("favorite_looks").select("look_id").eq("owner_id", guest.id);
  if (favs?.length) {
    await db.from("favorite_looks").upsert(favs.map((f) => ({ owner_id: user.id, look_id: f.look_id })), { ignoreDuplicates: true });
    await db.from("favorite_looks").delete().eq("owner_id", guest.id);
  }
  // the empty guest account is removed by the daily cleanup (it owns nothing now)
  const projectIds = (projects ?? []).map((p) => p.id as string);
  return ok({ moved: projectIds.length, projectIds });
});
