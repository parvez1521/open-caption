import "server-only";

/**
 * Connected accounts for Growth Studio (P1, 2026-11-11): env gates + origins.
 *
 * Each platform switches on ONLY when its OAuth app credentials exist in the
 * server environment. Unset ⇒ the connect section renders its honest
 * "not switched on yet" state and the start route bounces back to /growth —
 * there is no fake connect anywhere in this feature. Credentials are read
 * from process.env at request time and never reach a client bundle (this
 * module is server-only, like every lib/api module).
 */

export type ConnectPlatform = "youtube" | "instagram";
export const CONNECT_PLATFORMS: readonly ConnectPlatform[] = ["youtube", "instagram"];

export const isConnectPlatform = (value: string): value is ConnectPlatform =>
  value === "youtube" || value === "instagram";

export interface YoutubeConfig {
  clientId: string;
  clientSecret: string;
}

export interface InstagramConfig {
  /** The Instagram App ID from Instagram → API setup with Instagram login (NOT the Meta App ID). */
  appId: string;
  /** The Instagram App Secret from the same setup — server-only, never in a client bundle. */
  appSecret: string;
}

export function youtubeConfig(): YoutubeConfig | null {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * Instagram Login credentials (Business Login for Instagram): the Instagram
 * App ID + Secret shown under Instagram → API setup with Instagram login →
 * "Set up Instagram business login". They DIFFER from the Meta App ID and
 * App Secret in Settings > Basic — those belong to the Facebook Login flow
 * and cannot be used here. Until these two vars exist, Instagram reads
 * "not switched on".
 */
export function instagramConfig(): InstagramConfig | null {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  return appId && appSecret ? { appId, appSecret } : null;
}

export function platformConfigured(platform: ConnectPlatform): boolean {
  return platform === "youtube" ? youtubeConfig() !== null : instagramConfig() !== null;
}

/** The public origin OAuth callbacks land on: the configured app URL, else the request's own origin. */
export function appOrigin(req: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  return new URL(req.url).origin;
}

export function redirectUriFor(platform: ConnectPlatform, req: Request): string {
  return `${appOrigin(req)}/api/v1/growth/connect/${platform}/callback`;
}
