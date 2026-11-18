"use client";

import React, { useEffect, useMemo, useState } from "react";
import { OverlayShapeSvg } from "@capseasy/compositions";
import { Section } from "../controls";
import { overlayItemsOf } from "../composition";
import { OverlayEditor, OverlayRow } from "./OverlayEditor";
import { makeImageOverlay, makeShapeOverlay } from "./overlayItems";
import { STICKER_SETS, filterStickers, stickerCategories, stickerShapes, type StickerCategory } from "../stickers";
import {
  GIF_CATEGORIES,
  downloadGifBlob,
  gifCreditLine,
  gifFileName,
  saveGifAttribution,
  searchOpenverseGifs,
  type OpenverseGif,
} from "../gifStickers";
import type { OverlayPanelProps } from "./TextPanel";

/**
 * Stickers: the House Stickers set (house-drawn SVG, CC0, free for any use) plus a
 * runtime GIF library over Openverse (CC-licensed, keyless).
 *
 * Built-in stickers: each button shows the REAL OverlayShapeSvg in the shape's own
 * fixed colours (see OVERLAY_SHAPE_META), the exact component the composition renders:
 * an honest preview, never a fake image. Clicking one adds it as a timed shape overlay
 * at the playhead — through the exact overlay path Elements uses (makeShapeOverlay +
 * settings patch + select) — so it renders in the preview and the exported MP4, in the
 * colour the button showed (the placed item's colour IS the button's colour).
 * Search filters by name, tags and category; category chips narrow to one group.
 *
 * GIF stickers: searched on demand from Openverse (extension=gif, commercial-use
 * licences only), never bundled into the repo. Clicking one downloads it into the
 * project's on-device media bin and places it as an image overlay through
 * makeImageOverlay — so it animates in the preview. In the exported MP4 it renders
 * as a STILL (first frame): the composition draws image overlays with Remotion's
 * <Img>, and Remotion's own docs say not to use <Img> for GIFs (animated GIFs need
 * @remotion/gif, which this project does not install). The panel says so, plainly,
 * next to the library — a still in export is the honest behaviour, not a bug to hide.
 * Each GIF's attribution is shown under it and recorded per imported asset.
 */
