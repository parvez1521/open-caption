import { FailBody } from "@capseasy/shared";
import { requireWorker } from "@/lib/api/auth";
import { ok, parseBody, route, type Ctx } from "@/lib/api/http";
import { logJobEvent, requireHeldJob, setProjectStatus } from "@/lib/api/jobs";
import { settleReservation } from "@/lib/billing/minutes";
import { getAdmin } from "@/lib/supabase/admin";

export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const worker = await requireWorker(req);
  const { id } = await params;
  const body = await parseBody(req, FailBody);
  const job = await requireHeldJob(id, worker.id);
  const admin = getAdmin();
  const now = new Date().toISOString();

  // user cancellation acknowledged by the companion
  if (body.errorCode === "CANCELLED" || job.cancel_requested) {
    await admin.from("jobs").update({ status: "cancelled", finished_at: now, worker_id: null, lease_expires_at: null }).eq("id", id);
    await logJobEvent(id, "cancelled", null, "Cancelled");
    await admin.from("workers").update({ current_job_id: null }).eq("id", worker.id);
    // Minutes refund: a cancelled render never consumes minutes.
    if (job.kind === "render") {
      const exportId = (job.payload as { exportId?: string } | null)?.exportId;
      if (exportId) {
        await admin.from("exports").update({ status_v2: "cancelled", status: "cancelled" }).eq("id", exportId);
        await settleReservation(admin, { ownerId: job.owner_id, exportId, outcome: "cancelled" }).catch(() => {});
      }
    }
    return ok({ status: "cancelled" });
  }

  const willRetry = body.retryable && job.attempts < job.max_attempts;
  if (willRetry) {
    await admin.from("jobs").update({
      status: "queued", worker_id: null, lease_expires_at: null, error_code: body.errorCode, message: body.message,
      run_after: new Date(Date.now() + Math.min(job.attempts, 5) * 20_000).toISOString(),
    }).eq("id", id);
    await logJobEvent(id, "retry", null, `Will retry: ${body.message}`, "warn");
    // The reservation stays held: the same render will run again on the
    // same hold, so a retried render is never charged twice.
  } else {
    await admin.from("jobs").update({
      status: "failed", finished_at: now, worker_id: null, lease_expires_at: null, error_code: body.errorCode, error_message: body.message,
    }).eq("id", id);
    await logJobEvent(id, "failed", null, body.message, "error");
    if (job.kind === "render") {
      const exportId = (job.payload as { exportId?: string } | null)?.exportId;
      if (exportId) {
        await admin.from("exports").update({ status_v2: "failed", status: "failed" }).eq("id", exportId);
        // Minutes refund: a terminally failed render never consumes
        // minutes. A later manual retry re-reserves (see the retry route).
        await settleReservation(admin, { ownerId: job.owner_id, exportId, outcome: "failed" }).catch(() => {});
      }
    } else if (job.kind === "transcribe") {
      await setProjectStatus(job.project_id, "failed");
    }
  }
  await admin.from("workers").update({ current_job_id: null, last_error: body.message.slice(0, 500) }).eq("id", worker.id);
  return ok({ status: willRetry ? "queued" : "failed" });
});
