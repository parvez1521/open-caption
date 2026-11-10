"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import StudioShell from "@/components/studio/StudioShell";


export default function SettingsPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      // No backend configured: there is no sign-in to bounce to — send them to
      // the guest entry, which explains the state. Configured: as before.
      router.push(isSupabaseConfigured() ? "/login" : "/start");
      return;
    }
    authService.getCurrentUser().then((user) => {
      if (user) {
        setDisplayName(user.name);
        setEmail(user.email);
        setAvatarUrl(user.avatar_url);
      }
      setLoading(false);
    });
  }, [router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await authService.updateProfile({ name: displayName.trim() });
      setSaved(true);
    } catch (err) {
      setSaveError((err instanceof Error && err.message) || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    setResetError(null);
    setResetSent(false);
    try {
      await authService.requestPasswordReset(email);
      setResetSent(true);
    } catch (err) {
      setResetError((err instanceof Error && err.message) || "Couldn't send the reset email.");
    }
  };

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-3xl mx-auto">
        <div className="pb-8 border-b border-sand-200">
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink">
            Account <em className="italic text-sand-600">settings</em>
          </h1>
          <p className="mt-2 text-[14px] text-sand-800">
            Your identity across projects and exports.
          </p>
        </div>

        {/* Profile */}
        <section className="pt-8">
          <h2 className="font-sora text-[15px] font-bold text-ink">Profile</h2>
          {loading ? (
            <div className="mt-4 h-24 rounded-xl bg-sand-100 animate-pulse" />
          ) : (
            <form
              onSubmit={handleSave}
              className="mt-4 rounded-xl border border-sand-200 bg-white p-6 space-y-5"
            >
              <div className="flex items-center gap-4">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt=""
                    className="w-14 h-14 rounded-full border border-sand-200 bg-sand-50"
                  />
                ) : (
                  <span className="w-14 h-14 rounded-full bg-sand-200" />
                )}
                <div className="text-[13px] leading-relaxed text-sand-800">
                  Your avatar comes from your sign-in provider
                  {avatarUrl?.includes("dicebear") ? " (generated from your name)" : ""}.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="block font-sora text-[12px] font-semibold text-sand-800">
                    Display name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      setSaved(false);
                    }}
                    className="w-full rounded-lg border border-sand-300 bg-white px-4 py-3 text-[14px] text-ink outline-none transition-colors focus:border-sand-600 focus:ring-2 focus:ring-sand-200"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block font-sora text-[12px] font-semibold text-sand-800">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    disabled
                    title="Email changes require re-verification and aren't supported from this screen yet."
                    className="w-full rounded-lg border border-sand-200 bg-sand-50 px-4 py-3 text-[14px] text-sand-600 outline-none cursor-not-allowed"
                  />
                </div>
              </div>

              {saveError && (
                <div className="rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-4 py-3 text-[13px] text-obsidian">
                  {saveError}
                </div>
              )}

              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={saving || !displayName.trim()}
                  className="rounded-full bg-ink px-6 py-2.5 font-sora text-[12px] font-semibold text-dune-white hover:bg-sand-800 disabled:opacity-60 transition-all cursor-pointer"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
                {saved && (
                  <span className="font-sora text-[12px] font-semibold text-sand-700">
                    ✓ Saved
                  </span>
                )}
              </div>
            </form>
          )}
        </section>

        {/* Plan & billing */}
        <section className="pt-10">
          <h2 className="font-sora text-[15px] font-bold text-ink">Plan &amp; billing</h2>
          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-sand-200 bg-sand-100 p-6">
            <p className="max-w-[52ch] flex-1 text-[14px] leading-relaxed text-sand-800">
              Your current plan, its limits, and your payment history live on the billing page. Paid plans are 30-day
              passes — no auto-renewal.
            </p>
            <Link
              href="/settings/billing"
              className="rounded-full border border-sand-300 px-6 py-2.5 font-sora text-[12px] font-semibold text-sand-800 transition-colors hover:border-ink hover:text-ink"
            >
              Open billing
            </Link>
          </div>
        </section>

        {/* Security */}
        <section className="pt-10">
          <h2 className="font-sora text-[15px] font-bold text-ink">Security</h2>
          <div className="mt-4 rounded-xl border border-sand-200 bg-white p-6">
            <p className="text-[14px] leading-relaxed text-sand-800 max-w-[52ch]">
              Password changes go through a verified email link, sent to{" "}
              <strong className="text-ink">{email || "your account email"}</strong>.
            </p>
            {resetError && (
              <div className="mt-4 rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-4 py-3 text-[13px] text-obsidian">
                {resetError}
              </div>
            )}
            <div className="mt-4 flex items-center gap-4">
              <button
                onClick={handlePasswordReset}
                disabled={!email || resetSent}
                className="rounded-full border border-sand-300 px-6 py-2.5 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink disabled:opacity-60 transition-colors cursor-pointer"
              >
                {resetSent ? "Email sent" : "Send password reset email"}
              </button>
              {resetSent && (
                <span className="text-[12px] text-sand-700">Check your inbox.</span>
              )}
            </div>
          </div>
        </section>

      </div>
    </StudioShell>
  );
}
