import type { JobPayload } from "@capseasy/shared";
import { requireWorker } from "@/lib/api/auth";
import { ApiFailure, ok, route, type Ctx } from "@/lib/api/http";
import { requireHeldJob } from "@/lib/api/jobs";
import { HOUR, signedGet, signedPut } from "@/lib/api/storage";
import { getAdmin } from "@/lib/supabase/admin";

const EXPORT_EXT: Record<string, string> = { mp4: "mp4", mov_alpha: "mov", webm_alpha: "webm", png: "png" };

/** Fresh signed URLs when a long job outlives the originals. */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const worker = await requireWorker(req);
  const { id } = await params;
  const job = await requireHeldJob(id, worker.id);
  const payload = job.payload as JobPayload;
  const videoId = payload.kind === "render" ? payload.sourceVideoId : "videoId" in payload ? payload.videoId : null;
  const { data: video } = videoId ? await getAdmin().from("videos").select("id, owner_id, storage_path").eq("id", videoId).maybeSingle() : { data: null };
  // MA-A7-002: same re-check as the claim route — the payload video id is
  // owner-writable, so never sign another owner's video.
  if (video && (video as { owner_id?: string }).owner_id !== job.owner_id) {
    throw new ApiFailure("FORBIDDEN", "This job's video does not belong to its owner");
  }

  const urls: Record<string, string> = {};
  if (video?.storage_path) urls.sourceGet = await signedGet(video.storage_path, 6 * HOUR);
  if (payload.kind === "proxy" && video) urls.previewPut = (await signedPut(`${job.owner_id}/${job.project_id}/preview/${video.id}.mp4`)).url;
  if (payload.kind === "render") urls.exportPut = (await signedPut(`${job.owner_id}/${job.project_id}/exports/${payload.exportId}.${EXPORT_EXT[payload.format]}`)).url;
  return ok({ urls });
});
