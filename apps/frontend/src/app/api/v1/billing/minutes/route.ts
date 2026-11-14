import { effectivePlanId } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, route } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";
import { getMinutesUsage } from "@/lib/billing/minutes";

/**
 * The caller's minutes balance: plan, granted, used, remaining, cycle
 * window. The Studio reads this before starting a browser render, and
 * the billing page shows it. A missing ledger table answers
 * minutes:null with minutesReady:false instead of an error.
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
    const usage = await getMinutesUsage(
      getAdmin(),
      user.id,
      plan,
      (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at ?? null,
    );
    return ok({ minutes: usage, minutesReady: true });
  } catch (e) {
    if (e instanceof ApiFailure) return ok({ minutes: null, minutesReady: false });
    throw e;
  }
});
