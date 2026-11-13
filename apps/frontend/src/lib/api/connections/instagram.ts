import "server-only";
import type { InstagramConfig } from "./config";
import { asArray, asRecord, clampTitle, fetchJson, parseCount, type FetchImpl, type SyncedPost } from "./posts";

/**
 * Instagram connect: Instagram API with Unified Login (Facebook Login for
 * Business) — the ONLY setup Meta offers for this app.
 *
 * Why this flow: the app is newer than the Instagram Login setup. Meta's
 * dashboard has NO "API setup with Instagram login" page for it ("API
 * setup with Instagram login is not available for newer apps. Your app
 * uses API setup with Unified login instead."). The previous Instagram
 * Login code therefore failed at the authorize step with Meta's
 * "Invalid platform app" — Instagram never showed a consent screen.
 * Unified Login removes the linked-Page dependency of the classic
 * Facebook Login flow while keeping the Facebook Graph host.
 *
 * Flow (Meta's Instagram API with Unified Login):
 *  0. DASHBOARD PREREQUISITE — a Facebook Login for Business
 *     configuration must exist (Use cases → Manage messaging & content
 *     on Instagram → API setup with Unified login): token type
 *     "System-user access token" + its lifetime, assets (Instagram
 *     accounts only, Asset Required), and permissions (the instagram_*
 *     family — instagram_basic for profile + media,
 *     instagram_manage_insights for per-media views/reach/shares/saves).
 *     The configuration has an ID (`config_id`); the dashboard's
 *     "No compatible configurations found" means no configuration has
 *     been created yet. The redirect URI must be saved on that same
 *     setup (it already is: the callback URI is registered under
 *     Unified login / Facebook Login for Business).
 *  1. Authorize at https://www.facebook.com/dialog/oauth — the user
 *     signs in with Instagram or Facebook. The URL carries `config_id`
 *     and NO scope parameter: the configuration selects the permissions
 *     and assets. `prompt=login` shows both sign-in choices even when
 *     the browser is already signed into Facebook. Code valid 1 hour,
 *     one use.
 *  2. GET https://graph.facebook.com/v21.0/oauth/access_token
 *     ?client_id&client_secret&redirect_uri&code → a Business
 *     Integration System User Access Token, owned by the customer's
 *     business portfolio. There is NO second exchange hop (no
 *     ig_exchange_token, no fb_exchange_token). A non-expiring
 *     configuration returns no expires_in — that means no expiry, not
 *     an error.
 *  3. Discover the shared accounts: GET
 *     https://graph.facebook.com/v21.0/me/assigned_instagram_accounts
 *     ?fields=id,username — under Unified Login `/me` is the system
 *     user, NOT the Instagram account, so the account must be read
 *     from this edge (paginated). An empty list is a KNOWN failure mode
 *     (developer-community reports, Oct–Nov 2026, no confirmed
 *     resolution): the connect fails honestly and stores nothing —
 *     never invent an account id.
 *  4. Data on https://graph.facebook.com: `GET /{ig-user-id}/media`
 *     its posts, `GET /{media-id}/insights` its metrics.
 *
 * There is NO refresh grant in this flow. A token that expires is
 * reconnected (the sync surfaces "sign-in has expired — disconnect and
 * connect again"). Do NOT call ig_refresh_token or fb_exchange_token
 * here — neither applies to a system-user token.
 *
 * Credentials are the Meta App ID + Secret from Settings > Basic plus
 * the Unified Login `config_id` (env INSTAGRAM_CONFIG_ID). There are NO
 * separate Instagram App ID/Secret values for this app — the Instagram
 * Login credentials the old code expected do not exist.
 *
 * Scopes: none in code. The permissions live in the dashboard
 * configuration (instagram_basic + instagram_manage_insights for what
 * this product reads). The insights permission is the one Meta gates
 * behind App Review, which is why the UI says plainly that insights
 * stay unavailable until Meta approves the app. When insights calls
 * fail (permission not yet granted), the sync degrades honestly: those
 * metrics land as null (missing data), never as invented numbers, and
 * the basic counts still sync.
 */

export const GRAPH_VERSION = "v21.0";
const FB_GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const FB_AUTHORIZE_URL = "https://www.facebook.com/dialog/oauth";

export const INSTAGRAM_SYNC_LIMIT = 50;

/** The Unified Login authorize URL: config_id selects the consent flow — no scope parameter. */
export function instagramAuthUrl(args: { config: InstagramConfig; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: args.config.appId,
    config_id: args.config.configId,
    redirect_uri: args.redirectUri,
    response_type: "code",
    prompt: "login",
    state: args.state,
  });
  return `${FB_AUTHORIZE_URL}?${params.toString()}`;
}

export interface InstagramTokens {
  accessToken: string;
  expiresAt: string | null;
}

