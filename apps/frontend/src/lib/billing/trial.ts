import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import type { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import disposableDomains from "disposable-email-domains";
import wildcardDomains from "disposable-email-domains/wildcard.json";
import type { LegacyPlanId, PlanId } from "@capseasy/shared";
import { ApiFailure } from "@/lib/api/http";
import { rateLimit } from "@/lib/api/rateLimit";
import { freeGrantKey } from "./minutes";

/**
 * Free-trial protection (monetization, Builder 5). The Free plan is 5
 * minutes ONE-TIME ever, granted lazily by `reserve_minutes` the first
 * time a Free user reserves an export (Builder 2). This module is the
 * gate in front of that grant: the free-grant key AND the trial check
 * must both pass before the 5 minutes exist. Paid plans never reach
 * this code — a paid customer sharing an IP is never blocked.
 *
 * Signals, weakest to strongest:
 * - Verified email: read server-side from Supabase Auth
 *   (email_confirmed_at, or a Google provider — Google verifies the
 *   address itself). Guests have no email and get no trial.
 * - Disposable email: the `disposable-email-domains` list (npm, MIT),
 *   checked server-side at grant time. Google accounts cannot be
 *   disposable in practice; the check matters for email signup and
 *   guest email upgrade, and it runs here so no grant path skips it.
 * - One trial per eligible IP: the client IP is HMAC-SHA256 hashed
 *   with TRIAL_IP_HASH_SECRET and only the hash is stored
 *   (trial_ip_hashes). No raw IP is stored anywhere — ever — not in
 *   the table, not in a log, not in an error message.
 * - Device: a random id in an httpOnly cookie (`ct_device`). No
 *   fingerprinting of any kind — no canvas, WebGL, audio, fonts, or
 *   third-party library. The id is random, not derived from the
 *   device, and a cleared cookie simply looks like a new device.
 * - Velocity: trial attempts per IP per hour (rate-limit bucket
 *   `trial_signup`, 3/hour). Suspicious velocity asks for Turnstile.
 * - Turnstile: Cloudflare, free. Server-side verification only; the
 *   widget token means nothing until siteverify says so. Keys unset
 *   means Turnstile is OFF — signups are never blocked for a missing
 *   key, but an IP that already claimed a trial cannot earn a second
 *   one without a challenge, so the refusal stands with a support
 *   email for manual review.
 *
 * Policy (owner model): one trial per eligible IP means the FIRST
 * account from an IP gets it. A later account on the same IP is NOT
 * blocked from signing up or buying — it is only denied the trial,
 * unless it passes Turnstile with a verified email (households,
 * offices, colleges, carrier NAT, VPNs). The hard refusal is only
 * for unverified or suspicious repeats. A user on a NEW IP could
 * re-grant: that is the accepted residual risk, stated here and in
 * the report — IP hashing cannot see past a new address.
 *
 * Retention: trial_ip_hashes rows live 12 months (expires_at), then
 * the cleanup job deletes them. Deleting an account does NOT delete
 * its IP-hash row — the row is keyed by IP hash, not user id, so
 * recreating an account from the same IP does not re-grant the trial.
 * A deletion request removes account data; the fraud-prevention hash
 * stays until its expiry (privacy page wording is an owner step).
 *
 * Fail-closed, like the ledger: if the trial table or the hash secret
 * is not set up, a Free grant is refused with an honest message and
 * exports pause for Free users. Paid users are unaffected.
 */

/** How many trial attempts one IP hash may make per hour before a challenge is required. */
export const TRIAL_VELOCITY_MAX_PER_HOUR = 3;
/** Retention for trial_ip_hashes rows, in months. Owner to confirm (recommended 12). */
export const TRIAL_RETENTION_MONTHS = 12;
/** Manual review path for a denied trial (support address already used on the pricing page). */
export const TRIAL_SUPPORT_EMAIL = "work.techhacksai@gmail.com";
/** Random device id, httpOnly cookie. Never a fingerprint. */
export const TRIAL_DEVICE_COOKIE = "ct_device";

export const TRIAL_NOT_SET_UP = "Trial protection isn't set up yet — exports are paused until the setup finishes.";
export const TRIAL_EMAIL_UNVERIFIED_MESSAGE = "Verify your email to use the free trial.";
export const TRIAL_DISPOSABLE_MESSAGE = "Use a permanent email address.";
export const TRIAL_GUEST_MESSAGE = "Create a free account to use the free trial.";
export const TRIAL_IP_USED_MESSAGE = "This network already used the free trial. You can still buy a plan.";
export const TRIAL_VELOCITY_MESSAGE = "Too many signups from this network right now. Try again later, or buy a plan.";
export const TRIAL_REVIEW_MESSAGE = "This network already used the free trial. Email us and we can review it.";

/** True when a Supabase error means "the trial_ip_hashes table/functions are not applied yet". */
export const isMissingTrialTableError = (error: { code?: string; message?: string } | null): boolean => {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202") return true;
  const msg = error.message ?? "";
  return msg.includes("trial_ip_hashes") || msg.includes("trial_ip_status") || msg.includes("trial_ip_claim");
};

/** The client IP, first entry of x-forwarded-for — the same read the device routes already use. Never logged. */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const first = forwarded.split(",")[0]?.trim();
  return first || null;
}

