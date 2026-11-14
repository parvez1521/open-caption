"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PLAN_PRICING, PLANS, isLegacyPlanId, pricingFor, pricingForStoredPlan, type PlanId } from "@capseasy/shared";
import { USD_PRICE_UNSET_NOTE, hasUsdPrice, minutesLabel, priceLabel, type DisplayCurrency } from "@/lib/billing/pricingDisplay";
import StudioShell from "@/components/studio/StudioShell";
import { apiClient } from "@/services/api-client";
import { normalizeCustomerPhone } from "@/lib/billing/customerPhone";

interface PaymentRow {
  id: string;
  cf_order_id: string;
  plan: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  paid_at: string | null;
  period_end: string | null;
}

interface BillingState {
  configured: boolean;
  env: "sandbox" | "production";
  currency: DisplayCurrency;
  plan: PlanId;
  storedPlan: string;
  expiresAt: string | null;
  guest: boolean;
  payments: PaymentRow[];
  dbPending: boolean;
  videoQuota: { plan: PlanId; limit: number; used: number; remaining: number; windowStart: string; windowEnd: string } | null;
}

interface CheckoutResponse {
  configured: boolean;
  dbPending?: boolean;
  orderId?: string;
  paymentSessionId?: string;
  env?: "sandbox" | "production";
  amount?: number;
  currency?: DisplayCurrency;
  plan?: PlanId;
}

type CashfreeCheckoutResult = {
  redirect?: boolean;
  // The SDK resolves {error} instead of rejecting on validation failures
  // (e.g. a bad session) — the caller must surface it, or the failure is
  // silent. The error carries a message string (GeneralError).
  error?: { message?: string };
};

type CashfreeFactory = (opts: { mode: string }) => {
  checkout: (opts: { paymentSessionId: string; redirectTarget?: string }) => Promise<CashfreeCheckoutResult>;
};

declare global {
  interface Window {
    Cashfree?: CashfreeFactory;
  }
}

function loadCashfreeSdk(): Promise<CashfreeFactory> {
  if (window.Cashfree) return Promise.resolve(window.Cashfree);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.onload = () => (window.Cashfree ? resolve(window.Cashfree) : reject(new Error("Cashfree SDK did not initialise.")));
    script.onerror = () => reject(new Error("Could not load the Cashfree checkout. Check your connection and try again."));
    document.head.appendChild(script);
  });
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtMoney = (amount: number, currency: string) =>
  currency === "INR" ? `₹${amount.toLocaleString("en-IN")}` : `$${amount}`;

