import { rateLimit } from "@/lib/api/rateLimit";
import { ReplaceFootageBody, effectivePlanId, planFor } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";
import { uploadLimitLabel } from "@/lib/billing/pricingDisplay";

/**
 * Replace footage, keep captions: update the video row behind an existing video with the
 * new file's metadata. The client saves the new bytes in IndexedDB under the same video id.
 * Unlike registering a new video (which deletes the caption document and starts a fresh
 * transcription), this touches nothing but the video row — the captions, look and settings
 * stay exactly as they are. The cloud copy (if any) is cleared, so the existing Sync flow
 * offers to re-upload the new footage.
 *
 * Local videos only: a video uploaded to our servers still streams its old bytes to other
 * devices from its storage path, so swapping its local copy would leave two truths.
 */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id: videoId } = await params;
  await rateLimit(user.id, "upload", 60, 3600);
  const body = await parseBody(req, ReplaceFootageBody);

  const { data: video } = await user.db
    .from("videos")
    .select("id, project_id, owner_id, storage_path, status")
    .eq("id", videoId)
    .maybeSingle();
  if (!video || video.owner_id !== user.id) throw notFound("Video");

  const { data: project } = await user.db.from("projects").select("id").eq("id", video.project_id).is("deleted_at", null).maybeSingle();
  if (!project) throw notFound("Project");

  if (video.status === "uploading") throw new ApiFailure("CONFLICT", "The upload did not finish yet. Try again when it is done.");
  if (!video.storage_path.startsWith("local:")) {
    throw new ApiFailure(
      "CONFLICT",
      "This video was uploaded to our servers, so its footage can't be swapped on this device. Start fresh with new captions instead.",
    );
  }

  const { data: profile } = await user.db.from("profiles").select("plan, plan_expires_at").eq("id", user.id).maybeSingle();
  const limits = planFor(effectivePlanId(profile?.plan, (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at));
  if (body.size > limits.maxLocalBytes) {
    throw new ApiFailure("LIMIT_EXCEEDED", `This file is larger than your plan allows (${uploadLimitLabel(limits.maxLocalBytes)}).`, {
      maxUploadBytes: limits.maxLocalBytes,
    });
  }
  if (body.probe && body.probe.durationMs / 1000 > limits.maxDurationSec) {
    throw new ApiFailure("LIMIT_EXCEEDED", `Videos longer than ${Math.round(limits.maxDurationSec / 60)} minutes are not allowed on your plan.`, {
      maxDurationSec: limits.maxDurationSec,
    });
  }

  const p = body.probe;
  const { error } = await user.db
    .from("videos")
    .update({
      original_filename: body.filename,
      mime_type: body.mime,
      file_size: body.size,
      duration_ms: p ? Math.round(p.durationMs) : null,
      width: p?.width ?? null,
      height: p?.height ?? null,
      fps: p?.fps ? Math.round(p.fps) : null,
      rotation: p?.rotation ?? 0,
      video_codec: p?.videoCodec ?? null,
      audio_codec: p?.audioCodec ?? null,
      has_audio: p?.hasAudio ?? null,
      probe_json: p ?? null,
      // the cloud copy is the OLD footage now: clear it so the Sync flow re-uploads the new file
      cloud_storage_path: null,
      cloud_synced_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", videoId);
  if (error) throw new ApiFailure("INTERNAL", "Could not replace the video", error.message);
  return ok({ videoId });
});