/**
 * Keyed hash of an IP: HMAC-SHA256 with the server secret. Plain SHA-256
 * would be reversible by brute force (the IPv4 space is small), so the
 * existing sha256 helper in lib/api/auth.ts is the wrong function here.
 * The secret comes from TRIAL_IP_HASH_SECRET, never code, never the
 * client, never a log. A different secret gives a different hash for
 * the same IP — rotating the secret orphans old rows by design.
 */
export function hashTrialIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex");
}

function hashTrialIpWithEnv(ip: string): string {
  const secret = process.env.TRIAL_IP_HASH_SECRET;
  if (!secret) throw new ApiFailure("INTERNAL", TRIAL_NOT_SET_UP);
  return hashTrialIp(ip, secret);
}

const DISPOSABLE_SET = new Set<string>((disposableDomains as unknown as string[]).map((d) => d.toLowerCase()));
const DISPOSABLE_WILDCARD = new Set<string>((wildcardDomains as unknown as string[]).map((d) => d.toLowerCase()));

/**
 * True when the address is on a disposable domain. Exact match, plus
 * any parent suffix (mail.0-mail.com is disposable when 0-mail.com
 * is), plus the wildcard list (any subdomain of a wildcard entry).
 * A malformed address is not disposable — shape validation lives
 * elsewhere; this check only answers "throwaway domain?".
 */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return false;
  const domain = email.slice(at + 1).toLowerCase();
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const suffix = parts.slice(i).join(".");
    if (DISPOSABLE_SET.has(suffix)) return true;
    if (DISPOSABLE_WILDCARD.has(suffix)) return true;
  }
  return false;
}

/** Read the random device id from the request cookie, if the browser sent one. */
export function readDeviceId(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === TRIAL_DEVICE_COOKIE) {
      const value = rest.join("=").trim();
      return value || null;
    }
  }
  return null;
}

/** A fresh random device id. Random, not derived from anything about the device. */
export const newDeviceId = (): string => randomUUID();

/** Set the device cookie on a response, only when the browser had none. */
export function attachDeviceCookie(res: NextResponse, deviceId: string, isNew: boolean): void {
  if (!isNew) return;
  res.cookies.set(TRIAL_DEVICE_COOKIE, deviceId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 3600,
  });
}

export interface TurnstileCheck {
  /** False when no keys are configured: Turnstile is OFF. */
  enabled: boolean;
  ok: boolean;
  reason?: "turnstile_off" | "missing_token" | "verification_failed" | "unreachable";
}

/**
 * Verify a Turnstile token against Cloudflare siteverify, server-side.
 * Keys unset → Turnstile is OFF ({enabled:false}); the caller must NOT
 * block a signup for that, it only means no challenge can be passed.
 * A token that fails verification, or a Cloudflare that cannot be
 * reached, fails CLOSED for a challenged grant — never open.
 * `fetchFn` is injectable so tests never call Cloudflare.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  fetchFn: typeof fetch = fetch,
): Promise<TurnstileCheck> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn(JSON.stringify({ level: "warn", msg: "turnstile not configured — challenge cannot be passed", siteKeySet: !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY }));
    return { enabled: false, ok: false, reason: "turnstile_off" };
  }
  if (!token) return { enabled: true, ok: false, reason: "missing_token" };
  try {
    const res = await fetchFn("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5000),
    });
    const body = (await res.json()) as { success?: boolean };
    if (body?.success === true) return { enabled: true, ok: true };
    return { enabled: true, ok: false, reason: "verification_failed" };
  } catch {
    return { enabled: true, ok: false, reason: "unreachable" };
  }
}

/** The signals the pure trial decision reads. `null` means "no signal" (no IP header; verification unknown). */
export interface TrialSignals {
  isGuest: boolean;
  email: string | null;
  /** False = unverified; null = unknown (only a mocked caller omits it — production requireUser always sets it). */
  emailVerified: boolean | null;
  /** True = this IP hash already has a trial. Null = no IP header was sent, so no IP signal exists. */
  ipClaimed: boolean | null;
  velocitySuspicious: boolean;
  /** The Turnstile result for the token the client sent, or null when no token was sent. */
  turnstile: TurnstileCheck | null;
  isPaid: boolean;
}

