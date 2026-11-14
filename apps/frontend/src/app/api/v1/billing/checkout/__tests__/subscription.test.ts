// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { POST } from "../route";

/**
 * Subscription checkout: mode "subscription" creates a Cashfree
 * SUBSCRIPTION (INR only, dashboard plan id from env), writes the
 * payments row AND the subscription row before calling Cashfree, and
 * returns the subscription session id for
 * cashfree.subscriptionsCheckout. An unmapped tier answers
 * subscriptionPlanMissing without calling Cashfree; a missing
 * subscriptions table answers dbPending. Without mode, the one-time
 * order flow is unchanged.
 */

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  planMap: {} as Record<string, string>,
  createSubImpl: null as null | ((...args: unknown[]) => Promise<unknown>),
  createOrderImpl: null as null | ((...args: unknown[]) => Promise<unknown>),
  failInsert: {} as Record<string, { code: string; message: string }>,
  subCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", email: "user@example.test", token: "tok", guest: false, db: {} }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdmin: () => ({
    from: (t: string) => ({
      insert: (row: Record<string, unknown>) => {
        const err = state.failInsert[t] ?? null;
        let stored: Record<string, unknown> | null = null;
        if (!err) {
          stored = { id: `row-${((state.tables[t] ?? []).length) + 1}`, ...row };
          (state.tables[t] ??= []).push(stored);
        }
        return {
          select: () => ({ maybeSingle: async () => (err ? { data: null, error: err } : { data: stored, error: null }) }),
          then: (resolve: (v: { error: unknown }) => void) => resolve({ error: err }),
        };
      },
    }),
  }),
}));

vi.mock("@/lib/billing/cashfree", () => ({
  cashfreeConfig: () => ({
    configured: true,
    env: "sandbox",
    appId: "TEST-APP-ID",
    secret: "TEST-CF-KEY",
    webhookSecret: "TEST-SECRET",
    baseUrl: "https://sandbox-api.cashfree.com",
  }),
  createCashfreeOrder: (...args: unknown[]) => {
    if (!state.createOrderImpl) throw new Error("createCashfreeOrder not stubbed");
    return state.createOrderImpl(...args);
  },
  currencyForCountry: (c: string | null | undefined) => (c?.toUpperCase() === "IN" ? "INR" : "USD"),
  newOrderId: () => "oc_testorder1",
}));

vi.mock("@/lib/billing/cashfreeSubscriptions", () => ({
  cashfreeSubscriptionPlanId: (plan: string) => state.planMap[plan] ?? null,
  createCashfreeSubscription: (...args: unknown[]) => {
    state.subCalls.push(args[0] as Record<string, unknown>);
    if (!state.createSubImpl) throw new Error("createCashfreeSubscription not stubbed");
    return state.createSubImpl(...args);
  },
  newSubscriptionId: () => "ocs_testsub1",
}));

vi.mock("@/lib/seo", () => ({ SITE_URL: "https://captionit.in" }));

