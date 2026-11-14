// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ApiFailure } from "@/lib/api/http";
import {
  billedMinutesForDurationMs,
  billedMinutesForRender,
  getMinutesUsage,
  grantCycleMinutes,
  isMinutesChargedKind,
  isTextExportKind,
  reserveMinutes,
  settleReservation,
} from "../minutes";

/**
 * Minutes ledger tests (Builder 2). The SQL functions in
 * supabase/APPLY-MINUTES-LEDGER.sql are the atomicity guarantor
 * (reserve_minutes locks the balance row FOR UPDATE); this fake mirrors
 * their semantics in memory so the TypeScript contract is pinned:
 * idempotent keys, hold-then-settle, refunds, the Free one-time grant,
 * renewal adds a fresh cycle grant, and expiry wipes the remainder.
 *
 * Concurrency honesty: the fake serialises rpc calls through a queue,
 * exactly as Postgres serialises the FOR UPDATE transactions. A test
 * that ran the reserves truly in parallel against a read-then-act fake
 * would prove nothing about the SQL; the queue models the lock.
 */

type Row = Record<string, unknown>;

interface LedgerRow {
  user_id: string;
  project_id: string | null;
  export_id: string | null;
  reservation_key: string | null;
  kind: string;
  minutes: number;
  balance_after: number;
  idempotency_key: string;
  created_at: string;
}

interface BalanceRow {
  user_id: string;
  balance_minutes: number;
  cycle_start: string | null;
  cycle_end: string | null;
}

class MinutesStore {
  ledger: LedgerRow[] = [];
  balances = new Map<string, BalanceRow>();
  private queue: Promise<unknown> = Promise.resolve();

