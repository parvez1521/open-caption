"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import { studioService } from "@/services/studio";
import StudioShell from "@/components/studio/StudioShell";
import { FontPicker } from "@/features/studio/panels/FontPicker";

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_COLORS = 12;

/**
 * Brand presets (Creator Studio): the full edit surface for the existing brand kit —
 * up to 12 colours plus one preferred font, stored via /api/v1/brand.
 * The studio Style panel reads and writes this same kit; nothing is forked.
 */
export default function BrandPresetsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [signedIn, setSignedIn] = useState(false);
  const [colors, setColors] = useState<string[]>([]);
  const [fontId, setFontId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [newColor, setNewColor] = useState("#FFA946");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push(isSupabaseConfigured() ? "/login" : "/start");
      return;
    }
    setSignedIn(true);
  }, [router]);

  const brand = useQuery({ queryKey: ["brand"], queryFn: () => studioService.getBrand(), enabled: signedIn });

  useEffect(() => {
    if (brand.data && !loaded) {
      setColors(brand.data.colors);
      setFontId(brand.data.fontId);
      setLoaded(true);
    }
  }, [brand.data, loaded]);

  const addColor = () => {
    const c = newColor.trim().toUpperCase();
    if (!HEX.test(c)) { setError("Colours must be a 6-digit hex like #FFA946."); return; }
    if (colors.includes(c)) { setError("That colour is already in your kit."); return; }
    if (colors.length >= MAX_COLORS) { setError(`The brand kit holds up to ${MAX_COLORS} colours.`); return; }
    setError(null);
    setSaved(false);
    setColors([...colors, c]);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await studioService.saveBrand(colors, fontId);
      await qc.invalidateQueries({ queryKey: ["brand"] });
      setSaved(true);
    } catch (err: any) {
      setError(err?.message || "Couldn't save your brand kit.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-3xl mx-auto">
        <div className="pb-8 border-b border-sand-200">
          <p className="font-sora text-[11px] font-semibold uppercase tracking-wider text-sand-500">Creator Studio</p>
          <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink">
            Brand <em className="italic text-sand-600">presets</em>
          </h1>
          <p className="mt-2 text-[14px] text-sand-800">Your brand kit: up to {MAX_COLORS} colours and one preferred font. It appears as quick picks in every project&apos;s Style panel — the same kit, edited here in full.</p>
        </div>

        {brand.isLoading || !loaded ? (
          <div className="mt-8 h-40 rounded-xl bg-sand-100 animate-pulse" />
        ) : brand.isError ? (
          <div className="mt-8 rounded-xl border border-orange-accent/60 bg-orange-accent/10 p-8 text-center space-y-3">
            <p className="font-sora text-[14px] font-semibold text-obsidian">Couldn&apos;t load your brand kit.</p>
            <button onClick={() => brand.refetch()} className="rounded-full border border-orange-accent/60 px-5 py-2 font-sora text-[12px] font-semibold text-obsidian hover:bg-orange-accent/20 transition-colors cursor-pointer">Retry</button>
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            <section className="rounded-xl border border-sand-200 bg-white p-6">
              <h2 className="font-sora text-[15px] font-bold text-ink">Colours</h2>
              {colors.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {colors.map((c) => (
                    <span key={c} className="inline-flex items-center gap-2 rounded-full border border-sand-300 py-1 pl-1.5 pr-2.5">
                      <span className="h-6 w-6 rounded-full border border-sand-300" style={{ backgroundColor: c }} />
                      <span className="font-mono text-[12px] text-sand-800">{c}</span>
                      <button onClick={() => { setColors(colors.filter((x) => x !== c)); setSaved(false); }} aria-label={`Remove ${c}`} className="rounded-full px-1 text-sand-500 hover:text-ink cursor-pointer">×</button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-[13px] text-sand-700">No colours yet. Add your first brand colour below.</p>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <input type="color" value={HEX.test(newColor) ? newColor : "#000000"} onChange={(e) => setNewColor(e.target.value.toUpperCase())} aria-label="Pick a colour" className="h-10 w-12 cursor-pointer rounded-lg border border-sand-300 bg-transparent" />
                <input type="text" value={newColor} onChange={(e) => setNewColor(e.target.value)} placeholder="#FFA946" aria-label="Colour hex value" className="w-32 rounded-lg border border-sand-300 bg-white px-3 py-2.5 font-mono text-[13px] text-ink outline-none focus:border-sand-600" />
                <button onClick={addColor} disabled={colors.length >= MAX_COLORS} className="rounded-full border border-sand-300 px-5 py-2.5 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink disabled:opacity-50 transition-colors cursor-pointer">Add colour</button>
                <span className="text-[12px] text-sand-600">{colors.length}/{MAX_COLORS}</span>
              </div>
            </section>

            <section className="rounded-xl border border-sand-200 bg-white p-6">
              <h2 className="font-sora text-[15px] font-bold text-ink">Preferred font</h2>
              <p className="mt-1 text-[13px] text-sand-700">Offered in the Style panel as your brand font for new caption styles.</p>
              <div className="mt-4 rounded-lg border border-sand-200 bg-sand-50 p-4">
                <FontPicker label="Brand font" value={fontId ?? "Plus Jakarta Sans"} onChange={(f) => { setFontId(f); setSaved(false); }} />
                {!fontId ? <p className="mt-2 text-[12px] text-sand-600">No brand font saved yet — pick one above and save.</p> : (
                  <button onClick={() => { setFontId(null); setSaved(false); }} className="mt-3 font-sora text-[12px] font-semibold text-sand-700 hover:text-ink cursor-pointer">Clear brand font</button>
                )}
              </div>
            </section>

            {error ? <div className="rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-4 py-3 text-[13px] text-obsidian">{error}</div> : null}
            <div className="flex items-center gap-4">
              <button onClick={() => void save()} disabled={saving} className="rounded-full bg-ink px-6 py-2.5 font-sora text-[12px] font-semibold text-dune-white hover:bg-sand-800 disabled:opacity-60 transition-all cursor-pointer">{saving ? "Saving…" : "Save brand kit"}</button>
              {saved ? <span className="font-sora text-[12px] font-semibold text-sand-700">Saved — the Style panel will use this kit.</span> : null}
            </div>
          </div>
        )}
      </div>
    </StudioShell>
  );
}
