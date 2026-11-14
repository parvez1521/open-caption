import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TEXT_EXPORT_KINDS,
  compositionDurationMs,
  effectiveDurationMs,
  effectivePlanId,
  planFor,
  planIdFor,
  type ClipRange,
  type LegacyPlanId,
  type PlanId,
  type VideoSegment,
} from "@capseasy/shared";
import { ApiFailure } from "@/lib/api/http";

/**
 * Minutes ledger — the subscription meter (owner, 2026-11-14). This
 * REPLACES the monthly video quota: one meter only, never two.
 * Billed minutes = exported video minutes, rounded UP to whole minutes
 * per export. Transcription is NOT charged (render only). Text exports
 * (SRT/VTT/ASS/TXT/JSON) never count. No rollover.
 *
 * Free gets 5 minutes ONE-TIME ever. Starter 40 / Creator 100 / Pro 250
 * per billing cycle (cycle ends at profiles.plan_expires_at). An expired
 * paid plan reads as Free (5 one-time minutes if never granted, else 0).
 * A renewal (new payment via settle) grants a fresh cycle.
 *
 * Storage: public.minute_ledger (append-only: grant/reserve/deduct/
 * refund/expire, one row per movement, idempotency_key UNIQUE) and
 * public.minute_balances (one row per user). RLS on, no policies,
 * service-role-only — same shape as video_quota_events. All balance
 * changes go through the Postgres functions in
 * supabase/APPLY-MINUTES-LEDGER.sql; the TypeScript below is a thin
 * wrapper over rpc(). The check-and-hold is a single transaction
 * (reserve_minutes locks the balance row FOR UPDATE), so parallel
 * exports can never overspend — there is no read-then-act here.
 *
 * Reservation lifecycle: reserve (hold, balance drops at once) →
 * settle 'completed' (deduct row records the actual rendered minutes,
 * never more than reserved; the unused hold is refunded) or settle
 * 'failed'/'cancelled' (the whole hold is refunded). A deduct row never
 * moves the balance — the hold already left it at reserve time.
 *
 * Browser-path honesty: MP4s render on the user's device, so the server
 * cannot observe the render. The modal reserves BEFORE rendering and
 * settles after the save; a modified client can still skip the call.
 * Browser minutes are therefore a deterrent on that path and a guarantee
 * only on the server path. The server never trusts a client-supplied
 * minutes number: the reserve endpoint recomputes the minutes from the
 * video row and the project settings.
 *
 * If the ledger tables have not been applied yet the write path fails
 * CLOSED with an honest message; the read path answers null so billing
 * pages keep working.
 */

/** Video kinds that consume minutes: finished video renders only. */
export const VIDEO_MINUTES_KINDS = ["mp4", "mov_alpha", "webm_alpha"] as const;
export type VideoMinutesKind = (typeof VIDEO_MINUTES_KINDS)[number];

export const isMinutesChargedKind = (kind: string): kind is VideoMinutesKind =>
  (VIDEO_MINUTES_KINDS as readonly string[]).includes(kind);

/** Text exports never count — stated here, not just in the route. */
export const isTextExportKind = (kind: string): boolean =>
  (TEXT_EXPORT_KINDS as readonly string[]).includes(kind);

export interface MinutesUsage {
  plan: PlanId | LegacyPlanId;
  /** Minutes granted in the current cycle (Free one-time: 5, granted or not yet). */
  granted: number;
  /** Granted minus remaining. Holds count as used until they settle. */
  used: number;
  remaining: number;
  cycleStart: string | null;
  cycleEnd: string | null;
  /** True once the Free one-time 5 minutes have been granted. */
  freeGranted: boolean;
}

/** Whole minutes billed for a rendered duration: round UP, at least 1. */
export function billedMinutesForDurationMs(durationMs: number): number {
  return Math.max(1, Math.ceil(Math.max(0, durationMs) / 60_000));
}

/**
 * Whole minutes billed for one video export, from the same duration truth
 * the renderers use: the source duration narrowed by the clip range, then
 * by the segment chain when segments are stored (the composition's own
 * duration is the truth there), then by the trim range when the user
 * trimmed. The billed duration is the shorter of the rendered duration
 * and the trim window — a trim can never bill more than the render.
 */
export function billedMinutesForRender(input: {
  sourceDurationMs: number;
  clipRange?: ClipRange | null;
  segments?: readonly VideoSegment[] | null;
  range?: { startMs: number; endMs: number } | null;
}): number {
  const fallback = effectiveDurationMs(input.sourceDurationMs, input.clipRange ?? null);
  const rendered = input.segments?.length ? compositionDurationMs(input.segments) : fallback;
  const trimmed = input.range ? Math.max(0, input.range.endMs - input.range.startMs) : rendered;
  return billedMinutesForDurationMs(Math.min(rendered, trimmed));
}

