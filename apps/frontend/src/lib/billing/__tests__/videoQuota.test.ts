// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { planFor, pricingFor } from "@capseasy/shared";
import { ApiFailure } from "@/lib/api/http";
import {
  QUOTA_NOT_SET_UP,
  checkVideoQuota,
  getVideoQuotaUsage,
  isVideoQuotaKind,
  recordVideoQuotaEvent,
  videoQuotaWindow,
  type VideoQuotaUsage,
} from "../videoQuota";

/**
 * Monthly video quota (owner decision 2026-11-14): Free 3, Starter 10,
 * Plus 20, Pro 40 videos a month. 1 video = 1 finished export; text files
 * never count; unused videos never roll over. The window is the paid pass
 * (30 days ending at plan_expires_at) or the rolling last 30 days for Free.
 */

const NOW = new Date("2026-11-14T10:00:00.000Z");

/** Chainable stand-in for the supabase query builder, as videoQuota uses it. */
function fakeDb(rows: Array<{ id: string }>, error: { code?: string; message?: string } | null = null) {
  const upserts: Array<{ row: Record<string, unknown>; opts: Record<string, unknown> }> = [];
  const db = {
    upserts,
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            lt: () => ({
              limit: async () => ({ data: rows, error }),
            }),
          }),
        }),
      }),
      upsert: (row: Record<string, unknown>, opts: Record<string, unknown>) => {
        upserts.push({ row, opts });
        return Promise.resolve({ error });
      },
    }),
  };
  return db as unknown as Parameters<typeof getVideoQuotaUsage>[0] & { upserts: typeof upserts };
}

const events = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `ev-${i}` }));

describe("limits per plan", () => {
  it.each([
    ["free", 3],
    ["starter", 10],
    ["growth", 20],
    ["pro", 40],
  ] as const)("plan %s allows %s videos a month", (plan, limit) => {
    expect(planFor(plan).videosPerMonth).toBe(limit);
  });

  it("pricing bullets name the monthly videos, in short copy", () => {
    expect(pricingFor("free").features[0]).toBe("3 videos a month");
    expect(pricingFor("starter").features[0]).toBe("10 videos a month");
    expect(pricingFor("growth").features[0]).toBe("20 videos a month");
    expect(pricingFor("pro").features[0]).toBe("40 videos a month");
  });
});

describe("videoQuotaWindow", () => {
  it("paid: the 30 days ending at plan_expires_at", () => {
    const { start, end } = videoQuotaWindow("growth", "2026-11-20T00:00:00.000Z", NOW);
    expect(end.toISOString()).toBe("2026-11-20T00:00:00.000Z");
    expect(start.toISOString()).toBe("2026-10-21T00:00:00.000Z");
  });

  it("Free: the rolling last 30 days", () => {
    const { start, end } = videoQuotaWindow("free", null, NOW);
    expect(end.toISOString()).toBe(NOW.toISOString());
    expect(start.toISOString()).toBe("2026-10-15T10:00:00.000Z");
  });

  it("expired paid pass: reads as Free, rolling window — no rollover into the next month", () => {
    const { start, end } = videoQuotaWindow("growth", "2026-10-01T00:00:00.000Z", NOW);
    expect(end.toISOString()).toBe(NOW.toISOString());
    expect(start.toISOString()).toBe("2026-10-15T10:00:00.000Z");
  });

  it("an early renewal slides the window forward with the new period", () => {
    const first = videoQuotaWindow("starter", "2026-11-20T00:00:00.000Z", NOW);
    const renewed = videoQuotaWindow("starter", "2026-12-20T00:00:00.000Z", NOW);
    expect(renewed.start.toISOString()).toBe("2026-11-20T00:00:00.000Z");
    expect(renewed.start.getTime()).toBe(first.end.getTime());
  });
});

