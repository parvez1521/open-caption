import { effectivePlanId } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, route } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";
import { getVideoQuotaUsage } from "@/lib/billing/videoQuota";

/**
 * The caller's monthly video quota: plan, limit, used, remaining, window.
 * The Studio reads this before starting a browser MP4 render (the render
 * happens on the user's device, so the server only gets to count it after
 * the fact — this read is the gate that stops the render at the limit).
 *
 * A missing quota table answers videoQuota:null with quotaReady:false
 * instead of an error: the render is allowed and simply not counted yet.
 */
export const GET = route(async (req: Request) => {
  const user = await requireUser(req);
  const { data: profile } = await user.db
    .from("profiles")
    .select("plan, plan_expires_at")
    .eq("id", user.id)
    .maybeSingle();
  const plan = effectivePlanId(profile?.plan, (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at);
  try {
    const usage = await getVideoQuotaUsage(
      getAdmin(),
      user.id,
      plan,
      (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at ?? null,
    );
    return ok({ videoQuota: usage, quotaReady: true });
  } catch (e) {
    if (e instanceof ApiFailure) return ok({ videoQuota: null, quotaReady: false });
    throw e;
  }
});
