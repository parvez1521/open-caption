import "server-only";
import { VIDEO_MIME_TYPES } from "@capseasy/shared";
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
  const meta = await objectMeta(path);
  return meta?.size ?? null;
}

/**
 * MA-A6-002: size + stored content-type of an object, from storage itself —
 * never the client-declared size. `info()` returns the size at the top level
 * in some SDK versions and inside `metadata` in others, so both shapes are
 * read; the same goes for the content type.
 */
export async function objectMeta(path: string): Promise<{ size: number; contentType: string | null } | null> {
  const { data } = await getAdmin().storage.from(bucketFor(path)).info(path);
  const d = data as { size?: number; mimetype?: string | null; contentType?: string | null; metadata?: { size?: number; mimetype?: string | null; contentType?: string | null } | null } | null;
  if (!d) return null;
  const size = typeof d.size === "number" ? d.size : typeof d.metadata?.size === "number" ? d.metadata.size : null;
  if (size === null) return null;
  const contentType = d.mimetype ?? d.contentType ?? d.metadata?.mimetype ?? d.metadata?.contentType ?? null;
  return { size, contentType };
}

/** Remove one object (used to drop an upload that fails the confirm-time checks). */
export async function deleteObject(path: string): Promise<void> {
  const { error } = await getAdmin().storage.from(bucketFor(path)).remove([path]);
  if (error) throw new ApiFailure("UPSTREAM_FAILED", "Could not remove the uploaded file", error.message);
}

/**
 * MA-A6-002: confirm-time verification of an uploaded video object, against
 * storage itself — never the client-declared size. Rejects (and deletes the
 * object) when the real object is missing/empty, larger than the plan cap,
 * larger than the declared size by more than a small tolerance (the declared
 * size is what the registration cap check ran against, so a big mismatch
 * means the client understated it), or stored with a non-video content type.
 * Returns the verified size + content type for the caller to record.
 */
export async function verifyUploadedVideo(
  path: string,
  opts: { capBytes: number; declaredSize?: number | null },
): Promise<{ size: number; contentType: string | null }> {
  const meta = await objectMeta(path);
  if (!meta || meta.size === 0) throw new ApiFailure("CONFLICT", "The upload did not finish. Please try again.");
  const reject = async (code: "LIMIT_EXCEEDED" | "UNSUPPORTED_MEDIA", message: string): Promise<never> => {
    await deleteObject(path).catch(() => {});
    throw new ApiFailure(code, message);
  };
  if (meta.size > opts.capBytes) {
    await reject("LIMIT_EXCEEDED", "The uploaded file is larger than your plan allows. The upload was removed — try a smaller file.");
  }
  if (opts.declaredSize != null) {
    const tolerance = Math.max(1024 * 1024, Math.round(opts.declaredSize * 0.1));
    if (meta.size > opts.declaredSize + tolerance) {
      await reject("LIMIT_EXCEEDED", "The uploaded file is much larger than the size it was registered with. The upload was removed — try again.");
    }
  }
  if (meta.contentType !== null && !(VIDEO_MIME_TYPES as readonly string[]).includes(meta.contentType)) {
    await reject("UNSUPPORTED_MEDIA", "The uploaded file is not a video. The upload was removed — use MP4, MOV, WebM or MKV.");
  }
  return meta;
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
 * MA-A7-005: the DB-level owner rule for storage paths, mirrored in code
 * (see supabase/APPLY-A7-002-STORAGE-PATH-PREFIX.sql). A videos row may
 * only carry a path under its owner's id, a `local:` marker (on-device
 * video, no object), or a legacy `projects/` path; an exports row may
 * only carry a path under its owner's id (null = not rendered yet).
 * The predicates match the CHECKs exactly, so the write sites can fail
 * honestly here instead of tripping the constraint, and the download
 * read-gate shares the same definition of "own path" (the studio
 * read-gate stays stricter for legacy paths — only this project/video's
 * `projects/<id>/video.mp4` — and is intentionally not folded into this).
 */
export const isOwnVideoStoragePath = (path: string, ownerId: string): boolean =>
  path.startsWith(`${ownerId}/`) || path.startsWith("local:") || path.startsWith("projects/");

export const isOwnExportStoragePath = (path: string | null, ownerId: string): boolean =>
  path === null || path.startsWith(`${ownerId}/`);

/** Fail honestly at the write site when a path would violate the MA-A7-005 CHECK. */
export function assertOwnVideoStoragePath(path: string, ownerId: string): void {
  if (!isOwnVideoStoragePath(path, ownerId)) {
    throw new ApiFailure("INTERNAL", "Refusing to record a video path outside the owner's storage");
  }
}

export function assertOwnExportStoragePath(path: string | null, ownerId: string): void {
  if (!isOwnExportStoragePath(path, ownerId)) {
    throw new ApiFailure("INTERNAL", "Refusing to record an export path outside the owner's storage");
  }
}

/**
 * Where a video's cloud copy lives in the `media` bucket: one deterministic
 * object per video, so a retried sync reuses (and overwrites) the same path
 * instead of orphaning a new object each time. The project id is the second
 * path segment, so the project-delete cleanup (which lists the user's
 * objects) finds it.
 */
export const cloudVideoPath = (ownerId: string, projectId: string, videoId: string, mime: string, filename: string): string =>
  `${ownerId}/${projectId}/cloud/${videoId}.${extFromMime(mime, filename)}`;