describe("isVideoQuotaKind", () => {
  it.each(["mp4", "mov_alpha", "webm_alpha"])("%s counts", (kind) => {
    expect(isVideoQuotaKind(kind)).toBe(true);
  });
  it.each(["srt", "vtt", "ass", "txt", "json", "png"])("%s never counts", (kind) => {
    expect(isVideoQuotaKind(kind)).toBe(false);
  });
});

describe("getVideoQuotaUsage", () => {
  it("counts the window's events and reports the remainder", async () => {
    const db = fakeDb(events(2));
    const usage: VideoQuotaUsage = await getVideoQuotaUsage(db, "user-1", "free", null, NOW);
    expect(usage).toMatchObject({ plan: "free", limit: 3, used: 2, remaining: 1 });
  });

  it("remaining never goes below zero", async () => {
    const db = fakeDb(events(5));
    const usage = await getVideoQuotaUsage(db, "user-1", "free", null, NOW);
    expect(usage.used).toBe(5);
    expect(usage.remaining).toBe(0);
  });

  it("fails closed with a plain message when the quota table is not applied yet", async () => {
    const db = fakeDb([], { code: "42P01", message: 'relation "public.video_quota_events" does not exist' });
    await expect(getVideoQuotaUsage(db, "user-1", "free", null, NOW)).rejects.toMatchObject({
      code: "INTERNAL",
      message: QUOTA_NOT_SET_UP,
    });
  });
});

describe("checkVideoQuota", () => {
  it("passes under the limit", async () => {
    const db = fakeDb(events(2));
    const usage = await checkVideoQuota(db, "user-1", "free", null, NOW);
    expect(usage.remaining).toBe(1);
  });

  it("blocks at the Free 3 cap with an upsell message, never a crash", async () => {
    const db = fakeDb(events(3));
    const err = await checkVideoQuota(db, "user-1", "free", null, NOW).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiFailure);
    expect((err as ApiFailure).code).toBe("LIMIT_EXCEEDED");
    expect((err as ApiFailure).message).toContain("Monthly limit reached");
    expect((err as ApiFailure).message).toContain("3 videos a month");
    expect((err as ApiFailure).message).toContain("Upgrade for more videos");
  });

  it("blocks a paid plan at its own cap", async () => {
    const db = fakeDb(events(20));
    const err = await checkVideoQuota(db, "user-1", "growth", "2026-11-20T00:00:00.000Z", NOW).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiFailure);
    expect((err as ApiFailure).message).toContain("20 videos a month");
  });
});

describe("recordVideoQuotaEvent", () => {
  it("writes one event, keyed by export_id so a retry never counts twice", async () => {
    const db = fakeDb([]);
    const res = await recordVideoQuotaEvent(db, { exportId: "11111111-1111-4111-8111-111111111111", ownerId: "user-1", projectId: "proj-1", kind: "mp4" });
    expect(res).toEqual({ recorded: true });
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0]!.row).toMatchObject({ export_id: "11111111-1111-4111-8111-111111111111", owner_id: "user-1", project_id: "proj-1", kind: "mp4" });
    expect(db.upserts[0]!.opts).toMatchObject({ onConflict: "export_id", ignoreDuplicates: true });
  });

  it("answers recorded:false (never throws) when the quota table is not applied yet", async () => {
    const db = fakeDb([], { code: "PGRST205", message: "Could not find the table 'public.video_quota_events' in the schema cache" });
    const res = await recordVideoQuotaEvent(db, { exportId: "11111111-1111-4111-8111-111111111111", ownerId: "user-1", projectId: "proj-1", kind: "mp4" });
    expect(res).toEqual({ recorded: false });
  });
});

describe("plans — the quota change did not move prices or ids", () => {
  it("plans, prices and the 30-day pass model are unchanged", () => {
    expect(pricingFor("starter").priceInr).toBe(299);
    expect(pricingFor("growth").priceInr).toBe(499);
    expect(pricingFor("pro").priceInr).toBe(799);
    expect(pricingFor("growth").id).toBe("growth");
  });
});
