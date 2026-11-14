import { z } from "zod";
import { effectivePlanId } from "@capseasy/shared";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, notFound, ok, parseBody, route } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/seo";
import { cashfreeConfig, createCashfreeOrder, newOrderId, type CashfreeConfig } from "@/lib/billing/cashfree";
import { getWatermarkStatus, isMissingWatermarkTableError, watermarkRemovalAmount } from "@/lib/billing/watermark";

const Body = z.object({ projectId: z.string().uuid() });

/**
 * Start a ₹69 watermark-removal purchase for ONE video project.
 *
 * Price comes from the plan config server-side (₹69, INR only — no USD
 * price is set, so there is no guessed conversion and no geo currency
 * choice here; the Builder 1 INR fallback is the rule). The payment row
 * is written BEFORE the Cashfree order so a webhook can never arrive for
 * an order we don't know, and it carries the product discriminator
 * (product "watermark", project_id) so the webhook settles it to a
 * per-project entitlement, never a plan.
 *
 * Refused when the project already exports clean (paid plan, or an
 * entitlement already exists) — there is nothing to buy. Guests can't
 * buy: a watermark removal attaches to an account's project.
 *
 * When Cashfree keys are not configured this answers { configured: false }
 * and the UI says payments are not switched on yet. When the watermark
 * tables are not applied yet it answers { configured: false, dbPending: true }
 * — no money is taken before the entitlement can be granted.
 */
export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  if (user.guest) {
    throw new ApiFailure("FORBIDDEN", "Guests can't remove the watermark — create a free account first, then buy the removal for your video.");
  }
  const body = await parseBody(req, Body);

  const { data: project } = await user.db.from("projects").select("id").eq("id", body.projectId).is("deleted_at", null).maybeSingle();
  if (!project) throw notFound("Project");

  const admin = getAdmin();
  const { data: profile } = await user.db.from("profiles").select("plan, plan_expires_at").eq("id", user.id).maybeSingle();
  const plan = (profile?.plan as string | undefined) ?? "free";
  const expiresAt = (profile as { plan_expires_at?: string | null } | null)?.plan_expires_at ?? null;
  if (effectivePlanId(plan, expiresAt) !== "free") {
    throw new ApiFailure("CONFLICT", "Paid plans already export clean — there is no watermark to remove on this video.");
  }

  // A missing entitlement table answers ready:false (never a throw) —
  // checkout is not available until the migration is applied.
  const status = await getWatermarkStatus(admin, { ownerId: user.id, projectId: body.projectId, plan, expiresAt });
  if (!status.ready) return ok({ configured: false as const, dbPending: true as const });
  if (!status.watermark) return ok({ configured: true as const, alreadyEntitled: true as const, projectId: body.projectId });

  const cfg = cashfreeConfig();
  if (!cfg.configured) return ok({ configured: false as const });

  const { amount, currency } = watermarkRemovalAmount();
  const orderId = newOrderId(user.id);

  const { error: insertError } = await admin.from("payments").insert({
    owner_id: user.id,
    cf_order_id: orderId,
    plan: "watermark",
    product: "watermark",
    project_id: body.projectId,
    amount,
    currency,
    status: "created",
  });
  if (insertError) {
    // The likeliest cause pre-launch: APPLY-WATERMARK-ENTITLEMENTS.sql
    // has not been run yet (the product/project_id columns are missing).
    if (isMissingWatermarkTableError(insertError) || insertError.code === "42P01" || insertError.code === "PGRST205" || insertError.code === "PGRST204") {
      return ok({ configured: false as const, dbPending: true as const });
    }
    throw new ApiFailure("INTERNAL", `Could not start the payment: ${insertError.message}`);
  }

  const origin = SITE_URL;
  let order;
  try {
    order = await createCashfreeOrder({
      orderId,
      amount,
      currency,
      customerId: user.id,
      customerEmail: user.email ?? "",
      customerPhone: "",
      returnUrl: `${origin}/settings/billing?order_id=${orderId}`,
      notifyUrl: `${origin}/api/v1/billing/webhook`,
      planId: "watermark",
      orderNote: "Captionit watermark removal — one video project",
      orderTags: { product: "watermark" },
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
    projectId: body.projectId,
  });
});

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
