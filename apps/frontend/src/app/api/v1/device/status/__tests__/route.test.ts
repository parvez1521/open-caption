// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

/**
 * GET /api/v1/device/status: the public capability flag the Settings pairing
 * section asks before offering "Connect this computer" — when the helper is
 * off, POST /device/setup 403s, so the button would be a dead end
 * (overnight QA follow-up, 2026-11-15).
 */

const state = vi.hoisted(() => ({ enabled: true }));

vi.mock("@/lib/api/auth", () => ({
  companionsEnabled: () => state.enabled,
}));

import { GET } from "../route";

describe("GET /api/v1/device/status", () => {
  it("reports companionsEnabled true when the flag is on", async () => {
    state.enabled = true;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { companionsEnabled: true } });
  });

  it("reports companionsEnabled false when the flag is off", async () => {
    state.enabled = false;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { companionsEnabled: false } });
  });
});
