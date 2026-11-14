import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
