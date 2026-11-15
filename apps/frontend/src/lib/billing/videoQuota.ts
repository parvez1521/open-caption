import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_PERIOD_DAYS, effectivePlanId, planFor, type PlanId } from "@capseasy/shared";
import { ApiFailure } from "@/lib/api/http";
import { isFreeLaunchWindow } from "./freeLaunch";

/**
 * Monthly video quota — the subscription model (owner, 2026-11-14).
 * 1 video = 1 finished video export. Text caption files never count.
 * Transcription and editing stay unlimited; unused videos never roll over.
 *
 * Counting source: public.video_quota_events — one row per finished video
 * export (server renders write it when the job is queued; browser MP4s
 * write it when the render finishes, via the record endpoint). A failed
 * render keeps its slot: retrying the same export is free, because the
 * event is keyed by export_id and never written twice.
 *
 * The table is service-role-only (RLS on, no policies — same shape as
 * growth_connections). If it has not been applied yet the write path fails
 * CLOSED with an honest message; the read path answers null so billing
 * pages keep working.
 */

/** Video kinds that consume the quota: finished video renders only. */
export const VIDEO_QUOTA_KINDS = ["mp4", "mov_alpha", "webm_alpha"] as const;
export type VideoQuotaKind = (typeof VIDEO_QUOTA_KINDS)[number];

export const isVideoQuotaKind = (kind: string): kind is VideoQuotaKind =>
  (VIDEO_QUOTA_KINDS as readonly string[]).includes(kind);

export interface VideoQuotaUsage {
  plan: PlanId;
  limit: number;
  used: number;
  remaining: number;
  windowStart: string;
  windowEnd: string;
  /** True while the 5-day free launch window is active: limits are lifted. */
  freeLaunch?: boolean;
}

const DAY_MS = 24 * 3600 * 1000;

/**
 * The window a quota counts in. A paid pass counts the 30 days ending at
 * plan_expires_at (so an early renewal slides the window forward with the
 * new period); Free counts the rolling last 30 days. An expired paid pass
 * reads as Free, so it counts the rolling window too.
 */
export function videoQuotaWindow(
  plan: PlanId,
  expiresAt: string | null,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const effective = effectivePlanId(plan, expiresAt, now);
  const paid = effective !== "free" && expiresAt && new Date(expiresAt).getTime() > now.getTime();
  if (paid) {
    const end = new Date(expiresAt as string);
    return { start: new Date(end.getTime() - PLAN_PERIOD_DAYS * DAY_MS), end };
  }
  return { start: new Date(now.getTime() - PLAN_PERIOD_DAYS * DAY_MS), end: now };
}

/** True when a Supabase error means "this table does not exist yet". */
export const isMissingTableError = (error: { code?: string; message?: string } | null): boolean =>
  !!error && (error.code === "42P01" || error.code === "PGRST205" || error.message?.includes("video_quota_events") === true);

export const QUOTA_NOT_SET_UP = "Video limits aren't set up yet — exports are paused until the setup finishes.";

/**
 * Unlimited remaining during the free launch: a finite sentinel (JSON-safe,
 * unlike Infinity) so every existing `remaining <= 0` gate passes without
 * a client change. The billing page branches on `freeLaunch` instead of
 * printing this number.
 */
export const FREE_LAUNCH_REMAINING = Number.MAX_SAFE_INTEGER;

/**
 * The usage answer while the free launch window is active: the caller's
 * plan limit is reported honestly, nothing is counted, remaining is
 * unlimited. No DB access — this never fails on a missing table.
 */
export function freeLaunchUsage(plan: PlanId, expiresAt: string | null, now: Date = new Date()): VideoQuotaUsage {
  const { start, end } = videoQuotaWindow(plan, expiresAt, now);
  return {
    plan,
    limit: planFor(plan).videosPerMonth,
    used: 0,
    remaining: FREE_LAUNCH_REMAINING,
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    freeLaunch: true,
  };
}

/** Count the caller's finished videos in the current window. */
export async function getVideoQuotaUsage(
  db: SupabaseClient,
  ownerId: string,
  plan: PlanId,
  expiresAt: string | null,
  now: Date = new Date(),
): Promise<VideoQuotaUsage> {
  // Free launch window (owner, 2026-11-15): no counting, no limit — the
  // usage answers unlimited without touching the quota table, so every
  // read path (billing page, video-quota gate, record usage) reports
  // unlimited and the client gates (remaining <= 0) pass on their own.
  // `used` is not counted during the window — nothing displays it then.
  if (isFreeLaunchWindow(now)) return freeLaunchUsage(plan, expiresAt, now);
  const limit = planFor(plan).videosPerMonth;
  const { start, end } = videoQuotaWindow(plan, expiresAt, now);
  const { data, error } = await db
    .from("video_quota_events")
    .select("id")
    .eq("owner_id", ownerId)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .limit(1000);
  if (error) {
    if (isMissingTableError(error)) throw new ApiFailure("INTERNAL", QUOTA_NOT_SET_UP);
    throw new Error(`Could not count video exports: ${error.message}`);
  }
  const used = data?.length ?? 0;
  return {
    plan,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
  };
}

/**
 * Throw LIMIT_EXCEEDED (402) with an upsell message when the month's videos
 * are used up. Anything else returns the usage for the caller to display.
 */
