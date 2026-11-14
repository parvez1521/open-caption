// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ApiFailure } from "@/lib/api/http";
import { MOV_EXPORT_MESSAGE, assertMovAllowedForPlan } from "../mov";

/**
 * MOV-export gate: pure decision, no database. Pins the matrix
 * (free + mov_alpha → 402 with the clear error; free + any other kind
 * → pass; paid + mov_alpha → pass), the expiry rule (an expired paid
 * period reads as Free), and the scope (webm_alpha, mp4 and the text
 * kinds are never refused by this gate — the brief gates MOV only).
 */

const throws402 = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ApiFailure);
    expect((e as ApiFailure).code).toBe("LIMIT_EXCEEDED");
    expect((e as ApiFailure).message).toBe(MOV_EXPORT_MESSAGE);
    return;
  }
  throw new Error("expected a 402 refusal");
};

describe("assertMovAllowedForPlan", () => {
  it("a Free user exporting MOV is refused with a 402 and a clear error", () => {
    throws402(() => assertMovAllowedForPlan("mov_alpha", "free"));
    expect(MOV_EXPORT_MESSAGE).toBe("MOV export is a paid plan feature.");
    // the message names no price and no deadline
    expect(MOV_EXPORT_MESSAGE).not.toMatch(/₹|\$|only|now|today|limited/i);
  });

  it.each(["starter", "creator", "pro"])("a paid plan (%s) exporting MOV passes", (plan) => {
    expect(() => assertMovAllowedForPlan("mov_alpha", plan, "2026-12-14T00:00:00Z")).not.toThrow();
  });

  it("a live old Plus pass (growth) reads as Creator, so it passes", () => {
    expect(() => assertMovAllowedForPlan("mov_alpha", "growth", "2026-12-14T00:00:00Z")).not.toThrow();
  });

  it("an expired paid period reads as Free, so MOV is refused", () => {
    throws402(() => assertMovAllowedForPlan("mov_alpha", "starter", "2026-11-01T00:00:00Z", new Date("2026-11-14T00:00:00Z")));
    expect(() => assertMovAllowedForPlan("mp4", "starter", "2026-11-01T00:00:00Z", new Date("2026-11-14T00:00:00Z"))).not.toThrow();
  });

  it.each(["mp4", "webm_alpha", "srt", "vtt", "ass", "txt", "json"])(
    "a Free user exporting %s is never refused by this gate",
    (kind) => {
      expect(() => assertMovAllowedForPlan(kind, "free")).not.toThrow();
    },
  );

  it("a missing kind is never refused", () => {
    expect(() => assertMovAllowedForPlan(null, "free")).not.toThrow();
    expect(() => assertMovAllowedForPlan(undefined, "free")).not.toThrow();
    expect(() => assertMovAllowedForPlan("", "free")).not.toThrow();
  });
});
