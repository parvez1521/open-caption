import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_PERIOD_DAYS, planIdFor, type PlanId } from "@capseasy/shared";
import { ApiFailure } from "@/lib/api/http";
import { grantCycleMinutes } from "./minutes";
import type { PaymentRow } from "./settle";

/**
 * Subscription lifecycle — the server-side half of Cashfree
 * subscriptions (Builder 6). The webhook and the reconcile route share
 * this module so the two can never disagree.
 *
 * Storage: public.subscriptions (one row per Cashfree subscription,
 * keyed by cf_subscription_id) and public.webhook_events (one row per
 * handled webhook delivery, keyed by event_key). Both are defined in
 * supabase/APPLY-SUBSCRIPTIONS.sql — the owner applies that file in
 * the Supabase SQL editor. Until it is applied, subscription checkout
 * answers dbPending and the webhook treats subscription events as
 * unknown (200, no action), because no subscription can exist without
 * the table: checkout writes the row BEFORE calling Cashfree.
 *
 * Access rules, all deliberate:
 * - Activation / renewal charge → grant the cycle minutes via
 *   grantCycleMinutes and set the profile plan + plan_expires_at.
 * - Cancellation → keep access to the end of the paid period. The
 *   profile is NEVER touched on cancel. Only the next charge stops.
 * - Expiry → the profile plan stays, but plan_expires_at is the
 *   period end, so effectivePlanId reads Free after it. No revoke.
 * - Payment failure (past due) → keep access to period end, grant
 *   nothing. A later successful charge re-activates the same row.
 * - Refund of a plan order → keep access to period end, mark the
 *   payment `refunded`, grant nothing more from that payment. A
 *   refunded payment can never settle again: settlePaid only runs
 *   for `created`/`paid` rows. A refunded subscription charge id is
 *   recorded on the subscription row and the renewal grant for THAT
 *   charge is skipped. Future cycles still renew normally.
 *
 * Idempotency has three layers, and the grant key is the load-bearing
 * one: the first cycle of a subscription ALWAYS grants under
 * `grant:subscription:<id>:activation`, whichever event triggers it
 * (auth success and first-charge success can both arrive, in either
 * order — the same key means the ledger grants once). A renewal
 * charge grants under `grant:subscription:<id>:charge:<cfPaymentId>`,
 * so a retried webhook grants once — but only when the webhook
 * carries positive evidence of a new cycle (its period end is later
 * than the stored period end). A charge without that evidence grants
 * nothing in the webhook; reconcile heals it from Cashfree. A double
 * grant is never healed, a missed grant is. A reconcile renewal (no
 * charge id) grants under `grant:subscription:<id>:cycle:<periodStart>`,
 * where periodStart is the stored period end — deterministic, so a
 * webhook and a reconcile for the same cycle agree. On top of that,
 * the webhook event log dedupes whole deliveries, and the row
 * updates are conditional where it matters.
 */

export type SubscriptionStatus = "initialized" | "active" | "past_due" | "paused" | "cancelled" | "expired";

export interface SubscriptionRow {
  id: string;
  owner_id: string;
  cf_subscription_id: string;
  cf_plan_id: string | null;
  plan: string;
  amount: number;
  currency: string;
  status: SubscriptionStatus;
  period_start: string | null;
  period_end: string | null;
  next_charge_at: string | null;
  last_charge_id: string | null;
  last_charge_at: string | null;
  refunded_charge_ids: string[];
  cancelled_at: string | null;
  created_at: string;
}

export const SUBSCRIPTIONS_NOT_SET_UP = "Subscriptions aren't set up yet — checkout opens once the setup finishes.";

/** True when a Supabase error means "the subscriptions tables are not applied yet". */
export const isMissingSubscriptionsTableError = (error: { code?: string; message?: string } | null): boolean => {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202" || error.code === "PGRST204") return true;
  const msg = error.message ?? "";
  return msg.includes("subscriptions") || msg.includes("webhook_events");
};

const periodEndFallback = (start: Date): string => new Date(start.getTime() + PLAN_PERIOD_DAYS * 24 * 3600 * 1000).toISOString();

/** The first cycle's grant key: one key per subscription, ever. */
export const subscriptionActivationGrantKey = (cfSubscriptionId: string): string => `grant:subscription:${cfSubscriptionId}:activation`;

