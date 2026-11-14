import { effectivePlanId, ProjectSettingsSchema } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, route, type Ctx } from "@/lib/api/http";
import { logJobEvent, setProjectStatus } from "@/lib/api/jobs";
import { billedMinutesForRender, reserveMinutes } from "@/lib/billing/minutes";
import { getAdmin } from "@/lib/supabase/admin";

export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id } = await params;
  const { data: job } = await user.db.from("jobs").select("id, status, kind, engine, project_id, payload").eq("id", id).maybeSingle();
  if (!job) throw notFound("Job");
  if (job.status !== "failed" && job.status !== "cancelled") throw new ApiFailure("CONFLICT", "Only failed or cancelled jobs can be retried.");

  const admin = getAdmin();
  if (job.kind === "render") {
    // Minutes re-reserve: the failed attempt's hold was refunded when the
    // job failed, so a retry is a fresh attempt and must hold its minutes
    // again — otherwise a retry would render for free. The reserve is
    // idempotent per export, and a settled old reservation never blocks
    // the new hold (the SQL mints a suffixed key). Insufficient minutes
    // answer 402 and the job stays failed.
    const exportId = (job.payload as { exportId?: string; range?: { startMs: number; endMs: number } } | null)?.exportId;
    if (exportId) {
      const { data: project } = await user.db.from("projects").select("settings_json").eq("id", job.project_id).maybeSingle();
      const { data: video } = await user.db.from("videos").select("duration_ms").eq("project_id", job.project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const { data: profile } = await user.db.from("profiles").select("plan, plan_expires_at").eq("id", user.id).maybeSingle();
      if (video?.duration_ms) {
        const settings = ProjectSettingsSchema.parse((project as { settings_json?: unknown } | null)?.settings_json ?? {});
        await reserveMinutes(admin, {
          ownerId: user.id,
          projectId: job.project_id,
          exportId,
          minutes: billedMinutesForRender({
            sourceDurationMs: video.duration_ms,
            clipRange: settings.clipRange,
            segments: settings.composition?.videoSegments ?? null,
            range: (job.payload as { range?: { startMs: number; endMs: number } } | null)?.range ?? null,
          }),
          plan: effectivePlanId(profile?.plan, (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at),
          expiresAt: (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at ?? null,
        });
      }
    }
  }
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
