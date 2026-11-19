import { rateLimit } from "@/lib/api/rateLimit";
import { effectivePlanId, syncCapBytes } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, route, type Ctx } from "@/lib/api/http";
import { cloudVideoPath, objectSize, signedPut } from "@/lib/api/storage";
import { getAdmin } from "@/lib/supabase/admin";

/**
 * Step 1 of cloud sync: hand back a signed upload URL for this video's cloud
 * copy. The copy is capped at syncCapBytes (50 MB on the Supabase Free tier,
 * whatever the plan allows) and never touches the local copy or the captions:
 * syncing must not re-register the video (registering deletes the captions).
 * A video that already has a server copy — an old upload, or an already
 * synced one — answers synced:true with nothing to upload.
 */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id: videoId } = await params;
  await rateLimit(user.id, "sync", 60, 3600);

  const { data: video } = await user.db
    .from("videos")
    .select("id, project_id, storage_path, cloud_storage_path, status, file_size, mime_type, original_filename")
    .eq("id", videoId)
    .maybeSingle();
  if (!video) throw notFound("Video");
  if (video.status === "uploading") throw new ApiFailure("CONFLICT", "The upload did not finish yet. Try syncing again when it is done.");

  const { data: profile } = await user.db.from("profiles").select("plan, plan_expires_at").eq("id", user.id).maybeSingle();
  const cap = syncCapBytes(effectivePlanId(profile?.plan, (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at));

  // already playable from the server: an old server upload, or a previous sync.
  // MA-A7-001: never trust a non-null cloud_storage_path on its own — the
  // daily cleanup used to delete live cloud copies, leaving a stale pointer
  // that answered synced:true for an object that no longer exists. Verify
  // the object is still there; if it is gone, clear the pointer and fall
  // through so the video can be synced again instead of reporting success.
  if (video.cloud_storage_path) {
    const cloudSize = await objectSize(video.cloud_storage_path);
    if (cloudSize !== null && cloudSize > 0) return ok({ synced: true, videoId, path: video.cloud_storage_path, syncCapBytes: cap });
    const now = new Date().toISOString();
    await getAdmin()
      .from("videos")
      .update({ cloud_storage_path: null, cloud_synced_at: null, updated_at: now })
      .eq("id", videoId);
  }
  if (!video.storage_path.startsWith("local:")) return ok({ synced: true, videoId, path: video.storage_path, syncCapBytes: cap });

  if (video.file_size == null) throw new ApiFailure("CONFLICT", "This video has no recorded size, so sync can't check the cap. Re-upload it to sync.");
  if (video.file_size > cap) {
    throw new ApiFailure("LIMIT_EXCEEDED", "This video is too large to sync to your account.", { syncCapBytes: cap, fileSize: video.file_size });
  }

  const path = cloudVideoPath(user.id, video.project_id, videoId, video.mime_type ?? "video/mp4", video.original_filename ?? "video.mp4");
  const up = await signedPut(path);
  return ok({ synced: false, videoId, uploadUrl: up.url, token: up.token, path, syncCapBytes: cap });
});