export async function checkVideoQuota(
  db: SupabaseClient,
  ownerId: string,
  plan: PlanId,
  expiresAt: string | null,
  now: Date = new Date(),
): Promise<VideoQuotaUsage> {
  const usage = await getVideoQuotaUsage(db, ownerId, plan, expiresAt, now);
  if (usage.remaining <= 0) {
    throw new ApiFailure(
      "LIMIT_EXCEEDED",
      `Monthly limit reached — your plan includes ${usage.limit} videos a month. Upgrade for more videos.`,
      { videoQuota: usage },
    );
  }
  return usage;
}

/**
 * Record one finished video. Idempotent on export_id: a retry (or a
 * double-submit) never writes a second event for the same export.
 * Returns false only when the quota table has not been applied yet.
 */
export async function recordVideoQuotaEvent(
  db: SupabaseClient,
  input: { exportId: string; ownerId: string; projectId: string; kind: VideoQuotaKind },
): Promise<{ recorded: boolean }> {
  const { error } = await db.from("video_quota_events").upsert(
    { export_id: input.exportId, owner_id: input.ownerId, project_id: input.projectId, kind: input.kind },
    { onConflict: "export_id", ignoreDuplicates: true },
  );
  if (error) {
    if (isMissingTableError(error)) return { recorded: false };
    throw new Error(`Could not record the video export: ${error.message}`);
  }
  return { recorded: true };
}

/**
 * Delete one quota event by export_id, owner-scoped. Best-effort: never
 * throws — it only ever runs to give a slot back after a render that was
 * reserved but then failed before producing a video, so a delete failure
 * must not turn into a second user-facing error.
 */
export async function releaseVideoQuotaEvent(
  db: SupabaseClient,
  input: { exportId: string; ownerId: string },
): Promise<void> {
  try {
    const query = db.from("video_quota_events").delete();
    if (typeof (query as { eq?: unknown }).eq !== "function") return;
    const { error } = await query.eq("export_id", input.exportId).eq("owner_id", input.ownerId);
    if (error && !isMissingTableError(error)) {
      console.error(JSON.stringify({ level: "error", msg: "video quota release failed", exportId: input.exportId, err: error.message }));
    }
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "video quota release failed", exportId: input.exportId, err: e instanceof Error ? e.message : String(e) }));
  }
}

/**
 * Per-owner in-process mutex for quota check+record. The check-then-record
 * race (C-09) is closed by holding this lock across the count and the
 * insert, so two concurrent exports for the same owner in THIS process
 * cannot both see remaining=1 and both record. LIMIT: serverless instances
 * do not share this lock — two requests landing on different instances at
 * the same instant can still both pass. A fully atomic cap needs a Postgres
 * function (count-and-insert in one statement), which is a migration and
 * is deliberately out of scope here; the lock removes the race for the
 * common single-instance case and the overage stays at most a small number.
 */
const ownerExportLocks = new Map<string, Promise<void>>();

export async function withOwnerExportLock<T>(ownerId: string, fn: () => Promise<T>): Promise<T> {
  const prev = ownerExportLocks.get(ownerId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = prev.then(() => gate);
  ownerExportLocks.set(ownerId, chained);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (ownerExportLocks.get(ownerId) === chained) ownerExportLocks.delete(ownerId);
  }
}

/**
 * Server-side pre-flight quota reservation (B-04): count the caller's
 * videos and write the quota event for this exportId in one locked step,
 * BEFORE any rendering starts — the client cannot skip it, and the
 * exportId-keyed idempotency means the later post-render record is a
 * no-op for the same export. A render that then fails or is cancelled
 * should release the slot via releaseVideoQuotaEvent.
 *
 * Returns { reserved: false, usage: null } (soft-fail, same as the record
 * path) when the quota table has not been applied yet — the caller proceeds
 * uncounted instead of hard-failing. Throws LIMIT_EXCEEDED (402) at the cap.
 */
export async function reserveVideoQuotaEvent(
  db: SupabaseClient,
  input: { exportId: string; ownerId: string; projectId: string; kind: VideoQuotaKind; plan: PlanId; expiresAt: string | null; now?: Date },
): Promise<{ reserved: boolean; usage: VideoQuotaUsage | null }> {
  // Free launch window (owner, 2026-11-15): the export is allowed and
  // NOT counted — no quota event is written, so the window never eats a
  // user's monthly videos. No lock needed: nothing is written.
  if (isFreeLaunchWindow(input.now ?? new Date())) {
    return { reserved: true, usage: freeLaunchUsage(input.plan, input.expiresAt, input.now) };
  }
  return withOwnerExportLock(input.ownerId, async () => {
    let usage: VideoQuotaUsage;
    try {
      usage = await getVideoQuotaUsage(db, input.ownerId, input.plan, input.expiresAt, input.now);
    } catch (e) {
      if (e instanceof ApiFailure && e.message === QUOTA_NOT_SET_UP) return { reserved: false, usage: null };
      throw e;
    }
    if (usage.remaining <= 0) {
      throw new ApiFailure(
        "LIMIT_EXCEEDED",
        `Monthly limit reached — your plan includes ${usage.limit} videos a month. Upgrade for more videos.`,
        { videoQuota: usage },
      );
    }
    const { recorded } = await recordVideoQuotaEvent(db, {
      exportId: input.exportId,
      ownerId: input.ownerId,
      projectId: input.projectId,
      kind: input.kind,
    });
    return { reserved: recorded, usage };
  });
}
