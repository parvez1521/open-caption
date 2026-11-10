"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import { studioService } from "@/services/studio";
import StudioShell from "@/components/studio/StudioShell";
import { FontPicker } from "@/features/studio/panels/FontPicker";
import {
  activateBrandProfile,
  createBrandProfile,
  deleteBrandProfile,
  fetchBrandProfiles,
  updateBrandProfile,
} from "@/features/create/brandProfile";
import {
  EMPTY_BRAND_KIT_FORM,
  brandKitMode,
  formFromProfile,
  updateInputFromForm,
  type BrandKitForm,
} from "./brandKitForm";

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_COLORS = 12;
const LEGACY_FORM = "__legacy__";

const inputCls =
  "w-full rounded-lg border border-sand-300 bg-white px-3 py-2.5 text-[13px] text-ink outline-none focus:border-sand-600 disabled:opacity-60";
const labelCls = "block font-sora text-[12px] font-semibold text-sand-800";
const primaryBtn =
  "rounded-full bg-ink px-6 py-2.5 font-sora text-[12px] font-semibold text-dune-white hover:bg-sand-800 disabled:opacity-60 transition-all cursor-pointer";
const ghostBtn =
  "rounded-full border border-sand-300 px-4 py-2 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink disabled:opacity-50 transition-colors cursor-pointer";

/**
 * Brand Kit (Creator Studio): one place for how the user's content sounds and
 * looks. Each profile pairs a voice (niche, audience, tone, words, sample
 * captions, CTAs) with the visual kit (up to 12 colours plus one preferred
 * font). The Creator Studio generators use the ACTIVE profile automatically;
 * the studio Style panel reads the same table's oldest row, so saving here
 * invalidates the legacy ["brand"] query too.
 *
 * Degraded mode: until the server's database has the voice columns, the
 * profiles route returns `voiceReady: false` with the legacy kits as profiles.
 * The page then behaves exactly like the old brand page for colours and font
 * (saved via studioService.saveBrand), shows a notice, and keeps the voice
 * form read-only — nothing regresses and nothing pretends a voice was saved.
 */
