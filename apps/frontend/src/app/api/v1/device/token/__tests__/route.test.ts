// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level tests for POST /api/v1/device/token pinning the 2026-11-10 audit fix:
 * the previously unthrottled pairing-poll endpoint now goes through the shared
 * DB-backed rate limiter twice (per IP, per device-code hash), and a limiter
 * rejection surfaces as the standard 429 envelope. The caps themselves sit far
 * above a real pairing session (~200 polls per 10-minute code) — see route.ts.
 */

const state = vi.hoisted(() => ({
  limited: false,
  calls: [] as Array<{ subject: string; bucket: string; max: number; windowSeconds: number }>,
  row: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/api/auth", () => ({
  sha256: (s: string) => `hash:${s}`,
  requireCompanionsEnabled: () => undefined,
}));

vi.mock("@/lib/api/rateLimit", async () => {
  const { ApiFailure } = await import("@/lib/api/http");
  return {
    rateLimit: async (subject: string, bucket: string, max: number, windowSeconds: number) => {
      state.calls.push({ subject, bucket, max, windowSeconds });
      if (state.limited) throw new ApiFailure("RATE_LIMITED", "You're doing that too often. Please wait a bit and try again.");
    },
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  getAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.row }),
        }),
      }),
    }),
  }),
}));

import { POST } from "../route";

const DEVICE_CODE = "a".repeat(64);

const poll = () =>
  POST(
    new Request("http://test.local/api/v1/device/token", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
      body: JSON.stringify({ deviceCode: DEVICE_CODE }),
    }),
  );

beforeEach(() => {
  state.limited = false;
  state.calls = [];
  state.row = {
    status: "pending",
    owner_id: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
});

describe("POST /api/v1/device/token rate limiting", () => {
  it("runs both limiter checks on a normal poll and still answers pending", async () => {
    const res = await poll();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, data: { status: "pending" } });
    expect(state.calls).toEqual([
      { subject: "203.0.113.7", bucket: "device_token", max: 600, windowSeconds: 3600 },
      { subject: `hash:${DEVICE_CODE}`, bucket: "device_token_code", max: 300, windowSeconds: 3600 },
    ]);
  });

  it("returns the 429 envelope when the limiter rejects", async () => {
    state.limited = true;
    const res = await poll();
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ success: false, error: { code: "RATE_LIMITED" } });
  });
});
