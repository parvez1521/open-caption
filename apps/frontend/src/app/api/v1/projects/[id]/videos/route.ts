import { rateLimit } from "@/lib/api/rateLimit";
import { CreateVideoBody, VIDEO_MIME_TYPES, newId, effectivePlanId, planFor } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";
import { extFromMime, signedPut } from "@/lib/api/storage";

/** Step 1 of upload: validate against the plan, register the video, hand back a signed upload URL. */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id: projectId } = await params;
  await rateLimit(user.id, "upload", 60, 3600);
  const body = await parseBody(req, CreateVideoBody);

  const { data: project } = await user.db.from("projects").select("id").eq("id", projectId).is("deleted_at", null).maybeSingle();
  if (!project) throw notFound("Project");

  if (!(VIDEO_MIME_TYPES as readonly string[]).includes(body.mime)) {
    throw new ApiFailure("UNSUPPORTED_MEDIA", "Unsupported video type. Use MP4, MOV, WebM or MKV.");
  }
  const { data: profile } = await user.db.from("profiles").select("plan, plan_expires_at").eq("id", user.id).maybeSingle();
  const limits = planFor(effectivePlanId(profile?.plan, (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at));
  // on-device videos never reach our storage: the cap only protects the browser's own storage quota
  const cap = body.local ? limits.maxLocalBytes : limits.maxUploadBytes;
  if (body.size > cap) {
    throw new ApiFailure("LIMIT_EXCEEDED", `This file is larger than your plan allows (${Math.round(cap / 1048576)} MB).`, { maxUploadBytes: cap });
  }
  if (body.probe && body.probe.durationMs / 1000 > limits.maxDurationSec) {
    throw new ApiFailure("LIMIT_EXCEEDED", `Videos longer than ${Math.round(limits.maxDurationSec / 60)} minutes are not allowed on your plan.`, { maxDurationSec: limits.maxDurationSec });
  }

  const videoId = crypto.randomUUID();
  // on-device videos have no storage object: the path only marks them as local
  const path = body.local ? `local:${videoId}` : `${user.id}/${projectId}/source/${videoId}.${extFromMime(body.mime, body.filename)}`;
  const p = body.probe;
  const { error } = await user.db.from("videos").insert({
    id: videoId,
    project_id: projectId,
    owner_id: user.id,
    storage_path: path,
    status: "uploading",
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
  });
  if (error) throw new ApiFailure("INTERNAL", "Could not register the video", error.message);
  // a new video starts the project over: the old captions belonged to the old video and it is transcribed afresh
  const { error: docErr } = await user.db.from("caption_documents").delete().eq("project_id", projectId);
  if (docErr) throw new ApiFailure("INTERNAL", "Could not clear the old captions", docErr.message);

  if (body.local) return ok({ videoId, bucket: null, path, uploadUrl: null, token: null, uploadId: newId() }, 201);
  const up = await signedPut(path);
  return ok({ videoId, bucket: "media", path, uploadUrl: up.url, token: up.token, uploadId: newId() }, 201);
});
