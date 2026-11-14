// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { POST } from "../route";

/**
 * Watermark-removal checkout: Cashfree's production /pg/orders REQUIRES
 * customer_details.customer_phone, so the route validates the number
 * (same rule as plan checkout) before the payments row is written, and
 * passes the cleaned number to createCashfreeOrder — never "".
 */

const state = vi.hoisted(() => ({
  inserted: [] as Array<Record<string, unknown>>,
  createArgs: [] as Array<Record<string, unknown>>,
  createImpl: null as null | ((...args: unknown[]) => Promise<unknown>),
}));

vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({
    id: "user-1",
    email: "user@example.test",
    token: "tok",
    guest: false,
    db: {
      from: (t: string) => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: async () => ({ data: t === "projects" ? { id: "proj-1" } : null, error: null }),
            }),
            maybeSingle: async () => ({
              data: t === "profiles" ? { plan: "free", plan_expires_at: null } : { id: "proj-1" },
              error: null,
            }),
          }),
        }),
      }),
    },
  }),
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
secret: <redacted>
    webhookSecret: "TEST-SECRET",
    baseUrl: "https://sandbox.cashfree.com",
  }),
  createCashfreeOrder: (...args: unknown[]) => {
    state.createArgs.push(args[0] as Record<string, unknown>);
    if (!state.createImpl) throw new Error("createCashfreeOrder not stubbed");
    return state.createImpl(...args);
  },
  newOrderId: () => "oc_testorder1",
}));

vi.mock("@/lib/billing/watermark", () => ({
  getWatermarkStatus: async () => ({ ready: true, watermark: true }),
  isMissingWatermarkTableError: () => false,
  watermarkRemovalAmount: () => ({ amount: 69, currency: "INR" }),
}));

vi.mock("@/lib/seo", () => ({ SITE_URL: "https://captionit.in" }));

const call = (body: Record<string, unknown>) =>
  POST(
    new Request("https://example.test/api/v1/billing/watermark/checkout", {
      method: "POST",
      headers: { Authorization: "Bearer <redacted>", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  state.inserted = [];
  state.createArgs = [];
  state.createImpl = async () => ({ paymentSessionId: "sess-1", orderStatus: "ACTIVE" });
});

describe("watermark checkout phone", () => {
  it("passes a valid phone through to createCashfreeOrder", async () => {
    const res = await call({ projectId: "11111111-1111-4111-8111-111111111111", customerPhone: "9876543210" });
    const body = (await res.json()) as { success: boolean; data?: { paymentSessionId?: string } };
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.paymentSessionId).toBe("sess-1");
    expect(state.createArgs).toHaveLength(1);
    expect(state.createArgs[0]?.customerPhone).toBe("9876543210");
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]?.product).toBe("watermark");
  });

  it("returns a clear validation error when the phone is missing, and writes no payments row", async () => {
    const res = await call({ projectId: "11111111-1111-4111-8111-111111111111" });
    const body = (await res.json()) as { success: boolean; error?: { code: string; message: string } };
    expect(res.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe("VALIDATION");
    expect(body.error?.message).toBe("Add a valid mobile number to continue.");
    expect(state.inserted).toHaveLength(0);
    expect(state.createArgs).toHaveLength(0);
  });

  it("returns a clear validation error when the phone is invalid, and writes no payments row", async () => {
    const res = await call({ projectId: "11111111-1111-4111-8111-111111111111", customerPhone: "12345" });
    const body = (await res.json()) as { success: boolean; error?: { code: string; message: string } };
    expect(res.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe("VALIDATION");
    expect(body.error?.message).toBe("Add a valid mobile number to continue.");
    expect(state.inserted).toHaveLength(0);
    expect(state.createArgs).toHaveLength(0);
  });
});
