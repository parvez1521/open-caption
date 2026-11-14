import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_PERIOD_DAYS, effectivePlanId, planFor, type LegacyPlanId, type PlanId } from "@capseasy/shared";
import { ApiFailure } from "@/lib/api/http";

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
  plan: PlanId | LegacyPlanId;
  limit: number;
  used: number;
  remaining: number;
  windowStart: string;
  windowEnd: string;
}

const DAY_MS = 24 * 3600 * 1000;

/**
 * The window a quota counts in. A paid pass counts the 30 days ending at
 * plan_expires_at (so an early renewal slides the window forward with the
 * new period); Free counts the rolling last 30 days. An expired paid pass
 * reads as Free, so it counts the rolling window too.
 */
export function videoQuotaWindow(
  // Stored plan strings reach here, including the legacy "growth" id
  // (a live old Plus pass reads as Creator via effectivePlanId).
  plan: PlanId | LegacyPlanId,
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

/** Count the caller's finished videos in the current window. */
export async function getVideoQuotaUsage(
  db: SupabaseClient,
  ownerId: string,
  plan: PlanId | LegacyPlanId,
  expiresAt: string | null,
  now: Date = new Date(),
): Promise<VideoQuotaUsage> {
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
  plan: PlanId | LegacyPlanId,
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
