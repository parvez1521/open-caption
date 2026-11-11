import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { notFound, route, type Ctx } from "@/lib/api/http";
import { appOrigin, isConnectPlatform, metaConfig, platformConfigured, redirectUriFor, youtubeConfig } from "@/lib/api/connections/config";
import { signOAuthState } from "@/lib/api/connections/state";
import { youtubeAuthUrl } from "@/lib/api/connections/youtube";
import { instagramAuthUrl } from "@/lib/api/connections/instagram";

/**
 * Begin a connect (P1): signed-in users only. The identity rides to the
 * provider inside the HMAC-signed OAuth state (the callback has no auth
 * header); see connections/state.ts. A platform whose credentials are not
 * configured bounces straight back to /growth — never a fake consent page.
 */
export const GET = route(async (req: Request, { params }: Ctx<{ platform: string }>) => {
  const user = await requireUser(req);
  const { platform } = await params;
  if (!isConnectPlatform(platform)) throw notFound("Connect platform");
  if (!platformConfigured(platform)) {
    return NextResponse.redirect(new URL(`/growth?connect=${platform}-off`, appOrigin(req)));
  }
  const state = signOAuthState(user.id, platform);
  const redirectUri = redirectUriFor(platform, req);
  const url =
    platform === "youtube"
      ? youtubeAuthUrl({ config: youtubeConfig()!, redirectUri, state })
      : instagramAuthUrl({ config: metaConfig()!, redirectUri, state });
  return NextResponse.redirect(url);
});
