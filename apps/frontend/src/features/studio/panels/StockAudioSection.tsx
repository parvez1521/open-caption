"use client";

import React, { useMemo, useState } from "react";
import { describeAssetLicence } from "../mediaAssets";
import { licenceRecordForStockItem, stockItemUrl, stockSfxItems } from "../stockCatalogue";
import { importPixabayTrackToBin, importStockItemToBin } from "../stockImport";
import {
  PIXABAY_API_PAGE,
  PIXABAY_CONTENT_ID_NOTE,
  PIXABAY_LICENCE_NAME,
  PIXABAY_USE_NOTE,
  clearPixabayKey,
  contentIdWarningFor,
  savePixabayKey,
  savedPixabayKey,
  searchPixabayAudio,
  type PixabayAudioType,
  type PixabayTrack,
} from "../pixabay";

/**
 * Stock audio (Phase 8, A10): the bundled CC0 starter SFX pack plus Pixabay
 * browse-import, rendered inside the Media panel (per-project bin) and on the
 * Media Library page (with a project picker there). Adding/importing goes
 * through stockImport's validate → probe → saveAsset handoff, so a stock
 * track lands in the bin as a normal asset — the Audio panel and exports
 * treat it exactly like an upload — carrying its licence record with it.
 */
export interface StockAudioSectionProps {
  /** the project whose bin additions land in; null disables adding (Library page before a project is picked) */
  projectId: string | null;
  onAdded?: () => void;
  tone?: "studio" | "library";
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export const StockAudioSection: React.FC<StockAudioSectionProps> = ({ projectId, onAdded, tone = "studio" }) => {
  const items = useMemo(() => stockSfxItems(), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState<string | null>(() => savedPixabayKey());
  const [keyDraft, setKeyDraft] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<PixabayAudioType>("music");
  const [results, setResults] = useState<PixabayTrack[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [confirmTrack, setConfirmTrack] = useState<PixabayTrack | null>(null);

  const dark = tone === "studio";
  const txt = dark ? "text-st-text" : "text-ink";
  const mut = dark ? "text-st-muted" : "text-sand-700";
  const faint = dark ? "text-st-faint" : "text-sand-600";
  const rowBg = dark ? "bg-st-raised/60" : "bg-sand-100";
  const btn = dark
    ? "rounded-md border border-st-line px-2 py-0.5 text-[11px] font-medium text-st-text transition hover:bg-st-hover disabled:opacity-40"
    : "rounded-full border border-sand-300 px-3 py-1 text-[11px] font-semibold text-sand-800 transition hover:border-ink hover:text-ink disabled:opacity-40 cursor-pointer";
  const inputCls = dark
    ? "w-full rounded-md border border-st-line bg-st-panel px-2 py-1.5 text-sm text-st-text outline-none focus:border-st-lav"
    : "w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-[13px] text-ink outline-none placeholder:text-sand-500";

  const addPackItem = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item || !projectId || busyId) return;
    setBusyId(id);
    setNote(null);
    try {
      await importStockItemToBin(projectId, item);
      setAddedIds((prev) => new Set(prev).add(id));
      setNote(`Added “${item.displayName}” to this project's media bin.`);
      onAdded?.();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't add that sound.");
    } finally {
      setBusyId(null);
    }
  };

  const runSearch = async () => {
    if (!apiKey || searching) return;
    setSearching(true);
    setSearchError(null);
    setConfirmTrack(null);
    try {
      const r = await searchPixabayAudio({ key: apiKey, query: query.trim(), type });
      setResults(r.tracks);
      if (r.tracks.length === 0) setSearchError("No tracks matched that search on Pixabay. Try different words.");
    } catch (e) {
      setResults(null);
      setSearchError(e instanceof Error ? e.message : "Pixabay search failed.");
    } finally {
      setSearching(false);
    }
  };

  const importTrack = async (track: PixabayTrack) => {
    if (!projectId || busyId) return;
    setBusyId(`pixabay-${track.id}`);
    setNote(null);
    try {
      await importPixabayTrackToBin(projectId, track, todayIso());
      setAddedIds((prev) => new Set(prev).add(`pixabay-${track.id}`));
      setConfirmTrack(null);
      setNote(`Imported “${track.title}” into this project's media bin, with its Pixabay licence record.`);
      onAdded?.();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't import that track.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------ bundled pack */}
      <div>
        <p className={`text-sm font-medium ${txt}`}>Starter sound effects pack</p>
        <p className={`mt-1 text-xs ${faint}`}>CC0 — free for any use, no credit needed.</p>
        {!projectId ? (
          <p className={`mt-2 text-xs ${mut}`}>Pick a project above first — added sounds land in that project&apos;s media bin on this device.</p>
        ) : null}
        <div className="mt-2 space-y-1.5">
          {items.map((item) => (
            <div key={item.id} className={`rounded-lg px-2.5 py-2 ${rowBg}`}>
              <div className="flex items-center gap-2">
                <p className={`min-w-0 flex-1 truncate text-sm font-medium ${txt}`} title={item.displayName}>{item.displayName}</p>
                <span className={`text-xs tabular-nums ${faint}`}>{Math.round(item.durationMs / 100) / 10}s</span>
                <button type="button" className={btn} disabled={!projectId || busyId !== null || addedIds.has(item.id)} onClick={() => void addPackItem(item.id)}>
                  {addedIds.has(item.id) ? "In your bin" : busyId === item.id ? "Adding…" : "Add to media bin"}
                </button>
              </div>
              <p className={`mt-0.5 text-xs leading-relaxed ${faint}`}>{item.use}</p>
              <p className={`mt-0.5 truncate text-xs ${faint}`} title={`${describeAssetLicence(licenceRecordForStockItem(item))} · ${item.format} — full record travels with the copy in your bin`}>
                {describeAssetLicence(licenceRecordForStockItem(item))} ·{" "}
                <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">source</a>
                {" · "}{item.format.replace(/\s*\([^)]*\)\s*$/, "")}
              </p>
              <audio controls preload="none" src={stockItemUrl(item)} className="mt-1.5 h-8 w-full" aria-label={`Preview ${item.displayName}`} />
            </div>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------ Pixabay */}
      <div>
        <p className={`text-sm font-medium ${txt}`}>Stock music &amp; sounds (Pixabay)</p>
        {!apiKey ? (
          <>
            <p className={`mt-1 text-xs ${faint}`}>Needs your own free Pixabay API key — get one on{" "}<a href={PIXABAY_API_PAGE} target="_blank" rel="noreferrer" className="underline underline-offset-2">Pixabay&apos;s API page</a>.</p>
            <details className="mt-1.5">
              <summary className="cursor-pointer text-xs font-medium text-st-muted">Where the key is kept</summary>
              <p className={`mt-1 text-xs ${faint}`}>Saved in this browser only; sent only to api.pixabay.com when you search.</p>
            </details>
            <div className="mt-2 flex gap-1.5">
              <input
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="Your Pixabay API key"
                aria-label="Your Pixabay API key"
                className={inputCls}
                autoComplete="off"
              />
              <button
                type="button"
                className={btn}
                disabled={!keyDraft.trim()}
                onClick={() => { savePixabayKey(keyDraft); setApiKey(keyDraft.trim()); setKeyDraft(""); }}
              >
                Save key on this device
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={`mt-1 text-xs ${faint}`}>Searching Pixabay with your own key, from this browser.</p>
            <details className="mt-1.5">
              <summary className="cursor-pointer text-xs font-medium text-st-muted">Licence details</summary>
              <p className={`mt-1 text-xs ${faint}`}>Under the {PIXABAY_LICENCE_NAME}: free inside projects; no standalone redistribution.</p>
            </details>
            <div className="mt-2 flex gap-1.5">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }}
                placeholder="Search music or sounds — e.g. corporate, whoosh"
                aria-label="Search Pixabay audio"
                className={inputCls}
              />
              <select
                value={type}
                onChange={(e) => setType(e.target.value as PixabayAudioType)}
                aria-label="Pixabay audio type"
                className={inputCls.replace("w-full", "w-auto")}
              >
                <option value="music">Music</option>
                <option value="sound_effects">Sound effects</option>
              </select>
              <button type="button" className={btn} disabled={searching} onClick={() => void runSearch()}>
                {searching ? "Searching…" : "Search"}
              </button>
            </div>
            <button
              type="button"
              className={`mt-1.5 text-xs underline underline-offset-2 ${faint}`}
              onClick={() => { clearPixabayKey(); setApiKey(null); setResults(null); }}
            >
              Remove the saved key from this device
            </button>
            {searchError ? <p role="alert" className="mt-2 text-xs text-orange-accent">{searchError}</p> : null}
            {results && results.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {results.map((t) => (
                  <div key={t.id} className={`rounded-lg px-2.5 py-2 ${rowBg}`}>
                    <div className="flex items-center gap-2">
                      <p className={`min-w-0 flex-1 truncate text-sm font-medium ${txt}`} title={t.title}>{t.title}</p>
                      {t.durationSec != null ? <span className={`text-xs tabular-nums ${faint}`}>{Math.round(t.durationSec)}s</span> : null}
                      <button
                        type="button"
                        className={btn}
                        disabled={!projectId || busyId !== null || addedIds.has(`pixabay-${t.id}`) || !t.audioUrl}
                        onClick={() => setConfirmTrack(t)}
                      >
                        {addedIds.has(`pixabay-${t.id}`) ? "In your bin" : "Import…"}
                      </button>
                    </div>
                    <p className={`mt-0.5 text-xs ${faint}`}>
                      {t.author ? <>by {t.author} · </> : null}{PIXABAY_LICENCE_NAME}
                      {t.pageUrl ? <> · <a href={t.pageUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">track page</a></> : null}
                      {!t.audioUrl ? <> · no downloadable file in the API response</> : null}
                    </p>
                    {t.contentIdRegistered === true ? (
                      <p className="mt-1 text-xs font-medium text-orange-accent">{contentIdWarningFor(t)}</p>
                    ) : null}
                    {t.previewUrl ? (
                      <audio controls preload="none" src={t.previewUrl} className="mt-1.5 h-8 w-full" aria-label={`Preview ${t.title}`} />
                    ) : null}
                    {confirmTrack?.id === t.id ? (
                      <div className={`mt-2 rounded-md border ${dark ? "border-st-line" : "border-sand-300"} px-2.5 py-2`}>
                        <p className={`text-xs leading-relaxed ${mut}`}>
                          Import “{t.title}” into this project&apos;s media bin? It is stored on this
                          device with a licence record ({PIXABAY_LICENCE_NAME}, source page and
                          today&apos;s date) that stays visible from the asset&apos;s library row.
                        </p>
                        <p className={`mt-1 text-xs leading-relaxed ${mut}`}>{PIXABAY_USE_NOTE}</p>
                        <p className={`mt-1 text-xs leading-relaxed ${t.contentIdRegistered === true ? "font-medium text-orange-accent" : mut}`}>
                          {contentIdWarningFor(t)}
                        </p>
                        {!projectId ? <p className={`mt-1 text-xs ${mut}`}>Pick a project first — imports land in that project&apos;s bin.</p> : null}
                        <div className="mt-2 flex gap-1.5">
                          <button type="button" className={btn} disabled={!projectId || busyId !== null} onClick={() => void importTrack(t)}>
                            {busyId === `pixabay-${t.id}` ? "Importing…" : "Import to media bin"}
                          </button>
                          <button type="button" className={btn} onClick={() => setConfirmTrack(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            {results && results.length > 0 ? (
              <p className={`mt-2 text-xs leading-relaxed ${faint}`}>{PIXABAY_CONTENT_ID_NOTE}</p>
            ) : null}
          </>
        )}
      </div>

      {note ? <p role="status" className={`text-xs ${mut}`}>{note}</p> : null}
    </div>
  );
};
