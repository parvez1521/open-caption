import "server-only";
import { MAX_TITLE_LENGTH, type GrowthPostInput } from "@/features/growth/model";
import type { ConnectPlatform } from "./config";

/**
 * One post fetched from a connected platform, shaped for the EXISTING growth
 * data model: the sync writes these into growth_posts with the platform as
 * the row's source and `externalId` as its platform-side id. A metric the
 * platform did not report stays null — missing data, never a silent zero
 * (the growth model's standing rule).
 */
export interface SyncedPost extends GrowthPostInput {
  externalId: string;
  source: ConnectPlatform;
}

/** Platform counters arrive as strings (YouTube) or numbers; anything unparsable is missing data (null). */
export function parseCount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }
  return null;
}

/** Titles are clamped to the growth model's cap, on a word boundary where possible. */
export function clampTitle(title: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean.length <= MAX_TITLE_LENGTH) return clean;
  return clean.slice(0, MAX_TITLE_LENGTH).trimEnd();
}

export type FetchImpl = typeof fetch;

/**
 * Per-request ceiling for provider calls (C-04): without one, a hung Graph
 * / Google call holds the sync route until the platform kills it, and the
 * whole Instagram sync is lost. 30s is generous for a single Graph read
 * and far under any platform limit; a call that hits it throws like any
 * other provider failure, and the Instagram insights path degrades that
 * post's metrics to null instead of failing the sync.
 */
export const FETCH_JSON_TIMEOUT_MS = 30_000;

/**
 * The caller's signal, if any, plus a timeout that aborts on its own. The
 * caller's signal is never replaced — it still aborts the request itself.
 */
function timeoutSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // The timer must not keep the serverless function alive on its own.
  (timer as unknown as { unref?: () => void }).unref?.();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

/** GET/POST JSON with a hard failure on !ok — provider error bodies are never trusted as data. */
export async function fetchJson(
  fetchImpl: FetchImpl,
  url: string,
  init?: RequestInit,
  timeoutMs: number = FETCH_JSON_TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  const res = await fetchImpl(url, { ...init, signal: timeoutSignal(init?.signal ?? undefined, timeoutMs) });
  if (!res.ok) throw new Error(`provider request failed (${res.status})`);
  const body: unknown = await res.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("provider returned an unexpected response");
  return body as Record<string, unknown>;
}

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