/** One renewal grant key per Cashfree charge. A retried webhook reuses it, so it grants once. */
export const subscriptionChargeGrantKey = (cfSubscriptionId: string, chargeId: string): string =>
  `grant:subscription:${cfSubscriptionId}:charge:${chargeId}`;

/** A reconcile renewal (no charge id) keys on the cycle start — the stored period end. */
export const subscriptionCycleGrantKey = (cfSubscriptionId: string, periodStart: string): string =>
  `grant:subscription:${cfSubscriptionId}:cycle:${periodStart}`;

export async function findSubscriptionByCfId(admin: SupabaseClient, cfSubscriptionId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await admin.from("subscriptions").select("*").eq("cf_subscription_id", cfSubscriptionId).maybeSingle();
  if (error) {
    if (isMissingSubscriptionsTableError(error)) return null;
    throw new Error(`Subscription lookup failed: ${error.message ?? "unknown error"}`);
  }
  return (data as SubscriptionRow | null) ?? null;
}

export async function findActiveSubscriptionByOwner(admin: SupabaseClient, ownerId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await admin
    .from("subscriptions")
    .select("*")
    .eq("owner_id", ownerId)
    .in("status", ["initialized", "active", "past_due", "paused"])
    .order("created_at", { ascending: false })
    .maybeSingle();
  if (error) {
    if (isMissingSubscriptionsTableError(error)) return null;
    throw new Error(`Subscription lookup failed: ${error.message ?? "unknown error"}`);
  }
  return (data as SubscriptionRow | null) ?? null;
}

/** Write the subscription row BEFORE the Cashfree call, so a webhook can never arrive for a subscription we don't know. */
export async function recordSubscription(
  admin: SupabaseClient,
  input: { ownerId: string; cfSubscriptionId: string; cfPlanId: string; plan: PlanId; amount: number; currency: string },
): Promise<SubscriptionRow> {
  const { data, error } = await admin
    .from("subscriptions")
    .insert({
      owner_id: input.ownerId,
      cf_subscription_id: input.cfSubscriptionId,
      cf_plan_id: input.cfPlanId,
      plan: input.plan,
      amount: input.amount,
      currency: input.currency,
      status: "initialized",
    })
    .select("*")
    .maybeSingle();
  if (error) {
    if (isMissingSubscriptionsTableError(error)) throw new ApiFailure("INTERNAL", SUBSCRIPTIONS_NOT_SET_UP);
    throw new Error(`Subscription record failed: ${error.message ?? "unknown error"}`);
  }
  if (!data) throw new Error("Subscription record returned no row");
  return data as SubscriptionRow;
}

async function updateSubscriptionRow(
  admin: SupabaseClient,
  cfSubscriptionId: string,
  patch: Record<string, unknown>,
): Promise<SubscriptionRow | null> {
  const { data, error } = await admin
    .from("subscriptions")
    .update(patch)
    .eq("cf_subscription_id", cfSubscriptionId)
    .select("*")
    .maybeSingle();
  if (error) {
    if (isMissingSubscriptionsTableError(error)) return null;
    throw new Error(`Subscription update failed: ${error.message ?? "unknown error"}`);
  }
  return (data as SubscriptionRow | null) ?? null;
}

/**
 * Grant one cycle and set the profile plan + period end. The minutes
 * are granted FIRST (idempotent on the grant key), before any row
 * moves — a subscription is never marked active without its minutes.
 * When the same plan already has paid time left, the period end is
 * the LATER of the stored expiry and the new cycle end, so an early
 * activation never eats paid days. A plan switch starts a fresh
 * period on the new plan (the old rule from settlePaid).
 */
