"use client";

import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

/**
 * Guest mode: a new visitor gets an anonymous Supabase account (a real user id, so uploads, RLS and the
 * studio all work unchanged) and only creates a real account when they export. Linking keeps the same
 * user id, so nothing they made is lost.
 */

/** A guest is an anonymous user who hasn't given an email yet (a pending email counts as signed up). */
export const isGuestUser = (u: User | null | undefined) => !!u?.is_anonymous && !u.email && !u.new_email;

export async function currentUserIsGuest() {
  const { data } = await supabase.auth.getSession();
  return isGuestUser(data.session?.user);
}

/** Starts a guest session. Returns false when anonymous sign-ins are off in Supabase (caller sends to sign-up). */
export async function startGuestSession(): Promise<boolean> {
  const { data, error } = await supabase.auth.signInAnonymously();
  return !error && !!data.session;
}


/** Email + password on the same user id. Supabase emails a confirmation link; the work stays where it is. */
export async function upgradeWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.updateUser({ email });
  if (error) throw new Error(error.message);
  // some projects only accept the password once the email is confirmed; the reset flow covers that case
  await supabase.auth.updateUser({ password }).catch(() => undefined);
}

/* ---------- returning users ---------- */

const HAD_ACCOUNT = "ce:had-account";
const CLAIM = "ce:guest-claim";
const AFTER = "ce:after-signin";
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

/** This browser has been signed in to a real account before: never hand it a guest account again. */
export const hadAccountHere = () => store.get(HAD_ACCOUNT) === "1";
if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((_e, s) => {
    if (s && !isGuestUser(s.user)) store.set(HAD_ACCOUNT, "1");
  });
}

/** Where to go once signed in (survives the Google round trip). Only same-site paths. */
export function setAfterSignIn(path: string | null) {
  if (path && path.startsWith("/") && !path.startsWith("//")) store.set(AFTER, path);
}
export function takeAfterSignIn(): string | null {
  const p = store.get(AFTER);
  store.del(AFTER);
  return p && p.startsWith("/") && !p.startsWith("//") ? p : null;
}

/**
 * Before a guest signs in to an EXISTING account, keep the guest's tokens: once signed in, /start hands them to
 * the server, which moves the guest's projects onto the account. `returnTo` is where they continue (the project).
 */
export async function rememberGuestForClaim(returnTo: string) {
  const { data } = await supabase.auth.getSession();
  const s = data.session;
  if (!s || !isGuestUser(s.user)) return;
  store.set(CLAIM, JSON.stringify({ accessToken: s.access_token, refreshToken: s.refresh_token, at: Date.now() }));
  setAfterSignIn(returnTo);
}

/**
 * Runs a pending claim (if any) for the now signed-in user. Never throws: the user's own data is untouched on failure.
 * The stash is the ONLY copy of the guest's tokens (the guest session is gone once signed in), so it is cleared
 * only once the claim has actually been handed to the server — a transient failure keeps it, and the next /start
 * visit retries (the endpoint is idempotent: a repeat claim is a no-op). Expired/corrupt stashes are dropped.
 */
export async function claimPendingGuest(): Promise<void> {
  const raw = store.get(CLAIM);
  if (!raw) return;
  let parsed: { accessToken: string; refreshToken?: string; at: number };
  try {
    parsed = JSON.parse(raw) as { accessToken: string; refreshToken?: string; at: number };
  } catch {
    store.del(CLAIM);
    return;
  }
  if (Date.now() - parsed.at > 7 * 86_400_000) {
    store.del(CLAIM);
    return;
  }
  try {
    const { apiClient } = await import("@/services/api-client");
    await apiClient.post("/guest/claim", { json: { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken } });
    store.del(CLAIM);
  } catch (e) {
    console.warn("[auth] couldn't move the guest project to this account — will retry on the next visit", e);
  }
}

/**
 * Google from the export box: a normal Google sign-in (new or existing account), then /start moves everything the
 * guest made onto that account and returns to `returnTo`. One path for every case: linking Google onto the
 * anonymous user failed whenever that Google account already had CaptionsEasy, and the error loop sent people
 * straight back to the same sign-up box.
 */
export async function signInWithGoogleKeepingWork(returnTo: string) {
  await rememberGuestForClaim(returnTo);
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/start` } });
  if (error) throw new Error(error.message);
}

/** Old links / bookmarks still call it by its previous name. */
export const signInExistingWithGoogle = signInWithGoogleKeepingWork;

/** Google linking bounced back with "this Google account is already in use"? Reads (and strips) it from the URL. */
export function takeIdentityExistsError(): boolean {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const code = url.searchParams.get("error_code") ?? hash.get("error_code") ?? "";
  const desc = (url.searchParams.get("error_description") ?? hash.get("error_description") ?? "").toLowerCase();
  if (!code && !desc) return false;
  for (const k of ["error", "error_code", "error_description"]) url.searchParams.delete(k);
  url.hash = "";
  window.history.replaceState(null, "", url.toString());
  return code === "identity_already_exists" || /already (linked|exists|in use|registered)/.test(desc);
}

/** The sign-in didn't happen (cancelled or refused): forget the stored guest tokens. */
export function clearPendingGuestClaim() {
  store.del(CLAIM);
}
