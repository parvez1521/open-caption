import { getAdmin } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/billing/cashfree";
import { findPaymentByOrderId, settleClosed, settlePaid } from "@/lib/billing/settle";

/**
 * Cashfree webhook — the ONLY channel that can grant a plan on its own.
 * The signature is verified against the RAW body bytes before anything is
 * parsed (Cashfree signs timestamp + raw payload). Unknown orders and
 * already-settled payments answer 200 so Cashfree stops retrying; a bad
 * signature answers 401 and changes nothing.
 *
 * Configure this URL in the Cashfree dashboard:
 *   <site>/api/v1/billing/webhook
 */
export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature");
  const timestamp = req.headers.get("x-webhook-timestamp");
  if (!verifyWebhookSignature({ signature, timestamp, rawBody })) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: { type?: string; data?: { order?: { order_id?: string }; payment?: { cf_payment_id?: number | string; payment_status?: string } } };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  const orderId = event.data?.order?.order_id;
  if (!orderId) return new Response("OK", { status: 200 });

  const admin = getAdmin();
  const payment = await findPaymentByOrderId(admin, orderId);
  if (!payment) return new Response("OK", { status: 200 });

  const cfPaymentId = event.data?.payment?.cf_payment_id != null ? String(event.data.payment.cf_payment_id) : null;
  try {
    if (event.type === "PAYMENT_SUCCESS_WEBHOOK") {
      await settlePaid(admin, payment, cfPaymentId);
    } else if (event.type === "PAYMENT_FAILED_WEBHOOK") {
      await settleClosed(admin, payment, "failed");
    } else if (event.type === "PAYMENT_USER_DROPPED_WEBHOOK") {
      await settleClosed(admin, payment, "expired");
    }
  } catch (e) {
    // A settle failure must surface as a non-200 so Cashfree retries —
    // swallowing it would strand a real payment.
    console.error(JSON.stringify({ level: "error", msg: "billing webhook settle failed", orderId, err: e instanceof Error ? e.message : String(e) }));
    return new Response("Settle failed", { status: 500 });
  }
  return new Response("OK", { status: 200 });
}
