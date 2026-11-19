// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CAP-S06 (r3, MA-A6-004): the device-pairing approve route was unmetered.
 * GET and POST now go through the shared DB-backed limiter at 20/h per IP,
 * the same pattern as device/start — so a signed-in caller cannot burn
 * service-role updates guessing pairing codes.
 */

const state = vi.hoisted(() => ({
  limited: false,
  calls: [] as Array<{ subject: string; bucket: string; max: number; windowSeconds: number }>,
  row: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/api/auth", () => ({
  requireUser: async () => ({ id: "user-1" }),
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

import { GET } from "../route";

const approveGet = () =>
  GET(
    new Request("http://test.local/api/v1/device/approve?code=ABCD-1234", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    }),
  );

beforeEach(() => {
  state.limited = false;
  state.calls = [];
  state.row = {
    user_code: "ABCD-1234",
    worker_name: "Parvez's Mac",
    platform: "mac",
    status: "pending",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
});

describe("GET /api/v1/device/approve rate limiting", () => {
  it("runs the per-IP limiter check and still shows the pending device", async () => {
    const res = await approveGet();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, data: { userCode: "ABCD-1234" } });
    expect(state.calls).toEqual([{ subject: "203.0.113.7", bucket: "device_approve", max: 20, windowSeconds: 3600 }]);
  });

  it("returns the 429 envelope when the limiter rejects", async () => {
    state.limited = true;
    const res = await approveGet();
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ success: false, error: { code: "RATE_LIMITED" } });
  });
});
