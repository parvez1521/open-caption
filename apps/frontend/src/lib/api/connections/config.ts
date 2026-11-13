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
  /** The Meta App ID from Settings > Basic (NOT a separate Instagram App ID — none exists for this app). */
  appId: string;
  /** The Meta App Secret from Settings > Basic — server-only, never in a client bundle. */
  appSecret: string;
  /** The Unified Login configuration ID (Facebook Login for Business config, API setup with Unified login). */
  configId: string;
}

export function youtubeConfig(): YoutubeConfig | null {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * Instagram connect credentials (Unified Login): the Meta App ID + Secret
 * from Settings > Basic, plus the Unified Login configuration ID from
 * Use cases → Instagram → API setup with Unified login ("No compatible
 * configurations found" in the dashboard means no configuration has been
 * created yet — its ID is what goes in INSTAGRAM_CONFIG_ID). All three
 * must exist; until they do, Instagram reads "not switched on". The old
 * Instagram Login credentials (a separate Instagram App ID/Secret) do
 * not exist for this app — Meta does not offer that setup to it.
 */
export function instagramConfig(): InstagramConfig | null {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const configId = process.env.INSTAGRAM_CONFIG_ID;
  return appId && appSecret && configId ? { appId, appSecret, configId } : null;
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
