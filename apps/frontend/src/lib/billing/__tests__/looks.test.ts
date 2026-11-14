// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ApiFailure } from "@/lib/api/http";
import { PREMIUM_LOOK_EXPORT_MESSAGE, assertLookAllowedForPlan, isPremiumLookId } from "../looks";

/**
 * Premium-look gate (Builder 4): pure decision, no database. Pins the
 * matrix (free + premium → 402 with the clear error; free + free → pass;
 * paid + premium → pass), the expiry rule (an expired paid period reads
 * as Free), and the allow-list edges (user-saved templates, unknown ids
 * and hidden looks carry no premium tier, so they are never refused).
 */

const throws402 = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ApiFailure);
    expect((e as ApiFailure).code).toBe("LIMIT_EXCEEDED");
    expect((e as ApiFailure).message).toBe(PREMIUM_LOOK_EXPORT_MESSAGE);
    return;
  }
  throw new Error("expected a 402 refusal");
};

describe("isPremiumLookId", () => {
  it("the 25 free looks are not premium, everything else in the gallery is", () => {
    expect(isPremiumLookId("netflix_sub")).toBe(false);
    expect(isPremiumLookId("soft_glow")).toBe(false);
    expect(isPremiumLookId("typo_editorial_indent")).toBe(false);
    expect(isPremiumLookId("metal_script")).toBe(true);
    expect(isPremiumLookId("beast_bounce")).toBe(true);
    expect(isPremiumLookId("floor_hero")).toBe(true);
  });

  it("a retired premium look still counts as premium; hidden looks do not resolve", () => {
    expect(isPremiumLookId("karaoke_fill")).toBe(true); // retired #96, premium by tier
    expect(isPremiumLookId("desi_bold")).toBe(false); // hidden: not in the gallery, not resolvable
    expect(isPremiumLookId("chat_bubble_green")).toBe(false);
  });

  it("user-saved templates, unknown ids and empty ids are never premium", () => {
    expect(isPremiumLookId("user:abc123")).toBe(false);
    expect(isPremiumLookId("look-1")).toBe(false);
    expect(isPremiumLookId(null)).toBe(false);
    expect(isPremiumLookId(undefined)).toBe(false);
    expect(isPremiumLookId("")).toBe(false);
  });
});

describe("assertLookAllowedForPlan", () => {
  it("a Free user exporting a premium look is refused with a 402 and a clear error", () => {
    throws402(() => assertLookAllowedForPlan("metal_script", "free"));
    expect(PREMIUM_LOOK_EXPORT_MESSAGE).toContain("Pick a free look");
    expect(PREMIUM_LOOK_EXPORT_MESSAGE).toContain("upgrade");
    // the message names no price and no deadline
    expect(PREMIUM_LOOK_EXPORT_MESSAGE).not.toMatch(/₹|\$|only|now|today|limited/i);
  });

  it("a Free user exporting a free look passes", () => {
    expect(() => assertLookAllowedForPlan("netflix_sub", "free")).not.toThrow();
    expect(() => assertLookAllowedForPlan("hormozi_box", "free")).not.toThrow();
  });

  it.each(["starter", "creator", "pro"])("a paid plan (%s) exporting a premium look passes", (plan) => {
    expect(() => assertLookAllowedForPlan("metal_script", plan, "2026-12-14T00:00:00Z")).not.toThrow();
  });

  it("a live old Plus pass (growth) reads as Creator, so it passes", () => {
    expect(() => assertLookAllowedForPlan("metal_script", "growth", "2026-12-14T00:00:00Z")).not.toThrow();
  });

  it("an expired paid period reads as Free, so a premium look is refused", () => {
    throws402(() => assertLookAllowedForPlan("metal_script", "starter", "2026-11-01T00:00:00Z", new Date("2026-11-14T00:00:00Z")));
    expect(() => assertLookAllowedForPlan("netflix_sub", "starter", "2026-11-01T00:00:00Z", new Date("2026-11-14T00:00:00Z"))).not.toThrow();
  });

  it("a Free user with a user-saved template or an unknown look id passes", () => {
    expect(() => assertLookAllowedForPlan("user:abc123", "free")).not.toThrow();
    expect(() => assertLookAllowedForPlan("look-1", "free")).not.toThrow();
    expect(() => assertLookAllowedForPlan(null, "free")).not.toThrow();
  });
});
