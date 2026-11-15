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
  releaseVideoQuotaEvent,
  reserveVideoQuotaEvent,
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

// Enforcement tests run AFTER the 5-day free launch window ends
// (20 Nov 2026, 23:59:59 IST): inside the window the quota is lifted, so
// counting/blocking only applies from 21 Nov. Window behaviour itself is
// pinned in freeLaunch.test.ts. The videoQuotaWindow tests above keep NOW
// — that function is pure date math, unaffected by the window.
const AFTER_WINDOW = new Date("2026-11-25T10:00:00.000Z");

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
    const usage: VideoQuotaUsage = await getVideoQuotaUsage(db, "user-1", "free", null, AFTER_WINDOW);
    expect(usage).toMatchObject({ plan: "free", limit: 3, used: 2, remaining: 1 });
  });

  it("remaining never goes below zero", async () => {
    const db = fakeDb(events(5));
    const usage = await getVideoQuotaUsage(db, "user-1", "free", null, AFTER_WINDOW);
    expect(usage.used).toBe(5);
    expect(usage.remaining).toBe(0);
  });

  it("fails closed with a plain message when the quota table is not applied yet", async () => {
    const db = fakeDb([], { code: "42P01", message: 'relation "public.video_quota_events" does not exist' });
    await expect(getVideoQuotaUsage(db, "user-1", "free", null, AFTER_WINDOW)).rejects.toMatchObject({
      code: "INTERNAL",
      message: QUOTA_NOT_SET_UP,
    });
  });
});