export default function BrandKitPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [signedIn, setSignedIn] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<BrandKitForm | null>(null);
  const [formFor, setFormFor] = useState<string | null>(null);
  const [newColor, setNewColor] = useState("#FFA946");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push(isSupabaseConfigured() ? "/login" : "/start");
      return;
    }
    setSignedIn(true);
  }, [router]);

  const profilesQuery = useQuery({
    queryKey: ["brand-profiles"],
    queryFn: () => fetchBrandProfiles(),
    enabled: signedIn,
  });
  const data = profilesQuery.data;
  const mode = data ? brandKitMode(data.voiceReady) : "voice";
  const profiles = data?.profiles ?? [];
  const selectedProfile = profiles.find((p) => p.id === selectedId) ?? null;

  // The legacy kit is only needed in degraded mode, where it stays the source
  // of truth for colours + font exactly as the old page had it.
  const legacyBrand = useQuery({
    queryKey: ["brand"],
    queryFn: () => studioService.getBrand(),
    enabled: signedIn && !!data && mode === "legacy",
  });

  // Keep the selection pointing at a real profile: default to the active one.
  useEffect(() => {
    if (!data) return;
    if (!data.profiles.length) {
      if (data.voiceReady) setSelectedId(null);
      return;
    }
    if (!selectedId || !data.profiles.some((p) => p.id === selectedId)) {
      setSelectedId(data.activeId ?? data.profiles[0].id);
    }
  }, [data, selectedId]);

  // Voice mode: switching the selected profile reloads the form from it
  // (unsaved edits on the previous profile are dropped, as a chip switch implies).
  useEffect(() => {
    if (!data || mode !== "voice" || !selectedProfile) return;
    if (formFor !== selectedProfile.id) {
      setForm(formFromProfile(selectedProfile));
      setFormFor(selectedProfile.id);
      setConfirmDelete(false);
      setSaved(false);
    }
  }, [data, mode, selectedProfile, formFor]);

  // Degraded mode: the form's colours/font come from the legacy kit, once.
  useEffect(() => {
    if (!data || mode !== "legacy" || formFor === LEGACY_FORM) return;
    if (legacyBrand.data) {
      setForm({
        ...EMPTY_BRAND_KIT_FORM,
        name: data.profiles[0]?.name ?? "",
        colors: [...legacyBrand.data.colors],
        fontId: legacyBrand.data.fontId,
      });
      setFormFor(LEGACY_FORM);
    } else if (legacyBrand.isError) {
      const first = data.profiles[0];
      setForm(first ? formFromProfile(first) : { ...EMPTY_BRAND_KIT_FORM });
      setFormFor(LEGACY_FORM);
    }
  }, [data, mode, legacyBrand.data, legacyBrand.isError, formFor]);

  const patchForm = (patch: Partial<BrandKitForm>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setSaved(false);
  };

  const selectProfile = (id: string) => {
    setSelectedId(id);
    setConfirmDelete(false);
    setSaved(false);
    setError(null);
  };

  const runAction = async (fn: () => Promise<void>) => {
    setActionBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setActionBusy(false);
    }
  };

  const newProfile = () =>
    runAction(async () => {
      const created = await createBrandProfile({ name: "New profile" });
      await qc.invalidateQueries({ queryKey: ["brand-profiles"] });
      setSelectedId(created.id);
    });

  const makeActive = () => {
    if (!selectedProfile) return;
    void runAction(async () => {
      await activateBrandProfile(selectedProfile.id);
      await qc.invalidateQueries({ queryKey: ["brand-profiles"] });
      await qc.invalidateQueries({ queryKey: ["brand"] });
    });
  };

  const deleteSelected = () => {
    if (!selectedProfile) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    void runAction(async () => {
      await deleteBrandProfile(selectedProfile.id);
      setConfirmDelete(false);
      await qc.invalidateQueries({ queryKey: ["brand-profiles"] });
      await qc.invalidateQueries({ queryKey: ["brand"] });
      // The selection effect now points at the new active/first profile, or
      // at nothing when that was the last one (the empty state takes over).
    });
  };

  const addColor = () => {
    if (!form) return;
    const c = newColor.trim().toUpperCase();
    if (!HEX.test(c)) { setError("Colours must be a 6-digit hex like #FFA946."); return; }
    if (form.colors.includes(c)) { setError("That colour is already in your kit."); return; }
    if (form.colors.length >= MAX_COLORS) { setError(`The brand kit holds up to ${MAX_COLORS} colours.`); return; }
    setError(null);
    patchForm({ colors: [...form.colors, c] });
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === "voice") {
        if (!selectedProfile) return;
        await updateBrandProfile(selectedProfile.id, updateInputFromForm(form));
      } else {
        await studioService.saveBrand(form.colors, form.fontId);
      }
      await qc.invalidateQueries({ queryKey: ["brand-profiles"] });
      await qc.invalidateQueries({ queryKey: ["brand"] });
      setSaved(true);
    } catch (err: any) {
      setError(err?.message || "Couldn't save your brand kit.");
    } finally {
      setSaving(false);
    }
  };

  const isLoading =
    !signedIn || profilesQuery.isLoading || !data || (mode === "legacy" && legacyBrand.isLoading && !form);
  // In degraded mode the voice/name fields display the selected legacy profile
  // (read-only); colours and font always come from the form.
  const shown: BrandKitForm | null =
    form && mode === "legacy" && selectedProfile ? { ...formFromProfile(selectedProfile), colors: form.colors, fontId: form.fontId } : form;
  const voiceDisabled = mode === "legacy";

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-3xl mx-auto">
        <div className="pb-8 border-b border-sand-200">
          <p className="font-sora text-[11px] font-semibold uppercase tracking-wider text-sand-500">Creator Studio</p>
          <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink">
            Brand <em className="italic text-sand-600">Kit</em>
          </h1>
          <p className="mt-2 text-[14px] text-sand-800">
            One place for how your content sounds (your voice) and looks (colours and a font). The generators in
            Creator Studio use the active profile automatically.
          </p>
        </div>

        {profilesQuery.isError ? (
          <div className="mt-8 rounded-xl border border-orange-accent/60 bg-orange-accent/10 p-8 text-center space-y-3">
            <p className="font-sora text-[14px] font-semibold text-obsidian">Couldn&apos;t load your brand kit.</p>
            <button onClick={() => profilesQuery.refetch()} className="rounded-full border border-orange-accent/60 px-5 py-2 font-sora text-[12px] font-semibold text-obsidian hover:bg-orange-accent/20 transition-colors cursor-pointer">Retry</button>
          </div>
        ) : isLoading ? (
          <div className="mt-8 h-40 rounded-xl bg-sand-100 animate-pulse" />
        ) : mode === "voice" && profiles.length === 0 ? (
          <div className="mt-8 rounded-xl border border-sand-200 bg-white p-8 text-center space-y-3">
            <p className="font-sora text-[15px] font-bold text-ink">No brand profiles yet</p>
            <p className="text-[13px] text-sand-700">
              Create your first profile to save a voice — how your content sounds — alongside your colours and font.
              The generators in Creator Studio will use the active profile automatically.
            </p>
            {error ? <div className="rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-4 py-3 text-[13px] text-obsidian">{error}</div> : null}
            <button onClick={() => void newProfile()} disabled={actionBusy} className={primaryBtn}>
              {actionBusy ? "Creating…" : "Create your first profile"}
            </button>
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            {profiles.length ? (
              <section className="rounded-xl border border-sand-200 bg-white p-6">
                <h2 className="font-sora text-[15px] font-bold text-ink">Profiles</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {profiles.map((p) => {
                    const isActive = p.isActive || p.id === data.activeId;
                    const isSelected = p.id === selectedId;
                    return (
                      <button
                        key={p.id}
                        onClick={() => selectProfile(p.id)}
                        aria-pressed={isSelected}
                        className={`rounded-full px-4 py-2 font-sora text-[12px] font-semibold transition-colors cursor-pointer ${
                          isSelected ? "bg-ink text-dune-white" : "border border-sand-300 text-sand-800 hover:border-ink hover:text-ink"
                        }`}
                      >
                        {p.name}
                        {isActive ? <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider opacity-80">Active</span> : null}
                      </button>
                    );
                  })}
                </div>
                {mode === "voice" && selectedProfile ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {!selectedProfile.isActive && selectedProfile.id !== data.activeId ? (
                      <button onClick={makeActive} disabled={actionBusy} className={ghostBtn}>Make active</button>
                    ) : null}
                    <button onClick={() => void newProfile()} disabled={actionBusy} className={ghostBtn}>New profile</button>
                    <button onClick={deleteSelected} disabled={actionBusy} className={ghostBtn}>
                      {confirmDelete ? "Confirm delete?" : "Delete"}
                    </button>
                    {confirmDelete ? (
                      <button onClick={() => setConfirmDelete(false)} disabled={actionBusy} className={ghostBtn}>Cancel</button>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}

            {mode === "legacy" ? (
              <section className="rounded-xl border border-orange-accent/60 bg-orange-accent/10 p-6">
                <h2 className="font-sora text-[15px] font-bold text-obsidian">Voice profiles are not available yet</h2>
                <p className="mt-1 text-[13px] text-obsidian">
                  Voice profiles need a database update on the server before they can be saved. Until then, your
                  colours and font still save exactly as before.
                </p>
              </section>
            ) : null}

            {!form || !shown ? (
              <div className="h-40 rounded-xl bg-sand-100 animate-pulse" />
            ) : (
              <>
                <section className="rounded-xl border border-sand-200 bg-white p-6">
                  <h2 className="font-sora text-[15px] font-bold text-ink">Brand voice</h2>
                  <p className="mt-1 text-[13px] text-sand-700">
                    {mode === "legacy"
                      ? "Voice editing unlocks once the server update lands. Your colours and font below still save as before."
                      : "How this profile sounds. When it is the active profile, the Creator Studio generators write in this voice."}
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className={labelCls} htmlFor="bk-name">Profile name</label>
                      <input id="bk-name" className={inputCls} value={shown.name} disabled={voiceDisabled} onChange={(e) => patchForm({ name: e.target.value })} placeholder="e.g. My main account" />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="bk-niche">Niche</label>
                      <input id="bk-niche" className={inputCls} value={shown.niche} disabled={voiceDisabled} onChange={(e) => patchForm({ niche: e.target.value })} placeholder="e.g. home workouts for busy parents" />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="bk-audience">Audience</label>
                      <input id="bk-audience" className={inputCls} value={shown.audience} disabled={voiceDisabled} onChange={(e) => patchForm({ audience: e.target.value })} placeholder="e.g. complete beginners" />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="bk-language">Language</label>
                      <input id="bk-language" className={inputCls} value={shown.language} disabled={voiceDisabled} onChange={(e) => patchForm({ language: e.target.value })} placeholder="e.g. Hinglish, casual" />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="bk-tone">Tone</label>
                      <input id="bk-tone" className={inputCls} value={shown.tone} disabled={voiceDisabled} onChange={(e) => patchForm({ tone: e.target.value })} placeholder="e.g. friendly, direct, no hype" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls} htmlFor="bk-style">Writing style</label>
                      <input id="bk-style" className={inputCls} value={shown.writingStyle} disabled={voiceDisabled} onChange={(e) => patchForm({ writingStyle: e.target.value })} placeholder="e.g. short lines, one idea per line, ends with a question" />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="bk-use">Words to use</label>
                      <textarea id="bk-use" rows={4} className={inputCls} value={shown.wordsToUseText} disabled={voiceDisabled} onChange={(e) => patchForm({ wordsToUseText: e.target.value })} placeholder={"simple\nstep by step"} />
                      <p className="mt-1 text-[12px] text-sand-600">One per line.</p>
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="bk-avoid">Words to avoid</label>
                      <textarea id="bk-avoid" rows={4} className={inputCls} value={shown.wordsToAvoidText} disabled={voiceDisabled} onChange={(e) => patchForm({ wordsToAvoidText: e.target.value })} placeholder={"game-changer\nguaranteed results"} />
                      <p className="mt-1 text-[12px] text-sand-600">One per line. These are never used in generated content.</p>
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="bk-samples">Sample captions</label>
                      <textarea id="bk-samples" rows={5} className={inputCls} value={shown.sampleCaptionsText} disabled={voiceDisabled} onChange={(e) => patchForm({ sampleCaptionsText: e.target.value })} placeholder="Paste captions you have written that sound like you" />
                      <p className="mt-1 text-[12px] text-sand-600">One per line. Generators match this style; they do not copy them.</p>
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="bk-ctas">Preferred calls to action</label>
                      <textarea id="bk-ctas" rows={5} className={inputCls} value={shown.preferredCtasText} disabled={voiceDisabled} onChange={(e) => patchForm({ preferredCtasText: e.target.value })} placeholder={"Save this for later\nFollow for day 2"} />
                      <p className="mt-1 text-[12px] text-sand-600">One per line.</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-sand-200 bg-white p-6">
                  <h2 className="font-sora text-[15px] font-bold text-ink">Colours</h2>
                  {form.colors.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {form.colors.map((c) => (
                        <span key={c} className="inline-flex items-center gap-2 rounded-full border border-sand-300 py-1 pl-1.5 pr-2.5">
                          <span className="h-6 w-6 rounded-full border border-sand-300" style={{ backgroundColor: c }} />
                          <span className="font-mono text-[12px] text-sand-800">{c}</span>
                          <button onClick={() => patchForm({ colors: form.colors.filter((x) => x !== c) })} aria-label={`Remove ${c}`} className="rounded-full px-1 text-sand-500 hover:text-ink cursor-pointer">×</button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-[13px] text-sand-700">No colours yet. Add your first brand colour below.</p>
                  )}
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <input type="color" value={HEX.test(newColor) ? newColor : "#000000"} onChange={(e) => setNewColor(e.target.value.toUpperCase())} aria-label="Pick a colour" className="h-10 w-12 cursor-pointer rounded-lg border border-sand-300 bg-transparent" />
                    <input type="text" value={newColor} onChange={(e) => setNewColor(e.target.value)} placeholder="#FFA946" aria-label="Colour hex value" className="w-32 rounded-lg border border-sand-300 bg-white px-3 py-2.5 font-mono text-[13px] text-ink outline-none focus:border-sand-600" />
                    <button onClick={addColor} disabled={form.colors.length >= MAX_COLORS} className="rounded-full border border-sand-300 px-5 py-2.5 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink disabled:opacity-50 transition-colors cursor-pointer">Add colour</button>
                    <span className="text-[12px] text-sand-600">{form.colors.length}/{MAX_COLORS}</span>
                  </div>
                </section>

                <section className="rounded-xl border border-sand-200 bg-white p-6">
                  <h2 className="font-sora text-[15px] font-bold text-ink">Preferred font</h2>
                  <p className="mt-1 text-[13px] text-sand-700">Offered in the Style panel as your brand font for new caption styles.</p>
                  <div className="mt-4 rounded-lg border border-sand-200 bg-sand-50 p-4">
                    <FontPicker label="Brand font" value={form.fontId ?? "Plus Jakarta Sans"} onChange={(f) => patchForm({ fontId: f })} />
                    {!form.fontId ? <p className="mt-2 text-[12px] text-sand-600">No brand font saved yet — pick one above and save.</p> : (
                      <button onClick={() => patchForm({ fontId: null })} className="mt-3 font-sora text-[12px] font-semibold text-sand-700 hover:text-ink cursor-pointer">Clear brand font</button>
                    )}
                  </div>
                </section>

                {error ? <div className="rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-4 py-3 text-[13px] text-obsidian">{error}</div> : null}
                <div className="flex items-center gap-4">
                  <button onClick={() => void save()} disabled={saving} className={primaryBtn}>{saving ? "Saving…" : mode === "voice" ? "Save profile" : "Save brand kit"}</button>
                  {saved ? <span className="font-sora text-[12px] font-semibold text-sand-700">Saved — your brand kit is up to date.</span> : null}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </StudioShell>
  );
}
