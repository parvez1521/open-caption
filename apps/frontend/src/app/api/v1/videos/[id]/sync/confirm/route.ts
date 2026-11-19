import { rateLimit } from "@/lib/api/rateLimit";
import { effectivePlanId, syncCapBytes } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, route, type Ctx } from "@/lib/api/http";
import { cloudVideoPath, verifyUploadedVideo } from "@/lib/api/storage";
import { getAdmin } from "@/lib/supabase/admin";

/**
 * Step 2 of cloud sync: confirm the object really landed in storage, then
 * record its path on the video row so the studio read serves it to a second
 * device. Idempotent: confirming an already-synced video answers synced:true
 * without writing again.
 */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id: videoId } = await params;
  await rateLimit(user.id, "sync", 60, 3600);

  const { data: video } = await user.db
    .from("videos")
    .select("id, project_id, storage_path, cloud_storage_path, mime_type, original_filename")
    .eq("id", videoId)
    .maybeSingle();
  if (!video) throw notFound("Video");
  const { data: profile } = await user.db.from("profiles").select("plan, plan_expires_at").eq("id", user.id).maybeSingle();
  const cap = syncCapBytes(effectivePlanId(profile?.plan, (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at));
  // MA-A7-001: a non-null cloud_storage_path is a stale pointer if the
  // object was swept from storage — do not answer synced:true for it.
  // Verify the object still exists; if it is gone, clear the pointer and
  // fall through so the fresh upload below can be recorded instead.
  // MA-A6-002 / MA-A7-019: the same verify also enforces the sync cap and
  // the video content type on the stored copy — an oversize or non-video
  // object is rejected and deleted, never recorded as the cloud copy.
  if (video.cloud_storage_path) {
    const verified = await verifyUploadedVideo(video.cloud_storage_path, { capBytes: cap, declaredSize: video.file_size }).catch(async (e) => {
      if (e instanceof ApiFailure && e.code === "CONFLICT") return null;
      throw e;
    });
    if (verified !== null) return ok({ synced: true, videoId, path: video.cloud_storage_path });
    const clearedAt = new Date().toISOString();
    await getAdmin()
      .from("videos")
      .update({ cloud_storage_path: null, cloud_synced_at: null, updated_at: clearedAt })
      .eq("id", videoId);
  }

  const path = cloudVideoPath(user.id, video.project_id, videoId, video.mime_type ?? "video/mp4", video.original_filename ?? "video.mp4");
  await verifyUploadedVideo(path, { capBytes: cap, declaredSize: video.file_size });

  const now = new Date().toISOString();
  const { error } = await getAdmin()
    .from("videos")
    .update({ cloud_storage_path: path, cloud_synced_at: now, updated_at: now })
    .eq("id", videoId);
  if (error) throw new ApiFailure("INTERNAL", "Could not record the cloud copy", error.message);
  return ok({ synced: true, videoId, path });
});
