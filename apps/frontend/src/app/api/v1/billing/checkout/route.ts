import { z } from "zod";
import { PLAN_PRICING, planIdFor } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/seo";
import { cashfreeConfig, createCashfreeOrder, currencyForCountry, newOrderId } from "@/lib/billing/cashfree";

const Body = z.object({ plan: z.string().min(1).max(20) });

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

  const cfg = cashfreeConfig();
  if (!cfg.configured) return ok({ configured: false as const });

  const currency = currencyForCountry(req.headers.get("x-vercel-ip-country"));
  const amount = currency === "INR" ? pricing.priceInr : pricing.priceUsd;
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
  const order = await createCashfreeOrder({
    orderId,
    amount,
    currency,
    customerId: user.id,
    customerEmail: user.email ?? "",
    customerPhone: "",
    returnUrl: `${origin}/settings/billing?order_id=${orderId}`,
    notifyUrl: `${origin}/api/v1/billing/webhook`,
    planId,
  });

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