export interface TrialDecision {
  allowed: boolean;
  /** True when the client should show the Turnstile widget and retry with a token. */
  requiresTurnstile: boolean;
  /** Short message for the user, when denied. */
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Pure trial decision — no database, no network, so the policy matrix
 * is unit-testable. Order matters: paid bypass first (a paid customer
 * sharing an IP is never blocked), then guest, disposable, and
 * verification (hard refusals), then the IP/velocity challenge.
 */
export function decideTrialEligibility(s: TrialSignals): TrialDecision {
  if (s.isPaid) return { allowed: true, requiresTurnstile: false, message: "" };
  if (s.isGuest) {
    return { allowed: false, requiresTurnstile: false, message: TRIAL_GUEST_MESSAGE, details: { signupRequired: true } };
  }
  if (s.email && isDisposableEmail(s.email)) {
    return { allowed: false, requiresTurnstile: false, message: TRIAL_DISPOSABLE_MESSAGE };
  }
  if (s.emailVerified === false) {
    return { allowed: false, requiresTurnstile: false, message: TRIAL_EMAIL_UNVERIFIED_MESSAGE, details: { emailVerificationRequired: true } };
  }
  if (s.emailVerified === null && s.email) {
    // Fail closed: an address on file with no verification signal is
    // not a verified address. (Null with no email is the mocked-caller
    // path in route tests — production requireUser always sets it.)
    return { allowed: false, requiresTurnstile: false, message: TRIAL_EMAIL_UNVERIFIED_MESSAGE, details: { emailVerificationRequired: true } };
  }
  const challenged = s.ipClaimed === true || s.velocitySuspicious;
  if (!challenged) return { allowed: true, requiresTurnstile: false, message: "" };
  if (s.turnstile?.ok === true) return { allowed: true, requiresTurnstile: false, message: "" };
  if (s.turnstile?.enabled === false) {
    // Turnstile is OFF (no keys): no challenge can be passed, so the
    // refusal stands — but the account itself is never blocked, and a
    // human can review it at the support address.
    return {
      allowed: false,
      requiresTurnstile: false,
      message: TRIAL_REVIEW_MESSAGE,
      details: { trialChallenge: true, turnstileOff: true, supportEmail: TRIAL_SUPPORT_EMAIL },
    };
  }
  return {
    allowed: false,
    requiresTurnstile: true,
    message: s.ipClaimed === true ? TRIAL_IP_USED_MESSAGE : TRIAL_VELOCITY_MESSAGE,
    details: { trialChallenge: true },
  };
}

interface RpcResult<T> {
  data: T | null;
  error: { code?: string; message?: string } | null;
}

/** True once the Free one-time 5 minutes have been granted (the free-grant:<user_id> ledger key exists). */
export async function hasFreeGrant(admin: SupabaseClient, ownerId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("minute_ledger")
    .select("id")
    .eq("idempotency_key", freeGrantKey(ownerId))
    .maybeSingle();
  if (error) {
    // A missing ledger table means the grant cannot exist yet; the
    // reserve itself fails closed later with its honest message.
    if (isMissingTrialTableError(error) || error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202") return false;
    throw new Error(`Trial free-grant check failed: ${error.message ?? "unknown error"}`);
  }
  return data !== null;
}

interface TrialIpStatus {
  claimed: boolean;
  account_count: number;
  trial_granted_at: string | null;
}

/** Has this IP hash already had a trial? Read-only; the claim below is the write. */
async function trialIpStatus(admin: SupabaseClient, ipHash: string): Promise<TrialIpStatus> {
  const { data, error } = (await (admin as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult<TrialIpStatus>>;
  }).rpc("trial_ip_status", { p_ip_hash: ipHash })) ?? { data: null, error: null };
  if (error) {
    if (isMissingTrialTableError(error)) throw new ApiFailure("INTERNAL", TRIAL_NOT_SET_UP);
    throw new Error(`Trial IP status failed: ${error.message ?? "unknown error"}`);
  }
  if (!data) throw new Error("Trial IP status returned no data");
  return data;
}

interface TrialIpClaim {
  claimed: boolean;
  already_claimed: boolean;
  account_count: number;
}

/**
 * Record a trial for this IP hash, atomically (one Postgres function:
 * insert, or bump account_count on conflict). Returns whether another
 * account already claimed it — the race detector for two signups from
 * the same IP at the same moment.
 */
async function claimTrialIp(admin: SupabaseClient, ipHash: string): Promise<TrialIpClaim> {
  const { data, error } = (await (admin as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult<TrialIpClaim>>;
  }).rpc("trial_ip_claim", { p_ip_hash: ipHash })) ?? { data: null, error: null };
  if (error) {
    if (isMissingTrialTableError(error)) throw new ApiFailure("INTERNAL", TRIAL_NOT_SET_UP);
    throw new Error(`Trial IP claim failed: ${error.message ?? "unknown error"}`);
  }
  if (!data) throw new Error("Trial IP claim returned no data");
  return data;
}

