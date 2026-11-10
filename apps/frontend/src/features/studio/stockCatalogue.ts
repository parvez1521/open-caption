import type { AssetLicenceRecord } from "./mediaAssets";
import manifest from "../../../public/stock-sfx/manifest.json";

/**
 * Bundled starter SFX pack (Phase 8, A10a): a small curated set of creator
 * sound effects shipped as static files under `public/stock-sfx/`, every one
 * CC0. The per-file licence records live NEXT TO the assets in
 * `public/stock-sfx/manifest.json` (the same data the /credits page renders),
 * and this module is the typed view of that manifest.
 *
 * Ingestion record (2026-11-10): every file came from a Kenney (kenney.nl)
 * audio pack whose page states "License: Creative Commons CC0" and whose
 * downloaded zip contains a License.txt reading "License: (Creative Commons
 * Zero, CC0)" — both checked per pack before any file was copied in. The
 * files are the packs' original OGG Vorbis files, renamed only. Freesound
 * was the first-choice source and its CC0 items were verified on their pages,
 * but the sandbox could not download Freesound audio (CDN 403), so NO
 * Freesound file ships — Kenney is the substitute source the A10 spec names.
 */

export interface StockSfxItem {
  id: string;
  displayName: string;
  /** what a creator would reach for it for — shown in the catalogue UI */
  use: string;
  /** file name inside public/stock-sfx/ */
  file: string;
  /** the file's name in its source pack */
  originalFile: string;
  title: string;
  author: string;
  sourceUrl: string;
  licence: string;
  retrievedAt: string;
  format: string;
  durationMs: number;
}

export const STOCK_SFX_PACK_NOTE: string = (manifest as { pack: { note: string } }).pack.note;

export function stockSfxItems(): StockSfxItem[] {
  return (manifest as { items: StockSfxItem[] }).items;
}

/** Public URL the static file is served from (Next serves public/ at the root). */
export function stockItemUrl(item: Pick<StockSfxItem, "file">): string {
  return `/stock-sfx/${item.file}`;
}

/** The licence record an "Add to media bin" copy of this item carries into the bin. */
export function licenceRecordForStockItem(item: StockSfxItem): AssetLicenceRecord {
  return {
    source: "kenney",
    title: item.title,
    author: item.author,
    sourceUrl: item.sourceUrl,
    licence: item.licence,
    retrievedAt: item.retrievedAt,
    formatNote: item.format,
  };
}

/**
 * Manifest completeness gate (also unit-tested): every item must carry a
 * FULL licence record — title, author, source URL, a CC0 licence, a retrieval
 * date — and a sane file/duration. Returns the problems found (empty = clean).
 * Only CC0 ships in the bundled pack: anything else fails this gate, so a
 * future edit can't quietly bundle a CC-BY or unverified file.
 */
export function validateStockManifest(items: readonly StockSfxItem[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const tag = it.id || "(no id)";
    if (!it.id) problems.push("an item has no id");
    if (seen.has(it.id)) problems.push(`${tag}: duplicate id`);
    seen.add(it.id);
    if (!it.displayName?.trim()) problems.push(`${tag}: no display name`);
    if (!it.file?.endsWith(".ogg")) problems.push(`${tag}: file is not an .ogg in the pack`);
    if (!it.originalFile?.trim()) problems.push(`${tag}: no original file name recorded`);
    if (!it.title?.trim()) problems.push(`${tag}: no source title recorded`);
    if (!it.author?.trim()) problems.push(`${tag}: no author recorded`);
    if (!/^https:\/\//.test(it.sourceUrl ?? "")) problems.push(`${tag}: source URL missing or not https`);
    if (it.licence !== "CC0 1.0") problems.push(`${tag}: licence is "${it.licence}", not CC0 1.0 — only CC0 ships bundled`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(it.retrievedAt ?? "")) problems.push(`${tag}: retrieval date missing or not an ISO date`);
    if (!(it.durationMs > 0 && it.durationMs <= 30_000)) problems.push(`${tag}: duration ${it.durationMs}ms is not a sane SFX length`);
  }
  if (items.length < 8 || items.length > 15) problems.push(`pack has ${items.length} items — the starter pack is meant to stay small (8–15)`);
  return problems;
}
