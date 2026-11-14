// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  cancelCashfreeSubscription,
  cashfreeSubscriptionPlanId,
  createCashfreeSubscription,
  fetchCashfreeSubscription,
  newSubscriptionId,
  normalizeSubscriptionStatus,
} from "../cashfreeSubscriptions";

/**
 * Cashfree Subscriptions client: the plan mapping comes from env (never
 * hardcoded), create sends the flat 2023-08-01 body against the same
 * base URL as the order flow, fetch normalises the status, and cancel
 * goes through the manage endpoint. Live shape is unverified (the
 * sandbox checkout is failing for an undiagnosed reason), so these
 * tests pin the request we send and the parsing we do — the sandbox
 * test must still confirm Cashfree accepts it.
 */

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.CASHFREE_APP_ID = "app-1";
  process.env.CASHFREE_SECRET_KEY = "secret-1";
  delete process.env.CASHFREE_ENV;
  delete process.env.CASHFREE_SUBSCRIPTION_PLAN_STARTER;
  delete process.env.CASHFREE_SUBSCRIPTION_PLAN_CREATOR;
  delete process.env.CASHFREE_SUBSCRIPTION_PLAN_PRO;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CASHFREE_APP_ID;
  delete process.env.CASHFREE_SECRET_KEY;
  delete process.env.CASHFREE_SUBSCRIPTION_PLAN_STARTER;
  delete process.env.CASHFREE_SUBSCRIPTION_PLAN_CREATOR;
  delete process.env.CASHFREE_SUBSCRIPTION_PLAN_PRO;
});

const okJson = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: async () => body });

describe("cashfreeSubscriptionPlanId", () => {
  it("is null until the dashboard plan id is mapped in env", () => {
    expect(cashfreeSubscriptionPlanId("starter")).toBeNull();
    expect(cashfreeSubscriptionPlanId("creator")).toBeNull();
    expect(cashfreeSubscriptionPlanId("pro")).toBeNull();
  });

  it("reads each tier from its own env var", () => {
    process.env.CASHFREE_SUBSCRIPTION_PLAN_STARTER = "cf-plan-starter";
    process.env.CASHFREE_SUBSCRIPTION_PLAN_CREATOR = "cf-plan-creator";
    process.env.CASHFREE_SUBSCRIPTION_PLAN_PRO = "cf-plan-pro";
    expect(cashfreeSubscriptionPlanId("starter")).toBe("cf-plan-starter");
    expect(cashfreeSubscriptionPlanId("creator")).toBe("cf-plan-creator");
    expect(cashfreeSubscriptionPlanId("pro")).toBe("cf-plan-pro");
    expect(cashfreeSubscriptionPlanId("free")).toBeNull();
  });
});

describe("createCashfreeSubscription", () => {
  it("posts the flat subscription body and returns the session id", async () => {
    fetchMock.mockImplementationOnce(() =>
      okJson({ subscription_session_id: "subs_token_abc", subscription_id: "ocs_user1_x", subscription_status: "INITIALIZED" }),
    );
    const created = await createCashfreeSubscription({
      subscriptionId: "ocs_user1_x",
      cashfreePlanId: "cf-plan-starter",
      customerId: "user-1",
      customerEmail: "user@example.test",
      customerPhone: "",
      returnUrl: "https://captionit.in/settings/billing?subscription_id=ocs_user1_x",
      planId: "starter",
    });
    expect(created).toEqual({ subscriptionSessionId: "subs_token_abc", subscriptionId: "ocs_user1_x", status: "INITIALIZED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://sandbox-api.cashfree.com/pg/subscriptions");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-version"]).toBe("2023-08-01");
    expect(headers["x-client-id"]).toBe("app-1");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.subscription_id).toBe("ocs_user1_x");
    expect(body.subscription_plan_id).toBe("cf-plan-starter");
    expect(body.customer_details).toEqual({ customer_id: "user-1", customer_email: "user@example.test" });
    expect((body.subscription_meta as Record<string, string>).return_url).toContain("subscription_id=ocs_user1_x");
    expect(body.subscription_tags).toEqual({ plan: "starter" });
  });

  it("throws when Cashfree returns no session id", async () => {
    fetchMock.mockImplementationOnce(() => okJson({ subscription_id: "ocs_user1_x" }));
    await expect(
      createCashfreeSubscription({
        subscriptionId: "ocs_user1_x",
        cashfreePlanId: "cf-plan-starter",
        customerId: "user-1",
        customerEmail: "user@example.test",
        customerPhone: "",
        returnUrl: "https://captionit.in/settings/billing",
        planId: "starter",
      }),
    ).rejects.toThrow("did not return a subscription session");
  });

  it("surfaces Cashfree's error message on a failed create", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, status: 400, json: async () => ({ message: "Invalid plan id" }) }),
    );
    await expect(
      createCashfreeSubscription({
        subscriptionId: "ocs_user1_x",
        cashfreePlanId: "cf-plan-nope",
        customerId: "user-1",
        customerEmail: "user@example.test",
        customerPhone: "",
        returnUrl: "https://captionit.in/settings/billing",
        planId: "starter",
      }),
    ).rejects.toThrow("Invalid plan id");
  });
});

