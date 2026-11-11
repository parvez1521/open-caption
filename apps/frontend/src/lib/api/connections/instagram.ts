import "server-only";
import type { MetaConfig } from "./config";
import { asArray, asRecord, clampTitle, fetchJson, parseCount, type FetchImpl, type SyncedPost } from "./posts";

/**
 * Instagram connect (P1): Facebook Login + Instagram Graph API.
 *
 * Scopes: instagram_basic (read the account's media) and
 * instagram_manage_insights (per-media views/reach/shares/saves) — the
 * insights permission is the one Meta gates behind App Review, which is why
 * the UI and the owner steps say plainly that insights stay unavailable
 * until Meta approves the app. When insights calls fail (permission not yet
 * granted), the sync degrades honestly: those metrics land as null (missing
 * data), never as invented numbers, and the basic counts still sync.
 */

export const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export const INSTAGRAM_SCOPES = ["instagram_basic", "instagram_manage_insights", "pages_show_list"] as const;

export const INSTAGRAM_SYNC_LIMIT = 50;

export function instagramAuthUrl(args: { config: MetaConfig; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: args.config.appId,
    redirect_uri: args.redirectUri,
    state: args.state,
    scope: INSTAGRAM_SCOPES.join(","),
    response_type: "code",
  });
  return `${GRAPH_BASE}/dialog/oauth?${params.toString()}`;
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

/** Code → short-lived token → long-lived (~60 day) token. */
export async function exchangeInstagramCode(args: {
  config: MetaConfig;
  code: string;
  redirectUri: string;
  fetchImpl?: FetchImpl;
}): Promise<InstagramTokens> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const short = await fetchJson(
    fetchImpl,
    `${GRAPH_BASE}/oauth/access_token?client_id=${encodeURIComponent(args.config.appId)}&client_secret=${encodeURIComponent(args.config.appSecret)}&redirect_uri=${encodeURIComponent(args.redirectUri)}&code=${encodeURIComponent(args.code)}`,
  );
  const shortToken = typeof short.access_token === "string" ? short.access_token : null;
  if (!shortToken) throw new Error("Meta did not return an access token");
  const long = await fetchJson(
    fetchImpl,
    `${GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(args.config.appId)}&client_secret=${encodeURIComponent(args.config.appSecret)}&fb_exchange_token=${encodeURIComponent(shortToken)}`,
  );
  return longLivedFrom(long);
}

/** Long-lived tokens refresh by exchanging the current one (must still be valid). */
export async function refreshInstagramToken(args: {
  config: MetaConfig;
  accessToken: string;
  fetchImpl?: FetchImpl;
}): Promise<InstagramTokens> {
  const body = await fetchJson(
    args.fetchImpl ?? fetch,
    `${GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(args.config.appId)}&client_secret=${encodeURIComponent(args.config.appSecret)}&fb_exchange_token=${encodeURIComponent(args.accessToken)}`,
  );
  return longLivedFrom(body);
}

export interface InstagramAccount {
  igUserId: string;
  username: string;
}

/** The first Facebook Page the user manages that has an Instagram professional account linked. */
export async function fetchInstagramAccount(accessToken: string, fetchImpl: FetchImpl = fetch): Promise<InstagramAccount> {
  const body = await fetchJson(
    fetchImpl,
    `${GRAPH_BASE}/me/accounts?fields=name,instagram_business_account{id,username}&access_token=${encodeURIComponent(accessToken)}`,
  );
  for (const page of asArray(body.data)) {
    const ig = asRecord(asRecord(page)?.instagram_business_account);
    if (ig && typeof ig.id === "string") {
      return { igUserId: ig.id, username: typeof ig.username === "string" ? ig.username : "Instagram account" };
    }
  }
  throw new Error("No Instagram professional account is linked to a Facebook Page this login can manage");
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
    `${GRAPH_BASE}/${encodeURIComponent(igUserId)}/media?fields=id,caption,timestamp,permalink,media_type,like_count,comments_count&limit=${limit}&access_token=${encodeURIComponent(accessToken)}`,
  );
  const posts: SyncedPost[] = [];
  for (const item of asArray(body.data)) {
    const rec = asRecord(item);
    let insights = NO_INSIGHTS;
    if (rec && typeof rec.id === "string") {
      try {
        const insightsBody: Record<string, unknown> = await fetchJson(
          fetchImpl,
          `${GRAPH_BASE}/${encodeURIComponent(rec.id)}/insights?metric=views,reach,shares,saved&access_token=${encodeURIComponent(accessToken)}`,
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