export const MINUTES_NOT_SET_UP = "Minutes aren't set up yet — exports are paused until the setup finishes.";

/** True when a Supabase error means "the minutes tables/functions are not applied yet". */
export const isMissingMinutesTableError = (error: { code?: string; message?: string } | null): boolean => {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202") return true;
  const msg = error.message ?? "";
  return (
    msg.includes("minute_ledger") ||
    msg.includes("minute_balances") ||
    msg.includes("reserve_minutes") ||
    msg.includes("grant_cycle_minutes") ||
    msg.includes("settle_reservation") ||
    msg.includes("get_minutes_balance")
  );
};

interface RpcResult<T> {
  data: T | null;
  error: { code?: string; message?: string } | null;
}

async function callMinutesRpc<T>(
  db: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = (await (db as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult<T>>;
  }).rpc(fn, args)) ?? { data: null, error: null };
  if (error) {
    if (isMissingMinutesTableError(error)) throw new ApiFailure("INTERNAL", MINUTES_NOT_SET_UP);
    throw new Error(`Minutes ${fn} failed: ${error.message ?? "unknown error"}`);
  }
  if (data === null || data === undefined) throw new Error(`Minutes ${fn} returned no data`);
  return data;
}

interface BalanceRpc {
  balance: number;
  cycle_start: string | null;
  cycle_end: string | null;
  granted_in_cycle: number;
  free_granted: boolean;
  has_row: boolean;
}

/** The caller's minutes balance for display. Throws MINUTES_NOT_SET_UP when the ledger is not applied. */
export async function getMinutesUsage(
  db: SupabaseClient,
  ownerId: string,
  plan: PlanId | LegacyPlanId,
  expiresAt: string | null,
  now: Date = new Date(),
): Promise<MinutesUsage> {
  const effective = effectivePlanId(plan, expiresAt, now);
  const freeMinutes = planFor("free").minutesPerCycle;
  const row = await callMinutesRpc<BalanceRpc>(db, "get_minutes_balance", { p_user_id: ownerId });
  // A Free user who never took the one-time 5 minutes still has them —
  // granted or not yet — so the display shows 5 of 5 until they do.
  if (effective === "free" && !row.free_granted) {
    return { plan, granted: freeMinutes, used: 0, remaining: freeMinutes, cycleStart: row.cycle_start, cycleEnd: row.cycle_end, freeGranted: false };
  }
  const granted = row.granted_in_cycle;
  const remaining = Math.max(0, row.balance);
  return {
    plan,
    granted,
    used: Math.max(0, granted - remaining),
    remaining,
    cycleStart: row.cycle_start,
    cycleEnd: row.cycle_end,
    freeGranted: row.free_granted,
  };
}

interface ReserveRpc {
  ok: boolean;
  code?: string;
  message?: string;
  reservation_key?: string;
  minutes?: number;
  balance?: number;
  already_reserved?: boolean;
}

export interface ReserveResult {
  reservationKey: string;
  minutes: number;
  balance: number;
  alreadyReserved: boolean;
}

/**
 * Hold minutes for one export attempt, atomically (see the SQL function).
 * Throws LIMIT_EXCEEDED (402) with an upsell message when the balance
 * does not cover the export, and INTERNAL/MINUTES_NOT_SET_UP when the
 * ledger is not applied. A duplicate idempotency key returns the
 * existing reservation instead of charging twice.
 */
export async function reserveMinutes(
  db: SupabaseClient,
  input: {
    ownerId: string;
    projectId?: string | null;
    exportId: string;
    minutes: number;
    plan: PlanId | LegacyPlanId;
    expiresAt: string | null;
  },
  now: Date = new Date(),
): Promise<ReserveResult> {
  const effective = effectivePlanId(input.plan, input.expiresAt, now);
  const result = await callMinutesRpc<ReserveRpc>(db, "reserve_minutes", {
    p_user_id: input.ownerId,
    p_project_id: input.projectId ?? null,
    p_minutes: input.minutes,
    p_idempotency_key: `reserve:${input.exportId}`,
    p_export_id: input.exportId,
    p_plan: effective,
    p_free_minutes: planFor("free").minutesPerCycle,
  });
  if (!result.ok) {
    if (result.code === "INSUFFICIENT") {
      const limit = planFor(effective).minutesPerCycle;
      throw new ApiFailure(
        "LIMIT_EXCEEDED",
        `Monthly minutes used up — your plan includes ${limit} minutes a month. Upgrade for more minutes.`,
        { minutes: { balance: result.balance ?? 0, minutes: input.minutes } },
      );
    }
    if (result.code === "MINUTES_NOT_SET_UP") throw new ApiFailure("INTERNAL", MINUTES_NOT_SET_UP);
    throw new Error(`Minutes reserve failed: ${result.message ?? result.code ?? "unknown error"}`);
  }
  return {
    reservationKey: result.reservation_key ?? `reserve:${input.exportId}`,
    minutes: result.minutes ?? input.minutes,
    balance: result.balance ?? 0,
    alreadyReserved: result.already_reserved ?? false,
  };
}

