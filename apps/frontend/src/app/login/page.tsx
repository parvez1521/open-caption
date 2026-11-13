"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authService } from "@/services/auth";
import { supabase, isGoogleAuthEnabled, isSupabaseConfigured } from "@/services/auth/supabaseClient";
import { renderGoogleSignInButton } from "@/services/auth/googleIdToken";
import { setAfterSignIn } from "@/services/auth/guest";
import AuthShell, { Field, PasswordField, SubmitButton, ErrorNote, friendlyAuthError, validEmail } from "@/components/auth/AuthShell";
import { BRAND_NAME } from "@/lib/brand";

const GoogleIcon = () => (
  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" aria-hidden>
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.86c2.26-2.09 3.56-5.17 3.56-8.87z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.27 14.29A7.16 7.16 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
    />
  </svg>
);

/**
 * Google is the only way to create an account (no confirmation emails, one tap on phones).
 * "Sign in with email" stays as a small link for people who already made an email account.
 */
type Mode = "google" | "email";

export default function LoginPage() {
  const router = useRouter();

  // Google sign-in renders only when the deployment has it switched on
  // (isGoogleAuthEnabled) — otherwise email is the default mode and no
  // Google button exists on the page at all.
  const googleEnabled = isGoogleAuthEnabled();
  const [mode, setMode] = useState<Mode>(googleEnabled ? "google" : "email");
  // /start sends people here with ?mode=signup when a guest session could not be started:
  // the page must then speak as sign-up, not sign-in (the param used to be ignored entirely)
  const [signupIntent, setSignupIntent] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Google Identity Services button (captionit.in chooser) vs the old OAuth button:
  // "checking" shows the old button until GIS proves itself; "gis" swaps in Google's
  // own button; "oauth" keeps the old button (client ID unset or GIS failed to load).
  // The old flow is never removed — it is the fallback, and the only way back if the
  // live test ever shows the chooser still naming the Supabase host.
  //
  // googleButton renders in BOTH modes (the google branch, and below the email form),
  // so a mode toggle unmounts the container the GIS button lives in. Track which
  // container the button is rendered (or being rendered) into, and re-render into a
  // new container after a toggle — otherwise the toggle leaves an empty container
  // with gisMode "gis" and no Google button at all. A failed GIS setup is remembered
  // so toggles do not retry a dead load (a page reload re-attempts).
  const gisContainerRef = useRef<HTMLDivElement>(null);
  const gisRenderedForRef = useRef<HTMLDivElement | null>(null);
  const gisAttemptForRef = useRef<HTMLDivElement | null>(null);
  const gisUnavailableRef = useRef(false);
  const [gisMode, setGisMode] = useState<"checking" | "gis" | "oauth">("checking");
  useEffect(() => {
    if (!googleEnabled) return;
    const container = gisContainerRef.current;
    if (!container) {
      setGisMode("oauth");
      return;
    }
    if (gisRenderedForRef.current === container || gisAttemptForRef.current === container) return;
    if (gisUnavailableRef.current) {
      setGisMode("oauth");
      return;
    }
    gisAttemptForRef.current = container;
    let cancelled = false;
    void (async () => {
      const result = await renderGoogleSignInButton(container, {
        // the onAuthStateChange listener below also redirects on SIGNED_IN; this
        // is the deterministic path (same /start target as the OAuth flow).
        onSignedIn: () => router.replace("/start"),
        onError: (err) => {
          setError(friendlyAuthError(err.message || "Google sign-in failed."));
          setLoading(false);
        },
      });
      if (cancelled) return;
      if (result === "gis") {
        gisRenderedForRef.current = container;
        setGisMode("gis");
      } else {
        gisUnavailableRef.current = true;
        setGisMode("oauth");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [googleEnabled, mode, router]);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  // on a slow phone people type before the page script has loaded: keep what they typed, and keep the
  // button off until then (pressing Enter earlier would reload the page and wipe the form)
  const formRef = useRef<HTMLFormElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const typed = (sel: string) => formRef.current?.querySelector<HTMLInputElement>(sel)?.value ?? "";
    const e = typed("input[type=email]"), pw = typed("input[type=password]");
    if (e) setEmail((v) => v || e);
    if (pw) setPassword((v) => v || pw);
    setReady(true);
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    // a page that sent them here (e.g. a project link) is where they continue after signing in
    setAfterSignIn(q.get("redirect"));
    if (q.get("mode") === "signup") setSignupIntent(true);
    // arriving with an email means "I already have an email account": open the email form, filled in
    const e = q.get("email");
    if (e) {
      setEmail(e);
      setMode("email");
    }
  }, []);

  // Redirect if already authenticated; also catches the OAuth return.
  useEffect(() => {
    // No backend configured: never touch the placeholder auth client.
    if (!isSupabaseConfigured()) return;
    // a guest (anonymous) session may still sign in to a real account here
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session && !data.session.user.is_anonymous) router.replace("/start");
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !session.user.is_anonymous) router.replace("/start");
    });
    return () => subscription.unsubscribe();
  }, [router]);

  const validate = () => {
    const errs: typeof fieldErrors = {};
    if (!validEmail(email)) errs.email = "Enter a valid email address.";
    if (!password) errs.password = "Enter your password.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setLoading(true);
    try {
      await authService.login(email, password);
      router.replace("/start");
    } catch (err) {
      setError(friendlyAuthError((err instanceof Error ? err.message : "") || "Authentication failed."));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await authService.loginWithGoogle();
    } catch (err) {
      setError(friendlyAuthError((err instanceof Error ? err.message : "") || "Google sign-in failed."));
      setLoading(false);
    }
  };

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
    setFieldErrors({});
  };

  // The old OAuth button (fallback): shown while GIS is still loading and whenever
  // GIS is unavailable. The GIS container sits above it and replaces it once Google's
  // own button renders — an empty container takes no space, so nothing shifts.
  const googleButton = (
    <>
      <div ref={gisContainerRef} className="w-full" aria-label="Sign in with Google" />
      {gisMode !== "gis" ? (
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className={`w-full rounded-xl py-3 px-3 font-semibold text-[14px] transition duration-150 cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2.5 ${
            mode === "google"
              ? "bg-[#FFFFEB] text-[#141412] hover:bg-[#E4E4D6] shadow-[0_6px_16px_-8px_rgba(0,0,0,0.5)]"
              : "border border-sand-200 bg-[#1E1E1B] text-sand-700 hover:bg-[#232320] hover:border-sand-300 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          }`}
        >
          <span className={mode === "google" ? "rounded-full bg-[#FFFFEB] p-1" : ""}>
            <GoogleIcon />
          </span>
          <span className="truncate">Continue with Google</span>
        </button>
      ) : null}
    </>
  );

  // No Supabase backend is connected yet, so Google/email sign-in cannot work —
  // offering it would send people to the dead placeholder auth domain. Show the
  // guest path instead; the sign-in UI below returns unchanged once a real
  // project is configured.
  if (!isSupabaseConfigured()) {
    return (
      <AuthShell
        title={`Sign in to ${BRAND_NAME}`}
        subtitle={<p className="text-[13.5px] text-sand-600">Accounts are coming soon — no sign-up needed to make captions.</p>}
      >
        <div className="space-y-4">
          <Link
            href="/start"
            className="block w-full rounded-xl bg-[#FFFFEB] py-3 px-3 text-center font-semibold text-[14px] text-[#141412] shadow-[0_6px_16px_-8px_rgba(0,0,0,0.5)] transition duration-150 hover:bg-[#E4E4D6]"
          >
            Continue as guest
          </Link>
          <p className="text-center text-[12px] text-sand-500">
            Free. No card. By continuing you agree to the{" "}
            <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.
          </p>
        </div>
      </AuthShell>
    );
  }

  if (mode === "google" && googleEnabled) {
    return (
      <AuthShell
        title={signupIntent ? "Create your free account" : `Sign in to ${BRAND_NAME}`}
        subtitle={
          <p className="text-[13.5px] text-sand-600">
            {signupIntent
              ? "One tap with Google — free, no card. You can also make captions as a guest first and add an account when you export."
              : "New here? Continue with Google and your free account is ready in one tap."}
          </p>
        }
      >
        <div className="space-y-4">
          {error && <ErrorNote>{error}</ErrorNote>}
          {googleButton}
          <p className="text-center text-[12px] text-sand-500">
            Free. No card. By continuing you agree to the{" "}
            <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.
          </p>
          <button
            type="button"
            onClick={() => switchTo("email")}
            className="w-full text-center text-[13px] font-medium text-sand-500 hover:text-[#FFFFEB] transition cursor-pointer py-1"
          >
            Already have an email account? Sign in with email
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Sign in with email"
      subtitle={<p className="text-[13.5px] text-sand-600">For accounts made with an email and password.</p>}
    >
      <div className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Field
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email Address"
            autoComplete="email"
            autoFocus={!email}
            error={fieldErrors.email}
            disabled={loading}
          />

          <PasswordField
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            autoFocus={!!email}
            error={fieldErrors.password}
            disabled={loading}
          />

          <div className="flex justify-end pt-0.5 pb-1">
            <Link
              href="/forgot-password"
              className="text-[13px] font-medium text-emerald-accent hover:text-emerald-accent hover:underline transition"
            >
              Forgot password?
            </Link>
          </div>

          <SubmitButton loading={loading} disabled={!ready}>
            Sign In
          </SubmitButton>
        </form>

        {googleEnabled ? (
          <>
            <div className="relative py-2 flex items-center justify-center">
              <div className="w-full border-t border-sand-200" />
              <span className="absolute bg-major px-3 text-[12px] font-medium text-sand-500 lowercase">or</span>
            </div>

            {googleButton}

            <button
              type="button"
              onClick={() => switchTo("google")}
              className="w-full text-center text-[13px] font-medium text-sand-500 hover:text-[#FFFFEB] transition cursor-pointer py-1"
            >
              New to {BRAND_NAME}? Create your account with Google
            </button>
          </>
        ) : null}
      </div>
    </AuthShell>
  );
}
