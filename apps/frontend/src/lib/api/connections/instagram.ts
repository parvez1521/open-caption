import "server-only";
import type { InstagramConfig } from "./config";
import { asArray, asRecord, clampTitle, fetchJson, parseCount, type FetchImpl, type SyncedPost } from "./posts";

/**
 * Instagram connect: Instagram API with Instagram Login (Business Login
 * for Instagram) — NOT the Facebook Login variant.
 *
 * Why this flow: the app is Instagram-first and its Instagram account has
 * no Facebook Page behind it, and the Facebook Login variant cannot work
 * here at all. That variant discovers the account through
 * `GET /me/accounts?fields=instagram_business_account`, which needs the
 * `pages_show_list` permission — a permission this app cannot request
 * (Meta rejects it as an invalid scope: it belongs to the Facebook Login /
 * Page use case, which this app does not have). So the old code failed at
 * the account lookup even after a fully completed OAuth. Instagram Login
 * needs no Page and no Page permission: the token IS an Instagram User
 * token, and the token's own `/me` is the account (id + username).
 *
 * Flow (Meta's Business Login for Instagram):
 *  1. Authorize at https://www.instagram.com/oauth/authorize — the user
 *     signs in with Instagram, not Facebook. Code valid 1 hour, one use.
 *  2. POST https://api.instagram.com/oauth/access_token (form-encoded)
 *     → short-lived token (~1 hour) + the user's IG id.
 *  3. GET https://graph.instagram.com/access_token
 *     ?grant_type=ig_exchange_token → long-lived token (~60 days).
 *  4. Identity + data on https://graph.instagram.com: `GET /me` is the
 *     account, `GET /{ig-user-id}/media` its posts.
 *  Refresh: GET https://graph.instagram.com/refresh_access_token
 *  ?grant_type=ig_refresh_token (token must be ≥24h old and still valid).
 *
 * Credentials are the Instagram App ID + Secret from Instagram → API setup
 * with Instagram login — DIFFERENT from the Meta App ID/Secret in
 * Settings > Basic. The OAuth redirect URI must be registered in that
 * same Instagram Login setup (the Facebook Login for Business redirect
 * URI list does not cover this flow).
 *
 * Scopes: instagram_business_basic (profile + media) and
 * instagram_business_manage_insights (per-media views/reach/shares/saves)
 * — the insights permission is the one Meta gates behind App Review, which
 * is why the UI says plainly that insights stay unavailable until Meta
 * approves the app. When insights calls fail (permission not yet
 * granted), the sync degrades honestly: those metrics land as null
 * (missing data), never as invented numbers, and the basic counts still
 * sync.
 */

