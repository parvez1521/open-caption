import { requireUser } from "@/lib/api/auth";
import { notFound, ok, route, type Ctx } from "@/lib/api/http";
import { appOrigin, isConnectPlatform, metaConfig, platformConfigured, redirectUriFor, youtubeConfig } from "@/lib/api/connections/config";
import { signOAuthState } from "@/lib/api/connections/state";
import { youtubeAuthUrl } from "@/lib/api/connections/youtube";
import { instagramAuthUrl } from "@/lib/api/connections/instagram";

/**
 * Begin a connect (P1): signed-in users only. The identity rides to the
 * provider inside the HMAC-signed OAuth state (the callback has no auth
 * header); see connections/state.ts. A platform whose credentials are not
 * configured answers with the /growth bounce URL instead — never a fake
 * consent page.
 *
 * The answer is JSON `{ url }`, NOT an HTTP redirect (bugfix 2026-11-11):
 * this app authenticates API calls with a Bearer token the browser client
 * attaches (services/api-client) — a bare browser navigation to this route
 * can never carry it, so a redirect contract made the Connect button land
 * on a 401. The panel now fetches the URL through the authed client (the
 * same pattern as billing checkout) and navigates to it.
 */
export const GET = route(async (req: Request, { params }: Ctx<{ platform: string }>) => {
  const user = await requireUser(req);
  const { platform } = await params;
  if (!isConnectPlatform(platform)) throw notFound("Connect platform");
  if (!platformConfigured(platform)) {
    return ok({ url: new URL(`/growth?connect=${platform}-off`, appOrigin(req)).toString() });
  }
  const state = signOAuthState(user.id, platform);
  const redirectUri = redirectUriFor(platform, req);
  const url =
    platform === "youtube"
      ? youtubeAuthUrl({ config: youtubeConfig()!, redirectUri, state })
      : instagramAuthUrl({ config: metaConfig()!, redirectUri, state });
  return ok({ url });
});
