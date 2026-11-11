import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, route, type Ctx } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rateLimit";
import { isConnectPlatform } from "@/lib/api/connections/config";
import { CONNECTIONS_NOT_READY_MESSAGE, ConnectionStoreNotReady } from "@/lib/api/connections/store";
import { ProviderSyncError, syncConnection } from "@/lib/api/connections/sync";

/**
 * "Sync now" for one connected platform (P1): re-reads the account's latest
 * posts through the stored token and upserts them into growth_posts (same
 * external id ⇒ figures update in place). Rate-limited per user — syncs hit
 * the provider's quota, and the manual button is not a polling loop.
 */
export const POST = route(async (req: Request, { params }: Ctx<{ platform: string }>) => {
  const user = await requireUser(req);
  const { platform } = await params;
  if (!isConnectPlatform(platform)) throw notFound("Connect platform");
  await rateLimit(user.id, "growth_sync", 10, 3600);
  try {
    const result = await syncConnection(user.id, platform);
    return ok(result);
  } catch (err) {
    if (err instanceof ConnectionStoreNotReady) throw new ApiFailure("INTERNAL", CONNECTIONS_NOT_READY_MESSAGE);
    if (err instanceof ProviderSyncError) throw new ApiFailure("UPSTREAM_FAILED", err.message);
    throw err;
  }
});