  private run<T>(fn: () => T): Promise<T> {
    const p = this.queue.then(fn);
    this.queue = p.catch(() => {});
    return p;
  }

  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: null }> {
    return this.run(() => ({ data: this.dispatch(fn, args), error: null }));
  }

  private balanceOf(userId: string): BalanceRow {
    let row = this.balances.get(userId);
    if (!row) {
      row = { user_id: userId, balance_minutes: 0, cycle_start: null, cycle_end: null };
      this.balances.set(userId, row);
    }
    return row;
  }

  private hasGrant(userId: string): boolean {
    return this.ledger.some((l) => l.user_id === userId && l.kind === "grant");
  }

  private freeGranted(userId: string): boolean {
    return this.ledger.some((l) => l.idempotency_key === `free-grant:${userId}`);
  }

  private settledKeys(userId: string): Set<string> {
    return new Set(
      this.ledger
        .filter((l) => l.user_id === userId && (l.kind === "deduct" || l.kind === "refund") && l.reservation_key)
        .map((l) => l.reservation_key as string),
    );
  }

  /** Expire a finished cycle's leftover (mirrors the SQL). */
  private expireCycle(userId: string, now: Date): void {
    const bal = this.balanceOf(userId);
    if (bal.cycle_end && new Date(bal.cycle_end).getTime() <= now.getTime() && bal.balance_minutes > 0) {
      this.ledger.push({
        user_id: userId, project_id: null, export_id: null, reservation_key: null,
        kind: "expire", minutes: -bal.balance_minutes, balance_after: 0,
        idempotency_key: `expire:cycle:${userId}:${bal.cycle_end}`, created_at: now.toISOString(),
      });
      bal.balance_minutes = 0;
      bal.cycle_start = null;
      bal.cycle_end = null;
    }
  }

  private dispatch(fn: string, args: Record<string, unknown>): unknown {
    const now = new Date();
    if (fn === "grant_cycle_minutes") {
      const userId = args.p_user_id as string;
      const minutes = args.p_minutes as number;
      const key = args.p_idempotency_key as string;
      if (this.ledger.some((l) => l.idempotency_key === key)) {
        const bal = this.balanceOf(userId);
        return { granted: false, already_granted: true, balance: bal.balance_minutes, cycle_start: bal.cycle_start, cycle_end: bal.cycle_end };
      }
      const bal = this.balanceOf(userId);
      this.expireCycle(userId, now);
      const next = bal.balance_minutes + minutes;
      this.ledger.push({
        user_id: userId, project_id: null, export_id: null, reservation_key: null,
        kind: "grant", minutes, balance_after: next, idempotency_key: key, created_at: now.toISOString(),
      });
      bal.balance_minutes = next;
      if (args.p_cycle_end !== null && args.p_cycle_end !== undefined) {
        bal.cycle_start = args.p_cycle_start as string;
        bal.cycle_end = args.p_cycle_end as string;
      } else {
        bal.cycle_start = args.p_cycle_start as string;
        bal.cycle_end = null;
      }
      return { granted: true, already_granted: false, balance: next, cycle_start: bal.cycle_start, cycle_end: bal.cycle_end };
    }
    if (fn === "reserve_minutes") {
      const userId = args.p_user_id as string;
      const minutes = args.p_minutes as number;
      const exportId = args.p_export_id as string;
      let key = args.p_idempotency_key as string;
      // Dedup loop: an unsettled reservation with this key is returned
      // as-is; a settled one mints a suffixed key.
      let attempt = 2;
      for (;;) {
        const existing = this.ledger.find((l) => l.idempotency_key === key && l.kind === "reserve");
        if (!existing) break;
        if (!this.settledKeys(userId).has(key)) {
          const bal = this.balanceOf(userId);
          return { ok: true, already_reserved: true, reservation_key: key, minutes, balance: bal.balance_minutes };
        }
        key = `${args.p_idempotency_key as string}-r${attempt}`;
        attempt += 1;
        if (attempt > 12) return { ok: false, code: "INTERNAL", message: "too many reservation attempts" };
      }
      const bal = this.balanceOf(userId);
      this.expireCycle(userId, now);
      if (args.p_plan === "free" && !this.freeGranted(userId)) {
        const freeMinutes = args.p_free_minutes as number;
        const next = bal.balance_minutes + freeMinutes;
        this.ledger.push({
          user_id: userId, project_id: null, export_id: null, reservation_key: null,
          kind: "grant", minutes: freeMinutes, balance_after: next,
          idempotency_key: `free-grant:${userId}`, created_at: now.toISOString(),
        });
        bal.balance_minutes = next;
        bal.cycle_start = now.toISOString();
        bal.cycle_end = null;
      }
      if (args.p_plan !== "free" && bal.balance_minutes === 0 && bal.cycle_start === null && !this.hasGrant(userId)) {
        return { ok: false, code: "MINUTES_NOT_SET_UP", balance: 0, message: "Minutes are not set up yet — exports are paused until the setup finishes." };
      }
      if (bal.balance_minutes < minutes) {
        return { ok: false, code: "INSUFFICIENT", balance: bal.balance_minutes, minutes };
      }
      const next = bal.balance_minutes - minutes;
      this.ledger.push({
        user_id: userId, project_id: (args.p_project_id as string | null) ?? null, export_id: exportId,
        reservation_key: key, kind: "reserve", minutes: -minutes, balance_after: next,
        idempotency_key: key, created_at: now.toISOString(),
      });
      bal.balance_minutes = next;
      return { ok: true, already_reserved: false, reservation_key: key, minutes, balance: next };
    }
    if (fn === "settle_reservation") {
      const userId = args.p_user_id as string;
      const exportId = args.p_export_id as string;
      const outcome = args.p_outcome as string;
      const settled = this.settledKeys(userId);
      const reserve = [...this.ledger].reverse().find(
        (l) => l.user_id === userId && l.export_id === exportId && l.kind === "reserve" && !settled.has(l.idempotency_key),
      );
      if (!reserve) return { settled: false, reason: "no_reservation" };
      const bal = this.balanceOf(userId);
      const reserved = Math.abs(reserve.minutes);
      if (outcome === "completed") {
        const actual = Math.min((args.p_actual_minutes as number | null) ?? reserved, reserved);
        const refund = reserved - actual;
        this.ledger.push({
          user_id: userId, project_id: null, export_id: exportId, reservation_key: reserve.idempotency_key,
          kind: "deduct", minutes: actual, balance_after: bal.balance_minutes,
          idempotency_key: `deduct:${reserve.idempotency_key}`, created_at: now.toISOString(),
        });
        if (refund > 0) {
          bal.balance_minutes += refund;
          this.ledger.push({
            user_id: userId, project_id: null, export_id: exportId, reservation_key: reserve.idempotency_key,
            kind: "refund", minutes: refund, balance_after: bal.balance_minutes,
            idempotency_key: `refund:${reserve.idempotency_key}`, created_at: now.toISOString(),
          });
        }
        return { settled: true, outcome: "completed", minutes_charged: actual, refunded: refund, balance: bal.balance_minutes };
      }
      bal.balance_minutes += reserved;
      this.ledger.push({
        user_id: userId, project_id: null, export_id: exportId, reservation_key: reserve.idempotency_key,
        kind: "refund", minutes: reserved, balance_after: bal.balance_minutes,
        idempotency_key: `refund:${reserve.idempotency_key}`, created_at: now.toISOString(),
      });
      return { settled: true, outcome, minutes_charged: 0, refunded: reserved, balance: bal.balance_minutes };
    }
    if (fn === "get_minutes_balance") {
      const userId = args.p_user_id as string;
      const bal = this.balances.get(userId);
      const cycleStart = bal?.cycle_start ?? null;
      const granted = this.ledger
        .filter((l) => l.user_id === userId && l.kind === "grant" && (cycleStart === null || l.created_at >= cycleStart))
        .reduce((s, l) => s + l.minutes, 0);
      let balance = bal?.balance_minutes ?? 0;
      if (bal?.cycle_end && new Date(bal.cycle_end).getTime() <= now.getTime()) balance = 0;
      return {
        balance, cycle_start: cycleStart, cycle_end: bal?.cycle_end ?? null,
        granted_in_cycle: granted, free_granted: this.freeGranted(userId), has_row: !!bal,
      };
    }
    throw new Error(`fake rpc: unknown function ${fn}`);
  }
}

