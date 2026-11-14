import { getAdmin } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/billing/cashfree";
import { findPaymentByOrderId, settleClosed, settlePaid } from "@/lib/billing/settle";
import { isWatermarkPayment, settleWatermarkPaid, settleWatermarkRefunded } from "@/lib/billing/watermark";
import {
  findSubscriptionByCfId,
  findWebhookEvent,
  markSubscriptionCancelled,
  markSubscriptionExpired,
  markSubscriptionPastDue,
  markSubscriptionPaused,
  recordSubscriptionRefund,
  recordWebhookEvent,
  settlePlanRefunded,
  settleSubscriptionCycle,
  subscriptionActivationGrantKey,
  subscriptionChargeGrantKey,
  webhookEventKey,
  type SubscriptionRow,
} from "@/lib/billing/subscriptions";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cashfree webhook — the ONLY channel that can grant a plan, a
 * watermark removal, or subscription minutes on its own.
 * The signature is verified against the RAW body bytes before anything is
 * parsed (Cashfree signs timestamp + raw payload). Unknown orders and
 * already-settled payments answer 200 so Cashfree stops retrying; a bad
 * signature answers 401 and changes nothing.
 *
 * Configure this URL in the Cashfree dashboard:
 *   <site>/api/v1/billing/webhook
 * under BOTH the Payment Gateway tab (PAYMENT_* + REFUND_SUCCESS) and
 * the Subscriptions tab (SUBSCRIPTION_*), webhook version 2025-01-01.
 *
 * Watermark orders branch on the payment's product BEFORE any plan
 * settle: a ₹69 payment grants a per-project entitlement
 * (settleWatermarkPaid), never a plan. A refund of a watermark payment
 * (REFUND_SUCCESS_WEBHOOK) revokes the removal, so the project is
 * watermarked again.
 *
 * Plan refunds (Builder 6): a refund of a plan order
 * (REFUND_SUCCESS_WEBHOOK) keeps access to the end of the paid period
 * — no immediate revoke, no minutes clawback — but marks the payment
 * `refunded`, and a refunded payment can never settle again, so no
 * renewal grant can come from it. See settlePlanRefunded.
 *
 * Subscription events branch on the subscription id, not an order id.
 * The event names depend on the webhook version configured in the
 * dashboard, so the handler accepts the current names
 * (SUBSCRIPTION_AUTH_STATUS, SUBSCRIPTION_PAYMENT_SUCCESS,
 * SUBSCRIPTION_PAYMENT_FAILED, SUBSCRIPTION_PAYMENT_CANCELLED,
 * SUBSCRIPTION_STATUS_CHANGED, SUBSCRIPTION_REFUND_STATUS), the v1
 * names (SUBSCRIPTION_NEW_PAYMENT, SUBSCRIPTION_PAYMENT_DECLINED,
 * SUBSCRIPTION_STATUS_CHANGE, REFUND_STATUS_WEBHOOK) and the
 * *_WEBHOOK aliases (SUBSCRIPTION_CREATED_WEBHOOK,
 * SUBSCRIPTION_ACTIVATED_WEBHOOK, SUBSCRIPTION_CHARGED_WEBHOOK,
 * SUBSCRIPTION_CANCELLED_WEBHOOK, SUBSCRIPTION_EXPIRED_WEBHOOK,
 * SUBSCRIPTION_PAYMENT_FAILED_WEBHOOK). The live sandbox test must
 * confirm which names actually arrive. The payload shape is read
 * defensively (see parseSubscriptionEvent): the exact 2023-08-01
 * subscription payload is unverified, so several field spellings are
 * tried and a missing field falls back to a safe default — never to a
 * guessed grant.
 *
 * Dedupe: each subscription delivery is logged in `webhook_events`
 * AFTER it is handled (never before — a failed handling must retry).
 * A re-delivery with the same key answers 200 without re-processing.
 * The log is audit-only: the grant keys are the real dedupe (the
 * first cycle always grants under one activation key, each renewal
 * charge under its own charge key).
 */

type RawEvent = {
  type?: string;
  data?: {
    order?: { order_id?: string };
    payment?: { cf_payment_id?: number | string; payment_status?: string; cf_refund_id?: number | string };
    subscription?: Record<string, unknown>;
    subscription_id?: string;
    subscription_status?: string;
  };
};

