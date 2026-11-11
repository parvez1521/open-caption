import { requireUser } from "@/lib/api/auth";
import { ok, route } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";
import { CONNECT_PLATFORMS, platformConfigured, type ConnectPlatform } from "@/lib/api/connections/config";
import { ConnectionStoreNotReady, listConnectionStatuses } from "@/lib/api/connections/store";

/**
 * How many of the user's stored posts a connection's syncs have brought in
 * (growth_posts rows carrying the platform as their source). Best-effort by
 * design: any read failure answers null — "unknown" — never a wrong number,
 * and the card simply omits the count.
 */
async function countSyncedPosts(ownerId: string, source: ConnectPlatform): Promise<number | null> {
  try {
    const { data, error } = await getAdmin()
      .from("growth_posts")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("source", source);
    if (error) return null;
    return (data ?? []).length;
  } catch {
    return null;
  }
}

/**
 * Connection status for the Growth Studio connect section (P1).
 *
 * The response carries ONLY non-secret facts per platform: whether the
 * platform is switched on for the product (its OAuth app credentials are
 * configured server-side), whether THIS user has connected, the account
 * display name, the last sync time, and how many of the user's stored
 * posts its syncs have brought in. Token values are never selected
 * (see connections/store.ts) and never appear here.
 *
 * Until APPLY-GROWTH-CONNECT.sql is applied the table does not exist:
 * the route answers setupPending:true with nothing connected — the section
 * renders its honest not-set-up state instead of an error.
 */
export const GET = route(async (req: Request) => {
  const user = await requireUser(req);
  let setupPending = false;
  const byPlatform = new Map<string, { accountName: string | null; lastSyncAt: string | null }>();
  try {
    for (const status of await listConnectionStatuses(user.id)) {
      byPlatform.set(status.platform, { accountName: status.accountName, lastSyncAt: status.lastSyncAt });
    }
  } catch (err) {
    if (err instanceof ConnectionStoreNotReady) setupPending = true;
    else throw err;
  }
  const postCounts = new Map<ConnectPlatform, number | null>();
  if (!setupPending) {
    for (const platform of CONNECT_PLATFORMS) {
      postCounts.set(platform, await countSyncedPosts(user.id, platform));
    }
  }
  return ok({
    setupPending,
    platforms: CONNECT_PLATFORMS.map((platform) => ({
      platform,
      configured: platformConfigured(platform),
      connected: byPlatform.has(platform),
      accountName: byPlatform.get(platform)?.accountName ?? null,
      lastSyncAt: byPlatform.get(platform)?.lastSyncAt ?? null,
      postCount: postCounts.get(platform) ?? null,
    })),
  });
});
