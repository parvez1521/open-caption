import { NextResponse } from "next/server";
import { ClaimBody, type JobPayload } from "@capseasy/shared";
import { requireWorker } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { LEASE_SECONDS, logJobEvent } from "@/lib/api/jobs";
import { HOUR, signedGet, signedPut } from "@/lib/api/storage";
import { getAdmin } from "@/lib/supabase/admin";

export const maxDuration = 60;

const EXPORT_EXT: Record<string, string> = { mp4: "mp4", mov_alpha: "mov", webm_alpha: "webm", png: "png" };

/** Atomically claim the next queued job for this user (FOR UPDATE SKIP LOCKED) and hand back signed URLs. */
export const POST = route(async (req: Request) => {
  const worker = await requireWorker(req);
  const { kinds, waitMs } = await parseBody(req, ClaimBody);
  const admin = getAdmin();

  // Companions >= 0.2.0 only call this when their heartbeat said there's work (waitMs 0: one check, no waiting).
  // Older ones long-poll (waitMs 20 s) and call again straight after a 204, so they're held here; checked every 5 s
  // (not every 750 ms: an idle old companion made ~25k database calls a day).
  const deadline = Date.now() + waitMs;
  let job = null;
  for (;;) {
    const { data: claimed, error } = await admin.rpc("claim_next_job", { p_worker: worker.id, p_kinds: kinds, p_lease_s: LEASE_SECONDS });
    if (error) throw new ApiFailure("INTERNAL", "Could not claim a job", error.message);
    job = Array.isArray(claimed) ? claimed[0] : claimed;
    if (job || Date.now() >= deadline || req.signal.aborted) break;
    await new Promise((r) => setTimeout(r, Math.min(5000, Math.max(0, deadline - Date.now()))));
  }
  if (!job) return new NextResponse(null, { status: 204 });

  const payload = job.payload as JobPayload;
  const videoId = payload.kind === "render" ? payload.sourceVideoId : "videoId" in payload ? payload.videoId : null;
  const { data: video } = videoId
    ? await admin.from("videos").select("id, owner_id, storage_path, width, height, fps, duration_ms, has_audio, rotation, mime_type").eq("id", videoId).maybeSingle()
    : { data: null };

  // MA-A7-002: the video id comes from job.payload, which the job's owner
  // can write themselves via direct PostgREST — never hand out another
  // owner's video bytes. A mismatch gives the job back and fails the claim.
  if (video && (video as { owner_id?: string }).owner_id !== job.owner_id) {
    await admin.from("jobs").update({ status: "queued", worker_id: null, lease_expires_at: null, attempts: Math.max(0, job.attempts - 1) }).eq("id", job.id);
    throw new ApiFailure("FORBIDDEN", "This job's video does not belong to its owner");
  }

  const urls: Record<string, string> = {};
  try {
    if (video?.storage_path) urls.sourceGet = await signedGet(video.storage_path, 6 * HOUR);
    if (payload.kind === "proxy" && video) urls.previewPut = (await signedPut(`${job.owner_id}/${job.project_id}/preview/${video.id}.mp4`)).url;
    if (payload.kind === "thumbnail" && video) urls.thumbnailPut = (await signedPut(`${job.owner_id}/${job.project_id}/thumbs/${video.id}.jpg`)).url;
    if (payload.kind === "render") urls.exportPut = (await signedPut(`${job.owner_id}/${job.project_id}/exports/${payload.exportId}.${EXPORT_EXT[payload.format]}`)).url;
  } catch (e) {
    // give the job back rather than stranding it until the lease expires
    await admin.from("jobs").update({ status: "queued", worker_id: null, lease_expires_at: null, attempts: Math.max(0, job.attempts - 1) }).eq("id", job.id);
    throw e;
  }

  await admin.from("workers").update({ current_job_id: job.id }).eq("id", worker.id);
  await logJobEvent(job.id, "claimed", 0, `Claimed by ${worker.name}`);
  return ok({
    job: { id: job.id, kind: job.kind, attempts: job.attempts, projectId: job.project_id, payload },
    media: video ? { width: video.width, height: video.height, fps: video.fps, durationMs: video.duration_ms, hasAudio: video.has_audio, rotation: video.rotation, mime: video.mime_type } : null,
    urls,
    leaseSeconds: LEASE_SECONDS,
  });
});