describe("fetchCashfreeSubscription", () => {
  it("normalises the v2026 entity shape (plan_details + next_schedule_date)", async () => {
    fetchMock.mockImplementationOnce(() =>
      okJson({
        subscription_id: "ocs_1",
        subscription_status: "ACTIVE",
        plan_details: { plan_id: "cf-plan-creator" },
        next_schedule_date: "2026-12-14T00:00:00+05:30",
        subscription_first_charge_time: "2026-11-14T00:00:00+05:30",
      }),
    );
    const fetched = await fetchCashfreeSubscription("ocs_1");
    expect(fetched.status).toBe("active");
    expect(fetched.planId).toBe("cf-plan-creator");
    expect(fetched.periodEnd).toBe("2026-12-14T00:00:00+05:30");
    expect(fetched.periodStart).toBe("2026-11-14T00:00:00+05:30");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://sandbox-api.cashfree.com/pg/subscriptions/ocs_1");
  });

  it("falls back to subscription_expiry_time when no next charge date is present", async () => {
    fetchMock.mockImplementationOnce(() =>
      okJson({ subscription_status: "CANCELLED", subscription_expiry_time: "2026-12-01T00:00:00+05:30" }),
    );
    const fetched = await fetchCashfreeSubscription("ocs_1");
    expect(fetched.status).toBe("cancelled");
    expect(fetched.periodEnd).toBe("2026-12-01T00:00:00+05:30");
  });
});

describe("cancelCashfreeSubscription", () => {
  it("posts the manage CANCEL action and returns the new status", async () => {
    fetchMock.mockImplementationOnce(() => okJson({ subscription_status: "CANCELLED" }));
    const cancelled = await cancelCashfreeSubscription("ocs_1");
    expect(cancelled.status).toBe("cancelled");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://sandbox-api.cashfree.com/pg/subscriptions/ocs_1/manage");
    expect(JSON.parse(init.body as string)).toEqual({ subscription_id: "ocs_1", action: "CANCEL" });
  });
});

describe("normalizeSubscriptionStatus + ids", () => {
  it("maps Cashfree statuses to one internal value", () => {
    expect(normalizeSubscriptionStatus("ACTIVE")).toBe("active");
    expect(normalizeSubscriptionStatus("INITIALIZED")).toBe("initialized");
    expect(normalizeSubscriptionStatus("PAUSED")).toBe("paused");
    expect(normalizeSubscriptionStatus("CANCELLED")).toBe("cancelled");
    expect(normalizeSubscriptionStatus("CANCELED")).toBe("cancelled");
    expect(normalizeSubscriptionStatus("EXPIRED")).toBe("expired");
    expect(normalizeSubscriptionStatus("COMPLETED")).toBe("expired");
    expect(normalizeSubscriptionStatus("SOMETHING_NEW")).toBe("unknown");
    expect(normalizeSubscriptionStatus(null)).toBe("unknown");
  });

  it("subscription ids are unique, url-safe and within 50 chars", () => {
    const a = newSubscriptionId("user-1234-abcd");
    const b = newSubscriptionId("user-1234-abcd");
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(50);
    expect(a).toMatch(/^ocs_[a-zA-Z0-9_]+$/);
  });
});
