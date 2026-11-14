// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { POST } from "../route";

/**
 * Checkout must surface Cashfree's real error, not the generic banner.
 * Before this fix, a createCashfreeOrder failure threw a plain Error, the
 * route wrapper answered "Something went wrong", and the billing page
 * showed that — while the real reason (e.g. bad credentials) sat only in
 * the server log. Now the route converts it to an ApiFailure carrying the
 * Cashfree message (with any credential value redacted).
 */

const state = vi.hoisted(() => ({
  inserted: [] as Array<Record<string, unknown>>,
  createImpl: null as null | ((...args: unknown[]) => Promise<unknown>),
}));

vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1", email: "user@example.test", token: "tok", guest: false, db: {} }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdmin: () => ({
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        state.inserted.push(row);
        return { error: null };
      },
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
  createCashfreeOrder: (...args: unknown[]) => {
    if (!state.createImpl) throw new Error("createCashfreeOrder not stubbed");
    return state.createImpl(...args);
  },
  currencyForCountry: (c: string | null | undefined) => (c?.toUpperCase() === "IN" ? "INR" : "USD"),
  newOrderId: () => "oc_testorder1",
}));

vi.mock("@/lib/seo", () => ({ SITE_URL: "https://captionit.in" }));

const call = () =>
  POST(
    new Request("https://example.test/api/v1/billing/checkout", {
      method: "POST",
      headers: { Authorization: "Bearer tok", "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "starter" }),
    }),
  );

beforeEach(() => {
  state.inserted = [];
  state.createImpl = async () => ({ paymentSessionId: "sess-1", orderStatus: "ACTIVE" });
});

describe("billing checkout error surfacing", () => {
  it("returns the Cashfree error message when order creation fails", async () => {
    state.createImpl = async () => {
      throw new Error("Cashfree /pg/orders failed (401): Invalid client id or secret");
    };
    const res = await call();
    const body = (await res.json()) as { success: boolean; error?: { code: string; message: string } };
    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error?.message).toBe("Cashfree /pg/orders failed (401): Invalid client id or secret");
    expect(body.error?.message).not.toBe("Something went wrong");
    // The payments row is still written first, exactly as before.
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]?.cf_order_id).toBe("oc_testorder1");
  });

  it("redacts any credential value that somehow appears in the error", async () => {
    state.createImpl = async () => {
      throw new Error("Cashfree /pg/orders failed (401): bad TEST-APP-ID / TEST-SECRET");
    };
    const res = await call();
    const body = (await res.json()) as { success: boolean; error?: { message: string } };
    expect(body.error?.message).toContain("[redacted]");
    expect(body.error?.message).not.toContain("TEST-APP-ID");
    expect(body.error?.message).not.toContain("TEST-SECRET");
  });

  it("still returns a payment session when Cashfree succeeds", async () => {
    const res = await call();
    const body = (await res.json()) as { success: boolean; data?: { paymentSessionId?: string; orderId?: string } };
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.paymentSessionId).toBe("sess-1");
    expect(body.data?.orderId).toBe("oc_testorder1");
  });
});