const fakeDb = (store: MinutesStore) => ({ rpc: (fn: string, args: Record<string, unknown>) => store.rpc(fn, args) }) as never;

const USER = "user-1";
const NOW = new Date();
const in30d = new Date(NOW.getTime() + 30 * 24 * 3600 * 1000).toISOString();
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 3600 * 1000).toISOString();

describe("billed minutes — rounding and duration truth", () => {
  it("rounds UP to whole minutes per export, at least 1", () => {
    expect(billedMinutesForDurationMs(0)).toBe(1);
    expect(billedMinutesForDurationMs(500)).toBe(1);
    expect(billedMinutesForDurationMs(60_000)).toBe(1);
    expect(billedMinutesForDurationMs(60_001)).toBe(2);
    expect(billedMinutesForDurationMs(600_000)).toBe(10);
  });

  it("charges the trimmed duration, never the full source", () => {
    expect(billedMinutesForRender({ sourceDurationMs: 600_000, range: { startMs: 0, endMs: 90_000 } })).toBe(2);
    expect(billedMinutesForRender({ sourceDurationMs: 600_000 })).toBe(10);
  });

  it("charges the clip range, not the full source", () => {
    expect(billedMinutesForRender({ sourceDurationMs: 600_000, clipRange: { startMs: 60_000, endMs: 180_000 } })).toBe(2);
  });

  it("charges the segment chain when segments are stored", () => {
    const segments = [
      { id: "s1", sourceInMs: 0, sourceOutMs: 60_000, playbackRate: 1, transitionIn: null },
      { id: "s2", sourceInMs: 120_000, sourceOutMs: 180_000, playbackRate: 2, transitionIn: null },
    ] as never;
    // 60s + 30s at 2x = 75s → 2 minutes, not the 10-minute source.
    expect(billedMinutesForRender({ sourceDurationMs: 600_000, segments })).toBe(2);
  });

  it("a trim longer than the render never bills more than the render", () => {
    expect(billedMinutesForRender({ sourceDurationMs: 90_000, range: { startMs: 0, endMs: 600_000 } })).toBe(2);
  });
});

