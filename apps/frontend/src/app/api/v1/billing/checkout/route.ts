import { z } from "zod";
import { PLAN_PRICING, planIdFor } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/seo";
import { cashfreeConfig, createCashfreeOrder, currencyForCountry, newOrderId, type CashfreeConfig } from "@/lib/billing/cashfree";
import { normalizeCustomerPhone } from "@/lib/billing/customerPhone";

const Body = z.object({ plan: z.string().min(1).max(20), customerPhone: z.string().max(20).optional() });

/**
 * Cashfree's order error is a status + their message only — it never
 * contains a credential — but redact any configured credential value that
 * somehow got into it before it reaches the client, so a checkout failure
 * can be diagnosed from the UI without ever leaking a key.
 */
function redactCredentials(message: string, cfg: CashfreeConfig): string {
  const secrets = [cfg.appId, cfg.secret, cfg.webhookSecret].filter((v): v is string => v !== null);
  return secrets.reduce((m, v) => m.split(v).join("[redacted]"), message);
}

/**
 * Start a plan purchase: price comes from the plan config (never the
 * client), currency from the visitor's country (India → INR, else USD —
 * the two are never mixed), and the payment row is written BEFORE the
 * Cashfree order so a webhook can never arrive for an order we don't know.
 *
 * When Cashfree keys are not configured this answers { configured: false }
 * and the billing UI says payments are not switched on yet — there is no
 * fake checkout and no simulated success.
 */
export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  if (user.guest) {
    throw new ApiFailure("FORBIDDEN", "Guests can't buy a plan — create a free account first, then upgrade.");
  }
  const body = await parseBody(req, Body);
  const planId = planIdFor(body.plan);
  const pricing = PLAN_PRICING.find((p) => p.id === planId);
  if (!pricing || planId === "free" || pricing.priceInr <= 0) {
    throw new ApiFailure("VALIDATION", "That is not a purchasable plan.");
  }

  // Cashfree's production /pg/orders REQUIRES customer_details.customer_phone
  // and answers 400 without it. Check before the payments row is written,
  // so a bad number leaves no orphan row behind.
  const phone = normalizeCustomerPhone(body.customerPhone);
  if (!phone) {
    throw new ApiFailure("VALIDATION", "Add a valid mobile number to continue.");
  }

  const cfg = cashfreeConfig();
  if (!cfg.configured) return ok({ configured: false as const });

  // USD prices are not set yet (owner brief gives INR only), so a
  // non-India visitor pays in INR for now — never a guessed conversion.
  const geoCurrency = currencyForCountry(req.headers.get("x-vercel-ip-country"));
  const currency = pricing.priceUsd === null ? "INR" : geoCurrency;
  const amount = currency === "INR" ? pricing.priceInr : (pricing.priceUsd ?? pricing.priceInr);
  const orderId = newOrderId(user.id);

  const admin = getAdmin();
  const { error: insertError } = await admin.from("payments").insert({
    owner_id: user.id,
    cf_order_id: orderId,
    plan: planId,
    amount,
    currency,
    status: "created",
  });
  if (insertError) {
    // The likeliest cause pre-launch: APPLY-BILLING.sql has not been run yet.
    if (insertError.code === "42P01" || insertError.code === "PGRST205" || insertError.code === "PGRST204") {
      return ok({ configured: false as const, dbPending: true as const });
    }
    throw new ApiFailure("INTERNAL", `Could not start the payment: ${insertError.message}`);
  }

  const origin = SITE_URL;
  // A Cashfree order failure used to throw a plain Error, which the route
  // wrapper answers with the generic "Something went wrong" — the real
  // reason (e.g. bad credentials, a rejected order) was invisible in the
  // UI and only in the server log. Surface it so the failure can be
  // diagnosed from the billing page itself.
  let order;
  try {
    order = await createCashfreeOrder({
      orderId,
      amount,
      currency,
      customerId: user.id,
      customerEmail: user.email ?? "",
      customerPhone: phone,
      returnUrl: `${origin}/settings/billing?order_id=${orderId}`,
      notifyUrl: `${origin}/api/v1/billing/webhook`,
      planId,
    });
  } catch (e) {
    throw new ApiFailure("INTERNAL", redactCredentials(e instanceof Error ? e.message : "Checkout could not be started.", cfg));
  }

  return ok({
    configured: true as const,
    orderId,
    paymentSessionId: order.paymentSessionId,
    env: cfg.env,
    amount,
    currency,
    plan: planId,
  });
});
