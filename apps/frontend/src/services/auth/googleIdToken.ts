"use client";

import { supabase } from "./supabaseClient";

/**
 * Google sign-in via Google Identity Services (GIS) + Supabase `signInWithIdToken`.
 *
 * WHY THIS EXISTS (owner report 2026-11-13): the old `signInWithOAuth` flow sends the
 * browser to Supabase's hosted auth callback, so Google's "Choose an account" page says
 * "to continue to <project-ref>.supabase.co" instead of Captionit. The GIS pre-built
 * button runs entirely against this site's origin: Google's account chooser is keyed to
 * the relying-party JavaScript origin (captionit.in), so it says "to continue to
 * captionit.in". That is the whole fix — no Supabase custom auth domain (Supabase Pro,
 * paid) is needed, and the owner's NO-PAID rule is respected.
 *
 * WHY NO CLIENT SECRET: the GIS flow needs only the public OAuth client ID
 * (NEXT_PUBLIC_GOOGLE_CLIENT_ID). The ID token it returns is verified by Supabase via
 * `signInWithIdToken`; nothing secret lives in the app or in Vercel env. The alternative
 * server code-exchange flow would need the Google OAuth client secret in Vercel env, and
 * that secret cannot be recovered without rotating it in Google Cloud — rotating or
 * replacing the Supabase Google provider client secret is forbidden, so that flow was
 * not built.
 *
 * NONCE (Supabase's rule, from its Google guide): Supabase Auth expects the provider to
 * hash the nonce (SHA-256, hex), so Google gets the SHA-256 hex of the raw nonce and
 * `signInWithIdToken` gets the raw nonce. A fresh raw nonce is generated per attempt.
 *
 * FALLBACK: this flow is active ONLY when NEXT_PUBLIC_GOOGLE_CLIENT_ID is set AND the GIS
 * script loads. If either is missing/failed, callers keep the existing `signInWithOAuth`
 * flow untouched (see `supabaseAuthProvider.loginWithGoogle` and
 * `guest.signInWithGoogleKeepingWork`). The old flow stays until a real live login proves
 * the chooser says captionit.in — the exact chooser text can only be proven by that live
 * test, never by a unit test.
 *
 * No One Tap: `prompt()` is never called — button-click flow only, so nothing pops up
 * uninvited and nothing fires before the user chooses to sign in.
 */

export const GOOGLE_IDENTITY_SERVICES_SCRIPT_URL = "https://accounts.google.com/gsi/client";

/** The public Google OAuth web client ID. Env var NAME only — never a real value, never a dummy default. */
export function getGoogleClientId(): string | undefined {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  return id || undefined;
}

export function isGoogleIdTokenConfigured(): boolean {
  return !!getGoogleClientId();
}

/** SHA-256 of `input`, lowercase hex. Known vectors are pinned in googleIdToken.test.ts. */
export async function sha256Hex(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("This browser can't hash the sign-in nonce (WebCrypto is unavailable).");
  }
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A fresh raw nonce per sign-in attempt. */
export function createNonce(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  c?.getRandomValues?.(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- minimal GIS types (no extra dependency for Google's client library) ---------- */

export interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleAccountsId {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    nonce?: string;
    use_fedcm_for_prompt?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      shape?: "pill" | "rectangular" | "circle" | "square";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      width?: number;
    },
  ) => void;
}

function getGoogleAccountsId(): GoogleAccountsId | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { google?: { accounts?: { id?: GoogleAccountsId } } }).google?.accounts
    ?.id;
}

/* ---------- GIS script loader (one shared load, timeout, retryable after failure) ---------- */

let loadPromise: Promise<GoogleAccountsId> | null = null;

/** Test-only reset for the cached load promise (googleIdToken.test.ts). */
export function resetGoogleIdentityServicesForTests(): void {
  loadPromise = null;
}

