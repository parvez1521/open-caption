"use client";

import React, { useState } from "react";
import Link from "next/link";
import { authService } from "@/services/auth";
import AuthShell, {
  Field,
  SubmitButton,
  ErrorNote,
  friendlyAuthError,
  validEmail,
} from "@/components/auth/AuthShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validEmail(email)) {
      setFieldError("Enter a valid email address.");
      return;
    }
    setFieldError(null);
    setLoading(true);
    try {
      await authService.requestPasswordReset(email);
      setSent(true);
    } catch (err: any) {
      setError(friendlyAuthError(err.message || "Failed to send reset email."));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        title="Reset link sent"
        subtitle={
          <>
            If an account exists for <strong className="text-ink">{email}</strong>,
            a password-reset link is on its way. It can take a minute — check spam too.
          </>
        }
      >
        <Link
          href="/login"
          className="block w-full rounded-full bg-ink px-6 py-3.5 text-center font-sora text-[13px] font-semibold text-dune-white hover:bg-sand-800 transition-all"
        >
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your account email and we'll send you a link to choose a new one."
    >
      <div className="space-y-5">
        {error && <ErrorNote>{error}</ErrorNote>}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Field
            id="forgot-email"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@studio.com"
            autoComplete="email"
            autoFocus
            error={fieldError}
            disabled={loading}
          />
          <SubmitButton loading={loading}>Send reset link</SubmitButton>
        </form>
        <p className="text-center">
          <Link
            href="/login"
            className="inline-block py-2 font-sora text-[13px] font-semibold text-sand-700 hover:text-ink transition-colors"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
