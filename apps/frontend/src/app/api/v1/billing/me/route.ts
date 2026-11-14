import { effectivePlanId } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ok, route } from "@/lib/api/http";
import { cashfreeConfig, currencyForCountry } from "@/lib/billing/cashfree";
import { getAdmin } from "@/lib/supabase/admin";
import { getMinutesUsage, type MinutesUsage } from "@/lib/billing/minutes";

/**
 * The billing page's data: the caller's effective plan (an expired paid
 * period reads as Free — the same rule the enforcement routes apply) and
 * their payment history as the invoice list. Payments are read through the
 * caller's own RLS client (owner-read policy); a not-yet-applied billing
 * table answers an empty list, not an error.
 */
export const GET = route(async (req: Request) => {
  const user = await requireUser(req);
  const cfg = cashfreeConfig();

  const { data: profile } = await user.db
    .from("profiles")
    .select("plan, plan_expires_at")
    .eq("id", user.id)
    .maybeSingle();
  const storedPlan = (profile?.plan as string | undefined) ?? "free";
  const expiresAt = (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at ?? null;

  const { data: payments, error } = await user.db
    .from("payments")
    .select("id, cf_order_id, cf_payment_id, plan, amount, currency, status, created_at, paid_at, period_start, period_end")
    .order("created_at", { ascending: false })
    .limit(50);

  // Minutes balance: null when the ledger table has not been applied
  // yet — the billing page hides the line instead of breaking.
  let minutes: MinutesUsage | null = null;
  try {
    minutes = await getMinutesUsage(getAdmin(), user.id, effectivePlanId(storedPlan, expiresAt), expiresAt);
  } catch {
    minutes = null;
  }

  return ok({
    configured: cfg.configured,
    env: cfg.env,
    currency: currencyForCountry(req.headers.get("x-vercel-ip-country")),
    plan: effectivePlanId(storedPlan, expiresAt),
    storedPlan,
    expiresAt,
    guest: user.guest,
    payments: error ? [] : (payments ?? []),
    dbPending: !!error,
    minutes,
  });
});
