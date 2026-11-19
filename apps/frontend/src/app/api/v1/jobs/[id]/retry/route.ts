import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, route, type Ctx } from "@/lib/api/http";
import { logJobEvent, setProjectStatus } from "@/lib/api/jobs";
import { getAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/api/rateLimit";

export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "jobs_write", 60, 3600);
  const { id } = await params;
  const { data: job } = await user.db.from("jobs").select("id, status, kind, engine, project_id, payload").eq("id", id).maybeSingle();
  if (!job) throw notFound("Job");
  if (job.status !== "failed" && job.status !== "cancelled") throw new ApiFailure("CONFLICT", "Only failed or cancelled jobs can be retried.");

  const admin = getAdmin();
  await admin.from("jobs").update({
    status: "queued", ...(job.engine === "cloud" ? { engine: "local" } : {}), attempts: 0, error_code: null, error_message: null, cancel_requested: false, worker_id: null,
    // "now" by the database's clock: back-dated so a server clock running ahead can't hold the job back
    lease_expires_at: null, finished_at: null, progress: 0, run_after: new Date(Date.now() - 60_000).toISOString(),
  }).eq("id", id);
  if (job.kind === "render") {
    const exportId = (job.payload as { exportId?: string } | null)?.exportId;
    if (exportId) await admin.from("exports").update({ status_v2: "queued", status: "queued" }).eq("id", exportId);
  } else {
    await setProjectStatus(job.project_id, "processing");
  }
  await logJobEvent(id, "retry", 0, "Retried by user");
  return ok({ status: "queued" });
});