describe("which exports count", () => {
  it.each(["mp4", "mov_alpha", "webm_alpha"])("%s counts", (kind) => {
    expect(isMinutesChargedKind(kind)).toBe(true);
  });
  it.each(["srt", "vtt", "ass", "txt", "json", "png"])("%s never counts", (kind) => {
    expect(isMinutesChargedKind(kind)).toBe(false);
    expect(isTextExportKind(kind)).toBe(kind !== "png");
  });
});

describe("reserve → settle", () => {
  it("reserves before processing and settles the actual minutes, refunding the unused hold", async () => {
    const store = new MinutesStore();
    const db = fakeDb(store);
    await grantCycleMinutes(db, { ownerId: USER, plan: "starter", periodStart: NOW.toISOString(), periodEnd: in30d, idempotencyKey: "grant:payment:pay-1" });
    const res = await reserveMinutes(db, { ownerId: USER, projectId: "proj-1", exportId: "exp-1", minutes: 5, plan: "starter", expiresAt: in30d });
    expect(res.minutes).toBe(5);
    expect(res.balance).toBe(35);
    const settled = await settleReservation(db, { ownerId: USER, exportId: "exp-1", outcome: "completed", actualMinutes: 2 });
    expect(settled).toMatchObject({ settled: true, minutesCharged: 2, refunded: 3, balance: 38 });
    const usage = await getMinutesUsage(db, USER, "starter", in30d);
    expect(usage).toMatchObject({ granted: 40, used: 2, remaining: 38 });
  });

  it("a duplicate submission (same export id) holds minutes once, never twice", async () => {
    const store = new MinutesStore();
    const db = fakeDb(store);
    await grantCycleMinutes(db, { ownerId: USER, plan: "starter", periodStart: NOW.toISOString(), periodEnd: in30d, idempotencyKey: "grant:payment:pay-1" });
    const first = await reserveMinutes(db, { ownerId: USER, projectId: "proj-1", exportId: "exp-1", minutes: 3, plan: "starter", expiresAt: in30d });
    const second = await reserveMinutes(db, { ownerId: USER, projectId: "proj-1", exportId: "exp-1", minutes: 3, plan: "starter", expiresAt: in30d });
    expect(first.alreadyReserved).toBe(false);
    expect(second.alreadyReserved).toBe(true);
    expect(second.reservationKey).toBe(first.reservationKey);
    expect(store.ledger.filter((l) => l.kind === "reserve")).toHaveLength(1);
    const usage = await getMinutesUsage(db, USER, "starter", in30d);
    expect(usage.remaining).toBe(37);
  });

  it("parallel reserves never overspend: 6 x 1 minute against a 5-minute balance lets 5 through", async () => {
    const store = new MinutesStore();
    const db = fakeDb(store);
    await grantCycleMinutes(db, { ownerId: USER, plan: "free", periodStart: NOW.toISOString(), periodEnd: NOW.toISOString(), idempotencyKey: `free-grant:${USER}` });
    const attempts = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        reserveMinutes(db, { ownerId: USER, projectId: "proj-1", exportId: `exp-p${i}`, minutes: 1, plan: "free", expiresAt: null })
          .then(() => "ok" as const)
          .catch((e: unknown) => (e instanceof ApiFailure ? e.code : "other")),
      ),
    );
    expect(attempts.filter((a) => a === "ok")).toHaveLength(5);
    expect(attempts.filter((a) => a === "LIMIT_EXCEEDED")).toHaveLength(1);
    expect(store.ledger.filter((l) => l.kind === "reserve")).toHaveLength(5);
    const usage = await getMinutesUsage(db, USER, "free", null);
    expect(usage.remaining).toBe(0);
  });

  it("blocks at zero with a 402 upsell message, never a crash", async () => {
    const store = new MinutesStore();
    const db = fakeDb(store);
    await grantCycleMinutes(db, { ownerId: USER, plan: "free", periodStart: NOW.toISOString(), periodEnd: NOW.toISOString(), idempotencyKey: `free-grant:${USER}` });
    await reserveMinutes(db, { ownerId: USER, projectId: "proj-1", exportId: "exp-1", minutes: 5, plan: "free", expiresAt: null });
    const err = await reserveMinutes(db, { ownerId: USER, projectId: "proj-1", exportId: "exp-2", minutes: 1, plan: "free", expiresAt: null }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiFailure);
    expect((err as ApiFailure).code).toBe("LIMIT_EXCEEDED");
    expect((err as ApiFailure).message).toContain("Monthly minutes used up");
    expect((err as ApiFailure).message).toContain("5 minutes a month");
    expect((err as ApiFailure).message).toContain("Upgrade for more minutes");
  });

  it("refunds the whole hold on failure, and a second settle is a no-op", async () => {
    const store = new MinutesStore();
    const db = fakeDb(store);
    await grantCycleMinutes(db, { ownerId: USER, plan: "starter", periodStart: NOW.toISOString(), periodEnd: in30d, idempotencyKey: "grant:payment:pay-1" });
    await reserveMinutes(db, { ownerId: USER, projectId: "proj-1", exportId: "exp-1", minutes: 4, plan: "starter", expiresAt: in30d });
    const failed = await settleReservation(db, { ownerId: USER, exportId: "exp-1", outcome: "failed" });
    expect(failed).toMatchObject({ settled: true, minutesCharged: 0, refunded: 4, balance: 40 });
    const again = await settleReservation(db, { ownerId: USER, exportId: "exp-1", outcome: "failed" });
    expect(again.settled).toBe(false);
    const usage = await getMinutesUsage(db, USER, "starter", in30d);
    expect(usage.remaining).toBe(40);
    expect(store.ledger.filter((l) => l.kind === "refund")).toHaveLength(1);
  });

  it("a retry after a refunded failure reserves again (the settled key never blocks a fresh hold)", async () => {
    const store = new MinutesStore();
    const db = fakeDb(store);
    await grantCycleMinutes(db, { ownerId: USER, plan: "starter", periodStart: NOW.toISOString(), periodEnd: in30d, idempotencyKey: "grant:payment:pay-1" });
    const first = await reserveMinutes(db, { ownerId: USER, projectId: "proj-1", exportId: "exp-1", minutes: 4, plan: "starter", expiresAt: in30d });
    await settleReservation(db, { ownerId: USER, exportId: "exp-1", outcome: "failed" });
    const retry = await reserveMinutes(db, { ownerId: USER, projectId: "proj-1", exportId: "exp-1", minutes: 4, plan: "starter", expiresAt: in30d });
    expect(retry.alreadyReserved).toBe(false);
    expect(retry.reservationKey).not.toBe(first.reservationKey);
    const usage = await getMinutesUsage(db, USER, "starter", in30d);
    expect(usage.remaining).toBe(36);
  });

  it("a settle with no reservation charges nothing", async () => {
    const store = new MinutesStore();
    const db = fakeDb(store);
    const settled = await settleReservation(db, { ownerId: USER, exportId: "exp-ghost", outcome: "completed", actualMinutes: 3 });
    expect(settled).toMatchObject({ settled: false, reason: "no_reservation", minutesCharged: 0 });
    expect(store.ledger).toHaveLength(0);
  });

  it("completion never charges more than reserved", async () => {
    const store = new MinutesStore();
    const db = fakeDb(store);
    await grantCycleMinutes(db, { ownerId: USER, plan: "starter", periodStart: NOW.toISOString(), periodEnd: in30d, idempotencyKey: "grant:payment:pay-1" });
    await reserveMinutes(db, { ownerId: USER, projectId: "proj-1", exportId: "exp-1", minutes: 2, plan: "starter", expiresAt: in30d });
    const settled = await settleReservation(db, { ownerId: USER, exportId: "exp-1", outcome: "completed", actualMinutes: 9 });
    expect(settled).toMatchObject({ settled: true, minutesCharged: 2, refunded: 0 });
  });
});