const SUBSCRIPTION_EVENT_TYPES = new Set([
  "SUBSCRIPTION_AUTH_STATUS",
  "SUBSCRIPTION_PAYMENT_SUCCESS",
  "SUBSCRIPTION_PAYMENT_FAILED",
  "SUBSCRIPTION_PAYMENT_CANCELLED",
  "SUBSCRIPTION_STATUS_CHANGED",
  "SUBSCRIPTION_STATUS_CHANGE",
  "SUBSCRIPTION_REFUND_STATUS",
  "SUBSCRIPTION_NEW_PAYMENT",
  "SUBSCRIPTION_PAYMENT_DECLINED",
  "SUBSCRIPTION_CREATED_WEBHOOK",
  "SUBSCRIPTION_ACTIVATED_WEBHOOK",
  "SUBSCRIPTION_CHARGED_WEBHOOK",
  "SUBSCRIPTION_CANCELLED_WEBHOOK",
  "SUBSCRIPTION_EXPIRED_WEBHOOK",
  "SUBSCRIPTION_PAYMENT_FAILED_WEBHOOK",
  "REFUND_STATUS_WEBHOOK",
]);

const isSubscriptionEvent = (type: string | undefined): boolean =>
  !!type && (SUBSCRIPTION_EVENT_TYPES.has(type) || type.startsWith("SUBSCRIPTION_"));

interface ParsedSubscriptionEvent {
  subscriptionId: string | null;
  /** Cashfree subscription status string, when the payload carries one. */
  status: string | null;
  /** The charge/payment id, when the payload carries one. */
  chargeId: string | null;
  /** Current period end from the payload, when it carries one. */
  periodEnd: string | null;
  /** Current period start from the payload, when it carries one. */
  periodStart: string | null;
  /** True when the auth itself failed (SUBSCRIPTION_AUTH_STATUS, failed). */
  authFailed: boolean;
}

const asString = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);

/**
 * Read the subscription fields out of a webhook payload. Cashfree's
 * subscription payloads nest the subscription under data.subscription
 * (2025-01-01 shape); older shapes put the id/status flat on data.
 * Every spelling below is tried in order; anything missing stays
 * null and the caller falls back to a safe default.
 */
function parseSubscriptionEvent(event: RawEvent): ParsedSubscriptionEvent {
  const data = event.data ?? {};
  const sub = (data.subscription ?? {}) as Record<string, unknown>;
  const payment = (data.payment ?? {}) as Record<string, unknown>;
  const auth = (sub.authorisation_details ?? sub.authorization_details ?? {}) as Record<string, unknown>;
  const subscriptionId =
    asString(sub.subscription_id) ?? asString(data.subscription_id) ?? asString(sub.subscriptionId) ?? asString(data.order?.order_id);
  const status =
    asString(sub.subscription_status) ?? asString(data.subscription_status) ?? asString(sub.status) ?? null;
  const chargeId =
    asString(payment.cf_payment_id) ?? asString(sub.cf_payment_id) ?? asString(auth.payment_id) ?? null;
  const periodEnd =
    asString(sub.next_schedule_date) ?? asString(sub.subscription_expiry_time) ?? asString(sub.current_period_end) ?? null;
  const periodStart =
    asString(sub.subscription_first_charge_time) ?? asString(auth.authorization_time) ?? asString(sub.current_period_start) ?? null;
  const authStatus = asString(auth.authorization_status);
  const authFailed =
    event.type === "SUBSCRIPTION_AUTH_STATUS" &&
    (authStatus === "FAILED" || (status !== null && status.toUpperCase() === "FAILED"));
  return { subscriptionId, status, chargeId, periodEnd, periodStart, authFailed };
}