export async function settleSubscriptionCycle(
  admin: SupabaseClient,
  sub: SubscriptionRow,
  input: { periodStart: string | null; periodEnd: string | null; chargeId: string | null; grantKey: string },
): Promise<SubscriptionRow> {
  // A refunded charge never grants again — even if Cashfree re-sends
  // its success event after the refund.
  if (input.chargeId && (sub.refunded_charge_ids ?? []).includes(input.chargeId)) {
    return sub;
  }
  const plan = planIdFor(sub.plan) as PlanId;
  const now = new Date();
  const periodStart = input.periodStart ?? now.toISOString();
  const periodEnd = input.periodEnd ?? periodEndFallback(new Date(periodStart));

  const grant = await grantCycleMinutes(admin, {
    ownerId: sub.owner_id,
    plan,
    periodStart,
    periodEnd,
    idempotencyKey: input.grantKey,
  });
  if (!grant.granted && grant.reason === "not_applied") {
    throw new Error(`Subscription settle minutes grant failed: the minutes ledger is not applied yet (subscription ${sub.cf_subscription_id})`);
  }

  const { data: profile } = await admin.from("profiles").select("plan, plan_expires_at").eq("id", sub.owner_id).maybeSingle();
  const storedExpiry = profile?.plan_expires_at ? new Date(profile.plan_expires_at as string) : null;
  const newEnd = new Date(periodEnd);
  // Same plan with time left: keep the later end. A switch (or no
  // time left) takes the new cycle end as-is.
  const expiresAt =
    profile?.plan === plan && storedExpiry && storedExpiry.getTime() > newEnd.getTime() ? storedExpiry.toISOString() : periodEnd;

  const updated = await updateSubscriptionRow(admin, sub.cf_subscription_id, {
    status: "active",
    period_start: periodStart,
    period_end: periodEnd,
    next_charge_at: periodEnd,
    ...(input.chargeId ? { last_charge_id: input.chargeId, last_charge_at: now.toISOString() } : {}),
  });
  if (!updated) throw new Error(`Subscription settle update failed: no row for ${sub.cf_subscription_id}`);

  const { error: profileError } = await admin
    .from("profiles")
    .update({ plan, plan_expires_at: expiresAt })
    .eq("id", sub.owner_id);
  if (profileError) throw new Error(`Subscription settle profile update failed: ${profileError.message}`);

  // The checkout payments row (keyed by the subscription id) moves to
  // paid with the first cycle. Renewals have no payments row — the
  // subscription row itself is the renewal record.
  await admin
    .from("payments")
    .update({ status: "paid", paid_at: now.toISOString(), period_start: periodStart, period_end: periodEnd })
    .eq("cf_order_id", sub.cf_subscription_id)
    .eq("status", "created");

  return updated;
}

/** Cancel: stop the next charge only. Access runs to the paid period end. The profile is never touched here. */
export async function markSubscriptionCancelled(admin: SupabaseClient, sub: SubscriptionRow): Promise<SubscriptionRow> {
  if (sub.status === "cancelled") return sub;
  const updated = await updateSubscriptionRow(admin, sub.cf_subscription_id, {
    status: "cancelled",
    cancelled_at: new Date().toISOString(),
  });
  return updated ?? sub;
}

/**
 * Expire: the subscription is over. The profile plan stays, but the
 * period end is the subscription's period end when that is earlier
 * than what is stored — so effectivePlanId reads Free after it. A
 * later expiry from another purchase is never shortened.
 */
export async function markSubscriptionExpired(
  admin: SupabaseClient,
  sub: SubscriptionRow,
  periodEnd: string | null,
): Promise<SubscriptionRow> {
  const updated = await updateSubscriptionRow(admin, sub.cf_subscription_id, { status: "expired" });
  if (periodEnd) {
    const { data: profile } = await admin.from("profiles").select("plan, plan_expires_at").eq("id", sub.owner_id).maybeSingle();
    const storedExpiry = profile?.plan_expires_at ? new Date(profile.plan_expires_at as string) : null;
    if (profile?.plan === planIdFor(sub.plan) && storedExpiry && storedExpiry.getTime() > new Date(periodEnd).getTime()) {
      await admin.from("profiles").update({ plan_expires_at: periodEnd }).eq("id", sub.owner_id);
    }
  }
  return updated ?? sub;
}

/** Past due: a charge failed. Access runs to the period end, and nothing is granted. A later good charge re-activates. */
export async function markSubscriptionPastDue(
  admin: SupabaseClient,
  sub: SubscriptionRow,
  chargeId: string | null,
): Promise<SubscriptionRow> {
  if (sub.status === "past_due") return sub;
  const updated = await updateSubscriptionRow(admin, sub.cf_subscription_id, {
    status: "past_due",
    ...(chargeId ? { last_charge_id: chargeId, last_charge_at: new Date().toISOString() } : {}),
  });
  return updated ?? sub;
}

/** Paused: access runs to the period end, and nothing is granted. */
export async function markSubscriptionPaused(admin: SupabaseClient, sub: SubscriptionRow): Promise<SubscriptionRow> {
  if (sub.status === "paused") return sub;
  const updated = await updateSubscriptionRow(admin, sub.cf_subscription_id, { status: "paused" });
  return updated ?? sub;
}

