import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { WATERMARK_REMOVAL_PRICE_INR, WATERMARK_TEXT, effectivePlanId, type PlanId } from "@capseasy/shared";
import { ApiFailure } from "@/lib/api/http";
import type { PaymentRow } from "./settle";

/**
 * Watermark removal — the ₹69 one-time product (owner brief 2026-11-14).
 * One payment removes the watermark from ONE video project. Re-exports
 * of that same project stay clean, forever. It buys nothing else: no
 * minutes, no premium looks, no MOV export — nothing else in the codebase
 * reads the entitlement table, and the tests pin that (a grant touches
 * only `watermark_entitlements` + `payments`; the minutes ledger and the
 * profile plan are untouched).
 *
 * The decision, server-side truth:
 * - Paid user (effective plan not Free) → no watermark.
 * - Free user WITH a paid entitlement for THIS project → no watermark.
 * - Free user WITHOUT one → watermark on MP4.
 * Watermark applies to MP4 only (coordinator decision): text exports
 * (SRT/VTT/ASS/TXT/JSON) have no picture, and transparent overlays
 * (mov_alpha/webm_alpha) stay clean — the composition only draws the
 * mark in burn mode, and only MP4 jobs carry it in the payload.
 *
 * Browser-path honesty: MP4s render on the user's device, so the server
 * cannot observe the render. The ExportModal resolves the watermark from
 * the reserve endpoint (server-side) before rendering, and the Studio
 * preview shows the same value — but a modified client can skip the call
 * on the browser path. The browser watermark is therefore a deterrent
 * there and a guarantee only on the server path (the job payload).
 *
 * Storage: public.watermark_entitlements, one row per project
 * (project_id UNIQUE, cf_order_id UNIQUE). RLS on, no policies,
 * service-role-only — same shape as video_quota_events and the minutes
 * ledger. If the table has not been applied yet the decision fails
 * CLOSED toward watermarked (no entitlement can exist without the
 * table), and checkout answers dbPending instead of taking money.
 */

export interface WatermarkEntitlementRow {
  id: string;
  project_id: string;
  owner_id: string;
  payment_id: string | null;
  cf_order_id: string;
  amount: number;
  currency: string;
  status: "paid" | "refunded";
  paid_at: string;
  created_at: string;
}

export interface Watermark {
  text: string;
}

export interface WatermarkStatus {
  watermark: Watermark | null;
  entitled: boolean;
  /** False when the entitlement table is not applied yet — checkout is not available then. */
  ready: boolean;
}

/** True when a payment row is a watermark purchase, not a plan purchase. */
export const isWatermarkPayment = (payment: { plan?: string | null; product?: string | null }): boolean =>
  payment.product === "watermark" || (!payment.product && payment.plan === "watermark");

export const WATERMARK_NOT_SET_UP = "Watermark removal isn't set up yet — checkout opens once the setup finishes.";

/** True when a Supabase error means "the watermark tables are not applied yet". */
export const isMissingWatermarkTableError = (error: { code?: string; message?: string } | null): boolean => {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202" || error.code === "42703" || error.code === "PGRST204") return true;
  const msg = error.message ?? "";
  return msg.includes("watermark_entitlements");
};

/** The watermark price, from the plan config server-side — the client never names a price. */
export const watermarkRemovalAmount = (): { amount: number; currency: "INR" } => ({
  amount: WATERMARK_REMOVAL_PRICE_INR,
  currency: "INR",
});

/**
 * True when a PAID entitlement exists for this project. A missing table
 * throws ApiFailure(WATERMARK_NOT_SET_UP) — callers decide what that
 * means (exports fail closed toward watermarked; checkout answers
 * dbPending). Any other database error throws: a transient failure must
 * not silently grant a clean export.
 */
