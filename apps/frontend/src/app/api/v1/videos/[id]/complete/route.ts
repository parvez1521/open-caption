import { CompleteVideoBody } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { openSilentVideo, openWithoutCaptions } from "@/lib/api/transcripts";
import { startTranscription } from "@/lib/api/engine";
import { ApiFailure, notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";
import { enqueueJob } from "@/lib/api/jobs";
import { objectSize } from "@/lib/api/storage";
import { getAdmin } from "@/lib/supabase/admin";

export const maxDuration = 300;

/** Step 2 of upload: confirm the object really exists, then start transcription (in the browser or the desktop helper). */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id: videoId } = await params;
  const body = await parseBody(req, CompleteVideoBody);

  const { data: video } = await user.db.from("videos").select("id, project_id, storage_path, status, file_size, has_audio").eq("id", videoId).maybeSingle();
  if (!video) throw notFound("Video");

  const local = video.storage_path.startsWith("local:");
  const size = local ? video.file_size : await objectSize(video.storage_path);
  if (size === null || size === 0) throw new ApiFailure("CONFLICT", "The upload did not finish. Please try again.");
  await getAdmin().from("videos").update({ status: "uploaded", file_size: size, uploaded_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", videoId);

  // checked on the device before upload: no sound means nothing to transcribe, open the editor to type captions
  if (video.has_audio === false) {
    await openSilentVideo({ projectId: video.project_id, ownerId: user.id, videoId });
    return ok({ jobId: null, engine: "none", companionOnline: false, cloudAvailable: false, noAudio: true });
  }

  // Package 2 item G — the "Normal Editor" door: no transcription job at all; the project
  // opens in the editor with an empty caption document (captions can be generated later
  // from the Captions panel, which starts the same transcription this route would have).
  if (body.editorMode === true) {
    await openWithoutCaptions({ projectId: video.project_id, ownerId: user.id });
    return ok({ jobId: null, engine: "none", companionOnline: false, cloudAvailable: false, noAudio: false, editorMode: true });
  }

  // idempotent per video: a retried "complete" returns the same job
  const r = await startTranscription({ ownerId: user.id, projectId: video.project_id, videoId, idempotencyKey: `transcribe:${videoId}` });
  if (body.needsProxy) {
    await enqueueJob({ ownerId: user.id, projectId: video.project_id, kind: "proxy", payload: { kind: "proxy", videoId, targetHeight: 720 }, idempotencyKey: `proxy:${videoId}`, priority: 1 });
  }
  return ok(r);
});
