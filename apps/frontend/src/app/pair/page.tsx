"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authService } from "@/services/auth";
import { workersService, type PairingDetails } from "@/services/workers";

function PairConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "";

  const [authorized, setAuthorized] = useState(false);
  const [pairing, setPairing] = useState<PairingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"confirmed" | "denied" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push(`/login?redirect=${encodeURIComponent(`/pair?code=${code}`)}`);
      return;
    }
    setAuthorized(true);

    if (!code) {
      setError("Missing pairing code.");
      setLoading(false);
      return;
    }

    workersService
      .getPairingDetails(code)
      .then((details) => {
        if (!details) {
          setError("This pairing code wasn't found — it may have expired.");
        } else {
          setPairing(details);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Something went wrong."))
      .finally(() => setLoading(false));
  }, [code, router]);

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await workersService.confirmPairing(code);
      setOutcome("confirmed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't confirm this computer.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeny = async () => {
    setBusy(true);
    setError(null);
    try {
      await workersService.denyPairing(code);
      setOutcome("denied");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't deny this computer.");
    } finally {
      setBusy(false);
    }
  };

  if (!authorized) {
    return (
      <div className="min-h-screen bg-dune-white flex items-center justify-center px-6">
        <p role="status" className="font-sora text-[14px] text-sand-700">Checking your sign-in…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dune-white flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-xl border border-sand-200 bg-white p-8">
        <h1 className="font-serif text-2xl font-semibold text-ink">Connect this computer</h1>

        {loading ? (
          <div className="mt-6 h-24 rounded-lg bg-sand-100 animate-pulse" />
        ) : outcome === "confirmed" ? (
          <div className="mt-6">
            <p className="text-[14px] text-sand-800">
              This computer is now connected. Close this tab and go back to your terminal. Then return to Captionit to process a project.
            </p>
            <a
              href="/settings"
              className="mt-5 inline-block rounded-full bg-ink px-6 py-2.5 font-sora text-[12px] font-semibold text-dune-white hover:bg-sand-800 transition-colors"
            >
              Go to Settings
            </a>
          </div>
        ) : outcome === "denied" ? (
          <p className="mt-6 text-[14px] text-sand-800">This computer was not connected.</p>
        ) : error ? (
          <div className="mt-6 rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-4 py-3 text-[13px] text-obsidian">
            {error}
          </div>
        ) : pairing ? (
          <div className="mt-6">
            <p className="text-[14px] leading-relaxed text-sand-800">
              <strong className="text-ink">{pairing.workerName}</strong> wants to connect to your Captionit account. And process videos on your behalf. Only confirm this if you just ran the install command yourself.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={handleConfirm}
                disabled={busy}
                className="rounded-full bg-ink px-6 py-2.5 font-sora text-[12px] font-semibold text-dune-white hover:bg-sand-800 disabled:opacity-60 transition-colors cursor-pointer"
              >
                {busy ? "Confirming…" : "Confirm"}
              </button>
              <button
                onClick={handleDeny}
                disabled={busy}
                className="rounded-full border border-sand-300 px-6 py-2.5 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink disabled:opacity-60 transition-colors cursor-pointer"
              >
                Deny
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function PairPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-dune-white flex items-center justify-center px-6">
          <p role="status" className="font-sora text-[14px] text-sand-700">Loading the pairing request…</p>
        </div>
      }
    >
      <PairConfirmContent />
    </Suspense>
  );
}