export async function findPaymentByCfPaymentId(admin: SupabaseClient, cfPaymentId: string): Promise<PaymentRow | null> {
  const { data, error } = await admin.from("payments").select("*").eq("cf_payment_id", cfPaymentId).maybeSingle();
  if (error) {
    if (isMissingSubscriptionsTableError(error)) return null;
    throw new Error(`Payment lookup failed: ${error.message ?? "unknown error"}`);
  }
  return (data as PaymentRow | null) ?? null;
}

/**
 * Plan-order refund (REFUND_SUCCESS_WEBHOOK for a plan payment).
 * DECISION: a refund keeps access to the end of the paid period — no
 * immediate revoke, no minutes clawback — but the payment is marked
 * `refunded` and can never settle (or heal) again, so no renewal
 * grant can ever come from that payment. The row is kept as history.
 * Watermark refunds are NOT handled here (settleWatermarkRefunded
 * revokes the entitlement instead); callers must branch first.
 */
export async function settlePlanRefunded(admin: SupabaseClient, payment: PaymentRow): Promise<PaymentRow> {
  if (payment.status !== "paid") return payment;
  const { data, error } = await admin
    .from("payments")
    .update({ status: "refunded" })
    .eq("id", payment.id)
    .eq("status", "paid")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`Plan refund update failed: ${error.message}`);
  return (data as PaymentRow | null) ?? payment;
}

/**
 * Record a refunded subscription charge id on the subscription row,
 * so a later (re)sent success event for THAT charge grants nothing.
 * Also marks any payments row carrying that charge id as refunded.
 * Access is untouched: the paid period runs to its end.
 */
export async function recordSubscriptionRefund(
  admin: SupabaseClient,
  sub: SubscriptionRow,
  chargeId: string | null,
): Promise<SubscriptionRow> {
  if (chargeId) {
    const existing = sub.refunded_charge_ids ?? [];
    if (!existing.includes(chargeId)) {
      const updated = await updateSubscriptionRow(admin, sub.cf_subscription_id, {
        refunded_charge_ids: [...existing, chargeId],
      });
      if (updated) sub = updated;
    }
    const payment = await findPaymentByCfPaymentId(admin, chargeId);
    if (payment && payment.status === "paid") await settlePlanRefunded(admin, payment);
  }
  return sub;
}

/* ---------------- Webhook event log (audit + delivery dedupe) ---------------- */

/**
 * Dedupe key for one webhook delivery. Cashfree sends an
 * `x-idempotency-key` header for webhook version 2025-01-01 — that is
 * the key when present. Otherwise the key is built from the event
 * itself: type + subscription + status + charge id. Two different
 * status changes (ACTIVE, then CANCELLED) have different keys; the
 * same delivery retried has the same key. The log is audit-only and
 * NEVER load-bearing: a missing table is swallowed, and the row is
 * written only AFTER the event is handled, so a failed handling
 * (500, Cashfree retries) is never mistaken for a handled one. The
 * grant keys and the row status guards are the real dedupe.
 */
export function webhookEventKey(input: {
  idempotencyHeader: string | null;
  type: string;
  subscriptionId: string | null;
  status: string | null;
  chargeId: string | null;
}): string {
  if (input.idempotencyHeader) return `hdr:${input.idempotencyHeader}`;
  return [input.type, input.subscriptionId ?? "", input.status ?? "", input.chargeId ?? ""].join("::");
}

export async function findWebhookEvent(admin: SupabaseClient, key: string): Promise<boolean> {
  const { data, error } = await admin.from("webhook_events").select("event_key").eq("event_key", key).maybeSingle();
  if (error) return false; // missing table (or any read failure) means "not seen" — the grant keys still protect the grant
  return !!data;
}

export async function recordWebhookEvent(
  admin: SupabaseClient,
  input: { key: string; type: string; subscriptionId: string | null },
): Promise<void> {
  try {
    const { error } = await admin
      .from("webhook_events")
      .insert({ event_key: input.key, event_type: input.type, subscription_id: input.subscriptionId });
    if (error) {
      console.error(JSON.stringify({ level: "error", msg: "webhook event log insert failed (audit only)", err: error.message ?? String(error) }));
    }
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "webhook event log insert failed (audit only)", err: e instanceof Error ? e.message : String(e) }));
  }
}