describe("Free one-time grant", () => {
  it("grants 5 minutes lazily on first reserve, and never a second time", async () => {
    const store = new MinutesStore();
    const db = fakeDb(store);
    const first = await reserveMinutes(db, { ownerId: USER, projectId: "proj-1", exportId: "exp-1", minutes: 5, plan: "free", expiresAt: null });
    expect(first.balance).toBe(0);
    expect(store.ledger.filter((l) => l.kind === "grant")).toHaveLength(1);
    await settleReservation(db, { ownerId: USER, exportId: "exp-1", outcome: "failed" });
    const second = await reserveMinutes(db, { ownerId: USER, projectId: "proj-1", exportId: "exp-2", minutes: 5, plan: "free", expiresAt: null });
    expect(second.balance).toBe(0);
    // Still exactly one grant row: the refund returned the same 5 minutes, it did not mint 5 more.
    expect(store.ledger.filter((l) => l.kind === "grant")).toHaveLength(1);
  });

  it("a second explicit Free grant is refused", async () => {
    const store = new MinutesStore();
    const db = fakeDb(store);
    const first = await grantCycleMinutes(db, { ownerId: USER, plan: "free", periodStart: NOW.toISOString(), periodEnd: NOW.toISOString(), idempotencyKey: `free-grant:${USER}` });
    expect(first).toMatchObject({ granted: true, balance: 5 });
    const second = await grantCycleMinutes(db, { ownerId: USER, plan: "free", periodStart: NOW.toISOString(), periodEnd: NOW.toISOString(), idempotencyKey: `free-grant:${USER}` });
    expect(second).toMatchObject({ granted: false, alreadyGranted: true, balance: 5 });
    expect(store.ledger.filter((l) => l.kind === "grant")).toHaveLength(1);
  });

  it("a fresh Free user reads 5 of 5 before any grant row exists", async () => {
    const store = new MinutesStore();
    const db = fakeDb(store);
    const usage = await getMinutesUsage(db, USER, "free", null);
    expect(usage).toMatchObject({ granted: 5, used: 0, remaining: 5, freeGranted: false });
  });
});