export const StickersPanel: React.FC<OverlayPanelProps> = ({ settings, patch, selectedId, onSelect, getTimeMs, durationMs, composition, mediaAssets, onImportMedia }) => {
  const set = STICKER_SETS[0]!;
  const shapes = useMemo(() => stickerShapes(), []);
  const categories = useMemo(() => stickerCategories(), []);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<StickerCategory | "all">("all");
  const results = useMemo(() => filterStickers(shapes, query, category), [shapes, query, category]);

  // GIF library state
  const [gifQuery, setGifQuery] = useState("");
  const [gifCategory, setGifCategory] = useState<string | null>(null);
  const [gifResults, setGifResults] = useState<OpenverseGif[] | null>(null);
  const [gifTotal, setGifTotal] = useState(0);
  const [gifBusy, setGifBusy] = useState(false);
  const [gifError, setGifError] = useState("");
  const [gifAddingId, setGifAddingId] = useState<string | null>(null);
  const [pendingGif, setPendingGif] = useState<{ fileName: string; gif: OpenverseGif } | null>(null);

  const placed = (composition ? overlayItemsOf(composition, "shape") : settings.overlays.filter((o) => o.kind === "shape"))
    .filter((o) => o.kind === "shape" && o.shape !== undefined && set.shapes.includes(o.shape));
  const selected = placed.find((o) => o.id === selectedId) ?? null;

  const placeShape = (s: (typeof shapes)[number]) => {
    const item = makeShapeOverlay(s.id, getTimeMs(), durationMs);
    // The placed item carries the colour the button showed — preview, panel and export agree.
    patch({ overlays: [...settings.overlays, { ...item, color: s.color }] });
    onSelect(item.id);
  };

  const placeGifAsset = (asset: { id: string; name: string }, gif: OpenverseGif) => {
    const item = makeImageOverlay(asset, getTimeMs(), durationMs);
    patch({ overlays: [...settings.overlays, item] });
    saveGifAttribution(asset.id, gif);
    onSelect(item.id);
  };

  // The media bin refreshes after an import: when the GIF we just imported shows up
  // in mediaAssets, place it (same find-by-name pattern the AI Edit panel uses).
  useEffect(() => {
    if (!pendingGif || !mediaAssets) return;
    const record = mediaAssets.find((a) => a.name === pendingGif.fileName);
    if (!record) return;
    setPendingGif(null);
    setGifAddingId(null);
    placeGifAsset({ id: record.id, name: record.name }, pendingGif.gif);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaAssets, pendingGif]);

  const runGifSearch = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setGifBusy(true);
    setGifError("");
    try {
      const res = await searchOpenverseGifs({ query: trimmed });
      setGifResults(res.gifs);
      setGifTotal(res.total);
    } catch (e) {
      setGifResults(null);
      setGifError(e instanceof Error ? e.message : "Openverse search failed. Try again.");
    } finally {
      setGifBusy(false);
    }
  };

  const addGif = async (gif: OpenverseGif) => {
    if (gifAddingId || !onImportMedia) return;
    const fileName = gifFileName(gif);
    const existing = mediaAssets?.find((a) => a.name === fileName);
    if (existing) {
      placeGifAsset({ id: existing.id, name: existing.name }, gif);
      return;
    }
    setGifAddingId(gif.id);
    setGifError("");
    try {
      const blob = await downloadGifBlob(gif);
      const file = new File([blob], fileName, { type: "image/gif" });
      const errs = await onImportMedia([file]);
      if (errs.length > 0) throw new Error(errs[0]!.error);
      setPendingGif({ fileName, gif });
    } catch (e) {
      setGifAddingId(null);
      setGifError(e instanceof Error ? e.message : "Couldn't add that GIF. Try another one.");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* The selected sticker's editor sits at the TOP of the panel (same as
            MotionStudioPanel): a sticker just added must look editable at once. */}
        {selected ? (
          <OverlayEditor
            item={selected}
            onChange={(next) => patch({ overlays: settings.overlays.map((o) => (o.id === next.id ? next : o)) })}
            onDelete={() => { patch({ overlays: settings.overlays.filter((o) => o.id !== selected.id) }); onSelect(null); }}
            mediaAssets={mediaAssets}
            onImportMedia={onImportMedia}
          />
        ) : null}
        <Section title="Stickers" hint={`Drawn in-house for Captionit. ${set.licence}.`}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stickers — e.g. heart, arrow, cat"
            aria-label="Search stickers"
            className="w-full rounded-lg border border-st-line bg-st-raised px-3 py-2 text-[13px] text-st-text placeholder:text-st-faint"
          />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sticker category">
            <button
              key="all"
              type="button"
              onClick={() => setCategory("all")}
              aria-pressed={category === "all"}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${category === "all" ? "border-st-or bg-st-or/15 text-st-text" : "border-st-line bg-st-panel text-st-muted"}`}
            >
              All ({shapes.length})
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                aria-pressed={category === c.id}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${category === c.id ? "border-st-or bg-st-or/15 text-st-text" : "border-st-line bg-st-panel text-st-muted"}`}
              >
                {c.label} ({c.count})
              </button>
            ))}
          </div>
          {results.length === 0 ? (
            <p className="text-[12px] text-st-faint">
              No stickers match{query.trim() ? ` “${query.trim()}”` : ""}{category !== "all" ? ` in ${categories.find((c) => c.id === category)?.label ?? category}` : ""}. Try a different word, or clear the search.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {results.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => placeShape(s)}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-st-line bg-st-panel px-2 py-3 transition hover:bg-st-hover"
                  aria-label={`Add ${s.label}`}
                >
                  <OverlayShapeSvg shape={s.id} color={s.color} size={36} />
                  <span className="text-[11px] font-medium leading-tight text-st-text">{s.label}</span>
                </button>
              ))}
            </div>
          )}
        </Section>
        {placed.length ? (
          <Section title="On this video">
            <div className="space-y-1.5">
              {placed.map((o) => (
                <OverlayRow
                  key={o.id}
                  item={o}
                  label={o.kind === "shape" ? shapes.find((s) => s.id === o.shape)?.label ?? "Sticker" : "Sticker"}
                  selected={o.id === selectedId}
                  onSelect={() => onSelect(o.id === selectedId ? null : o.id)}
                />
              ))}
            </div>
          </Section>
        ) : null}
        <Section
          title="Animated GIFs"
          hint="Free GIFs from Openverse (CC-licensed, no account needed). They animate in the preview; in the exported MP4 they play as a still — the first frame. Credit is shown under each GIF and saved with the import."
        >
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="GIF category">
            {GIF_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { setGifCategory(c.id); setGifQuery(c.query); void runGifSearch(c.query); }}
                aria-pressed={gifCategory === c.id}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${gifCategory === c.id ? "border-st-or bg-st-or/15 text-st-text" : "border-st-line bg-st-panel text-st-muted"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="search"
              value={gifQuery}
              onChange={(e) => { setGifQuery(e.target.value); setGifCategory(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") void runGifSearch(gifQuery); }}
              placeholder="Search GIFs — e.g. birthday, cat"
              aria-label="Search GIFs"
              className="min-w-0 flex-1 rounded-lg border border-st-line bg-st-raised px-3 py-2 text-[13px] text-st-text placeholder:text-st-faint"
            />
            <button
              type="button"
              onClick={() => void runGifSearch(gifQuery)}
              disabled={gifBusy || !gifQuery.trim()}
              className="shrink-0 rounded-lg border border-st-line bg-st-panel px-3 py-2 text-[13px] font-medium text-st-text transition hover:bg-st-hover disabled:opacity-50"
            >
              {gifBusy ? "Searching…" : "Search"}
            </button>
          </div>
          {gifError ? (
            <p role="alert" className="text-[12px] text-st-text">{gifError}</p>
          ) : null}
          {pendingGif ? (
            <p className="text-[12px] text-st-faint">Adding “{pendingGif.gif.title}” to your video…</p>
          ) : null}
          {gifResults !== null ? (
            gifResults.length === 0 ? (
              <p className="text-[12px] text-st-faint">No GIFs found for that search. Try a different word.</p>
            ) : (
              <>
                <p className="text-[12px] text-st-faint">{gifTotal} GIFs on Openverse — showing {gifResults.length}.</p>
                <div className="grid grid-cols-2 gap-2">
                  {gifResults.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => void addGif(g)}
                      disabled={gifAddingId === g.id}
                      className="flex flex-col items-stretch overflow-hidden rounded-xl border border-st-line bg-st-panel text-left transition hover:bg-st-hover disabled:opacity-60"
                      aria-label={`Add GIF ${g.title}`}
                    >
                      <img src={g.thumbnailUrl} alt={g.title} loading="lazy" className="block aspect-square w-full object-cover" />
                      <span className="px-2 pb-2 pt-1.5">
                        <span className="block truncate text-[11px] font-medium leading-tight text-st-text">{g.title}</span>
                        <span className="mt-0.5 block text-[10px] leading-snug text-st-faint">{gifCreditLine(g)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )
          ) : (
            <p className="text-[12px] text-st-faint">Pick a category or search — results come from Openverse, free and openly licensed. GIFs you add are saved to this project's media bin, so they work offline afterwards.</p>
          )}
        </Section>
      </div>
    </div>
  );
};
