import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { ApiFailure, ok, parseBody, route } from "@/lib/api/http";
import { getAdmin } from "@/lib/supabase/admin";
import { fetchCashfreeOrder } from "@/lib/billing/cashfree";
import { settleClosed, settlePaid, type PaymentRow } from "@/lib/billing/settle";

const Body = z.object({ orderId: z.string().min(1).max(60) });

/**
 * "Check status" after returning from Cashfree checkout: asks Cashfree
 * (server-to-server) what really happened to the caller's own order and
 * settles from THAT — the browser's return parameters are never trusted.
 */
export const POST = route(async (req: Request) => {
  const user = await requireUser(req);
  const body = await parseBody(req, Body);

  const admin = getAdmin();
  const { data } = await admin.from("payments").select("*").eq("cf_order_id", body.orderId).maybeSingle();
  const payment = data as PaymentRow | null;
  if (!payment || payment.owner_id !== user.id) throw new ApiFailure("NOT_FOUND", "Payment not found");
  if (payment.status === "paid" || payment.status === "failed" || payment.status === "expired") {
    return ok({ payment });
  }

  const fetched = await fetchCashfreeOrder(payment.cf_order_id);
  let settled = payment;
  if (fetched.status === "PAID") settled = await settlePaid(admin, payment, fetched.paymentId);
  else if (fetched.status === "EXPIRED") settled = await settleClosed(admin, payment, "expired");
  return ok({ payment: settled, cashfreeStatus: fetched.status });
});