export function loadGoogleIdentityServices(timeoutMs = 10000): Promise<GoogleAccountsId> {
  const existing = getGoogleAccountsId();
  if (existing) return Promise.resolve(existing);
  if (loadPromise) return loadPromise;
  const p = new Promise<GoogleAccountsId>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Google sign-in needs a browser window."));
      return;
    }
    const script = document.createElement("script");
    script.src = GOOGLE_IDENTITY_SERVICES_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    const timer = setTimeout(() => {
      cleanup();
      script.remove();
      reject(new Error("Google sign-in library timed out — check your connection and try again."));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };
    const onLoad = () => {
      cleanup();
      const gis = getGoogleAccountsId();
      if (gis) resolve(gis);
      else reject(new Error("Google sign-in library loaded but didn't initialise."));
    };
    const onError = () => {
      cleanup();
      script.remove();
      reject(new Error("Google sign-in library failed to load — check your connection and try again."));
    };
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    document.head.appendChild(script);
  });
  loadPromise = p;
  // A failed load must not poison later attempts: drop the cache so a retry reloads.
  p.catch(() => {
    if (loadPromise === p) loadPromise = null;
  });
  return p;
}

/* ---------- ID-token exchange ---------- */

/**
 * Hands Google's ID token to Supabase. `rawNonce` is the UNHASHED nonce whose SHA-256
 * hex went to Google — Supabase hashes it again and compares it with the token's nonce
 * claim. Throws the Supabase message (surfaced to the caller, never swallowed).
 */
export async function exchangeGoogleCredential(credential: string, rawNonce: string) {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: credential,
    nonce: rawNonce,
  });
  if (error) throw new Error(error.message);
  if (!data.user || !data.session) {
    throw new Error("Google sign-in failed. No session returned.");
  }
  return { user: data.user, session: data.session };
}

/* ---------- pre-built button ---------- */

export type GoogleSignInButtonResult = "gis" | "unavailable";

export interface GoogleSignInButtonHandlers {
  /** The Supabase session is established; the caller navigates (same target as the OAuth flow: /start). */
  onSignedIn: () => void;
  /** Credential missing or the exchange failed; the message is safe to show the user. */
  onError: (error: Error) => void;
}

/**
 * Renders Google's own pre-built button into `container` and wires its callback to the
 * Supabase ID-token exchange. Returns "gis" when the button is live, "unavailable" when
 * the client ID is unset or the GIS script/hash failed — the caller then shows the old
 * OAuth button instead. Never throws for a missing/failed GIS setup.
 */
export async function renderGoogleSignInButton(
  container: HTMLElement,
  handlers: GoogleSignInButtonHandlers,
): Promise<GoogleSignInButtonResult> {
  const clientId = getGoogleClientId();
  if (!clientId) return "unavailable";
  let gis: GoogleAccountsId;
  try {
    gis = await loadGoogleIdentityServices();
  } catch {
    return "unavailable";
  }
  const rawNonce = createNonce();
  let nonceHash: string;
  try {
    nonceHash = await sha256Hex(rawNonce);
  } catch {
    return "unavailable";
  }
  gis.initialize({
    client_id: clientId,
    // FedCM prompt: the chooser runs through the browser's credential mediation
    // instead of third-party cookies (which browsers increasingly block).
    use_fedcm_for_prompt: true,
    nonce: nonceHash,
    callback: (response) => {
      void (async () => {
        if (!response.credential) {
          handlers.onError(new Error("Google didn't return a sign-in credential. Try again."));
          return;
        }
        try {
          await exchangeGoogleCredential(response.credential, rawNonce);
          handlers.onSignedIn();
        } catch (e) {
          handlers.onError(e instanceof Error ? e : new Error("Google sign-in failed."));
        }
      })();
    },
  });
  // Google's button is an iframe with a fixed pixel width: measure the container (max
  // 400, Google's own cap) so it fills the card instead of floating left at 240px.
  const width = container.clientWidth > 0 ? Math.min(container.clientWidth, 400) : 320;
  gis.renderButton(container, {
    theme: "outline",
    size: "large",
    shape: "pill",
    text: "signin_with",
    width,
  });
  return "gis";
}
