"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authService } from "@/services/auth";
import { supabase, isSupabaseConfigured } from "@/services/auth/supabaseClient";
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

  const [mode, setMode] = useState<Mode>("google");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const googleButton = (
    <button
      type="button"
      onClick={handleGoogle}
      disabled={loading}
      className={`w-full rounded-xl py-3 px-3 font-semibold text-[14px] transition duration-150 cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2.5 ${
        mode === "google"
          ? "bg-neutral-900 text-white hover:bg-neutral-800 shadow-[0_6px_16px_-8px_rgba(0,0,0,0.5)]"
          : "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50/90 hover:border-neutral-300 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      }`}
    >
      <span className={mode === "google" ? "rounded-full bg-white p-1" : ""}>
        <GoogleIcon />
      </span>
      <span className="truncate">Continue with Google</span>
    </button>
  );

  // No Supabase backend is connected yet, so Google/email sign-in cannot work —
  // offering it would send people to the dead placeholder auth domain. Show the
  // guest path instead; the sign-in UI below returns unchanged once a real
  // project is configured.
  if (!isSupabaseConfigured()) {
    return (
      <AuthShell
        title={`Sign in to ${BRAND_NAME}`}
        subtitle={<p className="text-[13.5px] text-neutral-600">Accounts are coming soon — no sign-up needed to make captions.</p>}
      >
        <div className="space-y-4">
          <Link
            href="/start"
            className="block w-full rounded-xl bg-neutral-900 py-3 px-3 text-center font-semibold text-[14px] text-white shadow-[0_6px_16px_-8px_rgba(0,0,0,0.5)] transition duration-150 hover:bg-neutral-800"
          >
            Continue as guest
          </Link>
          <p className="text-center text-[12px] text-neutral-500">
            Free. No card. By continuing you agree to the{" "}
            <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.
          </p>
        </div>
      </AuthShell>
    );
  }

  if (mode === "google") {
    return (
      <AuthShell
        title={`Sign in to ${BRAND_NAME}`}
        subtitle={<p className="text-[13.5px] text-neutral-600">New here? Continue with Google and your free account is ready in one tap.</p>}
      >
        <div className="space-y-4">
          {error && <ErrorNote>{error}</ErrorNote>}
          {googleButton}
          <p className="text-center text-[12px] text-neutral-500">
            Free. No card. By continuing you agree to the{" "}
            <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.
          </p>
          <button
            type="button"
            onClick={() => switchTo("email")}
            className="w-full text-center text-[13px] font-medium text-neutral-500 hover:text-neutral-900 transition cursor-pointer py-1"
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
      subtitle={<p className="text-[13.5px] text-neutral-600">For accounts made with an email and password.</p>}
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
              className="text-[13px] font-medium text-blue-600 hover:text-blue-700 hover:underline transition"
            >
              Forgot password?
            </Link>
          </div>

          <SubmitButton loading={loading} disabled={!ready}>
            Sign In
          </SubmitButton>
        </form>

        <div className="relative py-2 flex items-center justify-center">
          <div className="w-full border-t border-neutral-200" />
          <span className="absolute bg-white px-3 text-[12px] font-medium text-neutral-400 lowercase">or</span>
        </div>

        {googleButton}

        <button
          type="button"
          onClick={() => switchTo("google")}
          className="w-full text-center text-[13px] font-medium text-neutral-500 hover:text-neutral-900 transition cursor-pointer py-1"
        >
          New to {BRAND_NAME}? Create your account with Google
        </button>
      </div>
    </AuthShell>
  );
}
