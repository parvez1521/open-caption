import { z } from "zod";
import { effectivePlanId, ProjectSettingsSchema } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";
import { VIDEO_MINUTES_KINDS, billedMinutesForRender, getMinutesUsage, reserveMinutes } from "@/lib/billing/minutes";
import { assertLookAllowedForPlan } from "@/lib/billing/looks";
import { getWatermarkStatus } from "@/lib/billing/watermark";

const Body = z.object({
  exportId: z.string().uuid(),
  kind: z.enum(VIDEO_MINUTES_KINDS),
  range: z.object({ startMs: z.number().min(0), endMs: z.number().min(1) }).optional(),
});

/**
 * Reserve minutes for a browser-rendered video BEFORE it renders.
 *
 * MP4s (and the Clipper batch) render on the user's device and never
 * touch the server exports route, so the Studio reserves here first and
 * settles in the record endpoint after the file is saved. The minutes
 * are computed server-side from the video row and the project settings
 * — the client never supplies a minutes number, only the trim range.
 * A duplicate exportId returns the existing reservation (no double
 * charge). Guests may reserve too (browser MP4 has always been open to
 * guests); their minutes live on the anonymous id and do not carry over
 * on claim — the same gap the old quota had.
 *
 * Honest limit: a modified client can skip this call and render anyway.
 * Browser minutes are a deterrent on this path and a guarantee only on
 * the server path.
 */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id: projectId } = await params;
  const body = await parseBody(req, Body);

  const { data: project } = await user.db.from("projects").select("id, look_id, settings_json").eq("id", projectId).is("deleted_at", null).maybeSingle();
  if (!project) throw notFound("Project");
  const { data: video } = await user.db.from("videos").select("duration_ms").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!video?.duration_ms) throw notFound("Video");

  const settings = ProjectSettingsSchema.parse((project as { settings_json?: unknown }).settings_json ?? {});
  const minutes = billedMinutesForRender({
    sourceDurationMs: video.duration_ms,
    clipRange: settings.clipRange,
    segments: settings.composition?.videoSegments ?? null,
    range: body.range ?? null,
  });

  const admin = getAdmin();
  const { data: profile } = await user.db.from("profiles").select("plan, plan_expires_at").eq("id", user.id).maybeSingle();
  const plan = effectivePlanId(profile?.plan, (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at);

  // Premium looks (monetization): a Free user may not reserve a browser
  // render for a project that uses a premium look — refused here, before
  // any minutes are held, with a clear error. The look is never silently
  // swapped. A modified client can skip this call on the browser path, so
  // this is a deterrent there and a guarantee only on the server path
  // (the exports route refuses the same look before queuing a job).
  assertLookAllowedForPlan(
    (project as { look_id?: string | null }).look_id,
    profile?.plan,
    (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at ?? null,
  );

  const reservation = await reserveMinutes(admin, {
    ownerId: user.id,
    projectId,
    exportId: body.exportId,
    minutes,
    plan,
    expiresAt: (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at ?? null,
  });

  // Watermark (monetization): the server decides, per project — the modal
  // renders with this value, so the browser MP4 carries exactly what the
  // preview showed. A modified client can skip this call on the browser
  // path, so this is a deterrent there and a guarantee only on the server
  // path (the job payload).
  const watermarkStatus = await getWatermarkStatus(admin, {
    ownerId: user.id,
    projectId,
    plan: profile?.plan,
    expiresAt: (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at ?? null,
  });

  let usage = null;
  try {
    usage = await getMinutesUsage(admin, user.id, plan, (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at ?? null);
  } catch {
    usage = null;
  }
  return ok({ reservationKey: reservation.reservationKey, exportId: body.exportId, minutes: reservation.minutes, balance: reservation.balance, usage, watermark: watermarkStatus.watermark }, 201);
});