export async function hasWatermarkEntitlement(admin: SupabaseClient, projectId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("watermark_entitlements")
    .select("status")
    .eq("project_id", projectId)
    .eq("status", "paid")
    .maybeSingle();
  if (error) {
    if (isMissingWatermarkTableError(error)) throw new ApiFailure("INTERNAL", WATERMARK_NOT_SET_UP);
    throw new Error(`Watermark entitlement lookup failed: ${error.message ?? "unknown error"}`);
  }
  return !!data;
}

/**
 * The server-side watermark decision for one project. Paid → clean.
 * Free + entitled → clean. Free + not entitled → watermarked. When the
 * entitlement table is not applied yet, `ready` is false and a Free user
 * is watermarked (fail closed: no entitlement can exist without the
 * table, so watermarked is the true state).
 */
export async function getWatermarkStatus(
  admin: SupabaseClient,
  input: { ownerId: string; projectId: string; plan: string | null | undefined; expiresAt: string | null },
  now: Date = new Date(),
): Promise<WatermarkStatus> {
  const effective: PlanId = effectivePlanId(input.plan, input.expiresAt, now);
  if (effective !== "free") return { watermark: null, entitled: false, ready: true };
  let entitled = false;
  let ready = true;
  try {
    entitled = await hasWatermarkEntitlement(admin, input.projectId);
  } catch (e) {
    // A missing table is the only tolerated failure: it means the
    // migration has not been applied, so no entitlement can exist and
    // the answer is watermarked. Anything else is a real error.
    if (e instanceof ApiFailure && e.message === WATERMARK_NOT_SET_UP) {
      ready = false;
    } else {
      throw e;
    }
  }
  return { watermark: entitled ? null : { text: WATERMARK_TEXT }, entitled, ready };
}

/** The watermark the render carries, or null for a clean export. */
export async function resolveWatermark(
  admin: SupabaseClient,
  input: { ownerId: string; projectId: string; plan: string | null | undefined; expiresAt: string | null },
  now: Date = new Date(),
): Promise<Watermark | null> {
  return (await getWatermarkStatus(admin, input, now)).watermark;
}

/**
 * Grant the entitlement for one project, idempotently. A duplicate
 * webhook delivery finds the existing row by project (or by order) and
 * grants nothing twice; a racing grant loses on the project's UNIQUE key
 * and re-reads the winner. Exactly ONE entitlement row exists per project.
 */
export async function grantWatermarkEntitlement(
  admin: SupabaseClient,
  input: { ownerId: string; projectId: string; paymentId: string; orderId: string; amount: number; currency: string },
): Promise<{ granted: boolean; alreadyGranted: boolean; entitlement: WatermarkEntitlementRow | null }> {
  const byProject = await admin
    .from("watermark_entitlements")
    .select("*")
    .eq("project_id", input.projectId)
    .maybeSingle();
  if (byProject.error && !isMissingWatermarkTableError(byProject.error)) {
    throw new Error(`Watermark entitlement lookup failed: ${byProject.error.message ?? "unknown error"}`);
  }
  if (byProject.error && isMissingWatermarkTableError(byProject.error)) {
    throw new ApiFailure("INTERNAL", WATERMARK_NOT_SET_UP);
  }
  if (byProject.data) {
    return { granted: false, alreadyGranted: true, entitlement: byProject.data as WatermarkEntitlementRow };
  }
  const byOrder = await admin
    .from("watermark_entitlements")
    .select("*")
    .eq("cf_order_id", input.orderId)
    .maybeSingle();
  if (byOrder.error && !isMissingWatermarkTableError(byOrder.error)) {
    throw new Error(`Watermark entitlement lookup failed: ${byOrder.error.message ?? "unknown error"}`);
  }
  if (byOrder.data) {
    return { granted: false, alreadyGranted: true, entitlement: byOrder.data as WatermarkEntitlementRow };
  }
  const { data, error } = await admin
    .from("watermark_entitlements")
    .insert({
      project_id: input.projectId,
      owner_id: input.ownerId,
      payment_id: input.paymentId,
      cf_order_id: input.orderId,
      amount: input.amount,
      currency: input.currency,
      status: "paid",
    })
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      // A racing grant won on the UNIQUE project key — re-read the winner.
      const winner = await admin.from("watermark_entitlements").select("*").eq("project_id", input.projectId).maybeSingle();
      return { granted: false, alreadyGranted: true, entitlement: (winner.data as WatermarkEntitlementRow | null) ?? null };
    }
    if (isMissingWatermarkTableError(error)) throw new ApiFailure("INTERNAL", WATERMARK_NOT_SET_UP);
    throw new Error(`Watermark entitlement grant failed: ${error.message ?? "unknown error"}`);
  }
  return { granted: true, alreadyGranted: false, entitlement: (data as WatermarkEntitlementRow | null) ?? null };
}

