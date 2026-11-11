import "server-only";
import type { YoutubeConfig } from "./config";
import { asArray, asRecord, clampTitle, fetchJson, parseCount, type FetchImpl, type SyncedPost } from "./posts";

/**
 * YouTube connect (P1): Google OAuth 2.0 + YouTube Data API v3, read-only.
 *
 * Scope: `youtube.readonly` is the lightest scope that can read the channel,
 * its uploads and per-video statistics. Nothing here writes to YouTube.
 * Token exchange/refresh and every read happen server-side; the access token
 * lives only in growth_connections (see store.ts) and in these requests.
 */

export const YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.readonly"] as const;

const AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://youtube.googleapis.com/youtube/v3";

export function youtubeAuthUrl(args: { config: YoutubeConfig; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: args.config.clientId,
    redirect_uri: args.redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: args.state,
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

export interface YoutubeTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}

function tokensFrom(body: Record<string, unknown>, previousRefresh: string | null): YoutubeTokens {
  const accessToken = typeof body.access_token === "string" ? body.access_token : null;
  if (!accessToken) throw new Error("Google did not return an access token");
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : null;
  return {
    accessToken,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : previousRefresh,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
  };
}

export async function exchangeYoutubeCode(args: {
  config: YoutubeConfig;
  code: string;
  redirectUri: string;
  fetchImpl?: FetchImpl;
}): Promise<YoutubeTokens> {
  const body = await fetchJson(args.fetchImpl ?? fetch, TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: args.code,
      client_id: args.config.clientId,
      client_secret: args.config.clientSecret,
      redirect_uri: args.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  return tokensFrom(body, null);
}

export async function refreshYoutubeToken(args: {
  config: YoutubeConfig;
  refreshToken: string;
  fetchImpl?: FetchImpl;
}): Promise<YoutubeTokens> {
  const body = await fetchJson(args.fetchImpl ?? fetch, TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: args.refreshToken,
      client_id: args.config.clientId,
      client_secret: args.config.clientSecret,
      grant_type: "refresh_token",
    }).toString(),
  });
  return tokensFrom(body, args.refreshToken);
}

const authHeaders = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

export interface YoutubeChannel {
  id: string;
  title: string;
  uploadsPlaylistId: string | null;
}

export async function fetchYoutubeChannel(accessToken: string, fetchImpl: FetchImpl = fetch): Promise<YoutubeChannel> {
  const body = await fetchJson(
    fetchImpl,
    `${API_BASE}/channels?part=snippet,contentDetails&mine=true`,
    { headers: authHeaders(accessToken) },
  );
  const first = asRecord(asArray(body.items)[0]);
  if (!first || typeof first.id !== "string") throw new Error("YouTube did not return a channel for this account");
  const snippet = asRecord(first.snippet);
  const contentDetails = asRecord(first.contentDetails);
  const related = asRecord(contentDetails?.relatedPlaylists);
  return {
    id: first.id,
    title: typeof snippet?.title === "string" ? snippet.title : "YouTube channel",
    uploadsPlaylistId: typeof related?.uploads === "string" ? related.uploads : null,
  };
}

/** PURE mapper: one videos.list item → a growth row (null when the item has no usable id/date). */
export function mapYoutubeVideo(item: unknown): SyncedPost | null {
  const rec = asRecord(item);
  if (!rec || typeof rec.id !== "string" || !rec.id) return null;
  const snippet = asRecord(rec.snippet);
  const statistics = asRecord(rec.statistics);
  const publishedAt = typeof snippet?.publishedAt === "string" ? snippet.publishedAt : null;
  if (!publishedAt || Number.isNaN(Date.parse(publishedAt))) return null;
  return {
    externalId: rec.id,
    source: "youtube",
    platform: "youtube",
    title: clampTitle(typeof snippet?.title === "string" ? snippet.title : ""),
    postUrl: `https://www.youtube.com/watch?v=${rec.id}`,
    postedAt: new Date(publishedAt).toISOString(),
    views: parseCount(statistics?.viewCount),
    reach: null, // YouTube Data API v3 does not expose per-video reach
    likes: parseCount(statistics?.likeCount),
    comments: parseCount(statistics?.commentCount),
    shares: null, // not exposed per-video by the Data API
    saves: null,
  };
}

export interface YoutubeUploadsResult {
  /** Every upload the walk mapped to a post, newest first (the uploads playlist's own order). */
  posts: SyncedPost[];
  /** The uploads playlist's pageInfo.totalResults, as YouTube reports it (null when unreported). */
  totalResults: number | null;
  /** How many video ids the playlist walk collected, before statistics mapping. */
  walkedIds: number;
}

/**
 * ALL of the channel's uploads with their statistics, newest first.
 *
 * The uploads playlist is walked page by page (50 ids per playlistItems
 * call — the API's page size, not a product limit) until YouTube stops
 * handing out a nextPageToken; each page's statistics are then read with
 * videos.list in batches of 50. Everything in the uploads playlist comes
 * along — Shorts are ordinary uploads there and nothing here filters by
 * duration, title or anything else (only snippet+statistics are even
 * requested, so there is no duration field to filter on).
 *
 * `onPosts` fires per page, after that page's statistics land, so a caller
 * can persist progress page by page: if a later page fails, this throws,
 * but pages already handed to onPosts are the caller's to keep — a failed
 * sync never takes back what an earlier page brought in.
 */
export async function fetchYoutubeUploads(
  accessToken: string,
  uploadsPlaylistId: string,
  fetchImpl: FetchImpl = fetch,
  onPosts?: (posts: SyncedPost[]) => void | Promise<void>,
): Promise<YoutubeUploadsResult> {
  const posts: SyncedPost[] = [];
  let totalResults: number | null = null;
  let walkedIds = 0;
  let pageToken: string | null = null;
  const seenTokens = new Set<string>();
  do {
    const url = `${API_BASE}/playlistItems?part=contentDetails&maxResults=50&playlistId=${encodeURIComponent(uploadsPlaylistId)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const body: Record<string, unknown> = await fetchJson(fetchImpl, url, { headers: authHeaders(accessToken) });
    if (totalResults === null) {
      const pageInfo = asRecord(body.pageInfo);
      totalResults = parseCount(pageInfo?.totalResults);
    }
    const ids: string[] = [];
    for (const entry of asArray(body.items)) {
      const details = asRecord(asRecord(entry)?.contentDetails);
      if (details && typeof details.videoId === "string") ids.push(details.videoId);
    }
    walkedIds += ids.length;
    const pagePosts: SyncedPost[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const stats: Record<string, unknown> = await fetchJson(
        fetchImpl,
        `${API_BASE}/videos?part=snippet,statistics&id=${chunk.map(encodeURIComponent).join(",")}`,
        { headers: authHeaders(accessToken) },
      );
      for (const item of asArray(stats.items)) {
        const post = mapYoutubeVideo(item);
        if (post) pagePosts.push(post);
      }
    }
    posts.push(...pagePosts);
    if (onPosts && pagePosts.length > 0) await onPosts(pagePosts);
    const next = typeof body.nextPageToken === "string" ? body.nextPageToken : null;
    // Loop safety only: if the API ever hands back a token already seen,
    // stop instead of paging forever. This is not a content cap — distinct
    // pages are walked without any count limit.
    pageToken = next && !seenTokens.has(next) ? next : null;
    if (next) seenTokens.add(next);
  } while (pageToken);
  return { posts, totalResults, walkedIds };
}
