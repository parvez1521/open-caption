import "server-only";
import { cashfreeConfig } from "./cashfree";
import type { PlanId } from "@capseasy/shared";

/**
 * Cashfree Subscriptions — server side (Builder 6, minutes model).
 *
 * Paid plans (Starter / Creator / Pro) are monthly subscriptions that
 * auto-renew. The one-time PG order flow in cashfree.ts stays untouched
 * for the ₹69 watermark product.
 *
 * HOW A PLAN MAPS TO CASHFREE
 * Cashfree has no "list all plans" API: the three recurring plans MUST
 * be created by hand in the Cashfree dashboard first, then their plan
 * ids are pasted into env — the code never invents a plan id.
 *   Dashboard → Subscriptions → Plans → create one plan per tier:
 *     Starter — ₹149, monthly (PERIODIC, interval 1 MONTH), INR
 *     Creator — ₹349, monthly (PERIODIC, interval 1 MONTH), INR
 *     Pro     — ₹749, monthly (PERIODIC, interval 1 MONTH), INR
 *   Copy each plan's `plan_id` from the dashboard into env:
 *     CASHFREE_SUBSCRIPTION_PLAN_STARTER
 *     CASHFREE_SUBSCRIPTION_PLAN_CREATOR
 *     CASHFREE_SUBSCRIPTION_PLAN_PRO
 * Until a tier's env value is set, subscription checkout for that tier
 * answers `subscriptionPlanMissing` instead of calling Cashfree.
 * Subscriptions are INR-only (Cashfree recurring billing does not
 * support other currencies for these plans). No USD price is invented.
 *
 * API SHAPE — READ BEFORE CHANGING
 * This module pins the same API version the order flow uses,
 * `x-api-version: 2023-08-01`, and sends the FLAT pre-2026 request
 * body for that version: `subscription_id`, `subscription_plan_id`,
 * `customer_details`, `subscription_meta: { return_url }`,
 * `subscription_note`, `subscription_tags`. Cashfree's public docs
 * now only show v2026-01-01, whose body is restructured into nested
 * `plan_details` / `authorization_details` objects (the plan id still
 * lives at `plan_details.plan_id`). The flat shape below is the
 * documented pre-2026 shape for the pinned version — it is NOT yet
 * proven against the live sandbox (the sandbox checkout is failing
 * for an undiagnosed reason; see the monetization report). The live
 * sandbox subscription test MUST confirm the create call, the fetch
 * shape, and the manage/cancel shape; if Cashfree rejects the flat
 * body, the fix is to send the v2026-01-01 nested body with that
 * version header. Do not "fix" this by guessing fields.
 *
 * Host: the same base URL as the order flow (cashfreeConfig().baseUrl).
 * Cashfree's current docs show https://sandbox.cashfree.com/pg as the
 * sandbox host; the order flow uses https://sandbox-api.cashfree.com
 * and that host is what the owner already runs. The live sandbox test
 * must confirm subscriptions answer on this host too.
 *
 * Webhooks: subscription events are NOT sent to `notify_url` per
 * subscription — the endpoint must be registered in the dashboard
 * under Subscriptions (same URL as the PG webhook):
 *   https://captionit.in/api/v1/billing/webhook
 * with webhook version 2025-01-01 and these events ticked:
 *   SUBSCRIPTION_AUTH_STATUS, SUBSCRIPTION_PAYMENT_SUCCESS,
 *   SUBSCRIPTION_PAYMENT_FAILED, SUBSCRIPTION_PAYMENT_CANCELLED,
 *   SUBSCRIPTION_STATUS_CHANGED, SUBSCRIPTION_REFUND_STATUS.
 * The webhook handler also accepts the older *_WEBHOOK aliases and
 * the v1 names (SUBSCRIPTION_NEW_PAYMENT, SUBSCRIPTION_PAYMENT_DECLINED)
 * because the exact event names depend on the dashboard webhook
 * version. The live test must confirm which names actually arrive.
 *
 * The browser opens the hosted subscription checkout with the
 * `subscription_session_id` via the JS SDK:
 *   cashfree.subscriptionsCheckout({ subsSessionId, redirectTarget: "_self" })
 * — NOT the order checkout's `paymentSessionId`.
 */

