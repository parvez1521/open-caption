import { requireUser } from "@/lib/api/auth";
import { notFound, ok, route, type Ctx } from "@/lib/api/http";
import { logJobEvent } from "@/lib/api/jobs";
import { getAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/api/rateLimit";

/** Queued jobs cancel immediately; running jobs are flagged and the companion aborts on its next progress ping. */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  await rateLimit(user.id, "jobs_write", 60, 3600);
  const { id } = await params;
  const { data: job } = await user.db.from("jobs").select("id, status, kind, payload").eq("id", id).maybeSingle();
  if (!job) throw notFound("Job");
  const admin = getAdmin();
  if (job.status === "queued") {
    await admin.from("jobs").update({ status: "cancelled", finished_at: new Date().toISOString(), cancel_requested: true }).eq("id", id);
  } else if (job.status === "processing") {
    await admin.from("jobs").update({ cancel_requested: true }).eq("id", id);
  } else {
    return ok({ status: job.status });
  }
  if (job.kind === "render") {
    const exportId = (job.payload as { exportId?: string } | null)?.exportId;
    if (exportId) await admin.from("exports").update({ status_v2: "cancelled", status: "cancelled" }).eq("id", exportId);
  }
  await logJobEvent(id, "cancel", null, "Cancelled by user");
  return ok({ status: job.status === "queued" ? "cancelled" : "cancelling" });
});
