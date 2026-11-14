import { requireUser } from "@/lib/api/auth";
import { notFound, ok, route, type Ctx } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";
import { effectivePlanId } from "@capseasy/shared";
import { getWatermarkStatus } from "@/lib/billing/watermark";

/**
 * The watermark state for one project — the server-side truth the Studio
 * preview and the Export modal both render from, so the preview shows
 * exactly what the export will carry.
 *
 * - watermark: { text } when this project's MP4 exports carry the mark,
 *   null when they export clean (paid plan, or a ₹69 removal for this
 *   project).
 * - entitled: a paid ₹69 removal exists for this project.
 * - ready: false when the entitlement table is not applied yet — the
 *   removal checkout is not available then, and a Free project is
 *   watermarked (fail closed).
 * Guests read their own projects too: a guest is Free, so their MP4s
 * carry the mark until they sign up and buy the removal.
 */
export const GET = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id: projectId } = await params;
  const { data: project } = await user.db.from("projects").select("id").eq("id", projectId).is("deleted_at", null).maybeSingle();
  if (!project) throw notFound("Project");
  const { data: profile } = await user.db.from("profiles").select("plan, plan_expires_at").eq("id", user.id).maybeSingle();
  const plan = (profile?.plan as string | undefined) ?? "free";
  const expiresAt = (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at ?? null;
  const status = await getWatermarkStatus(getAdmin(), { ownerId: user.id, projectId, plan, expiresAt });
  return ok({ watermark: status.watermark, entitled: status.entitled, plan: effectivePlanId(plan, expiresAt), watermarkReady: status.ready });
});
