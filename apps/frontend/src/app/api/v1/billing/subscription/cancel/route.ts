import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";
import { cashfreeConfig } from "@/lib/billing/cashfree";
import { cancelCashfreeSubscription } from "@/lib/billing/cashfreeSubscriptions";
import { findSubscriptionByCfId, markSubscriptionCancelled, type SubscriptionRow } from "@/lib/billing/subscriptions";

const Body = z.object({ subscriptionId: z.string().min(1).max(60) });

/**
 * Cancel the caller's own subscription. Cashfree is cancelled first,
 * then the local row is marked cancelled. Access is kept until the
 * end of the paid period — cancelling only stops the next charge.
 * The billing page has no cancel button yet (follow-up): until it
 * does, this route is the cancel path for support use.
 */
export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  const body = await parseBody(req, Body);

  const cfg = cashfreeConfig();
  if (!cfg.configured) return ok({ configured: false as const });

  const admin = getAdmin();
  const sub: SubscriptionRow | null = await findSubscriptionByCfId(admin, body.subscriptionId);
  if (!sub || sub.owner_id !== user.id) throw new ApiFailure("NOT_FOUND", "Subscription not found");
  if (sub.status === "cancelled" || sub.status === "expired") {
    return ok({ subscription: sub });
  }

  try {
    await cancelCashfreeSubscription(sub.cf_subscription_id);
  } catch (e) {
    throw new ApiFailure("INTERNAL", e instanceof Error ? e.message : "Could not cancel the subscription.");
  }
  const cancelled = await markSubscriptionCancelled(admin, sub);
  return ok({ subscription: cancelled });
});
