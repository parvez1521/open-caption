import "server-only";
import { getAdmin } from "@/lib/supabase/admin";
import { isMissingTableError } from "@/lib/api/growth";
import { metaConfig, youtubeConfig, type ConnectPlatform } from "./config";
import {
  ConnectionStoreNotReady,
  getConnection,
  isMissingExternalIdError,
  touchLastSync,
  upsertConnection,
  type ConnectionRow,
} from "./store";
import { exchangeYoutubeCode, fetchYoutubeChannel, fetchYoutubeUploads, refreshYoutubeToken } from "./youtube";
import { exchangeInstagramCode, fetchInstagramAccount, fetchInstagramMedia, refreshInstagramToken } from "./instagram";
import type { FetchImpl, SyncedPost } from "./posts";

/**
 * Connect + sync orchestration (P1). Everything here runs server-side after
 * the caller is identified (signed OAuth state on the callback, requireUser
 * on the sync route). Synced posts land in the EXISTING growth_posts table
 * with source = the platform and external_id = the platform's post id, so a
 * re-sync updates figures in place. Disconnecting deletes only the
 * connection row — posts already synced are the user's data and stay.
 */

/** A failure the user can act on (expired sign-in, no channel, provider down). Message is safe to show. */
export class ProviderSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderSyncError";
  }
}

const providerFail = (platform: ConnectPlatform, err: unknown): ProviderSyncError =>
  new ProviderSyncError(
    err instanceof ProviderSyncError
      ? err.message
      : platform === "youtube"
        ? "YouTube could not be reached or refused the request — try Sync again, or disconnect and connect again."
        : "Instagram could not be reached or refused the request — try Sync again, or disconnect and connect again.",
  );

/** Refresh an expiring/expired access token in place; returns the row to use. */
async function ensureFreshToken(ownerId: string, conn: ConnectionRow, fetchImpl: FetchImpl): Promise<ConnectionRow> {
  const expiresAtMs = conn.expiresAt ? Date.parse(conn.expiresAt) : null;
  const stale = expiresAtMs !== null && expiresAtMs < Date.now() + 5 * 60 * 1000;
  if (!stale) return conn;
  try {
    if (conn.platform === "youtube") {
      const cfg = youtubeConfig();
      if (!cfg || !conn.refreshToken) return conn; // the read will surface any real failure
      const tokens = await refreshYoutubeToken({ config: cfg, refreshToken: conn.refreshToken, fetchImpl });
      const next: ConnectionRow = { ...conn, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt };
      await upsertConnection(ownerId, next);
      return next;
    }
    const cfg = metaConfig();
    if (!cfg) return conn;
    const tokens = await refreshInstagramToken({ config: cfg, accessToken: conn.accessToken, fetchImpl });
    const next: ConnectionRow = { ...conn, accessToken: tokens.accessToken, expiresAt: tokens.expiresAt };
    await upsertConnection(ownerId, next);
    return next;
  } catch (err) {
    if (err instanceof ConnectionStoreNotReady) throw err;
    if (expiresAtMs !== null && expiresAtMs < Date.now()) {
      throw new ProviderSyncError("The saved sign-in has expired — disconnect and connect the account again.");
    }
    return conn; // refresh failed but the current token is still within its life
  }
}

/** Upsert synced posts by (owner, source, external_id); returns how many rows were written. */
async function writeSyncedPosts(ownerId: string, posts: SyncedPost[]): Promise<number> {
  if (posts.length === 0) return 0;
  const db = getAdmin();
  const guardWrite = (error: { code?: string; message?: string } | null): void => {
    if (!error) return;
    if (isMissingTableError(error) || isMissingExternalIdError(error)) throw new ConnectionStoreNotReady();
    throw new Error(`growth_posts sync write failed: ${error.message ?? "unknown error"}`);
  };
  const { data: existing, error: lookupError } = await db
    .from("growth_posts")
    .select("id, external_id")
    .eq("owner_id", ownerId)
    .eq("source", posts[0]!.source)
    .in("external_id", posts.map((p) => p.externalId));
  guardWrite(lookupError);
  const byExternalId = new Map<string, string>();
  for (const row of (existing ?? []) as Array<{ id: string; external_id: string }>) {
    if (row.external_id) byExternalId.set(row.external_id, row.id);
  }
  let written = 0;
  for (const post of posts) {
    // Same column mapping as the posts routes' inserts, plus the sync stamps.
    const payload = {
      platform: post.platform,
      title: post.title,
      post_url: post.postUrl,
      posted_at: post.postedAt,
      views: post.views,
      reach: post.reach,
      likes: post.likes,
      comments: post.comments,
      shares: post.shares,
      saves: post.saves,
      source: post.source,
      external_id: post.externalId,
    };
    const existingId = byExternalId.get(post.externalId);
    const { error } = existingId
      ? await db.from("growth_posts").update(payload).eq("id", existingId).eq("owner_id", ownerId)
      : await db.from("growth_posts").insert({ owner_id: ownerId, ...payload });
    guardWrite(error);
    written += 1;
  }
  return written;
}

