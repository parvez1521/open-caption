import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Billing page: when checkout creation fails, the notice shows the server's
 * real error (e.g. Cashfree's message) — not the generic "Something went
 * wrong". The page already renders `e.message` from the apiClient error;
 * this pins that behaviour against a regression to a hardcoded generic.
 */

vi.mock("@/components/studio/StudioShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const api = vi.hoisted(() => ({
  getImpl: null as null | ((...args: unknown[]) => Promise<unknown>),
  postImpl: null as null | ((...args: unknown[]) => Promise<unknown>),
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
};

beforeEach(() => {
  api.getImpl = async () => billingState;
  api.postImpl = async () => {
    throw new Error("Cashfree /pg/orders failed (401): Invalid client id or secret");
  };
});

describe("billing page checkout failure", () => {
  it("shows the server's Cashfree error instead of a generic message", async () => {
    render(<BillingPage />);
    fireEvent.change(await screen.findByLabelText("Mobile number"), { target: { value: "9876543210" } });
    fireEvent.click(await screen.findByRole("button", { name: "Get Starter" }));
    expect(await screen.findByText(/Cashfree \/pg\/orders failed \(401\): Invalid client id or secret/)).toBeTruthy();
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });
});

describe("billing page phone at checkout", () => {
  it("does not send the order without a valid phone number", async () => {
    const post = vi.fn(async () => ({ configured: true, paymentSessionId: "sess-1" }));
    api.postImpl = post;
    render(<BillingPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Get Starter" }));
    expect(await screen.findByText("Add a valid mobile number to continue.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it("sends the cleaned phone with the order once it is valid", async () => {
    const post = vi.fn(async () => ({ configured: true, paymentSessionId: "sess-1" }));
    api.postImpl = post;
    render(<BillingPage />);
    fireEvent.change(await screen.findByLabelText("Mobile number"), { target: { value: "98765 43210" } });
    fireEvent.click(await screen.findByRole("button", { name: "Get Starter" }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/billing/checkout", { json: { plan: "starter", customerPhone: "9876543210" } });
  });
});

describe("billing page Cashfree SDK checkout", () => {
  const checkoutMock = vi.fn();
  const cashfreeFactory = vi.fn(() => ({ checkout: checkoutMock }));

  beforeEach(() => {
    checkoutMock.mockReset();
    cashfreeFactory.mockClear();
    // loadCashfreeSdk() returns window.Cashfree when it exists, so the
    // tests never append the real SDK script tag.
    (window as unknown as { Cashfree?: unknown }).Cashfree = cashfreeFactory;
    api.postImpl = async () => ({ configured: true, paymentSessionId: "sess-1" });
  });

  afterEach(() => {
    delete (window as unknown as { Cashfree?: unknown }).Cashfree;
  });

  const startCheckout = async () => {
    render(<BillingPage />);
    fireEvent.change(await screen.findByLabelText("Mobile number"), { target: { value: "9876543210" } });
    fireEvent.click(await screen.findByRole("button", { name: "Get Starter" }));
  };

  it("passes redirectTarget _self to the SDK (returnTarget does not exist)", async () => {
    checkoutMock.mockResolvedValue({ redirect: true });
    await startCheckout();
    await waitFor(() => expect(checkoutMock).toHaveBeenCalled());
    expect(checkoutMock).toHaveBeenCalledWith({ paymentSessionId: "sess-1", redirectTarget: "_self" });
  });

  it("shows the SDK's error when checkout resolves {error} instead of rejecting", async () => {
    checkoutMock.mockResolvedValue({ error: { message: "paymentSessionId is missing in options" } });
    await startCheckout();
    expect(await screen.findByText("paymentSessionId is missing in options")).toBeTruthy();
  });

  it("shows no notice when checkout resolves {redirect: true}", async () => {
    checkoutMock.mockResolvedValue({ redirect: true });
    await startCheckout();
    await waitFor(() => expect(checkoutMock).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
describe("billing page plan display (new minutes model)", () => {
  it("shows the minutes allowance, the real minutes usage, and the Most Popular marker", async () => {
    api.getImpl = async () => ({
      ...billingState,
      plan: "creator",
      storedPlan: "creator",
      expiresAt: "2026-12-14T00:00:00.000Z",
      minutes: { plan: "creator", granted: 100, used: 12, remaining: 88, cycleStart: "2026-11-14T00:00:00.000Z", cycleEnd: "2026-12-14T00:00:00.000Z", freeGranted: false },
    });
    render(<BillingPage />);
    expect((await screen.findAllByText(/100 processing minutes a month/)).length).toBeGreaterThanOrEqual(1);
    // Real usage from the minutes ledger — the old "coming with the
    // minutes ledger" placeholder is gone.
    expect(await screen.findByText(/88 of 100 minutes left/)).toBeTruthy();
    expect(screen.queryByText(/coming with the minutes ledger/)).toBeNull();
    expect((await screen.findAllByText("Most Popular")).length).toBe(1);
    expect(screen.queryByText(/Paid plans are 30-day passes/)).toBeNull();
    expect(screen.queryByText(/adds 30 days to your current period/)).toBeNull();
  });

  it("shows a live old Plus pass as Creator, honoured to its expiry date", async () => {
    api.getImpl = async () => ({ ...billingState, plan: "creator", storedPlan: "growth", expiresAt: "2026-12-14T00:00:00.000Z" });
    render(<BillingPage />);
    expect(await screen.findByText(/Your Plus pass is honoured until/)).toBeTruthy();
  });
});
