import { NextResponse } from "next/server";
import type { Ctx } from "@/lib/api/http";
import { appOrigin, isConnectPlatform, redirectUriFor } from "@/lib/api/connections/config";
import { verifyOAuthState } from "@/lib/api/connections/state";
import { connectInstagram, connectYoutube } from "@/lib/api/connections/sync";

/**
 * OAuth callback (P1). This is a bare browser redirect from Google/Meta —
 * there is no Authorization header, so the caller is identified ONLY by the
 * HMAC-signed state minted by the start route. Every outcome lands back on
 * /growth with a plain query flag the connect section turns into a notice:
 * connected=<platform> / connect_error=<platform>. Details of failures stay
 * server-side; nothing about tokens or provider bodies reaches the URL.
 */
export async function GET(req: Request, { params }: Ctx<{ platform: string }>) {
  const { platform } = await params;
  const back = (query: string) => NextResponse.redirect(new URL(`/growth?${query}`, appOrigin(req)));
  if (!isConnectPlatform(platform)) return back("connect_error=unknown");
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return back(`connect_error=${platform}`);
  const verified = verifyOAuthState(state, platform);
  if (!verified) return back(`connect_error=${platform}`);
  try {
    const result =
      platform === "youtube"
        ? await connectYoutube(verified.userId, code, redirectUriFor(platform, req))
        : await connectInstagram(verified.userId, code, redirectUriFor(platform, req));
    return back(`connected=${platform}${result.syncFailed ? "&sync=failed" : ""}`);
  } catch {
    return back(`connect_error=${platform}`);
  }
}
