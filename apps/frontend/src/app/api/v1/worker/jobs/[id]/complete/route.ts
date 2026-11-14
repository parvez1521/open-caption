import { CompleteBody } from "@capseasy/shared";
import { requireWorker } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route, type Ctx } from "@/lib/api/http";
import { logJobEvent, requireHeldJob } from "@/lib/api/jobs";
import { saveTranscription } from "@/lib/api/transcripts";
import { objectSize } from "@/lib/api/storage";
import { billedMinutesForDurationMs, settleReservation } from "@/lib/billing/minutes";
import { getAdmin } from "@/lib/supabase/admin";

const EXPORT_EXT: Record<string, string> = { mp4: "mp4", mov_alpha: "mov", webm_alpha: "webm", png: "png" };

/** Result paths are computed here, never trusted from the companion, and the object must really exist. */
async function verifiedPath(path: string): Promise<{ path: string; size: number }> {
  const size = await objectSize(path);
  if (size === null || size === 0) throw new ApiFailure("CONFLICT", "The uploaded file was not found. Upload it before completing the job.");
  return { path, size };
}

/** Idempotent: a retried call from the same companion after success is a no-op. */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const worker = await requireWorker(req);
  const { id } = await params;
  const body = await parseBody(req, CompleteBody);
  const job = await requireHeldJob(id, worker.id, { allowDone: true });
  if (job.status === "completed") return ok({ status: "completed", duplicate: true });
  if (job.kind !== body.kind) throw new ApiFailure("VALIDATION", `Result kind "${body.kind}" does not match job kind "${job.kind}"`);

  const admin = getAdmin();
  const now = new Date().toISOString();

  if (body.kind === "transcribe") {
    await saveTranscription(job, body);
  } else if (body.kind === "proxy") {
    const { videoId } = job.payload as { videoId: string };
    const { path } = await verifiedPath(`${job.owner_id}/${job.project_id}/preview/${videoId}.mp4`);
    await admin.from("videos").update({ preview_path: path, updated_at: now }).eq("id", videoId);
  } else if (body.kind === "thumbnail") {
    const { videoId } = job.payload as { videoId: string };
    const { path } = await verifiedPath(`${job.owner_id}/${job.project_id}/thumbs/${videoId}.jpg`);
    await admin.from("videos").update({ thumbnail_path: path, updated_at: now }).eq("id", videoId);
  } else {
    const { exportId, format } = job.payload as { exportId: string; format: string };
    const { path, size } = await verifiedPath(`${job.owner_id}/${job.project_id}/exports/${exportId}.${EXPORT_EXT[format] ?? "mp4"}`);
    await admin.from("exports").update({
      status_v2: "ready", status: "completed", storage_path: path, file_size: size,
      render_duration_ms: body.renderMs ? Math.round(body.renderMs) : null, duration_ms: body.durationMs ? Math.round(body.durationMs) : null, updated_at: now,
    }).eq("id", exportId);
    if (body.renderMs) await admin.from("usage_events").insert({ owner_id: job.owner_id, kind: "render_s", amount: Math.round(body.renderMs / 1000), project_id: job.project_id, job_id: id });
    // Minutes settle: the render happened, so the reservation converts to
    // a spend of the actual rendered minutes (never more than reserved)
    // and the unused hold is refunded. A settle that finds no
    // reservation is logged, not retried — the export is already ready.
    const settled = await settleReservation(admin, {
      ownerId: job.owner_id,
      exportId,
      outcome: "completed",
      actualMinutes: body.durationMs ? billedMinutesForDurationMs(body.durationMs) : undefined,
    });
    if (!settled.settled) {
      console.error(JSON.stringify({ level: "warn", msg: "render completed with no minutes reservation", exportId, reason: settled.reason ?? "unknown" }));
    }
  }

  await admin.from("jobs").update({ status: "completed", progress: 100, finished_at: now, result: body as unknown as Record<string, unknown>, lease_expires_at: null }).eq("id", id);
  await admin.from("workers").update({ current_job_id: null }).eq("id", worker.id);
  await logJobEvent(id, "completed", 100, `Completed ${body.kind}`);
  return ok({ status: "completed" });
});
