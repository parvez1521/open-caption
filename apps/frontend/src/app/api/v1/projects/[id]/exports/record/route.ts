import { z } from "zod";
import { effectivePlanId } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { notFound, ok, parseBody, route, type Ctx } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";
import {
  VIDEO_MINUTES_KINDS,
  getMinutesUsage,
  settleReservation,
} from "@/lib/billing/minutes";

const Body = z.object({
  exportId: z.string().uuid(),
  kind: z.enum(VIDEO_MINUTES_KINDS),
  outcome: z.enum(["completed", "failed"]),
  actualMinutes: z.number().int().min(0).optional(),
});

/**
 * Settle a browser-rendered video's minutes reservation.
 *
 * This route used to be a post-hoc quota record (fire-and-forget, no
 * limit check at all). It is now the second half of reserve-then-settle:
 * the Studio reserves BEFORE rendering (exports/reserve) and settles
 * here after the file is saved ('completed') or when the render fails
 * or is cancelled ('failed'). Completion charges the actual rendered
 * minutes (capped at the reservation) and refunds the unused hold;
 * failure refunds the whole hold.
 *
 * A record with no reservation answers settled:false instead of an
 * error: the file is already saved on the user's device, so there is
 * nothing to undo — the video simply was not charged. That is the
 * honest limit of the browser path (see the reserve route): a modified
 * client can skip the reserve call, and the server cannot observe a
 * render that never touches it.
 *
 * Guests may settle too (browser MP4 has always been open to guests);
 * their minutes stay with the anonymous id and do not carry over on claim.
 */
export const POST = route(async (req: Request, { params }: Ctx<{ id: string }>) => {
  const user = await requireUser(req);
  const { id: projectId } = await params;
  const body = await parseBody(req, Body);

  const { data: project } = await user.db.from("projects").select("id").eq("id", projectId).is("deleted_at", null).maybeSingle();
  if (!project) throw notFound("Project");

  const admin = getAdmin();
  const settled = await settleReservation(admin, {
    ownerId: user.id,
    exportId: body.exportId,
    outcome: body.outcome,
    actualMinutes: body.actualMinutes,
  });
  if (!settled.settled) {
    console.error(JSON.stringify({ level: "warn", msg: "browser export settled with no reservation", exportId: body.exportId, reason: settled.reason ?? "unknown" }));
  }

  const { data: profile } = await user.db.from("profiles").select("plan, plan_expires_at").eq("id", user.id).maybeSingle();
  const plan = effectivePlanId(profile?.plan, (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at);
  let usage = null;
  try {
    usage = await getMinutesUsage(admin, user.id, plan, (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at ?? null);
  } catch {
    usage = null;
  }
  return ok({ settled: settled.settled, reason: settled.reason ?? null, minutesCharged: settled.minutesCharged, refunded: settled.refunded, usage }, 201);
});
