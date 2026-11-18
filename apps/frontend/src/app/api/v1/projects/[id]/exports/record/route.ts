import { z } from "zod";
import { effectivePlanId } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";
import {
  VIDEO_QUOTA_KINDS,
  freeLaunchUsage,
  getVideoQuotaUsage,
  recordVideoQuotaEvent,
} from "@/lib/billing/videoQuota";
import { isFreeLaunchWindow } from "@/lib/billing/freeLaunch";

const Body = z.object({
  exportId: z.string().uuid(),
  kind: z.enum(VIDEO_QUOTA_KINDS),
});

/**
 * Record a browser-rendered MP4 as one finished video for the monthly quota.
 *
 * MP4s are rendered on the user's own device and never touch the server
 * exports route, so the Studio reports the finished render here — once,
 * keyed by the client-generated exportId, so a retry never counts twice.
 * Events stay with the caller's id and do not carry over on claim.
 *
 * PER-01-B: guests do NOT reach this route from the Studio — export is the
 * moment a guest creates their (free) account (StudioPage.openExport gates
 * every guest and every kind; the server exports route 403s guests for every
 * kind). An earlier version of this comment claimed the opposite ("browser
 * MP4 has always been open to guests"); that was false. This route itself
 * takes any authenticated caller, so a direct call from a guest token would
 * still record; that is only quota counting, never an export.
 *
 * A missing quota table answers recorded:false instead of an error: the
 * file is already saved on the user's device, so there is nothing to undo
 * — the video simply was not counted.
 */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id: projectId } = await params;
  const body = await parseBody(req, Body);

  const { data: project } = await user.db.from("projects").select("id").eq("id", projectId).is("deleted_at", null).maybeSingle();
  if (!project) throw notFound("Project");

  const admin = getAdmin();
  const { data: profile } = await user.db.from("profiles").select("plan, plan_expires_at").eq("id", user.id).maybeSingle();
  const plan = effectivePlanId(profile?.plan, (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at);
  const expiresAt = (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at ?? null;
  // Free launch window (owner, 2026-11-15): the finished video is NOT
  // counted — no quota event is written, so the window never eats a user's
  // monthly videos. recorded:false is honest here: nothing was recorded.
  if (isFreeLaunchWindow()) return ok({ recorded: false, usage: freeLaunchUsage(plan, expiresAt) });
  // recordVideoQuotaEvent answers recorded:false (never throws) when the
  // quota table has not been applied yet.
  const { recorded } = await recordVideoQuotaEvent(admin, {
    exportId: body.exportId,
    ownerId: user.id,
    projectId,
    kind: body.kind,
  });
  if (!recorded) return ok({ recorded: false, usage: null });

  let usage = null;
  try {
    usage = await getVideoQuotaUsage(admin, user.id, plan, expiresAt);
  } catch (e) {
    if (!(e instanceof ApiFailure)) throw e;
  }
  return ok({ recorded: true, usage }, 201);
});
