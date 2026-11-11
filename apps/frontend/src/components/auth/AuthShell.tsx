"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

/* ————— Shared form primitives matching modern UI ————— */

export function Field({
  label,
  error,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | null;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[13px] font-medium text-sand-700">
        {label}
      </label>
      <input
        {...props}
        className={`w-full rounded-xl border bg-[#232320] px-4 py-3 text-[14px] text-[#FFFFEB] placeholder:text-sand-500 outline-none transition-all duration-150 focus:border-emerald-accent focus:ring-1 focus:ring-emerald-accent ${
          error ? "border-red-500 bg-red-500/10" : "border-sand-200 hover:border-sand-300"
        }`}
      />
      {error ? (
        <p className="text-[12px] text-red-400 font-medium">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-sand-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function PasswordField({
  label,
  error,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | null;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="block text-[13px] font-medium text-sand-700">
        {label}
      </label>
      <div className="relative">
        <input
          {...props}
          type={visible ? "text" : "password"}
          className={`w-full rounded-xl border bg-[#232320] px-4 py-3 pr-12 text-[14px] text-[#FFFFEB] placeholder:text-sand-500 outline-none transition-all duration-150 focus:border-emerald-accent focus:ring-1 focus:ring-emerald-accent ${
            error ? "border-red-500 bg-red-500/10" : "border-sand-200 hover:border-sand-300"
          }`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-sand-500 hover:text-sand-800 transition cursor-pointer"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.75"
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
              />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.75"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.75"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
          )}
        </button>
      </div>
      {error ? (
        <p className="text-[12px] text-red-400 font-medium">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-sand-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  loading,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading || props.disabled}
      {...props}
      className="w-full rounded-xl bg-[#FFFFEB] py-3.5 font-medium text-[14px] text-[#141412] transition-colors hover:bg-[#E4E4D6] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 shadow-sm"
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#141412]/30 border-t-[#141412]" />
      )}
      {children}
    </button>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] leading-relaxed text-red-300 font-medium"
    >
      {children}
    </div>
  );
}

/** Translate raw Supabase error strings into something a user can act on. */
export function friendlyAuthError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "That email and password don't match. Double-check them, or reset your password below.";
  if (m.includes("email not confirmed"))
    return "Your email isn't verified yet — open the confirmation link we sent you, then sign in.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "An account with this email already exists. Sign in instead.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Too many attempts in a row. Give it a minute, then try again.";
  if (m.includes("network") || m.includes("fetch"))
    return "Couldn't reach the sign-in service. Check your connection and try again.";
  // Google sign-in is not enabled on this project (Supabase: "Unsupported provider: provider is not
  // enabled"). Never show that raw string: point people at the paths that do work.
  if (m.includes("unsupported provider") || m.includes("provider is not enabled"))
    return "Google sign-in isn't available right now. Sign in with your email below, or continue as a guest from the start page.";
  return raw;
}

export const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/* ————— Split Auth Shell: Left brand panel + Right Clean Form ————— */

export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main id="main-content" className="min-h-screen w-full bg-major flex flex-col lg:flex-row font-sans selection:bg-emerald-accent selection:text-[#141412]">
      {/* Left brand panel. On phones it collapses to a slim bar so the form starts at the
          top — the earlier full-width stock photo pushed sign-in below the fold. */}
      <div className="relative w-full lg:w-1/2 lg:min-h-screen bg-[#1C1C1A] overflow-hidden select-none">
        <div className="flex items-center justify-between px-6 py-4 lg:absolute lg:top-0 lg:left-0 lg:right-0 lg:px-8 lg:py-6">
          <Link
            href="/"
            className="z-20 inline-flex items-center gap-2 rounded-full border border-[#FFFFEB]/20 px-3.5 py-2 text-[13px] font-semibold text-[#FFFFEB] transition duration-200 hover:bg-[#232320]"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Home
          </Link>
          <span className="lg:hidden">
            <Logo height={22} />
          </span>
        </div>

        <div className="hidden lg:flex h-full flex-col items-start justify-center px-14 xl:px-20">
          <Logo height={34} />
          <p className="mt-8 max-w-md text-[26px] font-bold leading-snug text-[#FFFFEB]">
            Captions for every video you post — made right in your browser.
          </p>
          <ul className="mt-6 space-y-2.5 text-[14px] font-medium text-[#FFFFEB]/70">
            <li>Automatic captions in English, Hindi and Hinglish</li>
            <li>150 animated looks, free to use</li>
            <li>Your video file stays on your device — nothing to install</li>
          </ul>
        </div>
      </div>

      {/* Right form section */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center px-6 sm:px-12 lg:px-16 py-10 lg:py-12 bg-major">
        <div className="w-full max-w-[420px] mx-auto flex flex-col">
          {/* Header */}
          <div className="mb-7">
            <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight text-[#FFFFEB] leading-tight">
              {title}
            </h1>
            {subtitle && (
              <div className="mt-1.5 text-[14px] text-sand-600">
                {subtitle}
              </div>
            )}
          </div>

          {/* Form Content */}
          <div className="w-full">{children}</div>
        </div>
      </div>
    </main>
  );
}
