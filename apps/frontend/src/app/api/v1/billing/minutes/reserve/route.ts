import { z } from "zod";
import { effectivePlanId } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ok, parseBody, route } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";
import { getMinutesUsage, reserveMinutes } from "@/lib/billing/minutes";

const Body = z.object({
  exportId: z.string().uuid(),
  kind: z.enum(["mp4", "webm", "webm_alpha"]),
  minutes: z.number().int().min(1).max(60),
  source: z.enum(["motion"]),
});

/**
 * Reserve minutes for a project-less browser render (Motion Studio
 * standalone export: no project is created, nothing is uploaded, no
 * sign-in is needed). The minutes come from the client (the animation's
 * own duration — there is no video row for the server to recompute
 * from), capped at 60, and the caller settles in the sibling settle
 * endpoint after the file is saved. Guests may reserve too, on the
 * anonymous id; their minutes do not carry over on claim.
 *
 * Honest limit, same as every browser render: the server cannot observe
 * a render that runs on the device. A modified client can skip this
 * call. Browser minutes are a deterrent on this path and a guarantee
 * only on the server path.
 */
export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  const body = await parseBody(req, Body);

  const admin = getAdmin();
  const { data: profile } = await user.db.from("profiles").select("plan, plan_expires_at").eq("id", user.id).maybeSingle();
  const plan = effectivePlanId(profile?.plan, (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at);
  const reservation = await reserveMinutes(admin, {
    ownerId: user.id,
    projectId: null,
    exportId: body.exportId,
    minutes: body.minutes,
    plan,
    expiresAt: (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at ?? null,
  });

  let usage = null;
  try {
    usage = await getMinutesUsage(admin, user.id, plan, (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at ?? null);
  } catch {
    usage = null;
  }
  return ok({ reservationKey: reservation.reservationKey, exportId: body.exportId, minutes: reservation.minutes, balance: reservation.balance, usage }, 201);
});