const SUBS_API_VERSION = "2023-08-01";

/** Dashboard-created Cashfree plan id for one app tier, or null when not mapped yet. */
export function cashfreeSubscriptionPlanId(plan: PlanId): string | null {
  const env =
    plan === "starter"
      ? "CASHFREE_SUBSCRIPTION_PLAN_STARTER"
      : plan === "creator"
        ? "CASHFREE_SUBSCRIPTION_PLAN_CREATOR"
        : plan === "pro"
          ? "CASHFREE_SUBSCRIPTION_PLAN_PRO"
          : null;
  if (!env) return null;
  return process.env[env]?.trim() || null;
}

export type CashfreeSubscriptionStatus = "initialized" | "active" | "paused" | "cancelled" | "expired" | "unknown";

/** Cashfree's status strings, across versions, to one internal value. */
export function normalizeSubscriptionStatus(raw: unknown): CashfreeSubscriptionStatus {
  const s = typeof raw === "string" ? raw.toUpperCase() : "";
  if (s === "ACTIVE") return "active";
  if (s === "INITIALIZED" || s === "INITIATED") return "initialized";
  if (s === "PAUSED") return "paused";
  if (s === "CANCELLED" || s === "CANCELED") return "cancelled";
  if (s === "EXPIRED" || s === "COMPLETED") return "expired";
  return "unknown";
}

async function subsFetch(cfg: ReturnType<typeof cashfreeConfig>, path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-version": SUBS_API_VERSION,
      "x-client-id": cfg.appId ?? "",
      "x-client-secret": cfg.secret ?? "",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    throw new Error(`Cashfree ${path} failed (${res.status}): ${typeof body?.message === "string" ? body.message : "unknown error"}`);
  }
  return body;
}

export interface CreatedSubscription {
  subscriptionSessionId: string;
  subscriptionId: string;
  status: string;
}

/**
 * Create a Cashfree subscription (PERIODIC plan created in the
 * dashboard). The first charge is taken when the customer authorises
 * the mandate on the hosted checkout; renewals are charged by
 * Cashfree on schedule. Amount and currency come from the dashboard
 * plan, never from this call — the plan id IS the price.
 */
export async function createCashfreeSubscription(input: {
  subscriptionId: string;
  cashfreePlanId: string;
  customerId: string;
  customerEmail: string;
  customerPhone: string;
  returnUrl: string;
  planId: string;
}): Promise<CreatedSubscription> {
  const cfg = cashfreeConfig();
  if (!cfg.configured) throw new Error("Cashfree is not configured");
  const body = (await subsFetch(cfg, "/pg/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      subscription_id: input.subscriptionId,
      subscription_plan_id: input.cashfreePlanId,
      customer_details: {
        customer_id: input.customerId,
        customer_email: input.customerEmail,
        customer_phone: input.customerPhone,
      },
      // No notify_url here: subscription webhooks are registered in the
      // dashboard (see the module header), not per subscription.
      subscription_meta: { return_url: input.returnUrl },
      subscription_note: `Captionit ${input.planId} plan — monthly subscription`,
      subscription_tags: { plan: input.planId },
    }),
  })) as { subscription_session_id?: string; subscription_id?: string; subscription_status?: string } | null;
  if (!body?.subscription_session_id) throw new Error("Cashfree did not return a subscription session");
  return {
    subscriptionSessionId: body.subscription_session_id,
    subscriptionId: body.subscription_id ?? input.subscriptionId,
    status: body.subscription_status ?? "INITIALIZED",
  };
}

export interface FetchedSubscription {
  status: CashfreeSubscriptionStatus;
  rawStatus: string | null;
  /** Dashboard plan id, when Cashfree returns it. */
  planId: string | null;
  /** Next scheduled charge date (ISO), when Cashfree returns it. */
  nextChargeAt: string | null;
  /** Current period start, when Cashfree returns it. */
  periodStart: string | null;
  /** Current period end, when Cashfree returns it. */
  periodEnd: string | null;
  /** The authorisation payment id, when Cashfree returns it. */
  authorizationPaymentId: string | null;
}

