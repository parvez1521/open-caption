import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, route, type Ctx } from "@/lib/api/http";
import { isConnectPlatform } from "@/lib/api/connections/config";
import { CONNECTIONS_NOT_READY_MESSAGE, ConnectionStoreNotReady, deleteConnection } from "@/lib/api/connections/store";
import { rateLimit } from "@/lib/api/rateLimit";

/**
 * Disconnect one platform (P1): deletes ONLY the connection row (the stored
 * tokens). Posts already synced from the account are the user's own data in
 * growth_posts and stay — the UI copy says exactly that before the click.
 */
export const POST = route(async (req: Request, { params }: Ctx<{ platform: string }>) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "growth_connect", 30, 3600);
  const { platform } = await params;
  if (!isConnectPlatform(platform)) throw notFound("Connect platform");
  try {
    await deleteConnection(user.id, platform);
  } catch (err) {
    if (err instanceof ConnectionStoreNotReady) throw new ApiFailure("INTERNAL", CONNECTIONS_NOT_READY_MESSAGE);
    throw err;
  }
  return ok({ disconnected: true, platform });
});
