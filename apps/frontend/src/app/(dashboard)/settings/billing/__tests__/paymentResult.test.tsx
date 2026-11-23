import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Billing return states (production-pages audit): after Cashfree sends the
 * visitor back with ?order_id, the page reconciles server-to-server and
 * shows a distinct success / failed / still-confirming state from the
 * reconcile response — never from the URL parameters, which are only a
 * hint for which order to ask the server about.
 */

vi.mock("@/components/studio/StudioShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const api = vi.hoisted(() => ({
  getImpl: null as null | ((...args: unknown[]) => Promise<unknown>),
  postImpl: null as null | ((...args: unknown[]) => Promise<unknown>),
}));

const launch = vi.hoisted(() => ({ active: false }));

vi.mock("@/lib/billing/freeLaunch", () => ({
  isFreeLaunchWindow: () => launch.active,
  FREE_LAUNCH_UNTIL_ISO: "2026-12-05T18:29:59.000Z",
  FREE_LAUNCH_UNTIL: new Date("2026-12-05T18:29:59.000Z"),
  FREE_LAUNCH_END_LABEL: "5 Dec",
  PAID_FROM_LABEL: "6 Dec",
}));

vi.mock("@/services/api-client", () => ({
  apiClient: {
    get: (...args: unknown[]) => api.getImpl!(...args),
    post: (...args: unknown[]) => api.postImpl!(...args),
  },
}));

import BillingPage from "../page";

const billingState = {
  configured: true,
  env: "sandbox",
  currency: "INR",
  plan: "free",
  storedPlan: "free",
  expiresAt: null,
  guest: false,
  payments: [],
  dbPending: false,
  videoQuota: null,
};

const paidPayment = {
  id: "pay-1",
  cf_order_id: "ord-1",
  plan: "starter",
  amount: 149,
  currency: "INR",
  status: "paid",
  created_at: "2026-11-23T00:00:00.000Z",
  paid_at: "2026-11-23T00:01:00.000Z",
  period_end: "2026-12-23T00:01:00.000Z",
};

beforeEach(() => {
  launch.active = false;
  api.getImpl = async () => billingState;
  window.history.pushState(null, "", "/settings/billing?order_id=ord-1");
});

afterEach(() => {
  window.history.pushState(null, "", "/");
});

describe("billing page payment return states", () => {
  it("shows an explicit success state from a paid reconcile (plan, amount, covers-until)", async () => {
    const post = vi.fn(async () => ({ payment: paidPayment }));
    api.postImpl = post;
    render(<BillingPage />);
    expect(await screen.findByText(/Payment confirmed — your new plan is active/)).toBeTruthy();
    expect(screen.getByText(/Starter · ₹149 · covers you until/)).toBeTruthy();
    expect(post).toHaveBeenCalledWith("/billing/reconcile", { json: { orderId: "ord-1" } });
  });

  it("shows an explicit failed state with the no-money-taken copy", async () => {
    api.postImpl = async () => ({ payment: { ...paidPayment, status: "failed", period_end: null } });
    render(<BillingPage />);
    expect(await screen.findByText("That payment didn't go through.")).toBeTruthy();
    expect(screen.getByText(/No money was taken for a failed payment/)).toBeTruthy();
  });

  it("shows a still-confirming state for a created payment, with a reconcile retry", async () => {
    const post = vi.fn(async () => ({ payment: { ...paidPayment, status: "created", period_end: null } }));
    api.postImpl = post;
    render(<BillingPage />);
    expect(await screen.findByText(/still confirming it with Cashfree/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post).toHaveBeenNthCalledWith(2, "/billing/reconcile", { json: { orderId: "ord-1" } });
  });

  it("shows an unconfirmed state when reconcile itself fails", async () => {
    api.postImpl = async () => {
      throw new Error("reconcile failed");
    };
    render(<BillingPage />);
    expect(await screen.findByText("We could not confirm that payment yet.")).toBeTruthy();
  });

  it("states the pass cannot be cancelled and simply expires", async () => {
    api.postImpl = async () => ({ payment: paidPayment });
    render(<BillingPage />);
    expect(await screen.findByText(/Passes cannot be cancelled — a pass simply expires/)).toBeTruthy();
  });
});
