// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { cashfreeConfig, currencyForCountry, newOrderId, verifyWebhookSignature } from "../cashfree";

/**
 * Cashfree helpers: the signature check is the billing system's front door —
 * these tests pin the documented algorithm (Base64 HMAC-SHA256 of
 * timestamp + raw body) and the fail-closed behaviour around it.
 */
const SECRET = "test-signing-value-123";

const sign = (timestamp: string, body: string) =>
  createHmac("sha256", SECRET).update(timestamp + body).digest("base64");

describe("cashfree config", () => {
  beforeEach(() => {
    delete process.env.CASHFREE_APP_ID;
    delete process.env.CASHFREE_SECRET_KEY;
    delete process.env.CASHFREE_ENV;
    delete process.env.CASHFREE_WEBHOOK_SECRET;
  });
  afterEach(() => {
    delete process.env.CASHFREE_APP_ID;
    delete process.env.CASHFREE_SECRET_KEY;
    delete process.env.CASHFREE_ENV;
    delete process.env.CASHFREE_WEBHOOK_SECRET;
  });

  it("is unconfigured with no env, sandbox by default", () => {
    const cfg = cashfreeConfig();
    expect(cfg.configured).toBe(false);
    expect(cfg.env).toBe("sandbox");
    expect(cfg.baseUrl).toBe("https://sandbox-api.cashfree.com");
  });

  it("configures from env; production only when named", () => {
    process.env.CASHFREE_APP_ID = "app-1";
    process.env.CASHFREE_SECRET_KEY = SECRET;
    expect(cashfreeConfig().configured).toBe(true);
    process.env.CASHFREE_ENV = "production";
    const cfg = cashfreeConfig();
    expect(cfg.env).toBe("production");
    expect(cfg.baseUrl).toBe("https://api.cashfree.com");
  });
});

describe("verifyWebhookSignature", () => {
  beforeEach(() => {
    process.env.CASHFREE_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.CASHFREE_WEBHOOK_SECRET;
  });

  it("accepts a correctly signed payload", () => {
    const body = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", data: { order: { order_id: "oc_1" } } });
    const ts = "1699999999";
    expect(verifyWebhookSignature({ signature: sign(ts, body), timestamp: ts, rawBody: body })).toBe(true);
  });

  it("rejects a tampered body, a wrong timestamp and missing headers", () => {
    const body = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK" });
    const ts = "1699999999";
    const sig = sign(ts, body);
    expect(verifyWebhookSignature({ signature: sig, timestamp: ts, rawBody: body + " " })).toBe(false);
    expect(verifyWebhookSignature({ signature: sig, timestamp: "1700000000", rawBody: body })).toBe(false);
    expect(verifyWebhookSignature({ signature: null, timestamp: ts, rawBody: body })).toBe(false);
    expect(verifyWebhookSignature({ signature: sig, timestamp: null, rawBody: body })).toBe(false);
    expect(verifyWebhookSignature({ signature: "AAAA", timestamp: ts, rawBody: body })).toBe(false);
  });

  it("fails closed when no webhook secret is configured", () => {
    delete process.env.CASHFREE_WEBHOOK_SECRET;
    delete process.env.CASHFREE_SECRET_KEY;
    const body = "{}";
    expect(verifyWebhookSignature({ signature: sign("1", body), timestamp: "1", rawBody: body })).toBe(false);
  });
});

describe("currency + order ids", () => {
  it("India is INR, everywhere else USD", () => {
    expect(currencyForCountry("IN")).toBe("INR");
    expect(currencyForCountry("in")).toBe("INR");
    expect(currencyForCountry("US")).toBe("USD");
    expect(currencyForCountry(null)).toBe("USD");
    expect(currencyForCountry(undefined)).toBe("USD");
  });

  it("order ids are unique, url-safe and within Cashfree's 50 chars", () => {
    const a = newOrderId("user-1234-abcd");
    const b = newOrderId("user-1234-abcd");
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(50);
    expect(a).toMatch(/^oc_[a-zA-Z0-9_]+$/);
  });
});