describe("cycles: renewal and expiry", () => {
  it("renewal grants a fresh cycle on top of the leftover and extends the window", async () => {
    const store = new MinutesStore();
    const db = fakeDb(store);
    await grantCycleMinutes(db, { ownerId: USER, plan: "starter", periodStart: NOW.toISOString(), periodEnd: in30d, idempotencyKey: "grant:payment:pay-1" });
    await reserveMinutes(db, { ownerId: USER, projectId: "proj-1", exportId: "exp-1", minutes: 10, plan: "starter", expiresAt: in30d });
    await settleReservation(db, { ownerId: USER, exportId: "exp-1", outcome: "completed", actualMinutes: 10 });
    const in60d = new Date(NOW.getTime() + 60 * 24 * 3600 * 1000).toISOString();
    const renewed = await grantCycleMinutes(db, { ownerId: USER, plan: "starter", periodStart: NOW.toISOString(), periodEnd: in60d, idempotencyKey: "grant:payment:pay-2" });
    // 30 leftover + 40 fresh = 70, usable until the new cycle end. An
    // early renewal never eats paid minutes left over from the old cycle.
    expect(renewed).toMatchObject({ granted: true, balance: 70 });
    const usage = await getMinutesUsage(db, USER, "starter", in60d);
    expect(usage.cycleEnd).toBe(in60d);
  });

  it("an expired paid plan reads as Free: the leftover is dead, the Free 5 apply only if never granted", async () => {
    const store = new MinutesStore();
    const db = fakeDb(store);
    const expiredAt = daysAgo(1);
    await grantCycleMinutes(db, { ownerId: USER, plan: "starter", periodStart: daysAgo(31), periodEnd: expiredAt, idempotencyKey: "grant:payment:pay-1" });
    // 30 leftover from the expired cycle, then the plan expired: the
    // leftover is dead, but the Free 5 (never granted) are still theirs.
    const usage = await getMinutesUsage(db, USER, "free", expiredAt);
    expect(usage).toMatchObject({ granted: 5, used: 0, remaining: 5, freeGranted: false });
    const res = await reserveMinutes(db, { ownerId: USER, projectId: "proj-1", exportId: "exp-1", minutes: 5, plan: "starter", expiresAt: expiredAt });
    expect(res.balance).toBe(0);
    expect(store.ledger.filter((l) => l.kind === "grant")).toHaveLength(2); // paid grant + lazy Free grant
    expect(store.ledger.some((l) => l.kind === "expire")).toBe(true);
  });

  it("an expired paid plan with the Free grant already used reads as 0", async () => {
    const store = new MinutesStore();
    const db = fakeDb(store);
    const expiredAt = daysAgo(1);
    await grantCycleMinutes(db, { ownerId: USER, plan: "free", periodStart: daysAgo(60), periodEnd: daysAgo(60), idempotencyKey: `free-grant:${USER}` });
    await grantCycleMinutes(db, { ownerId: USER, plan: "starter", periodStart: daysAgo(31), periodEnd: expiredAt, idempotencyKey: "grant:payment:pay-1" });
    const err = await reserveMinutes(db, { ownerId: USER, projectId: "proj-1", exportId: "exp-1", minutes: 1, plan: "starter", expiresAt: expiredAt }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiFailure);
    expect((err as ApiFailure).code).toBe("LIMIT_EXCEEDED");
  });

  it("a paid user with no grant at all fails closed, never open", async () => {
    const store = new MinutesStore();
    const db = fakeDb(store);
    const err = await reserveMinutes(db, { ownerId: USER, projectId: "proj-1", exportId: "exp-1", minutes: 1, plan: "starter", expiresAt: in30d }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiFailure);
    expect((err as ApiFailure).code).toBe("INTERNAL");
    expect((err as ApiFailure).message).toContain("Minutes aren't set up yet");
  });
});

