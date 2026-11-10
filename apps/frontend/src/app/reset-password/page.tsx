"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authService } from "@/services/auth";
import { supabase } from "@/services/auth/supabaseClient";
import AuthShell, {
  PasswordField,
  SubmitButton,
  ErrorNote,
  friendlyAuthError,
} from "@/components/auth/AuthShell";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);
  const [checked, setChecked] = useState(false);

  // Supabase establishes a recovery session client-side from the email link's
  // URL fragment before firing PASSWORD_RECOVERY; updatePassword() needs that
  // session to exist first.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
      setChecked(true);
    });
    // Fallback: if neither signal arrives, stop showing the neutral state.
    const fallback = setTimeout(() => setChecked(true), 2500);
    return () => { subscription.unsubscribe(); clearTimeout(fallback); };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The two passwords don't match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await authService.updatePassword(password);
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err: any) {
      setError(friendlyAuthError(err.message || "Failed to update password."));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell
        title="Password updated"
        subtitle="You're all set — taking you back to sign in."
      >
        <div className="flex items-center gap-3 text-sand-700">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-sand-300 border-t-sand-700" />
          <span className="text-[13px]">Redirecting…</span>
        </div>
      </AuthShell>
    );
  }

  if (!ready && !checked) {
    // First paint used to be the failure-flavoured guidance below — even for a valid
    // reset link whose recovery session just hadn't landed yet. Neutral state first.
    return (
      <AuthShell title="Choose a new password" subtitle="Checking your reset link…">
        <div className="flex items-center gap-3 text-sand-700">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-sand-300 border-t-sand-700" />
          <span className="text-[13px]">One moment…</span>
        </div>
      </AuthShell>
    );
  }

  if (!ready) {
    return (
      <AuthShell
        title="Choose a new password"
        subtitle="This page only works from the reset link in your email. If you landed here directly, request a new link first."
      >
        <Link
          href="/forgot-password"
          className="block w-full rounded-full bg-ink px-6 py-3.5 text-center font-sora text-[13px] font-semibold text-dune-white hover:bg-sand-800 transition-all"
        >
          Request a reset link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Make it at least 6 characters. You'll use it the next time you sign in."
    >
      <div className="space-y-5">
        {error && <ErrorNote>{error}</ErrorNote>}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <PasswordField
            label="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            autoComplete="new-password"
            autoFocus
            disabled={loading}
          />
          <PasswordField
            label="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Same password again"
            autoComplete="new-password"
            disabled={loading}
          />
          <SubmitButton loading={loading}>Update password</SubmitButton>
        </form>
      </div>
    </AuthShell>
  );
}
