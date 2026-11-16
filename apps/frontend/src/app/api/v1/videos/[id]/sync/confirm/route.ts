import { rateLimit } from "@/lib/api/rateLimit";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, route, type Ctx } from "@/lib/api/http";
import { cloudVideoPath, objectSize } from "@/lib/api/storage";
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
  if (video.cloud_storage_path) return ok({ synced: true, videoId, path: video.cloud_storage_path });

  const path = cloudVideoPath(user.id, video.project_id, videoId, video.mime_type ?? "video/mp4", video.original_filename ?? "video.mp4");
  const size = await objectSize(path);
  if (size === null || size === 0) throw new ApiFailure("CONFLICT", "The cloud copy did not finish uploading. Try syncing again.");

  const now = new Date().toISOString();
  const { error } = await getAdmin()
    .from("videos")
    .update({ cloud_storage_path: path, cloud_synced_at: now, updated_at: now })
    .eq("id", videoId);
  if (error) throw new ApiFailure("INTERNAL", "Could not record the cloud copy", error.message);
  return ok({ synced: true, videoId, path });
});