const call = (body: Record<string, unknown>) =>
  POST(
    new Request("https://example.test/api/v1/billing/checkout", {
      method: "POST",
      headers: { Authorization: "Bearer <redacted>", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  state.tables = {};
  state.planMap = { starter: "cf-plan-starter", creator: "cf-plan-creator", pro: "cf-plan-pro" };
  state.createSubImpl = async () => ({ subscriptionSessionId: "subs_token_1", subscriptionId: "ocs_testsub1", status: "INITIALIZED" });
  state.createOrderImpl = async () => ({ paymentSessionId: "sess-1", orderStatus: "ACTIVE" });
  state.failInsert = {};
  state.subCalls = [];
});

describe("billing subscription checkout", () => {
  it("creates a subscription in INR and returns its session id", async () => {
    const res = await call({ plan: "starter", mode: "subscription", customerPhone: "9876543210" });
    const body = (await res.json()) as { success: boolean; data?: Record<string, unknown> };
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.mode).toBe("subscription");
    expect(body.data?.subscriptionId).toBe("ocs_testsub1");
    expect(body.data?.subscriptionSessionId).toBe("subs_token_1");
    expect(body.data?.amount).toBe(149);
    expect(body.data?.currency).toBe("INR");
    expect(body.data?.plan).toBe("starter");
    expect(state.subCalls).toHaveLength(1);
    expect(state.subCalls[0]).toMatchObject({
      subscriptionId: "ocs_testsub1",
      cashfreePlanId: "cf-plan-starter",
      customerId: "user-1",
      customerPhone: "9876543210",
      planId: "starter",
    });
    expect((state.subCalls[0]?.returnUrl as string) ?? "").toContain("subscription_id=ocs_testsub1");
    // The payments row (product subscription, keyed by subscription id)
    // and the subscription row are both written before Cashfree.
    expect(state.tables.payments).toHaveLength(1);
    expect(state.tables.payments[0]).toMatchObject({ cf_order_id: "ocs_testsub1", plan: "starter", product: "subscription", amount: 149, currency: "INR", status: "created" });
    expect(state.tables.subscriptions).toHaveLength(1);
    expect(state.tables.subscriptions[0]).toMatchObject({ cf_subscription_id: "ocs_testsub1", cf_plan_id: "cf-plan-starter", plan: "starter", status: "initialized" });
  });

  it("answers subscriptionPlanMissing when the tier has no dashboard plan id", async () => {
    delete state.planMap.creator;
    const res = await call({ plan: "creator", mode: "subscription", customerPhone: "9876543210" });
    const body = (await res.json()) as { success: boolean; data?: Record<string, unknown> };
    expect(res.status).toBe(200);
    expect(body.data?.subscriptionPlanMissing).toBe(true);
    expect(state.subCalls).toHaveLength(0);
    expect(state.tables.payments ?? []).toHaveLength(0);
  });

  it("answers dbPending when the subscriptions table is not applied yet", async () => {
    state.failInsert = { subscriptions: { code: "42P01", message: 'relation "public.subscriptions" does not exist' } };
    const res = await call({ plan: "starter", mode: "subscription", customerPhone: "9876543210" });
    const body = (await res.json()) as { success: boolean; data?: Record<string, unknown> };
    expect(res.status).toBe(200);
    expect(body.data?.dbPending).toBe(true);
    expect(state.subCalls).toHaveLength(0);
  });

  it("surfaces the Cashfree error when subscription creation fails", async () => {
    state.createSubImpl = async () => {
      throw new Error("Cashfree /pg/subscriptions failed (400): Invalid plan id");
    };
    const res = await call({ plan: "starter", mode: "subscription", customerPhone: "9876543210" });
    const body = (await res.json()) as { success: boolean; error?: { message: string } };
    expect(res.status).toBe(500);
    expect(body.error?.message).toBe("Cashfree /pg/subscriptions failed (400): Invalid plan id");
  });


  it("returns a clear validation error when the phone is missing, and writes no rows", async () => {
    const res = await call({ plan: "starter", mode: "subscription" });
    const body = (await res.json()) as { success: boolean; error?: { code: string; message: string } };
    expect(res.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe("VALIDATION");
    expect(body.error?.message).toBe("Add a valid mobile number to continue.");
    expect(state.subCalls).toHaveLength(0);
    expect(state.tables.payments ?? []).toHaveLength(0);
    expect(state.tables.subscriptions ?? []).toHaveLength(0);
  });

  it("without mode, the one-time order flow is unchanged and no subscription is created", async () => {
    const res = await call({ plan: "starter", customerPhone: "9876543210" });
    const body = (await res.json()) as { success: boolean; data?: Record<string, unknown> };
    expect(res.status).toBe(200);
    expect(body.data?.paymentSessionId).toBe("sess-1");
    expect(body.data?.mode).toBeUndefined();
    expect(state.subCalls).toHaveLength(0);
    expect(state.tables.subscriptions ?? []).toHaveLength(0);
  });
});