function tokensFrom(body: Record<string, unknown>): InstagramTokens {
  const accessToken = typeof body.access_token === "string" ? body.access_token : null;
  if (!accessToken) throw new Error("Meta did not return an access token");
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : null;
  return { accessToken, expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null };
}

/**
 * Code → Business Integration System User Access Token, in ONE exchange on
 * graph.facebook.com. A non-expiring configuration returns no expires_in
 * (expiresAt null) — that is a valid token, not a failure.
 */
export async function exchangeInstagramCode(args: {
  config: InstagramConfig;
  code: string;
  redirectUri: string;
  fetchImpl?: FetchImpl;
}): Promise<InstagramTokens> {
  const body = await fetchJson(
    args.fetchImpl ?? fetch,
    `${FB_GRAPH_BASE}/oauth/access_token?client_id=${encodeURIComponent(args.config.appId)}&client_secret=${encodeURIComponent(args.config.appSecret)}&redirect_uri=${encodeURIComponent(args.redirectUri)}&code=${encodeURIComponent(args.code)}`,
  );
  return tokensFrom(body);
}

export interface InstagramAccount {
  igUserId: string;
  username: string;
}

/** One page of the assigned-accounts edge. */
function parseAssignedAccounts(body: unknown): { accounts: InstagramAccount[]; after: string | null } {
  const accounts: InstagramAccount[] = [];
  for (const item of asArray(asRecord(body)?.data)) {
    const rec = asRecord(item);
    if (rec && typeof rec.id === "string" && rec.id) {
      accounts.push({ igUserId: rec.id, username: typeof rec.username === "string" && rec.username ? rec.username : "Instagram account" });
    }
  }
  const after = asRecord(asRecord(asRecord(body)?.paging)?.cursors)?.after;
  return { accounts, after: typeof after === "string" && after ? after : null };
}

/**
 * Discover the Instagram accounts the system-user token can access.
 * `/me` is the system user under Unified Login, so the account comes
 * from the assigned-accounts edge (paginated, with a safety cap and a
 * repeated-cursor guard — never page forever).
 *
 * Selection: exactly one shared account → it. Several → keep the
 * already-connected one when it is among them (a reconnect); otherwise
 * fail honestly — never silently pick one of several. Zero → fail
 * honestly: no account was shared, so there is nothing to connect.
 */
export async function fetchInstagramAccount(
  accessToken: string,
  fetchImpl: FetchImpl = fetch,
  existingAccountId: string | null = null,
): Promise<InstagramAccount> {
  const found = new Map<string, InstagramAccount>();
  const seenCursors = new Set<string>();
  let after: string | null = null;
  for (let page = 0; page < 100; page++) {
    const url = new URL(`${FB_GRAPH_BASE}/me/assigned_instagram_accounts`);
    url.searchParams.set("fields", "id,username");
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);
    const body = await fetchJson(fetchImpl, url.toString(), {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const { accounts, after: next } = parseAssignedAccounts(body);
    for (const account of accounts) found.set(account.igUserId, account);
    if (!next || next === after) break;
    if (seenCursors.has(next)) throw new Error("Instagram account discovery stopped on a repeated page cursor");
    seenCursors.add(next);
    after = next;
  }
  if (found.size === 0) {
    throw new Error("Instagram did not share a professional account for this sign-in. The account must be a Business or Creator account. Shared with the app..");
  }
  if (found.size === 1) return [...found.values()][0]!;
  if (existingAccountId && found.has(existingAccountId)) return found.get(existingAccountId)!;
  throw new Error("Several Instagram accounts were shared — share only the intended account with the app, then connect again");
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
 * Recent media with per-media insights where Meta grants them, on the
 * Facebook Graph host. An insights failure (typically: App Review still
 * pending) degrades that post's insight metrics to null — the sync
 * itself never fails over it.
 */
export async function fetchInstagramMedia(
  accessToken: string,
  igUserId: string,
  fetchImpl: FetchImpl = fetch,
  limit: number = INSTAGRAM_SYNC_LIMIT,
): Promise<SyncedPost[]> {
  const auth = { authorization: `Bearer ${accessToken}` };
  const body = await fetchJson(
    fetchImpl,
    `${FB_GRAPH_BASE}/${encodeURIComponent(igUserId)}/media?fields=id,caption,timestamp,permalink,media_type,like_count,comments_count&limit=${limit}`,
    { headers: auth },
  );
  const posts: SyncedPost[] = [];
  for (const item of asArray(body.data)) {
    const rec = asRecord(item);
    let insights = NO_INSIGHTS;
    if (rec && typeof rec.id === "string") {
      try {
        const insightsBody: Record<string, unknown> = await fetchJson(
          fetchImpl,
          `${FB_GRAPH_BASE}/${encodeURIComponent(rec.id)}/insights?metric=views,reach,shares,saved`,
          { headers: auth },
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
