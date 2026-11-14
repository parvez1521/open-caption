// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { POST } from "../route";

/**
 * Subscription cancel: the caller's own subscription is cancelled at
 * Cashfree first, then marked cancelled locally — access runs to the
 * paid period end. Another user's subscription is not found, and an
 * already-cancelled row is a no-op.
 */

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  cancelCalls: [] as string[],
}));

vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", email: "user@example.test", token: "tok", guest: false, db: {} }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdmin: () => ({
    from: (t: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: (state.tables[t] ?? [])[0] ?? null, error: null }),
        }),
      }),
      update: (row: Record<string, unknown>) => ({
        eq: () => ({
          select: () => ({
            maybeSingle: async () => {
              const target = (state.tables[t] ?? [])[0];
              if (!target) return { data: null, error: null };
              Object.assign(target, row);
              return { data: target, error: null };
            },
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/billing/cashfree", () => ({
  cashfreeConfig: () => ({
    configured: true,
    env: "sandbox",
    appId: "TEST-APP-ID",
    secret: "TEST-SECRET",
    webhookSecret: "TEST-SECRET",
    baseUrl: "https://sandbox-api.cashfree.com",
  }),
}));

vi.mock("@/lib/billing/cashfreeSubscriptions", () => ({
  cancelCashfreeSubscription: async (id: string) => {
    state.cancelCalls.push(id);
    return { status: "cancelled", rawStatus: "CANCELLED", planId: null, nextChargeAt: null, periodStart: null, periodEnd: null, authorizationPaymentId: null };
  },
}));

const call = (body: Record<string, unknown>) =>
  POST(
    new Request("https://example.test/api/v1/billing/subscription/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  state.cancelCalls = [];
  state.tables = {
    subscriptions: [
      {
        id: "sub-1",
        owner_id: "user-1",
        cf_subscription_id: "ocs_1",
        plan: "starter",
        status: "active",
        period_start: "2026-11-14T00:00:00Z",
        period_end: "2026-12-14T00:00:00Z",
        refunded_charge_ids: [],
        cancelled_at: null,
      },
    ],
    profiles: [{ id: "user-1", plan: "starter", plan_expires_at: "2026-12-14T00:00:00Z" }],
  };
});

describe("billing subscription cancel", () => {
  it("cancels at Cashfree and marks the row cancelled, keeping the plan", async () => {
    const res = await call({ subscriptionId: "ocs_1" });
    const body = (await res.json()) as { success: boolean; data?: { subscription?: Record<string, unknown> } };
    expect(res.status).toBe(200);
    expect(state.cancelCalls).toEqual(["ocs_1"]);
    expect(body.data?.subscription?.status).toBe("cancelled");
    expect(state.tables.subscriptions[0]!.cancelled_at).toBeTruthy();
    expect(state.tables.profiles[0]).toMatchObject({ plan: "starter", plan_expires_at: "2026-12-14T00:00:00Z" });
  });

  it("does not find another user's subscription", async () => {
    state.tables.subscriptions[0]!.owner_id = "user-2";
    const res = await call({ subscriptionId: "ocs_1" });
    expect(res.status).toBe(404);
    expect(state.cancelCalls).toHaveLength(0);
  });

  it("an already-cancelled subscription does not call Cashfree again", async () => {
    state.tables.subscriptions[0]!.status = "cancelled";
    const res = await call({ subscriptionId: "ocs_1" });
    expect(res.status).toBe(200);
    expect(state.cancelCalls).toHaveLength(0);
  });
});
