"use client";

import { useEffect, useState } from "react";
import {
  downloadSubscriberCsv,
  getMarketingPreference,
  getSubscriberListMeta,
  setMarketingPreference,
} from "@/services/marketing";

/**
 * Email updates (owner order 2026-11-18): the consent toggle — "Product
 * updates & offers by email" — plus, for the site owner only, the
 * subscriber-list export. The toggle writes PATCH /marketing/preference;
 * it starts OFF for everyone (Google signups carry no consent) until the
 * person turns it on here. The export block renders only when the admin
 * route answers 200 (owner); anyone else never sees it.
 */
export default function EmailUpdatesSection() {
  const [optIn, setOptIn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [ownerTotal, setOwnerTotal] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getMarketingPreference()
      .then((p) => {
        if (!cancelled) {
          setOptIn(p.marketingOptIn);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    void getSubscriberListMeta().then((m) => {
      if (!cancelled && m) setOwnerTotal(m.total);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onToggle = async (next: boolean) => {
    setOptIn(next);
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await setMarketingPreference(next);
      setSaved(true);
    } catch (err) {
      setOptIn(!next);
      setSaveError((err instanceof Error && err.message) || "Couldn't save your email preference.");
    } finally {
      setSaving(false);
    }
  };

  const onDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadSubscriberCsv();
    } catch (err) {
      setDownloadError((err instanceof Error && err.message) || "Couldn't download the subscriber list.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-sand-200 bg-white p-6 space-y-5">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={optIn}
          disabled={!loaded || saving}
          onChange={(e) => void onToggle(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[#34D399] disabled:opacity-60"
        />
        <span>
          <span className="block text-[14px] font-semibold text-ink">Product updates &amp; offers by email</span>
          <span className="mt-0.5 block text-[13px] leading-relaxed text-sand-800">
            Occasional product news and offers. Unsubscribe anytime from any email.
          </span>
        </span>
      </label>

      {saveError && (
        <div className="rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-4 py-3 text-[13px] text-obsidian">
          {saveError}
        </div>
      )}
      {saved && <p className="font-sora text-[12px] font-semibold text-sand-700">✓ Saved</p>}

      {ownerTotal !== null && (
        <div className="border-t border-sand-200 pt-5">
          <p className="text-[14px] leading-relaxed text-sand-800 max-w-[52ch]">
            <strong className="text-ink">{ownerTotal} subscriber{ownerTotal === 1 ? "" : "s"}</strong> on the
            email list. Download the full list (opt-in flag included — send promo mail only to opted-in
            addresses).
          </p>
          {downloadError && (
            <div className="mt-4 rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-4 py-3 text-[13px] text-obsidian">
              {downloadError}
            </div>
          )}
          <button
            type="button"
            onClick={() => void onDownload()}
            disabled={downloading}
            className="mt-4 rounded-full border border-sand-300 px-6 py-2.5 font-sora text-[12px] font-semibold text-sand-800 transition-colors hover:border-ink hover:text-ink disabled:opacity-60 cursor-pointer"
          >
            {downloading ? "Downloading…" : "Download subscriber list (CSV)"}
          </button>
        </div>
      )}
    </div>
  );
}