/** Which lifecycle action one subscription event means, or "ignore". */
function subscriptionAction(
  event: RawEvent,
  parsed: ParsedSubscriptionEvent,
): "activate" | "charge" | "cancel" | "expire" | "past_due" | "paused" | "refund" | "ignore" {
  const type = event.type ?? "";
  const status = (parsed.status ?? "").toUpperCase();
  if (type === "SUBSCRIPTION_REFUND_STATUS" || type === "REFUND_STATUS_WEBHOOK") return "refund";
  if (type === "SUBSCRIPTION_PAYMENT_FAILED" || type === "SUBSCRIPTION_PAYMENT_DECLINED" || type === "SUBSCRIPTION_PAYMENT_FAILED_WEBHOOK") {
    return "past_due";
  }
  if (type === "SUBSCRIPTION_PAYMENT_SUCCESS" || type === "SUBSCRIPTION_NEW_PAYMENT" || type === "SUBSCRIPTION_CHARGED_WEBHOOK") {
    return "charge";
  }
  if (type === "SUBSCRIPTION_ACTIVATED_WEBHOOK") return "activate";
  if (type === "SUBSCRIPTION_CANCELLED_WEBHOOK") return "cancel";
  if (type === "SUBSCRIPTION_EXPIRED_WEBHOOK") return "expire";
  if (type === "SUBSCRIPTION_CREATED_WEBHOOK") return "ignore";
  if (type === "SUBSCRIPTION_AUTH_STATUS") {
    if (parsed.authFailed) return "past_due";
    return "activate";
  }
  if (type === "SUBSCRIPTION_STATUS_CHANGED" || type === "SUBSCRIPTION_STATUS_CHANGE") {
    if (status === "ACTIVE") return "activate";
    if (status === "CANCELLED" || status === "CANCELED") return "cancel";
    if (status === "EXPIRED" || status === "COMPLETED") return "expire";
    if (status === "PAUSED") return "paused";
    return "ignore";
  }
  if (type === "SUBSCRIPTION_PAYMENT_CANCELLED") {
    // A cancelled charge: cancel the subscription only when the
    // payload says the subscription itself is cancelled; a lone
    // cancelled charge changes no access.
    return status === "CANCELLED" || status === "CANCELED" ? "cancel" : "ignore";
  }
  return "ignore";
}

