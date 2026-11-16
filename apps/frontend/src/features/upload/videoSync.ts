"use client";

import { studioService } from "@/services/studio";
import { ensureRoomFor, saveLocalVideo } from "./localVideos";

/**
 * Cloud video sync: after the local save, a ≤50 MB copy of the video goes to
 * the account's storage (Supabase `media` bucket), so the project opens on
 * a second device instead of showing the upload screen. The local copy is
 * always the source of truth — a failed sync changes nothing on this device.
 *
 * Two steps, mirroring the upload flow: request a signed upload URL, PUT the
 * bytes straight to storage, then confirm so the server records the copy.
 * The signed URL already carries its token, so the PUT needs no extra auth.
 */

export type VideoSyncStatus = "unsynced" | "syncing" | "synced" | "too-large" | "failed";

export class VideoSyncError extends Error {
  constructor(
    public code: "too-large" | "upload-failed" | "confirm-failed" | "no-file",
    message: string,
  ) {
    super(message);
  }
}

/** What the header shows for a video that has never synced: too large, or ready to sync. */
export function syncStatusFor(opts: { cloudSynced?: boolean; size?: number | null; syncMaxBytes?: number | null }): VideoSyncStatus {
  if (opts.cloudSynced) return "synced";
  if (opts.size != null && opts.syncMaxBytes != null && opts.size > opts.syncMaxBytes) return "too-large";
  return "unsynced";
}

/** Send this device's copy of the video to the account's storage. Throws VideoSyncError on any failure. */
export async function syncVideoToCloud(opts: { videoId: string; file: Blob }): Promise<void> {
  const { videoId, file } = opts;
  const req = await studioService.requestVideoSync(videoId);
  // already playable from the server (an old upload, or a previous sync)
  if (req.synced) return;
  if (!req.uploadUrl) throw new VideoSyncError("upload-failed", "The server did not give an upload link. Try syncing again.");
  let res: Response;
  try {
    res = await fetch(req.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type || "video/mp4" } });
  } catch {
    throw new VideoSyncError("upload-failed", "The video could not be sent. Check your connection and try again.");
  }
  if (!res.ok) throw new VideoSyncError("upload-failed", "The video could not be sent. Try syncing again.");
  try {
    await studioService.confirmVideoSync(videoId);
  } catch {
    throw new VideoSyncError("confirm-failed", "The copy was sent but could not be confirmed. Try syncing again.");
  }
}

/**
 * Second device: pull the cloud copy into this browser's IndexedDB, so
 * generate-captions and export work here exactly as on the first device.
 * Best-effort — a failure just leaves the server stream in place.
 */
export async function cacheRemoteVideo(videoId: string, url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const blob = await res.blob();
    await ensureRoomFor(blob.size);
    await saveLocalVideo(videoId, blob);
    return true;
  } catch {
    return false;
  }
}