/** Trial attempts per IP hash per hour. A hit over the cap means "suspicious velocity". Never throws. */
async function velocitySuspicious(ipHash: string): Promise<boolean> {
  try {
    await rateLimit(ipHash, "trial_signup", TRIAL_VELOCITY_MAX_PER_HOUR, 3600);
    return false;
  } catch (e) {
    if (e instanceof ApiFailure && e.code === "RATE_LIMITED") return true;
    return false; // the limiter fails open by design; a DB error never blocks a trial by itself
  }
}

export interface TrialUser {
  id: string;
  email: string | null;
  guest: boolean;
  /** Undefined only from a mocked caller — production requireUser always sets it. */
  emailVerified?: boolean | null;
}

export interface TrialGrantCheck {
  /** True when no trial gate ran: paid plan, or the Free grant already exists. */
  skipped: boolean;
  reason: string;
  deviceId: string;
  deviceIsNew: boolean;
  /** The IP hash that was checked and claimed, or null when no IP header was sent. Never the raw IP. */
  ipHash: string | null;
}

function throwDecision(decision: TrialDecision): never {
  if (decision.details?.signupRequired) throw new ApiFailure("FORBIDDEN", decision.message, decision.details);
  if (decision.message === TRIAL_DISPOSABLE_MESSAGE) throw new ApiFailure("VALIDATION", decision.message, decision.details);
  if (decision.details?.emailVerificationRequired) throw new ApiFailure("FORBIDDEN", decision.message, decision.details);
  throw new ApiFailure("LIMIT_EXCEEDED", decision.message, decision.details);
}

/**
 * The gate every Free-grant path calls before `reserveMinutes` (which
 * lazily mints the 5 minutes). Paid plans skip it entirely. A user who
 * already holds the Free grant skips it too — the trial was earned
 * once, and re-checking it on every export would re-deny households.
 *
 * The IP claim is recorded BEFORE the reserve: the reserve is what
 * mints the minutes, and a claim recorded after it would leave a
 * farming window between the check and the grant. If the reserve then
 * fails, the claim stands — the user's own per-user grant key is
 * untouched, so they can retry, but a second account on that IP
 * would need Turnstile, the same as the household path.
 *
 * A missing IP header (no proxy in front, e.g. local dev) means no IP
 * signal: the grant proceeds on the email/device signals alone, and a
 * warning is logged. Vercel always sets x-forwarded-for in production.
 */
export async function enforceFreeTrialGrant(input: {
  admin: SupabaseClient;
  user: TrialUser;
  plan: PlanId | LegacyPlanId;
  req: Request;
  turnstileToken?: string | null;
}): Promise<TrialGrantCheck> {
  const { admin, user, plan, req } = input;
  const existingDevice = readDeviceId(req);
  const deviceId = existingDevice ?? newDeviceId();
  const deviceIsNew = existingDevice === null;
  if (plan !== "free") return { skipped: true, reason: "paid", deviceId, deviceIsNew, ipHash: null };
  if (await hasFreeGrant(admin, user.id)) {
    return { skipped: true, reason: "already_granted", deviceId, deviceIsNew, ipHash: null };
  }

  const ip = clientIp(req);
  let ipHash: string | null = null;
  let ipClaimed: boolean | null = null;
  if (ip) {
    ipHash = hashTrialIpWithEnv(ip);
    ipClaimed = (await trialIpStatus(admin, ipHash)).claimed;
  } else {
    console.warn(JSON.stringify({ level: "warn", msg: "trial grant without an IP header — IP check skipped", userId: user.id }));
  }
  const suspicious = ipHash ? await velocitySuspicious(ipHash) : false;
  const challenged = ipClaimed === true || suspicious;
  const turnstile = challenged && input.turnstileToken ? await verifyTurnstileToken(input.turnstileToken) : null;

  const decision = decideTrialEligibility({
    isGuest: user.guest,
    email: user.email,
    emailVerified: user.emailVerified ?? null,
    ipClaimed,
    velocitySuspicious: suspicious,
    turnstile,
    isPaid: false,
  });
  if (!decision.allowed) throwDecision(decision);

  if (ipHash) {
    const claim = await claimTrialIp(admin, ipHash);
    if (claim.already_claimed && turnstile?.ok !== true) {
      // Lost the race: another account from this IP claimed the trial
      // between the status read and this claim. Same refusal as a
      // claimed IP — unless the token already passed, which earns it.
      throwDecision(decideTrialEligibility({
        isGuest: false,
        email: user.email,
        emailVerified: user.emailVerified ?? null,
        ipClaimed: true,
        velocitySuspicious: false,
        turnstile,
        isPaid: false,
      }));
    }
  }
  return { skipped: false, reason: "granted", deviceId, deviceIsNew, ipHash };
}
