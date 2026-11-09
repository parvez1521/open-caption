"use client";

import React, { useState } from "react";
import { rememberGuestForClaim, signInWithGoogleKeepingWork } from "@/services/auth/guest";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import { Button } from "./controls";

/**
 * Shown when a guest clicks Export: one step to a free account. The account is linked to the guest's user id,
 * so the project, video and captions they already made stay exactly where they are.
 * New accounts are Google only (no confirmation emails); people with an email account use "Sign in".
 */
export const SignupGate: React.FC<{ onDone: () => void; onClose: () => void; notice?: string | null }> = ({ onDone, onClose, notice }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** They already have an account: sign in to it; this project moves over and the export dialog reopens. */
  const signInInstead = async () => {
    const back = new URL(window.location.href);
    back.searchParams.set("export", "1");
    await rememberGuestForClaim(back.pathname + back.search);
    window.location.href = "/login";
  };

  const google = async () => {
    setError(null);
    setBusy(true);
    try {
      const back = new URL(window.location.href);
      back.searchParams.set("export", "1"); // reopen the export dialog after Google brings them back
      await signInWithGoogleKeepingWork(back.pathname + back.search);
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Google sign-up didn't start. Check your connection and try again.");
    }
  };

  // No Supabase backend connected: there is no account to create and Google
  // sign-in would bounce to the dead placeholder auth domain. Exports are made
  // in the browser, so let the guest straight through instead. (Env-based, so
  // this branch can never flip between renders of a mounted gate.)
  if (!isSupabaseConfigured()) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
        <div role="dialog" aria-label="No account needed" onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-2xl border border-st-line bg-st-panel p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl">
          <h2 className="text-lg font-semibold">No account needed to export</h2>
          <p className="mt-1 text-sm text-st-muted">Accounts are coming soon — no sign-up needed to make captions. Your export is made right in your browser.</p>
          {notice ? <p role="status" className="mt-3 rounded-lg border border-st-line bg-st-raised px-3 py-2 text-sm text-st-text">{notice}</p> : null}
          <Button tone="primary" className="mt-5 w-full !py-3" onClick={onDone}>
            Continue to export
          </Button>
          <p className="mt-4 text-center text-sm text-st-muted">Changed your mind? <button type="button" className="font-semibold text-st-text underline" onClick={onClose}>Keep editing</button>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-label="Create your free account" onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-2xl border border-st-line bg-st-panel p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl">
        <h2 className="text-lg font-semibold">Create a free account to export</h2>
        <p className="mt-1 text-sm text-st-muted">One tap with Google. Everything you&apos;ve made stays exactly as it is.</p>
        <Button tone="primary" className="mt-5 w-full !py-3" disabled={busy} onClick={() => void google()}>
          {busy ? "Opening Google…" : "Continue with Google"}
        </Button>
        {notice && !error ? <p role="status" className="mt-3 rounded-lg border border-st-line bg-st-raised px-3 py-2 text-sm text-st-text">{notice}</p> : null}
        {error ? <p role="alert" className="mt-3 rounded-lg border border-st-or/60 bg-st-or/15 px-3 py-2 text-sm text-st-text">{error}</p> : null}
        <p className="mt-4 text-center text-sm text-st-muted">Already have an account? <button type="button" className="font-semibold text-st-text underline" onClick={() => void signInInstead()}>Sign in</button>. This project comes with you.</p>
        <p className="mt-2 text-center text-xs text-st-faint">Free. No card. By continuing you agree to the <a href="/terms" className="underline">Terms</a> and <a href="/privacy" className="underline">Privacy Policy</a>.</p>
      </div>
    </div>
  );
};
