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

export interface MetaConfig {
  appId: string;
  appSecret: string;
}

export function youtubeConfig(): YoutubeConfig | null {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function metaConfig(): MetaConfig | null {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  return appId && appSecret ? { appId, appSecret } : null;
}

export function platformConfigured(platform: ConnectPlatform): boolean {
  return platform === "youtube" ? youtubeConfig() !== null : metaConfig() !== null;
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
