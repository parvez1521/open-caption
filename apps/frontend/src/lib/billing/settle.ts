import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_PERIOD_DAYS, planIdFor, type PlanId } from "@capseasy/shared";
import { grantCycleMinutes } from "./minutes";

/**
 * Settling a payment — the ONE place a plan is granted or a payment is
 * closed out, shared by the webhook and the reconcile route so the two can
 * never disagree. All writes go through the service-role client: profiles.plan
 * is server-written only (lock_profile_plan) and payments has no client write
 * policy at all.
 *
 * Idempotent by construction: a payment that is already `paid` is never
 * settled twice (Cashfree retries webhooks), and a terminal payment
 * (paid/failed/expired) never changes state again.
 */

export interface PaymentRow {
  id: string;
  owner_id: string;
  cf_order_id: string;
  cf_payment_id: string | null;
  plan: string;
  amount: number;
  currency: string;
  status: "created" | "paid" | "failed" | "expired";
  created_at: string;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
}

/**
 * Mark a payment PAID and grant its plan: the period is 30 days from now —
 * or, when the same user already has paid time left on the SAME plan, it
 * extends from that period's end so an early renewal never eats paid days.
 *
 * The cycle's minutes are granted FIRST, before the payment row moves
 * (idempotent on the payment id, so a retry after a crash never grants
 * twice). A payment is never marked paid without its minutes: if the
 * minutes ledger is not applied yet the settle throws and Cashfree (or
 * the reconcile route) retries it once the ledger exists. An already-paid
 * payment still attempts its grant — the healing path for a payment that
 * was settled while the ledger was missing.
 */
export async function settlePaid(admin: SupabaseClient, payment: PaymentRow, cfPaymentId: string | null): Promise<PaymentRow> {
  if (payment.status !== "created" && payment.status !== "paid") return payment;
  const plan = planIdFor(payment.plan) as PlanId;
  const now = new Date();

  const { data: profile } = await admin.from("profiles").select("plan, plan_expires_at").eq("id", payment.owner_id).maybeSingle();

  if (payment.status === "paid") {
    // Healing attempt: the plan is already granted, but the minutes may
    // have been missed (ledger not applied at settle time). The grant
    // uses the payment's own stored period, never a fresh one.
    const end = payment.period_end ?? (profile?.plan_expires_at as string | null) ?? null;
    const start =
      payment.period_start ??
      (end ? new Date(new Date(end).getTime() - PLAN_PERIOD_DAYS * 24 * 3600 * 1000).toISOString() : now.toISOString());
    const grant = await grantCycleMinutes(admin, {
      ownerId: payment.owner_id,
      plan,
      periodStart: start,
      periodEnd: end ?? new Date(now.getTime() + PLAN_PERIOD_DAYS * 24 * 3600 * 1000).toISOString(),
      idempotencyKey: `grant:payment:${payment.id}`,
    });
    if (!grant.granted && grant.reason === "not_applied") {
      console.error(JSON.stringify({ level: "error", msg: "minutes ledger not applied — paid payment has no minutes grant", paymentId: payment.id, ownerId: payment.owner_id }));
    }
    return payment;
  }

  const currentExpiry = profile?.plan_expires_at ? new Date(profile.plan_expires_at as string) : null;
  const base = profile?.plan === plan && currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
  const periodStart = now;
  const periodEnd = new Date(base.getTime() + PLAN_PERIOD_DAYS * 24 * 3600 * 1000);

  const grant = await grantCycleMinutes(admin, {
    ownerId: payment.owner_id,
    plan,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    idempotencyKey: `grant:payment:${payment.id}`,
  });
  if (!grant.granted && grant.reason === "not_applied") {
    throw new Error(`settlePaid minutes grant failed: the minutes ledger is not applied yet (payment ${payment.id})`);
  }

  const { data: updated, error } = await admin
    .from("payments")
    .update({
      status: "paid",
      cf_payment_id: cfPaymentId ?? payment.cf_payment_id,
      paid_at: now.toISOString(),
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
    })
    .eq("id", payment.id)
    .eq("status", "created")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`settlePaid update failed: ${error.message}`);
  if (!updated) return payment; // a racing settle won; nothing more to do

  const { error: profileError } = await admin
    .from("profiles")
    .update({ plan, plan_expires_at: periodEnd.toISOString() })
    .eq("id", payment.owner_id);
  if (profileError) throw new Error(`settlePaid profile update failed: ${profileError.message}`);
  return updated as PaymentRow;
}

/** Close a payment out as failed/expired (terminal, and never from `paid`). */
export async function settleClosed(admin: SupabaseClient, payment: PaymentRow, status: "failed" | "expired"): Promise<PaymentRow> {
  if (payment.status !== "created") return payment;
  const { data: updated, error } = await admin
    .from("payments")
    .update({ status })
    .eq("id", payment.id)
    .eq("status", "created")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`settleClosed update failed: ${error.message}`);
  return (updated as PaymentRow | null) ?? payment;
}

export async function findPaymentByOrderId(admin: SupabaseClient, orderId: string): Promise<PaymentRow | null> {
  const { data } = await admin.from("payments").select("*").eq("cf_order_id", orderId).maybeSingle();
  return (data as PaymentRow | null) ?? null;
}
