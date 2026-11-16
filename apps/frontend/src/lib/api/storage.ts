import "server-only";
import { getAdmin } from "../supabase/admin";
import { ApiFailure } from "./http";

/** Legacy uploads (`projects/<id>/video.mp4`) live in the old private `videos` bucket; everything new is in `media`. */
export const bucketFor = (path: string) => (path.startsWith("projects/") ? "videos" : "media");

export const HOUR = 3600;

export async function signedGet(path: string, ttlSeconds = 6 * HOUR, downloadName?: string): Promise<string> {
  const { data, error } = await getAdmin()
    .storage.from(bucketFor(path))
    .createSignedUrl(path, ttlSeconds, downloadName ? { download: downloadName } : undefined);
  if (error || !data) throw new ApiFailure("UPSTREAM_FAILED", "Could not create a download link", error?.message);
  return data.signedUrl;
}

export async function signedPut(path: string, bucket = "media"): Promise<{ url: string; token: string }> {
  const { data, error } = await getAdmin().storage.from(bucket).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new ApiFailure("UPSTREAM_FAILED", "Could not create an upload link", error?.message);
  return { url: data.signedUrl, token: data.token };
}

export async function objectSize(path: string): Promise<number | null> {
  const { data } = await getAdmin().storage.from(bucketFor(path)).info(path);
  const size = (data as { size?: number } | null)?.size;
  return typeof size === "number" ? size : null;
}

export async function putObject(path: string, body: string | Uint8Array, contentType: string, bucket = "media") {
  const { error } = await getAdmin().storage.from(bucket).upload(path, body, { contentType, upsert: true });
  if (error) throw new ApiFailure("UPSTREAM_FAILED", "Could not store file", error.message);
}

export const extFromMime = (mime: string, filename: string): string => {
  const m: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/x-matroska": "mkv" };
  return m[mime] ?? (filename.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) ?? "mp4";
};

/**
 * Where a video's cloud copy lives in the `media` bucket: one deterministic
 * object per video, so a retried sync reuses (and overwrites) the same path
 * instead of orphaning a new object each time. The project id is the second
 * path segment, so the project-delete cleanup (which lists the user's
 * objects) finds it.
 */
export const cloudVideoPath = (ownerId: string, projectId: string, videoId: string, mime: string, filename: string): string =>
  `${ownerId}/${projectId}/cloud/${videoId}.${extFromMime(mime, filename)}`;
