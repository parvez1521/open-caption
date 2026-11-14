import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdmin, getUserClient } from "../supabase/admin";
import { ApiFailure } from "./http";

export interface AuthedUser {
  id: string;
  email: string | null;
  token: string;
  /** anonymous guest who hasn't signed up yet (may edit, may not export) */
  guest: boolean;
  /**
   * Email verified in Supabase Auth (email_confirmed_at set, or the
   * account came from Google, which verifies the address itself).
   * Read server-side from auth.users on every token check — never from
   * a client claim. The free-trial gate (lib/billing/trial.ts) reads
   * this; other routes ignore it.
   */
  emailVerified: boolean;
  /** Supabase Auth provider (app_metadata.provider, e.g. "google" | "email"), or null. */
  authProvider: string | null;
  /** acts as the user; Postgres RLS enforces ownership */
  db: SupabaseClient;
}

const bearer = (req: Request): string | null => {
  const h = req.headers.get("authorization");
  return h?.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() || null : null;
};

/**
 * A verified token is remembered for a few seconds: the editor polls, autosaves and prefetches many times a minute, and each
 * request used to pay a round-trip to Supabase Auth just to learn the same answer. Keyed by the token, so a different or
 * expired token is always checked again.
 */
const TOKEN_TTL_MS = 20_000;
const verified = new Map<string, { id: string; email: string | null; guest: boolean; emailVerified: boolean; authProvider: string | null; until: number }>();

/**
 * True when Supabase Auth counts the address as verified: the
 * confirmation timestamp is set, or the account came from Google
 * (Google verifies the address itself, so Supabase marks OAuth users
 * confirmed at signup). Pure, so the trial gate can unit-test it.
 */
export function isEmailVerifiedForTrial(user: {
  email_confirmed_at?: string | null;
  app_metadata?: { provider?: string | null };
  identities?: Array<{ provider?: string | null }> | null;
}): boolean {
  if (user.email_confirmed_at) return true;
  if (user.app_metadata?.provider === "google") return true;
  if (user.identities?.some((i) => i.provider === "google")) return true;
  return false;
}

/** Verifies the Supabase access token and returns an RLS-scoped client. profiles.id === auth.users.id since P1. */
export async function requireUser(req: Request): Promise<AuthedUser> {
  const token = bearer(req);
  if (!token) throw new ApiFailure("UNAUTHORIZED", "Missing bearer token");
  const now = Date.now();
  const hit = verified.get(token);
  if (hit && hit.until > now) return { id: hit.id, email: hit.email, token, guest: hit.guest, emailVerified: hit.emailVerified, authProvider: hit.authProvider, db: getUserClient(token) };
  const { data, error } = await getAdmin().auth.getUser(token);
  if (error || !data.user) throw new ApiFailure("UNAUTHORIZED", "Invalid or expired token");
  const u = data.user;
  const guest = !!u.is_anonymous && !u.email && !u.new_email;
  const emailVerified = isEmailVerifiedForTrial(u);
  const authProvider = (u.app_metadata?.provider as string | null) ?? null;
  if (verified.size > 500) for (const [k, v] of verified) if (v.until <= now) verified.delete(k);
  verified.set(token, { id: u.id, email: u.email ?? null, guest, emailVerified, authProvider, until: now + TOKEN_TTL_MS });
  return { id: u.id, email: u.email ?? null, token, guest, emailVerified, authProvider, db: getUserClient(token) };
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export interface AuthedWorker {
  id: string;
  ownerId: string;
  name: string;
}

/**
 * Recently verified companion tokens (per server instance). An idle companion calls every minute or so; looking its
 * token up and writing "last seen" every time was most of the database traffic. A revoked token stops working
 * within a minute.
 */
type CachedWorker = { worker: AuthedWorker; checkedAt: number; seenWrittenAt: number };
// on globalThis: each route is bundled separately, and revoking (workers route) must clear what heartbeat/claim cached
const g = globalThis as typeof globalThis & { __ceWorkerCache?: Map<string, CachedWorker> };
const workerCache = (g.__ceWorkerCache ??= new Map<string, CachedWorker>());
const WORKER_CACHE_MS = 60_000;
/** liveness is written at most this often (the "online" window is 3 minutes, see COMPANION_ONLINE_MS) */
export const SEEN_WRITE_MS = 60_000;

/** Companion auth: `Authorization: Bearer cpe_...` looked up by SHA-256 hash; revoked workers are rejected. */
/**
 * Desktop helpers (Companion) are switched off unless COMPANIONS_ENABLED=1: the app runs fully in the browser, and an
 * idle helper was most of the database traffic. While off, every helper call gets 401 (helpers stop themselves on
 * 401) and pairing is refused.
 */
export const companionsEnabled = () => process.env.COMPANIONS_ENABLED === "1";
export function requireCompanionsEnabled() {
  if (!companionsEnabled()) throw new ApiFailure("FORBIDDEN", "The desktop helper is turned off. Captions and exports work right in your browser.");
}

/** `touch: false` when the route writes the worker row itself (heartbeat), so liveness isn't written twice. */
export async function requireWorker(req: Request, { touch = true }: { touch?: boolean } = {}): Promise<AuthedWorker> {
  if (!companionsEnabled()) throw new ApiFailure("UNAUTHORIZED", "The desktop helper is turned off for now.");
  const token = bearer(req);
  if (!token || !token.startsWith("cpe_")) throw new ApiFailure("UNAUTHORIZED", "Missing companion token");
  const hash = sha256(token);
  const now = Date.now();
  const admin = getAdmin();
  const hit = workerCache.get(hash);
  if (hit && now - hit.checkedAt < WORKER_CACHE_MS) {
    if (touch && now - hit.seenWrittenAt > SEEN_WRITE_MS) {
      hit.seenWrittenAt = now;
      await admin.from("workers").update({ last_seen_at: new Date(now).toISOString(), status: "online" }).eq("id", hit.worker.id);
    }
    return hit.worker;
  }
  const { data } = await admin
    .from("workers")
    .select("id, owner_id, name, revoked_at, last_seen_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!data || data.revoked_at) {
    workerCache.delete(hash);
    throw new ApiFailure("UNAUTHORIZED", "Companion token is invalid or was revoked");
  }
  let seenWrittenAt = data.last_seen_at ? new Date(data.last_seen_at).getTime() : 0;
  if (touch && now - seenWrittenAt > SEEN_WRITE_MS) {
    seenWrittenAt = now;
    await admin.from("workers").update({ last_seen_at: new Date(now).toISOString(), status: "online" }).eq("id", data.id);
  }
  const worker = { id: data.id, ownerId: data.owner_id, name: data.name };
  if (workerCache.size > 5000) workerCache.clear();
  workerCache.set(hash, { worker, checkedAt: now, seenWrittenAt });
  return worker;
}

/** Forget a revoked token straight away on this instance (others notice within WORKER_CACHE_MS). */
export function forgetWorker(workerId: string) {
  for (const [k, v] of workerCache) if (v.worker.id === workerId) workerCache.delete(k);
}
