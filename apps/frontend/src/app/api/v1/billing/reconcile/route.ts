import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";
import { fetchCashfreeOrder } from "@/lib/billing/cashfree";
import { fetchCashfreeSubscription } from "@/lib/billing/cashfreeSubscriptions";
import { settleClosed, settlePaid, type PaymentRow } from "@/lib/billing/settle";
import { isWatermarkPayment, settleWatermarkPaid } from "@/lib/billing/watermark";
import {
  findSubscriptionByCfId,
  markSubscriptionCancelled,
  markSubscriptionExpired,
  markSubscriptionPastDue,
  markSubscriptionPaused,
  settleSubscriptionCycle,
  subscriptionActivationGrantKey,
  subscriptionCycleGrantKey,
} from "@/lib/billing/subscriptions";

const Body = z
  .object({ orderId: z.string().min(1).max(60).optional(), subscriptionId: z.string().min(1).max(60).optional() })
  .refine((v) => v.orderId || v.subscriptionId, { message: "orderId or subscriptionId is required" });

/**
 * "Check status" after returning from Cashfree checkout: asks Cashfree
 * (server-to-server) what really happened to the caller's own order or
 * subscription and settles from THAT — the browser's return parameters
 * are never trusted.
 *
 * Subscription reconcile: Cashfree is the truth. ACTIVE with a
 * not-yet-active row settles the first cycle (same activation grant
 * key the webhook uses, so the two agree); ACTIVE with a newer period
 * than the stored one grants the renewal cycle (keyed on the stored
 * period end, so it is deterministic); CANCELLED marks the row
 * cancelled and keeps access to period end; EXPIRED marks it expired.
 * A failed charge (past due at Cashfree) grants nothing.
 */
export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  const body = await parseBody(req, Body);

  const admin = getAdmin();

  if (body.subscriptionId) {
    const sub = await findSubscriptionByCfId(admin, body.subscriptionId);
    if (!sub || sub.owner_id !== user.id) throw new ApiFailure("NOT_FOUND", "Subscription not found");
    if (sub.status === "cancelled" || sub.status === "expired") {
      return ok({ subscription: sub });
    }
    const fetched = await fetchCashfreeSubscription(sub.cf_subscription_id);
    let settled = sub;
    if (fetched.status === "active") {
      const storedEnd = sub.period_end ? new Date(sub.period_end).getTime() : 0;
      const fetchedEnd = fetched.periodEnd ? new Date(fetched.periodEnd).getTime() : 0;
      if (sub.status === "initialized") {
        settled = await settleSubscriptionCycle(admin, sub, {
          periodStart: fetched.periodStart,
          periodEnd: fetched.periodEnd,
          chargeId: fetched.authorizationPaymentId,
          grantKey: subscriptionActivationGrantKey(sub.cf_subscription_id),
        });
      } else if (fetchedEnd > storedEnd) {
        // A newer cycle at Cashfree: grant it. The key is the stored
        // period end (the new cycle starts there), so a webhook for
        // the same renewal and this reconcile can never double-grant.
        settled = await settleSubscriptionCycle(admin, sub, {
          periodStart: sub.period_end,
          periodEnd: fetched.periodEnd,
          chargeId: null,
          grantKey: subscriptionCycleGrantKey(sub.cf_subscription_id, sub.period_end ?? fetched.periodStart ?? ""),
        });
      }
    } else if (fetched.status === "cancelled") {
      settled = await markSubscriptionCancelled(admin, sub);
    } else if (fetched.status === "expired") {
      settled = await markSubscriptionExpired(admin, sub, fetched.periodEnd);
    } else if (fetched.status === "paused") {
      settled = await markSubscriptionPaused(admin, sub);
    }
    return ok({ subscription: settled, cashfreeStatus: fetched.status });
  }

  const { data } = await admin.from("payments").select("*").eq("cf_order_id", body.orderId!).maybeSingle();
  const payment = data as PaymentRow | null;
  if (!payment || payment.owner_id !== user.id) throw new ApiFailure("NOT_FOUND", "Payment not found");
  if (payment.status === "paid" || payment.status === "failed" || payment.status === "expired" || payment.status === "refunded") {
    return ok({ payment });
  }

  const fetched = await fetchCashfreeOrder(payment.cf_order_id);
  let settled = payment;
  if (fetched.status === "PAID") {
    // Watermark orders settle to an entitlement, never a plan.
    settled = isWatermarkPayment(payment) ? await settleWatermarkPaid(admin, payment, fetched.paymentId) : await settlePaid(admin, payment, fetched.paymentId);
  } else if (fetched.status === "EXPIRED") settled = await settleClosed(admin, payment, "expired");
  return ok({ payment: settled, cashfreeStatus: fetched.status });
});
