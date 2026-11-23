import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Maintenance mode (production-pages audit): a real env flag, default
 * off. Only the exact value "true" enables the holding page.
 */

describe("isMaintenanceMode", () => {
  const OLD = process.env.MAINTENANCE_MODE;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.MAINTENANCE_MODE;
  });

  afterEach(() => {
    if (OLD === undefined) delete process.env.MAINTENANCE_MODE;
    else process.env.MAINTENANCE_MODE = OLD;
    vi.resetModules();
  });

  it("is off when the flag is unset", async () => {
    const { isMaintenanceMode } = await import("../maintenance");
    expect(isMaintenanceMode()).toBe(false);
  });

  it("is off for any value other than the exact string true", async () => {
    process.env.MAINTENANCE_MODE = "1";
    const { isMaintenanceMode } = await import("../maintenance");
    expect(isMaintenanceMode()).toBe(false);
  });

  it("is on when MAINTENANCE_MODE=true", async () => {
    process.env.MAINTENANCE_MODE = "true";
    const { isMaintenanceMode } = await import("../maintenance");
    expect(isMaintenanceMode()).toBe(true);
  });
});