export default function BillingPage() {
  const [state, setState] = useState<BillingState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const reconciled = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await apiClient.get<BillingState>("/billing/me");
      setState(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load your billing details.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Returning from Cashfree: the ?order_id in the URL is only a hint — the
  // reconcile call asks the server to confirm with Cashfree directly.
  useEffect(() => {
    if (reconciled.current) return;
    const orderId = new URLSearchParams(window.location.search).get("order_id");
    if (!orderId) return;
    reconciled.current = true;
    void (async () => {
      try {
        const res = await apiClient.post<{ payment: PaymentRow }>("/billing/reconcile", { json: { orderId } });
        setNotice(
          res.payment.status === "paid"
            ? "Payment confirmed — your new plan is active. Thank you!"
            : res.payment.status === "failed"
              ? "That payment didn't go through. No money was taken for a failed payment — you can try again below."
              : "We're still confirming that payment with Cashfree. Refresh in a moment — your plan updates automatically once it's confirmed.",
        );
      } catch {
        setNotice("We couldn't confirm that payment yet. If money left your account, your plan updates automatically via Cashfree's confirmation — check back in a few minutes.");
      }
      window.history.replaceState(null, "", window.location.pathname);
      await load();
    })();
  }, [load]);

  const buy = async (plan: PlanId) => {
    // Cashfree needs a mobile number to create the order — never start
    // checkout without a valid one.
    const validPhone = normalizeCustomerPhone(phone);
    if (!validPhone) {
      setPhoneError("Add a valid mobile number to continue.");
      return;
    }
    setPhoneError(null);
    setBusyPlan(plan);
    setNotice(null);
    try {
      const res = await apiClient.post<CheckoutResponse>("/billing/checkout", { json: { plan, customerPhone: validPhone } });
      if (!res.configured || !res.paymentSessionId) {
        setNotice("Payments aren't switched on for Captionit yet — plans can't be bought right now. Your current plan and limits are unchanged.");
        return;
      }
      const cashfree = await loadCashfreeSdk();
      // redirectTarget is the SDK's option name (returnTarget does not
      // exist — the SDK ignores it). It defaults to "_self"; pass it
      // explicitly so a future SDK change cannot silently flip the flow.
      const result = await cashfree({ mode: res.env ?? "sandbox" }).checkout({
        paymentSessionId: res.paymentSessionId,
        redirectTarget: "_self",
      });
      // checkout() resolves {error} on SDK-side failures instead of
      // rejecting — show it, or the button just reverts with no message.
      if (result?.error) {
        setNotice(result.error.message || "Checkout didn't start. Please try again.");
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Checkout didn't start. Please try again.");
    } finally {
      setBusyPlan(null);
    }
  };

  return (
    <StudioShell>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-10 sm:py-10">
        <div className="border-b border-sand-200 pb-8">
          <h1 className="font-serif text-3xl font-semibold tracking-[-0.015em] text-ink sm:text-4xl">
            Plan &amp; <em className="italic text-sand-600">billing</em>
          </h1>
          <p className="mt-2 text-[14px] text-sand-800">
            Paid plans are monthly. Minutes reset each billing cycle. Unused minutes do not roll over.
          </p>
        </div>

        {loadError ? (
          <p className="mt-8 rounded-xl border border-sand-200 bg-sand-100 p-5 text-[14px] text-sand-800" role="alert">
            {loadError}{" "}
            <button type="button" onClick={() => void load()} className="font-semibold text-ink underline">
              Retry
            </button>
          </p>
        ) : !state ? (
          <div className="mt-8 h-32 animate-pulse rounded-xl bg-sand-100" aria-label="Loading billing details" />
        ) : (
          <>
            <section className="pt-8" aria-label="Current plan">
              <h2 className="font-sora text-[15px] font-bold text-ink">Your plan</h2>
              <div className="mt-4 rounded-xl border border-sand-200 bg-sand-100 p-6">
                <p className="font-sora text-[18px] font-bold text-ink">
                  {pricingFor(state.plan).name}
                  {state.plan !== "free" && state.expiresAt ? (
                    <span className="ml-3 text-[13px] font-medium text-sand-600">active until {fmtDate(state.expiresAt)}</span>
                  ) : null}
                </p>
                <p className="mt-2 text-[13.5px] leading-relaxed text-sand-800">
                  Up to {PLANS[state.plan].maxProjects} projects · uploads to{" "}
                  {Math.round(PLANS[state.plan].maxUploadBytes / 1_000_000)} MB · videos to{" "}
                  {Math.round(PLANS[state.plan].maxDurationSec / 60)} minutes · exports kept{" "}
                  {PLANS[state.plan].exportRetentionDays} days.
                </p>
                <p className="mt-2 text-[13.5px] leading-relaxed text-sand-800">
                  {minutesLabel(PLANS[state.plan].minutesPerCycle, PLANS[state.plan].minutesOneTime)}.
                </p>
                <p className="mt-2 text-[13.5px] leading-relaxed text-sand-800">
                  Minutes used: coming with the minutes ledger.
                </p>
                {state.videoQuota ? (
                  <p className="mt-2 text-[13.5px] leading-relaxed text-sand-800">
                    {state.videoQuota.remaining} of {state.videoQuota.limit} videos left this month.
                  </p>
                ) : null}
                {state.storedPlan !== state.plan && state.plan === "free" ? (
                  <p className="mt-2 text-[13px] text-sand-600">
                    Your {pricingForStoredPlan(state.storedPlan).name} pass has ended, so Free limits apply until
                    you buy a new pass.
                  </p>
                ) : null}
                {isLegacyPlanId(state.storedPlan) && state.plan === "creator" && state.expiresAt ? (
                  <p className="mt-2 text-[13px] text-sand-600">
                    Your Plus pass is honoured until {fmtDate(state.expiresAt)}. It reads as Creator until then.
                    Renewal buys the new plan.
                  </p>
                ) : null}
                {state.guest ? (
                  <p className="mt-3 text-[13.5px] text-sand-800">
                    You&rsquo;re working as a guest.{" "}
                    <Link href="/login" className="font-semibold text-ink underline">
                      Create a free account
                    </Link>{" "}
                    before buying a plan, so the plan attaches to an account you can sign back into.
                  </p>
                ) : null}
                {!state.configured ? (
                  <p className="mt-3 rounded-lg border border-sand-200 bg-sand-50 px-4 py-3 text-[13px] leading-relaxed text-sand-700">
                    Payments aren&rsquo;t switched on yet — checkout opens as soon as the payment gateway is connected.
                    Nothing below can charge you until then.
                  </p>
                ) : state.env === "sandbox" ? (
                  <p className="mt-3 rounded-lg border border-sand-200 bg-sand-50 px-4 py-3 text-[13px] leading-relaxed text-sand-700">
                    Checkout is in test mode right now — test payments only, no real money moves.
                  </p>
                ) : null}
              </div>
            </section>

            {notice ? (
              <p className="mt-6 rounded-xl border border-sand-200 bg-sand-100 p-5 text-[14px] leading-relaxed text-sand-800" role="status">
                {notice}
              </p>
            ) : null}

            <section className="pt-10" aria-label="Plans">
              <h2 className="font-sora text-[15px] font-bold text-ink">Plans</h2>
              <div className="mt-4">
                <label htmlFor="checkout-phone" className="font-sora text-[13.5px] font-semibold text-ink">
                  Mobile number
                </label>
                <p className="mt-1 text-[13px] text-sand-700">Cashfree needs your mobile number to start the payment.</p>
                <input
                  id="checkout-phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setPhoneError(null);
                  }}
                  placeholder="98765 43210"
                  aria-invalid={phoneError ? true : undefined}
                  aria-describedby={phoneError ? "checkout-phone-error" : undefined}
                  className="mt-2 w-full max-w-xs rounded-xl border border-sand-200 bg-sand-50 px-4 py-2.5 text-[14px] text-ink outline-none focus:border-ink"
                />
                {phoneError ? (
                  <p id="checkout-phone-error" role="alert" className="mt-2 text-[13px] font-semibold text-ink">
                    {phoneError}
                  </p>
                ) : null}
              </div>
              <div className="mt-4 space-y-3">
                {PLAN_PRICING.filter((p) => p.id !== "free").map((entry) => {
                  const price = priceLabel(entry, state.currency);
                  const isCurrent = state.plan === entry.id;
                  return (
                    <div
                      key={entry.id}
                      className="flex flex-wrap items-center gap-4 rounded-xl border border-sand-200 bg-sand-100 px-5 py-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-sora text-[15px] font-bold text-ink">
                          {entry.name}{" "}
                          {entry.isMostPopular ? (
                            <span className="ml-1 rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-sand-50">
                              Most Popular
                            </span>
                          ) : null}{" "}
                          <span className="ml-2 font-serif text-[18px]">{price}</span>
                          <span className="ml-1 text-[12.5px] font-medium text-sand-600">/ month</span>
                        </p>
                        <p className="mt-0.5 text-[13px] text-sand-700">{entry.tagline}</p>
                        <p className="mt-0.5 text-[13px] text-sand-700">
                          {minutesLabel(PLANS[entry.id as PlanId].minutesPerCycle, PLANS[entry.id as PlanId].minutesOneTime)}
                        </p>
                      </div>
                      {isCurrent ? (
                        <span className="rounded-full border border-sand-300 px-4 py-2 text-[13px] font-semibold text-sand-700">
                          Current plan
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busyPlan !== null || state.guest}
                          onClick={() => void buy(entry.id as PlanId)}
                          className="rounded-full bg-ink px-5 py-2.5 font-sora text-[13.5px] font-semibold text-sand-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busyPlan === entry.id ? "Opening checkout…" : state.plan === "free" ? `Get ${entry.name}` : `Switch to ${entry.name}`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {state.currency === "USD" && PLAN_PRICING.some((p) => !hasUsdPrice(p)) ? (
                <p className="mt-3 text-[12.5px] leading-relaxed text-sand-600">{USD_PRICE_UNSET_NOTE}</p>
              ) : null}
              <p className="mt-3 text-[12.5px] leading-relaxed text-sand-600">
                Minutes reset each billing cycle. Unused minutes do not roll over. Old 30-day passes run to their
                expiry date. Renewal buys the new plan, not the old one. Full comparison on the{" "}
                <Link href="/pricing" className="underline">
                  pricing page
                </Link>
                .
              </p>
            </section>

            <section className="pt-10" aria-label="Payment history">
              <h2 className="font-sora text-[15px] font-bold text-ink">Payments</h2>
              {state.payments.length === 0 ? (
                <p className="mt-4 rounded-xl border border-sand-200 bg-sand-100 p-5 text-[13.5px] text-sand-700">
                  No payments yet. When you buy a plan, each payment and the period it covers will be listed here.
                </p>
              ) : (
                <div className="mt-4 overflow-x-auto rounded-xl border border-sand-200">
                  <table className="w-full min-w-[520px] text-left text-[13.5px]">
                    <thead>
                      <tr className="border-b border-sand-200 bg-sand-100 text-sand-600">
                        <th className="px-4 py-3 font-sora text-[12px] font-semibold">Date</th>
                        <th className="px-4 py-3 font-sora text-[12px] font-semibold">Plan</th>
                        <th className="px-4 py-3 font-sora text-[12px] font-semibold">Amount</th>
                        <th className="px-4 py-3 font-sora text-[12px] font-semibold">Status</th>
                        <th className="px-4 py-3 font-sora text-[12px] font-semibold">Covers until</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.payments.map((p) => (
                        <tr key={p.id} className="border-b border-sand-200/60 last:border-0">
                          <td className="px-4 py-3 text-sand-800">{fmtDate(p.created_at)}</td>
                          <td className="px-4 py-3 text-sand-800">{pricingForStoredPlan(p.plan).name}</td>
                          <td className="px-4 py-3 text-sand-800">{fmtMoney(p.amount, p.currency)}</td>
                          <td className="px-4 py-3 text-sand-800">
                            {p.status === "paid" ? "Paid" : p.status === "created" ? "Started, not completed" : p.status === "failed" ? "Failed" : "Expired"}
                          </td>
                          <td className="px-4 py-3 text-sand-800">{p.status === "paid" ? fmtDate(p.period_end) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </StudioShell>
  );
}
