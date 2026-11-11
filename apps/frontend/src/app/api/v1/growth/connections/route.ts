import { requireUser } from "@/lib/api/auth";
import { ok, route } from "@/lib/api/http";
import { CONNECT_PLATFORMS, platformConfigured } from "@/lib/api/connections/config";
import { ConnectionStoreNotReady, listConnectionStatuses } from "@/lib/api/connections/store";

/**
 * Connection status for the Growth Studio connect section (P1).
 *
 * The response carries ONLY non-secret facts per platform: whether the
 * platform is switched on for the product (its OAuth app credentials are
 * configured server-side), whether THIS user has connected, the account
 * display name, and the last sync time. Token values are never selected
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
  return ok({
    setupPending,
    platforms: CONNECT_PLATFORMS.map((platform) => ({
      platform,
      configured: platformConfigured(platform),
      connected: byPlatform.has(platform),
      accountName: byPlatform.get(platform)?.accountName ?? null,
      lastSyncAt: byPlatform.get(platform)?.lastSyncAt ?? null,
    })),
  });
});