describe("checkVideoQuota", () => {
  it("passes under the limit", async () => {
    const db = fakeDb(events(2));
    const usage = await checkVideoQuota(db, "user-1", "free", null, AFTER_WINDOW);
    expect(usage.remaining).toBe(1);
  });

  it("blocks at the Free 3 cap with an upsell message, never a crash", async () => {
    const db = fakeDb(events(3));
    const err = await checkVideoQuota(db, "user-1", "free", null, AFTER_WINDOW).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiFailure);
    expect((err as ApiFailure).code).toBe("LIMIT_EXCEEDED");
    expect((err as ApiFailure).message).toContain("Monthly limit reached");
    expect((err as ApiFailure).message).toContain("3 videos a month");
    expect((err as ApiFailure).message).toContain("Upgrade for more videos");
  });

  it("blocks a paid plan at its own cap", async () => {
    const db = fakeDb(events(20));
    const err = await checkVideoQuota(db, "user-1", "growth", "2026-12-20T00:00:00.000Z", AFTER_WINDOW).catch((e: unknown) => e);
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

/**
 * reserveVideoQuotaEvent (B-04 pre-flight reservation + C-09 race fix):
 * count + record happen in one per-owner locked step, so the slot is held
 * before rendering starts. The fake below is LIVE — the count query sees
 * rows written by earlier upserts, exactly like the real table — which is
 * what makes the concurrency test below a real proof instead of a tautology.
 */
function liveFakeDb(
  initial: Array<{ id: string; owner_id: string }> = [],
  error: { code?: string; message?: string } | null = null,
) {
  const rows = [...initial];
  const upserts: Array<Record<string, unknown>> = [];
  const deletes: Array<Array<[string, unknown]>> = [];
  const db = {
    rows,
    upserts,
    deletes,
    from: () => ({
      select: () => {
        let owner: string | null = null;
        const chain = {
          eq: (col: string, val: unknown) => {
            if (col === "owner_id") owner = val as string;
            return chain;
          },
          gte: () => chain,
          lt: () => chain,
          limit: async () => ({ data: rows.filter((r) => owner === null || r.owner_id === owner), error }),
        };
        return chain;
      },
      upsert: (row: Record<string, unknown>, _opts: Record<string, unknown>) => {
        upserts.push(row);
        if (!rows.some((r) => r.id === row.export_id)) {
          rows.push({ id: String(row.export_id), owner_id: String(row.owner_id) });
        }
        return Promise.resolve({ error });
      },
      delete: () => {
        const filters: Array<[string, unknown]> = [];
        const chain = {
          eq: (col: string, val: unknown) => {
            filters.push([col, val]);
            return chain;
          },
          then(onOk: (v: { error: { code?: string; message?: string } | null }) => unknown, onErr?: (e: unknown) => unknown) {
            deletes.push(filters);
            const match = rows.filter((r) => filters.every(([c, v]) => (c === "export_id" ? r.id === v : r.owner_id === v)));
            for (const m of match) rows.splice(rows.indexOf(m), 1);
            return Promise.resolve({ error }).then(onOk, onErr);
          },
        };
        return chain;
      },
    }),
  };
  return db as unknown as Parameters<typeof getVideoQuotaUsage>[0] & {
    rows: typeof rows;
    upserts: typeof upserts;
    deletes: typeof deletes;
  };
}

const reserveInput = (exportId: string, ownerId = "user-1") => ({
  exportId,
  ownerId,
  projectId: "proj-1",
  kind: "mp4" as const,
  plan: "free" as const,
  expiresAt: null,
  now: AFTER_WINDOW,
});

describe("reserveVideoQuotaEvent", () => {
  it("reserves under the limit: one event written, usage returned", async () => {
    const db = liveFakeDb([{ id: "ev-1", owner_id: "user-1" }, { id: "ev-2", owner_id: "user-1" }]);
    const res = await reserveVideoQuotaEvent(db, reserveInput("aaaaaaaa-1111-4111-8111-111111111111"));
    expect(res).toMatchObject({ reserved: true, usage: { limit: 3, used: 2, remaining: 1 } });
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0]).toMatchObject({ export_id: "aaaaaaaa-1111-4111-8111-111111111111", owner_id: "user-1" });
    expect(db.rows).toHaveLength(3);
  });

  it("blocks at the Free 3 cap with LIMIT_EXCEEDED and writes nothing", async () => {
    const db = liveFakeDb(events(3).map((e) => ({ ...e, owner_id: "user-1" })));
    const err = await reserveVideoQuotaEvent(db, reserveInput("aaaaaaaa-1111-4111-8111-111111111111")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiFailure);
    expect((err as ApiFailure).code).toBe("LIMIT_EXCEEDED");
    expect(db.upserts).toHaveLength(0);
  });

  it("soft-fails (reserved:false, never throws) when the quota table is not applied yet", async () => {
    const db = liveFakeDb([], { code: "42P01", message: 'relation "public.video_quota_events" does not exist' });
    const res = await reserveVideoQuotaEvent(db, reserveInput("aaaaaaaa-1111-4111-8111-111111111111"));
    expect(res).toEqual({ reserved: false, usage: null });
    expect(db.upserts).toHaveLength(0);
  });

  it("two concurrent reserves at remaining=1: exactly one succeeds (C-09)", async () => {
    const db = liveFakeDb(events(2).map((e) => ({ ...e, owner_id: "user-1" })));
    const [a, b] = await Promise.allSettled([
      reserveVideoQuotaEvent(db, reserveInput("aaaaaaaa-1111-4111-8111-111111111111")),
      reserveVideoQuotaEvent(db, reserveInput("bbbbbbbb-2222-4222-8222-222222222222")),
    ]);
    expect([a.status, b.status].sort()).toEqual(["fulfilled", "rejected"]);
    const rejected = [a, b].find((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toBeDefined();
    const reason = rejected!.reason as ApiFailure;
    expect(reason).toBeInstanceOf(ApiFailure);
    expect(reason.code).toBe("LIMIT_EXCEEDED");
    expect(db.upserts).toHaveLength(1);
    expect(db.rows).toHaveLength(3);
  });

  it("two concurrent reserves for DIFFERENT owners at remaining=1 each: both succeed", async () => {
    const db = liveFakeDb([
      { id: "ev-1", owner_id: "user-1" },
      { id: "ev-2", owner_id: "user-1" },
      { id: "ev-3", owner_id: "user-2" },
      { id: "ev-4", owner_id: "user-2" },
    ]);
    const [a, b] = await Promise.allSettled([
      reserveVideoQuotaEvent(db, reserveInput("aaaaaaaa-1111-4111-8111-111111111111", "user-1")),
      reserveVideoQuotaEvent(db, reserveInput("bbbbbbbb-2222-4222-8222-222222222222", "user-2")),
    ]);
    expect(a.status).toBe("fulfilled");
    expect(b.status).toBe("fulfilled");
    expect(db.upserts).toHaveLength(2);
  });
});

describe("releaseVideoQuotaEvent", () => {
  it("deletes the event for that export_id, owner-scoped", async () => {
    const db = liveFakeDb([{ id: "ev-1", owner_id: "user-1" }]);
    await releaseVideoQuotaEvent(db, { exportId: "ev-1", ownerId: "user-1" });
    expect(db.rows).toHaveLength(0);
    expect(db.deletes[0]).toEqual([
      ["export_id", "ev-1"],
      ["owner_id", "user-1"],
    ]);
  });

  it("never throws when the quota table is missing", async () => {
    const db = liveFakeDb([], { code: "42P01", message: 'relation "public.video_quota_events" does not exist' });
    await expect(releaseVideoQuotaEvent(db, { exportId: "ev-1", ownerId: "user-1" })).resolves.toBeUndefined();
  });
});