interface SettleRpc {
  settled: boolean;
  reason?: string;
  outcome?: string;
  minutes_charged?: number;
  refunded?: number;
  balance?: number;
}

export interface SettleResult {
  settled: boolean;
  reason?: string;
  minutesCharged: number;
  refunded: number;
  balance: number;
}

/**
 * Settle one reservation. 'completed' charges the actual rendered
 * minutes (capped at the reservation) and refunds the unused hold;
 * 'failed'/'cancelled' refunds the whole hold. Never throws for a
 * missing reservation or an unapplied ledger — the render already
 * happened (or never started), so the caller logs and moves on.
 * A second settle for the same reservation is a no-op.
 */
export async function settleReservation(
  db: SupabaseClient,
  input: {
    ownerId: string;
    exportId: string;
    outcome: "completed" | "failed" | "cancelled";
    actualMinutes?: number;
  },
): Promise<SettleResult> {
  let result: SettleRpc;
  try {
    result = await callMinutesRpc<SettleRpc>(db, "settle_reservation", {
      p_user_id: input.ownerId,
      p_export_id: input.exportId,
      p_outcome: input.outcome,
      p_actual_minutes: input.actualMinutes ?? null,
    });
  } catch (e) {
    if (e instanceof ApiFailure && e.message === MINUTES_NOT_SET_UP) {
      return { settled: false, reason: "not_applied", minutesCharged: 0, refunded: 0, balance: 0 };
    }
    throw e;
  }
  return {
    settled: result.settled,
    reason: result.reason,
    minutesCharged: result.minutes_charged ?? 0,
    refunded: result.refunded ?? 0,
    balance: result.balance ?? 0,
  };
}

interface GrantRpc {
  granted: boolean;
  already_granted?: boolean;
  balance?: number;
  cycle_start?: string | null;
  cycle_end?: string | null;
  reason?: string;
}

export interface GrantResult {
  granted: boolean;
  alreadyGranted: boolean;
  balance: number;
  reason?: string;
}

/** Idempotency key for the Free one-time grant: one key per user, ever. */
export const freeGrantKey = (ownerId: string): string => `free-grant:${ownerId}`;

/**
 * Grant one billing cycle of minutes. Paid plans get their cycle
 * allowance (Starter 40 / Creator 100 / Pro 250) for the window
 * [periodStart, periodEnd]; Free gets the 5 one-time minutes, once ever
 * (keyed free-grant:<user_id> — a second grant is refused). Reusable for
 * Cashfree subscriptions (Builder 6): the same idempotency key never
 * grants twice. Never throws when the ledger is not applied — it answers
 * {granted:false, reason:'not_applied'} so a payment is never stranded
 * by a missing table; the caller logs loudly and the grant is retried by
 * the next settle (settlePaid re-attempts the grant for paid payments).
 */
export async function grantCycleMinutes(
  db: SupabaseClient,
  input: {
    ownerId: string;
    plan: PlanId | LegacyPlanId;
    periodStart: string;
    periodEnd: string;
    idempotencyKey: string;
  },
): Promise<GrantResult> {
  const plan = planFor(input.plan);
  // Free-ness comes from the plan being granted, never from the period
  // end: a Starter payment settled late (or with a backdated window)
  // still grants Starter minutes. effectivePlanId would read "free"
  // for any expired period and grant the one-time 5 instead.
  const isFree = planIdFor(input.plan) === "free";
  const minutes = isFree ? planFor("free").minutesPerCycle : plan.minutesPerCycle;
  let result: GrantRpc;
  try {
    result = await callMinutesRpc<GrantRpc>(db, "grant_cycle_minutes", {
      p_user_id: input.ownerId,
      p_minutes: minutes,
      p_cycle_start: input.periodStart,
      p_cycle_end: isFree ? null : input.periodEnd,
      p_idempotency_key: isFree ? freeGrantKey(input.ownerId) : input.idempotencyKey,
    });
  } catch (e) {
    if (e instanceof ApiFailure && e.message === MINUTES_NOT_SET_UP) {
      return { granted: false, alreadyGranted: false, balance: 0, reason: "not_applied" };
    }
    throw e;
  }
  return {
    granted: result.granted,
    alreadyGranted: result.already_granted ?? false,
    balance: result.balance ?? 0,
    reason: result.reason,
  };
}
