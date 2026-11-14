// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const call = (host?: string) =>
  GET(
    new Request(
      `https://example.test/api/v1/debug/cashfree-probe${host ? `?host=${host}` : ""}`,
    ),
  );

describe("cashfree-probe diagnostic (temporary, never merge)", () => {
  let lastInit: RequestInit | undefined;

  beforeEach(() => {
    lastInit = undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        lastInit = init;
        return {
          status: 401,
          text: async () => JSON.stringify({ message: "Invalid client id" }),
          url,
        };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports reachable with the HTTP status when Cashfree answers", async () => {
    const res = await call();
    const body = (await res.json()) as {
      host: string;
      url: string;
      reachable: boolean;
      status: number | null;
    };
    expect(body.host).toBe("sandbox");
    expect(body.url).toBe("https://sandbox.cashfree.com/pg/orders");
    expect(body.reachable).toBe(true);
    expect(body.status).toBe(401);
  });

  it("probes the production host when asked", async () => {
    const res = await call("production");
    const body = (await res.json()) as { host: string; url: string; reachable: boolean };
    expect(body.host).toBe("production");
    expect(body.url).toBe("https://api.cashfree.com/pg/orders");
    expect(body.reachable).toBe(true);
  });

  it("sends the exact full body the real checkout sends (dummy values)", async () => {
    await call();
    expect(lastInit?.method).toBe("POST");
    expect(lastInit?.headers).toEqual({
      "Content-Type": "application/json",
      "x-api-version": "2023-08-01",
      "x-client-id": "TEST",
      "x-client-secret": "TEST",
    });
    expect(JSON.parse(String(lastInit?.body))).toEqual({
      order_id: "probe",
      order_amount: 1,
      order_currency: "INR",
      customer_details: {
        customer_id: "probe-user",
        customer_email: "probe@example.com",
      },
      order_meta: {
        return_url: "https://www.captionit.in/settings/billing?order_id=probe",
        notify_url: "https://www.captionit.in/api/v1/billing/webhook",
      },
      order_note: "probe",
      order_tags: { plan: "starter" },
    });
  });

  it("reports unreachable with the exact fetch error when the network fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fetch failed");
      }),
    );
    const res = await call();
    const body = (await res.json()) as {
      reachable: boolean;
      status: number | null;
      error: string;
    };
    expect(body.reachable).toBe(false);
    expect(body.status).toBeNull();
    expect(body.error).toBe("fetch failed");
  });
});