const asIsoString = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * Server-side subscription check — the reconcile path settles ONLY
 * from this, never from browser state.
 *
 * FIELD UNCERTAINTY: Cashfree's current docs (v2026-01-01) show the
 * SubscriptionEntity with `subscription_status`,
 * `plan_details.plan_id`, `next_schedule_date`,
 * `subscription_expiry_time`, `subscription_first_charge_time` and
 * `authorisation_details`. The pinned 2023-08-01 shape may name these
 * differently, and the entity carries NO explicit current-period
 * start/end — the period end is read as `next_schedule_date` (the next
 * charge is when the current cycle ends) and falls back to
 * `subscription_expiry_time`. The live sandbox test must confirm
 * which fields the fetch actually returns; the settle code treats a
 * missing period end as "now + 30 days" and never trusts it blindly.
 */
export async function fetchCashfreeSubscription(subscriptionId: string): Promise<FetchedSubscription> {
  const cfg = cashfreeConfig();
  if (!cfg.configured) throw new Error("Cashfree is not configured");
  const sub = (await subsFetch(cfg, `/pg/subscriptions/${encodeURIComponent(subscriptionId)}`)) as Record<string, unknown> | null;
  const planDetails = (sub?.plan_details ?? null) as Record<string, unknown> | null;
  const authDetails = (sub?.authorisation_details ?? sub?.authorization_details ?? null) as Record<string, unknown> | null;
  const nextChargeAt = asIsoString(sub?.next_schedule_date);
  return {
    status: normalizeSubscriptionStatus(sub?.subscription_status),
    rawStatus: typeof sub?.subscription_status === "string" ? (sub.subscription_status as string) : null,
    planId:
      (typeof planDetails?.plan_id === "string" ? (planDetails.plan_id as string) : null) ??
      (typeof sub?.subscription_plan_id === "string" ? (sub.subscription_plan_id as string) : null),
    nextChargeAt,
    periodStart: asIsoString(sub?.subscription_first_charge_time) ?? asIsoString(authDetails?.authorization_time),
    periodEnd: nextChargeAt ?? asIsoString(sub?.subscription_expiry_time),
    authorizationPaymentId: asIsoString(authDetails?.payment_id),
  };
}

/**
 * Cancel a subscription at Cashfree: POST /pg/subscriptions/{id}/manage
 * with action CANCEL (current docs). The customer's access is kept
 * until the paid period ends — the cancel only stops the NEXT charge;
 * the local row is marked cancelled and the profile is untouched.
 * UNCERTAINTY: the manage body is the v2026-01-01 documented shape;
 * the pinned 2023-08-01 version may expect a different cancel call.
 * The live sandbox test must confirm it.
 */
export async function cancelCashfreeSubscription(subscriptionId: string): Promise<FetchedSubscription> {
  const cfg = cashfreeConfig();
  if (!cfg.configured) throw new Error("Cashfree is not configured");
  const sub = (await subsFetch(cfg, `/pg/subscriptions/${encodeURIComponent(subscriptionId)}/manage`, {
    method: "POST",
    body: JSON.stringify({ subscription_id: subscriptionId, action: "CANCEL" }),
  })) as Record<string, unknown> | null;
  return {
    status: normalizeSubscriptionStatus(sub?.subscription_status ?? "CANCELLED"),
    rawStatus: typeof sub?.subscription_status === "string" ? (sub.subscription_status as string) : "CANCELLED",
    planId: null,
    nextChargeAt: asIsoString(sub?.next_schedule_date),
    periodStart: null,
    periodEnd: asIsoString(sub?.next_schedule_date) ?? asIsoString(sub?.subscription_expiry_time),
    authorizationPaymentId: null,
  };
}

/** Subscription ids: URL-safe, unique per attempt, within 50 chars. */
export function newSubscriptionId(userId: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `ocs_${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}_${Date.now().toString(36)}_${rand}`.slice(0, 50);
}
