import { z } from "zod";
import { effectivePlanId } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ok, parseBody, route } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";
import { getMinutesUsage, settleReservation } from "@/lib/billing/minutes";

const Body = z.object({
  exportId: z.string().uuid(),
  outcome: z.enum(["completed", "failed"]),
  actualMinutes: z.number().int().min(0).optional(),
});

/**
 * Settle a project-less browser render's minutes reservation (Motion
 * Studio standalone export). 'completed' charges the actual rendered
 * minutes (capped at the reservation) and refunds the unused hold;
 * 'failed' refunds the whole hold. A settle with no reservation answers
 * settled:false instead of an error — the file is already saved on the
 * user's device, so there is nothing to undo.
 */
export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  const body = await parseBody(req, Body);

  const admin = getAdmin();
  const settled = await settleReservation(admin, {
    ownerId: user.id,
    exportId: body.exportId,
    outcome: body.outcome,
    actualMinutes: body.actualMinutes,
  });
  if (!settled.settled) {
    console.error(JSON.stringify({ level: "warn", msg: "standalone export settled with no reservation", exportId: body.exportId, reason: settled.reason ?? "unknown" }));
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