describe("grant idempotency (settle safety)", () => {
  it("the same payment never grants twice", async () => {
    const store = new MinutesStore();
    const db = fakeDb(store);
    const args = { ownerId: USER, plan: "creator" as const, periodStart: NOW.toISOString(), periodEnd: in30d, idempotencyKey: "grant:payment:pay-9" };
    expect(await grantCycleMinutes(db, args)).toMatchObject({ granted: true, balance: 100 });
    expect(await grantCycleMinutes(db, args)).toMatchObject({ granted: false, alreadyGranted: true, balance: 100 });
  });

  it("plan allowances are Starter 40, Creator 100, Pro 250", async () => {
    for (const [plan, minutes] of [["starter", 40], ["creator", 100], ["pro", 250]] as const) {
      const store = new MinutesStore();
      const db = fakeDb(store);
      const g = await grantCycleMinutes(db, { ownerId: USER, plan, periodStart: NOW.toISOString(), periodEnd: in30d, idempotencyKey: `grant:payment:${plan}` });
      expect(g.balance).toBe(minutes);
    }
  });

  it("a stored legacy growth pass grants the Creator allowance", async () => {
    const store = new MinutesStore();
    const db = fakeDb(store);
    const g = await grantCycleMinutes(db, { ownerId: USER, plan: "growth", periodStart: NOW.toISOString(), periodEnd: in30d, idempotencyKey: "grant:payment:pay-old" });
    expect(g.balance).toBe(100);
  });
});
