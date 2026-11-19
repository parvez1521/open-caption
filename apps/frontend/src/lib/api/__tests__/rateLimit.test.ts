import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdmin: vi.fn(),
}));

import { getAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/api/rateLimit";

const getAdminMock = vi.mocked(getAdmin);

// Regression: CAP-S06 extended rateLimit() to 36 more routes, but getAdmin()
// throws when the service-role env is missing — that 500'd every route test
// whose mocks never set up the admin client. The limiter's contract is to
// fail open whenever it is unavailable; only RATE_LIMITED may reject.
describe("rateLimit fail-open", () => {
  it("resolves when the admin client is unavailable (getAdmin throws)", async () => {
    getAdminMock.mockImplementation(() => {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    });
    await expect(rateLimit("user-1", "test", 10, 60)).resolves.toBeUndefined();
  });

  it("resolves when the admin client has no rpc (partial mock)", async () => {
    getAdminMock.mockImplementation(() => ({}) as never);
    await expect(rateLimit("user-1", "test", 10, 60)).resolves.toBeUndefined();
  });

  it("resolves when the RPC itself errors", async () => {
    getAdminMock.mockImplementation(
      () =>
        ({
          rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "db down" } }),
        }) as never,
    );
    await expect(rateLimit("user-1", "test", 10, 60)).resolves.toBeUndefined();
  });

  it("resolves when the count is within max", async () => {
    getAdminMock.mockImplementation(
      () =>
        ({
          rpc: vi.fn().mockResolvedValue({ data: 5, error: null }),
        }) as never,
    );
    await expect(rateLimit("user-1", "test", 10, 60)).resolves.toBeUndefined();
  });

  it("rejects RATE_LIMITED when the count exceeds max", async () => {
    getAdminMock.mockImplementation(
      () =>
        ({
          rpc: vi.fn().mockResolvedValue({ data: 11, error: null }),
        }) as never,
    );
    await expect(rateLimit("user-1", "test", 10, 60)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