export interface SyncResult {
  platform: ConnectPlatform;
  accountName: string | null;
  synced: number;
}

/** Fetch the connected account's latest posts and write them into growth_posts. */
export async function syncConnection(ownerId: string, platform: ConnectPlatform, fetchImpl: FetchImpl = fetch): Promise<SyncResult> {
  const stored = await getConnection(ownerId, platform);
  if (!stored) throw new ProviderSyncError("This account is not connected.");
  const conn = await ensureFreshToken(ownerId, stored, fetchImpl);
  let posts: SyncedPost[];
  try {
    if (platform === "youtube") {
      const channel = await fetchYoutubeChannel(conn.accessToken, fetchImpl);
      if (!channel.uploadsPlaylistId) throw new ProviderSyncError("YouTube did not return an uploads list for this channel.");
      posts = await fetchYoutubeUploads(conn.accessToken, channel.uploadsPlaylistId, fetchImpl);
    } else {
      posts = await fetchInstagramMedia(conn.accessToken, conn.accountId, fetchImpl);
    }
  } catch (err) {
    if (err instanceof ConnectionStoreNotReady) throw err;
    throw providerFail(platform, err);
  }
  const synced = await writeSyncedPosts(ownerId, posts);
  await touchLastSync(ownerId, platform, new Date().toISOString());
  return { platform, accountName: conn.accountName, synced };
}

export interface ConnectResult {
  accountName: string | null;
  /** The connection is stored; only the first sync failed (the user can press Sync now). */
  syncFailed: boolean;
}

/** Callback step: exchange the code, store the connection, then a best-effort first sync. */
export async function connectYoutube(ownerId: string, code: string, redirectUri: string, fetchImpl: FetchImpl = fetch): Promise<ConnectResult> {
  const cfg = youtubeConfig();
  if (!cfg) throw new ProviderSyncError("YouTube connect is not switched on yet.");
  let channelTitle: string;
  try {
    const tokens = await exchangeYoutubeCode({ config: cfg, code, redirectUri, fetchImpl });
    const channel = await fetchYoutubeChannel(tokens.accessToken, fetchImpl);
    channelTitle = channel.title;
    await upsertConnection(ownerId, {
      platform: "youtube",
      accountId: channel.id,
      accountName: channel.title,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });
  } catch (err) {
    if (err instanceof ConnectionStoreNotReady) throw err;
    throw providerFail("youtube", err);
  }
  let syncFailed = false;
  try {
    await syncConnection(ownerId, "youtube", fetchImpl);
  } catch {
    syncFailed = true;
  }
  return { accountName: channelTitle, syncFailed };
}

/** Callback step for Instagram: same shape as YouTube (see connectYoutube). */
export async function connectInstagram(ownerId: string, code: string, redirectUri: string, fetchImpl: FetchImpl = fetch): Promise<ConnectResult> {
  const cfg = metaConfig();
  if (!cfg) throw new ProviderSyncError("Instagram connect is not switched on yet.");
  let username: string;
  try {
    const tokens = await exchangeInstagramCode({ config: cfg, code, redirectUri, fetchImpl });
    const account = await fetchInstagramAccount(tokens.accessToken, fetchImpl);
    username = account.username;
    await upsertConnection(ownerId, {
      platform: "instagram",
      accountId: account.igUserId,
      accountName: account.username,
      accessToken: tokens.accessToken,
      refreshToken: null, // Meta long-lived user tokens refresh by exchange, not a refresh token
      expiresAt: tokens.expiresAt,
    });
  } catch (err) {
    if (err instanceof ConnectionStoreNotReady) throw err;
    throw providerFail("instagram", err);
  }
  let syncFailed = false;
  try {
    await syncConnection(ownerId, "instagram", fetchImpl);
  } catch {
    syncFailed = true;
  }
  return { accountName: username, syncFailed };
}
