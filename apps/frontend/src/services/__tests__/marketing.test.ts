import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

function mockFetch(): Mock {
  return fetch as unknown as Mock;
}

vi.mock("../auth", () => ({
  authService: { getToken: async () => "test-token" },
}));

import { captureEmailSubscription, downloadSubscriberCsv, getSubscriberListMeta } from "../marketing";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("marketing service", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("capture posts once to /marketing/capture and returns the flag", async () => {
    mockFetch().mockResolvedValueOnce(jsonResponse({ success: true, data: { captured: true, marketingOptIn: false } }));
    const res = await captureEmailSubscription();
    expect(res).toEqual({ captured: true, marketingOptIn: false });
    expect(mockFetch()).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch().mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/marketing/capture");
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-token" });
  });

  it("capture swallows a network failure and returns null (sign-in must never break)", async () => {
    mockFetch().mockRejectedValueOnce(new Error("down"));
    await expect(captureEmailSubscription()).resolves.toBeNull();
  });

  it("capture swallows a backend error and returns null", async () => {
    mockFetch().mockResolvedValueOnce(jsonResponse({ success: false, error: { code: "INTERNAL", message: "no table" } }, 500));
    await expect(captureEmailSubscription()).resolves.toBeNull();
  });

  it("subscriber-list meta returns null for a non-owner (403)", async () => {
    mockFetch().mockResolvedValueOnce(jsonResponse({ success: false, error: { code: "FORBIDDEN", message: "no" } }, 403));
    await expect(getSubscriberListMeta()).resolves.toBeNull();
  });

  it("subscriber-list meta returns the total for the owner", async () => {
    mockFetch().mockResolvedValueOnce(jsonResponse({ success: true, data: { total: 7 } }));
    await expect(getSubscriberListMeta()).resolves.toEqual({ total: 7 });
  });

  it("CSV download fetches with the Bearer token and triggers a file download", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:fake", revokeObjectURL: () => {} });
    mockFetch().mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(["email,marketing_opt_in\n"], { type: "text/csv" }),
    } as Response);
    await downloadSubscriberCsv();
    expect(mockFetch()).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch().mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/admin/subscribers?format=csv");
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-token" });
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });
});