async function handleSubscriptionEvent(admin: SupabaseClient, event: RawEvent, req: Request): Promise<Response> {
  const parsed = parseSubscriptionEvent(event);
  if (!parsed.subscriptionId) return new Response("OK", { status: 200 });
  const sub = await findSubscriptionByCfId(admin, parsed.subscriptionId);
  if (!sub) return new Response("OK", { status: 200 });

  const key = webhookEventKey({
    idempotencyHeader: req.headers.get("x-idempotency-key"),
    type: event.type ?? "",
    subscriptionId: parsed.subscriptionId,
    status: parsed.status,
    chargeId: parsed.chargeId,
  });
  if (await findWebhookEvent(admin, key)) return new Response("OK", { status: 200 });

  const action = subscriptionAction(event, parsed);
  try {
    if (action === "activate") {
      // First cycle, always under the one activation key — whichever
      // event triggers it (auth and first-charge success can both
      // arrive, in either order; the same key means the ledger
      // grants once).
      await settleSubscriptionCycle(admin, sub, {
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
        chargeId: parsed.chargeId,
        grantKey: subscriptionActivationGrantKey(sub.cf_subscription_id),
      });
    } else if (action === "charge") {
      if (sub.status === "initialized") {
        // The first charge, with no auth event before it: still the
        // first cycle, still the activation key.
        await settleSubscriptionCycle(admin, sub, {
          periodStart: parsed.periodStart,
          periodEnd: parsed.periodEnd,
          chargeId: parsed.chargeId,
          grantKey: subscriptionActivationGrantKey(sub.cf_subscription_id),
        });
      } else {
        // A later charge grants ONLY on positive evidence of a new
        // cycle: the payload's period end (Cashfree's
        // next_schedule_date — the end of the cycle this charge pays
        // for) is later than the stored period end. A charge for the
        // cycle already granted, or a charge with no period in the
        // payload, grants nothing here: a double grant is never
        // healed, while a missed renewal IS healed by reconcile,
        // which fetches Cashfree and grants any newer cycle.
        const storedEnd = sub.period_end ? new Date(sub.period_end).getTime() : 0;
        const eventEnd = parsed.periodEnd ? new Date(parsed.periodEnd).getTime() : 0;
        if (parsed.chargeId && eventEnd > storedEnd) {
          await settleSubscriptionCycle(admin, sub, {
            periodStart: parsed.periodStart ?? sub.period_end,
            periodEnd: parsed.periodEnd,
            chargeId: parsed.chargeId,
            grantKey: subscriptionChargeGrantKey(sub.cf_subscription_id, parsed.chargeId),
          });
        }
      }
    } else if (action === "cancel") {
      await markSubscriptionCancelled(admin, sub);
    } else if (action === "expire") {
      await markSubscriptionExpired(admin, sub, parsed.periodEnd);
    } else if (action === "past_due") {
      await markSubscriptionPastDue(admin, sub, parsed.chargeId);
    } else if (action === "paused") {
      await markSubscriptionPaused(admin, sub);
    } else if (action === "refund") {
      await recordSubscriptionRefund(admin, sub, parsed.chargeId);
    }
  } catch (e) {
    // A settle failure must surface as a non-200 so Cashfree retries —
    // swallowing it would strand a real payment. Nothing is logged as
    // handled: the event-log row is only written on success below.
    console.error(JSON.stringify({ level: "error", msg: "billing webhook subscription settle failed", subscriptionId: parsed.subscriptionId, err: e instanceof Error ? e.message : String(e) }));
    return new Response("Settle failed", { status: 500 });
  }
  await recordWebhookEvent(admin, { key, type: event.type ?? "", subscriptionId: parsed.subscriptionId });
  return new Response("OK", { status: 200 });
}

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature");
  const timestamp = req.headers.get("x-webhook-timestamp");
  if (!verifyWebhookSignature({ signature, timestamp, rawBody })) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: RawEvent;
  try {
    event = JSON.parse(rawBody) as RawEvent;
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  const admin = getAdmin();

  // Subscription lifecycle events carry a subscription id, not an
  // order id, and are handled (and deduped) separately.
  if (isSubscriptionEvent(event.type)) {
    try {
      return await handleSubscriptionEvent(admin, event, req);
    } catch (e) {
      console.error(JSON.stringify({ level: "error", msg: "billing webhook subscription failed", err: e instanceof Error ? e.message : String(e) }));
      return new Response("Settle failed", { status: 500 });
    }
  }

  const orderId = event.data?.order?.order_id;
  if (!orderId) return new Response("OK", { status: 200 });

  const payment = await findPaymentByOrderId(admin, orderId);
  if (!payment) return new Response("OK", { status: 200 });

  const cfPaymentId = event.data?.payment?.cf_payment_id != null ? String(event.data.payment.cf_payment_id) : null;
  try {
    if (event.type === "PAYMENT_SUCCESS_WEBHOOK") {
      if (isWatermarkPayment(payment)) await settleWatermarkPaid(admin, payment, cfPaymentId);
      else await settlePaid(admin, payment, cfPaymentId);
    } else if (event.type === "PAYMENT_FAILED_WEBHOOK") {
      await settleClosed(admin, payment, "failed");
    } else if (event.type === "PAYMENT_USER_DROPPED_WEBHOOK") {
      await settleClosed(admin, payment, "expired");
    } else if (event.type === "REFUND_SUCCESS_WEBHOOK") {
      if (isWatermarkPayment(payment)) {
        await settleWatermarkRefunded(admin, payment);
      } else if (payment.product === "subscription") {
        // A refund of a subscription's first charge: mark the payment
        // refunded (keeps access to period end) and record the charge
        // id on the subscription so no renewal grants from it.
        await settlePlanRefunded(admin, payment);
        const sub: SubscriptionRow | null = await findSubscriptionByCfId(admin, payment.cf_order_id);
        if (sub) await recordSubscriptionRefund(admin, sub, cfPaymentId);
      } else {
        await settlePlanRefunded(admin, payment);
      }
    }
  } catch (e) {
    // A settle failure must surface as a non-200 so Cashfree retries —
    // swallowing it would strand a real payment.
    console.error(JSON.stringify({ level: "error", msg: "billing webhook settle failed", orderId, err: e instanceof Error ? e.message : String(e) }));
    return new Response("Settle failed", { status: 500 });
  }
  return new Response("OK", { status: 200 });
}
