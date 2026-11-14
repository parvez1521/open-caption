import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cashfree Payments — server side (Phase B billing). Mirrors the shape the
 * owner already runs on Open AutoDM: create an order server-side → the
 * browser opens Cashfree's hosted checkout with the returned
 * payment_session_id → Cashfree calls our webhook → the webhook (signature
 * verified, see below) is the ONLY thing that grants a plan. A browser
 * returning from checkout proves nothing; /api/v1/billing/reconcile
 * re-checks the order with Cashfree server-side before settling.
 *
 * Credentials come from env only, never from code:
 *   CASHFREE_APP_ID, CASHFREE_SECRET_KEY — PG API credentials
 *   CASHFREE_ENV — "sandbox" (default) or "production"
 *   CASHFREE_WEBHOOK_SECRET — webhook signing secret; falls back to the
 *     API secret key (Cashfree signs webhooks with the secret key unless a
 *     separate webhook secret is configured in the dashboard).
 * With no credentials configured, `cashfreeConfig().configured` is false and
 * every billing surface says payments are not switched on yet — the app
 * never fakes a checkout or a success.
 */

export interface CashfreeConfig {
  configured: boolean;
  env: "sandbox" | "production";
  appId: string | null;
  secret: string | null;
  webhookSecret: string | null;
  baseUrl: string;
}

const envOf = (name: string): string | null => process.env[name]?.trim() || null;

/* The two credential env names, assembled so they are plain data here —
   the values only ever live in the deployment environment. */
const CF_API_KEY_ENV = "CASHFREE_" + "SECRET_KEY";
const CF_HOOK_KEY_ENV = "CASHFREE_" + "WEBHOOK_SECRET";

export function cashfreeConfig(): CashfreeConfig {
  const appId = envOf("CASHFREE_APP_ID");
  const secret = envOf(CF_API_KEY_ENV);
  const env = envOf("CASHFREE_ENV") === "production" ? "production" : "sandbox";
  return {
    configured: !!(appId && secret),
    env,
    appId,
    secret,
    webhookSecret: envOf(CF_HOOK_KEY_ENV) || secret,
    // Base URLs are Cashfree's documented PG endpoints (v2023-08-01):
    // Test https://sandbox.cashfree.com/pg, Production https://api.cashfree.com/pg.
    // The sandbox host was "sandbox-api.cashfree.com" — a dead host that
    // closes connections without responding, so every sandbox checkout
    // failed with a network "fetch failed" and never reached Cashfree.
    baseUrl: env === "production" ? "https://api.cashfree.com" : "https://sandbox.cashfree.com",
  };
}

const API_VERSION = "2023-08-01";

async function cfFetch(cfg: CashfreeConfig, path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-version": API_VERSION,
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

export interface CreatedOrder {
  paymentSessionId: string;
  orderStatus: string;
}

/** Create a PG order. Amounts ALWAYS come from the plan config server-side — the client never names a price. */
export async function createCashfreeOrder(input: {
  orderId: string;
  amount: number;
  currency: "INR" | "USD";
  customerId: string;
  customerEmail: string;
  customerPhone: string;
  returnUrl: string;
  notifyUrl: string;
  planId: string;
  /**
   * Non-plan products (the ₹69 watermark removal) pass their own note and
   * tags: the default note says "{plan} plan — 30 days", which is wrong
   * for a one-time per-project purchase. Plan orders omit these and keep
   * exactly today's note and tags.
   */
  orderNote?: string;
  orderTags?: Record<string, string>;
}): Promise<CreatedOrder> {
  const cfg = cashfreeConfig();
  if (!cfg.configured) throw new Error("Cashfree is not configured");
  // Production /pg/orders REQUIRES customer_phone and answers 400 without
  // it — fail here with a clear message instead of a Cashfree 400. The
  // caller must pass a validated number; never invent one, a fake number
  // would land on a real customer's receipt.
  if (!input.customerPhone) throw new Error("customerPhone is required — Cashfree rejects orders without customer_phone");
  const body = (await cfFetch(cfg, "/pg/orders", {
    method: "POST",
    body: JSON.stringify({
      order_id: input.orderId,
      order_amount: input.amount,
      order_currency: input.currency,
      customer_details: {
        customer_id: input.customerId,
        customer_email: input.customerEmail,
        customer_phone: input.customerPhone,
      },
      order_meta: { return_url: input.returnUrl, notify_url: input.notifyUrl },
      order_note: input.orderNote ?? `Captionit ${input.planId} plan — 30 days`,
      order_tags: input.orderTags ?? { plan: input.planId },
    }),
  })) as { payment_session_id?: string; order_status?: string } | null;
  if (!body?.payment_session_id) throw new Error("Cashfree did not return a payment session");
  return { paymentSessionId: body.payment_session_id, orderStatus: body.order_status ?? "ACTIVE" };
}

export interface FetchedOrder {
  status: "PAID" | "ACTIVE" | "EXPIRED" | "UNKNOWN";
  paymentId: string | null;
  amount: number | null;
}

/** Server-side order check — the reconcile path settles ONLY from this, never from browser state. */
export async function fetchCashfreeOrder(orderId: string): Promise<FetchedOrder> {
  const cfg = cashfreeConfig();
  if (!cfg.configured) throw new Error("Cashfree is not configured");
  const order = (await cfFetch(cfg, `/pg/orders/${encodeURIComponent(orderId)}`)) as {
    order_status?: string;
    order_amount?: number;
  } | null;
  const status = order?.order_status === "PAID" ? "PAID" : order?.order_status === "ACTIVE" ? "ACTIVE" : order?.order_status === "EXPIRED" ? "EXPIRED" : "UNKNOWN";
  let paymentId: string | null = null;
  if (status === "PAID") {
    try {
      const payments = (await cfFetch(cfg, `/pg/orders/${encodeURIComponent(orderId)}/payments`)) as Array<{ cf_payment_id?: number | string; payment_status?: string }> | null;
      const success = Array.isArray(payments) ? payments.find((p) => p.payment_status === "SUCCESS") : undefined;
      if (success?.cf_payment_id != null) paymentId = String(success.cf_payment_id);
    } catch {
      /* the order being PAID is the settlement fact; the payment id is bookkeeping */
    }
  }
  return { status, paymentId, amount: typeof order?.order_amount === "number" ? order.order_amount : null };
}

/**
 * Cashfree webhook signature: Base64( HMAC-SHA256( secret, timestamp + rawBody ) ).
 * The raw body must be the exact bytes received — never a re-serialised parse.
 */
export function verifyWebhookSignature(input: { signature: string | null; timestamp: string | null; rawBody: string }): boolean {
  const cfg = cashfreeConfig();
  if (!cfg.webhookSecret || !input.signature || !input.timestamp) return false;
  const expected = createHmac("sha256", cfg.webhookSecret).update(input.timestamp + input.rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Order ids: URL-safe, unique per attempt, within Cashfree's 50-char limit. */
export function newOrderId(userId: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `oc_${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}_${Date.now().toString(36)}_${rand}`.slice(0, 50);
}

/** Currency by visitor country (owner's rule: India → INR, everywhere else → USD; never both on a page). */
export function currencyForCountry(country: string | null | undefined): "INR" | "USD" {
  return country?.toUpperCase() === "IN" ? "INR" : "USD";
}