export const GRAPH_VERSION = "v21.0";
const IG_GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`;
const IG_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
const IG_TOKEN_URL = "https://api.instagram.com/oauth/access_token";

export const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_manage_insights"] as const;

export const INSTAGRAM_SYNC_LIMIT = 50;

export function instagramAuthUrl(args: { config: InstagramConfig; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: args.config.appId,
    redirect_uri: args.redirectUri,
    response_type: "code",
    scope: INSTAGRAM_SCOPES.join(","),
    state: args.state,
  });
  return `${IG_AUTHORIZE_URL}?${params.toString()}`;
}

export interface InstagramTokens {
  accessToken: string;
  expiresAt: string | null;
}

function longLivedFrom(body: Record<string, unknown>): InstagramTokens {
  const accessToken = typeof body.access_token === "string" ? body.access_token : null;
  if (!accessToken) throw new Error("Meta did not return an access token");
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : null;
  return { accessToken, expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null };
}

/**
 * Code → short-lived token → long-lived (~60 day) token. The code exchange
 * is a form POST to api.instagram.com; the long-lived exchange is a GET on
 * graph.instagram.com.
 */
export async function exchangeInstagramCode(args: {
  config: InstagramConfig;
  code: string;
  redirectUri: string;
  fetchImpl?: FetchImpl;
}): Promise<InstagramTokens> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const form = new URLSearchParams({
    client_id: args.config.appId,
    client_secret: args.config.appSecret,
    grant_type: "authorization_code",
    redirect_uri: args.redirectUri,
    code: args.code,
  });
  const short = await fetchJson(fetchImpl, IG_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const shortToken = typeof short.access_token === "string" ? short.access_token : null;
  if (!shortToken) throw new Error("Meta did not return an access token");
  const long = await fetchJson(
    fetchImpl,
    `${IG_GRAPH_BASE}/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(args.config.appSecret)}&access_token=${encodeURIComponent(shortToken)}`,
  );
  return longLivedFrom(long);
}

/**
 * Long-lived tokens refresh by exchanging the current one (must be at least
 * 24 hours old and still valid — an expired token cannot be refreshed and
 * the owner has to sign in again).
 */
export async function refreshInstagramToken(args: {
  config: InstagramConfig;
  accessToken: string;
  fetchImpl?: FetchImpl;
}): Promise<InstagramTokens> {
  const body = await fetchJson(
    args.fetchImpl ?? fetch,
    `${IG_GRAPH_BASE}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(args.accessToken)}`,
  );
  return longLivedFrom(body);
}

export interface InstagramAccount {
  igUserId: string;
  username: string;
}

/**
 * The token's own /me — with Instagram Login the access token belongs to
 * the Instagram professional account itself, so no Page lookup is needed
 * (and none is possible: there is no Page behind this login).
 */
export async function fetchInstagramAccount(accessToken: string, fetchImpl: FetchImpl = fetch): Promise<InstagramAccount> {
  const body = await fetchJson(
    fetchImpl,
    `${IG_GRAPH_BASE}/me?fields=id,username&access_token=${encodeURIComponent(accessToken)}`,
  );
  const id = typeof body.id === "string" && body.id ? body.id : null;
  if (!id) {
    throw new Error("Instagram did not return a professional account for this sign-in — the account must be a Business or Creator account");
  }
  return { igUserId: id, username: typeof body.username === "string" && body.username ? body.username : "Instagram account" };
}

export interface InstagramInsights {
  views: number | null;
  reach: number | null;
  shares: number | null;
  saves: number | null;
}

export const NO_INSIGHTS: InstagramInsights = { views: null, reach: null, shares: null, saves: null };

/** PURE mapper: insights response rows → the four metrics (absent metric = null). */
export function parseInstagramInsights(body: unknown): InstagramInsights {
  const out: InstagramInsights = { ...NO_INSIGHTS };
  for (const row of asArray(asRecord(body)?.data)) {
    const rec = asRecord(row);
    if (!rec || typeof rec.name !== "string") continue;
    const value = parseCount(asRecord(asArray(rec.values)[0])?.value);
    if (rec.name === "views") out.views = value;
    else if (rec.name === "reach") out.reach = value;
    else if (rec.name === "shares") out.shares = value;
    else if (rec.name === "saved") out.saves = value;
  }
  return out;
}

/** PURE mapper: one media item (+ its insights, when available) → a growth row. */
export function mapInstagramMedia(item: unknown, insights: InstagramInsights = NO_INSIGHTS): SyncedPost | null {
  const rec = asRecord(item);
  if (!rec || typeof rec.id !== "string" || !rec.id) return null;
  const timestamp = typeof rec.timestamp === "string" ? rec.timestamp : null;
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) return null;
  const caption = typeof rec.caption === "string" ? rec.caption : "";
  return {
    externalId: rec.id,
    source: "instagram",
    platform: "instagram",
    title: clampTitle(caption.split("\n")[0] ?? ""),
    postUrl: typeof rec.permalink === "string" ? rec.permalink : null,
    postedAt: new Date(timestamp).toISOString(),
    views: insights.views,
    reach: insights.reach,
    likes: parseCount(rec.like_count),
    comments: parseCount(rec.comments_count),
    shares: insights.shares,
    saves: insights.saves,
  };
}

/**
 * Recent media with per-media insights where Meta grants them. An insights
 * failure (typically: App Review still pending) degrades that post's
 * insight metrics to null — the sync itself never fails over it.
 */
export async function fetchInstagramMedia(
  accessToken: string,
  igUserId: string,
  fetchImpl: FetchImpl = fetch,
  limit: number = INSTAGRAM_SYNC_LIMIT,
): Promise<SyncedPost[]> {
  const body = await fetchJson(
    fetchImpl,
    `${IG_GRAPH_BASE}/${encodeURIComponent(igUserId)}/media?fields=id,caption,timestamp,permalink,media_type,like_count,comments_count&limit=${limit}&access_token=${encodeURIComponent(accessToken)}`,
  );
  const posts: SyncedPost[] = [];
  for (const item of asArray(body.data)) {
    const rec = asRecord(item);
    let insights = NO_INSIGHTS;
    if (rec && typeof rec.id === "string") {
      try {
        const insightsBody: Record<string, unknown> = await fetchJson(
          fetchImpl,
          `${IG_GRAPH_BASE}/${encodeURIComponent(rec.id)}/insights?metric=views,reach,shares,saved&access_token=${encodeURIComponent(accessToken)}`,
        );
        insights = parseInstagramInsights(insightsBody);
      } catch {
        insights = NO_INSIGHTS; // permission not granted yet — honest nulls, not a failed sync
      }
    }
    const post = mapInstagramMedia(item, insights);
    if (post) posts.push(post);
  }
  return posts;
}
