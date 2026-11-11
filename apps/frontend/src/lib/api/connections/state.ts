import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ConnectPlatform } from "./config";

/**
 * OAuth `state` for the connect flow: the callback arrives as a bare browser
 * redirect (no Authorization header), so the caller's identity travels in a
 * SIGNED state instead — an HMAC over (userId, platform, expiry) keyed by the
 * service-role secret, which exists only on the server. A state that fails
 * verification, names another platform, or is older than 10 minutes is
 * rejected and nothing is stored. The state carries no token and no email —
 * just the user id the connection will belong to.
 */

const STATE_TTL_MS = 10 * 60 * 1000;

function secret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return key;
}

const b64url = (buf: Buffer): string => buf.toString("base64url");

function sign(payload: string): string {
  return b64url(createHmac("sha256", secret()).update(payload).digest());
}

export function signOAuthState(userId: string, platform: ConnectPlatform, now: number = Date.now()): string {
  const payload = b64url(Buffer.from(JSON.stringify({ u: userId, p: platform, exp: now + STATE_TTL_MS }), "utf8"));
  return `${payload}.${sign(payload)}`;
}

export function verifyOAuthState(state: string, platform: ConnectPlatform, now: number = Date.now()): { userId: string } | null {
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = state.slice(0, dot);
  const given = Buffer.from(state.slice(dot + 1), "utf8");
  const expected = Buffer.from(sign(payload), "utf8");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let parsed: { u?: unknown; p?: unknown; exp?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as typeof parsed;
  } catch {
    return null;
  }
  if (typeof parsed.u !== "string" || !parsed.u) return null;
  if (parsed.p !== platform) return null;
  if (typeof parsed.exp !== "number" || parsed.exp < now) return null;
  return { userId: parsed.u };
}