/**
 * Revoke the removal for one order (refund): the entitlement row flips
 * to `refunded` and the project is watermarked again. The row is kept
 * as history — never deleted — so a re-delivered refund is a no-op.
 */
export async function revokeWatermarkEntitlement(admin: SupabaseClient, orderId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("watermark_entitlements")
    .update({ status: "refunded" })
    .eq("cf_order_id", orderId)
    .eq("status", "paid")
    .select("*")
    .maybeSingle();
  if (error) {
    if (isMissingWatermarkTableError(error)) return false;
    throw new Error(`Watermark entitlement revoke failed: ${error.message ?? "unknown error"}`);
  }
  return !!data;
}

/**
 * Settle a watermark payment as PAID and grant its entitlement. The
 * entitlement is granted FIRST (idempotent on project + order), then the
 * payment row moves — a payment is never marked paid without its
 * entitlement. An already-paid payment still attempts the grant (the
 * healing path for a payment settled while the table was missing).
 * Never touches profiles.plan or the minutes ledger: a watermark purchase
 * buys no plan and no minutes.
 */
export async function settleWatermarkPaid(admin: SupabaseClient, payment: PaymentRow, cfPaymentId: string | null): Promise<PaymentRow> {
  if (!isWatermarkPayment(payment)) throw new Error("settleWatermarkPaid called for a plan payment");
  if (payment.status !== "created" && payment.status !== "paid") return payment;
  if (!payment.project_id) throw new Error(`Watermark payment ${payment.id} has no project`);
  const now = new Date();
  const grant = await grantWatermarkEntitlement(admin, {
    ownerId: payment.owner_id,
    projectId: payment.project_id,
    paymentId: payment.id,
    orderId: payment.cf_order_id,
    amount: payment.amount,
    currency: payment.currency,
  });
  if (!grant.granted && !grant.alreadyGranted) {
    throw new Error(`Watermark settle failed: no entitlement for payment ${payment.id}`);
  }
  if (payment.status === "paid") return payment; // healing grant done; the row is already paid
  const { data: updated, error } = await admin
    .from("payments")
    .update({ status: "paid", cf_payment_id: cfPaymentId ?? payment.cf_payment_id, paid_at: now.toISOString() })
    .eq("id", payment.id)
    .eq("status", "created")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`Watermark settle update failed: ${error.message}`);
  return (updated as PaymentRow | null) ?? payment; // a racing settle won; the entitlement is already granted
}

/**
 * Settle a watermark refund: the payment is marked `refunded` and the
 * entitlement is revoked, so the project is watermarked again. A payment
 * that was never paid has no entitlement to revoke.
 */
export async function settleWatermarkRefunded(admin: SupabaseClient, payment: PaymentRow): Promise<PaymentRow> {
  if (!isWatermarkPayment(payment)) throw new Error("settleWatermarkRefunded called for a plan payment");
  if (payment.status === "paid") {
    const { data: updated, error } = await admin
      .from("payments")
      .update({ status: "refunded" })
      .eq("id", payment.id)
      .eq("status", "paid")
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`Watermark refund update failed: ${error.message}`);
    await revokeWatermarkEntitlement(admin, payment.cf_order_id);
    return (updated as PaymentRow | null) ?? payment;
  }
  return payment;
}
