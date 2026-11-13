import type { AssetLicenceRecord } from "./mediaAssets";
import manifest from "../../../public/stock-sfx/manifest.json";

/**
 * Bundled starter SFX pack (Phase 8, A10a): a small curated set of creator
 * sound effects shipped as static files under `public/stock-sfx/`, every one
 * CC0. The per-file licence records live NEXT TO the assets in
 * `public/stock-sfx/manifest.json` (the same data the /credits page renders),
 * and this module is the typed view of that manifest.
 *
 * Ingestion record (2026-11-10): every STARTER file came from a Kenney
 * (kenney.nl) audio pack whose page states "License: Creative Commons CC0"
 * and whose downloaded zip contains a License.txt reading "License:
 * (Creative Commons Zero, CC0)" — both checked per pack before any file was
 * copied in. The files are the packs' original OGG Vorbis files, renamed
 * only. Freesound was the first-choice source and its CC0 items were verified
 * on their pages, but the sandbox could not download Freesound audio
 * (CDN 403), so NO Freesound file ships — Kenney is the substitute source
 * the A10 spec names.
 *
 * Meme group (2026-11-11): original SYNTHESIZED effects generated in code
 * (Python DSP — oscillators, filtered noise, envelopes), in the style of the
 * classic meme sounds. The famous meme recordings themselves are other
 * people's uploads (myinstants-style libraries) and were never touched.
 * CC0-verified Freesound recordings of these classes were located via
 * Openverse (licence cc0 in the API record), but the Freesound CDN still
 * refuses downloads from this sandbox (HTTP 403), so synthesized originals
 * ship instead, each labelled "original synthesis" in its title, format and
 * UI copy, and dedicated CC0 by Captionit as author. The validator below
 * pins that labelling so a synth item can never pose as a found recording.
 */

export interface StockSfxItem {
  id: string;
  displayName: string;
  /** what a creator would reach for it for — shown in the catalogue UI */
  use: string;
  /** file name inside public/stock-sfx/ */
  file: string;
  /** the file's name in its source pack (for synth items: how it was generated) */
  originalFile: string;
  title: string;
  author: string;
  sourceUrl: string;
  licence: string;
  retrievedAt: string;
  format: string;
  durationMs: number;
  /** which bundled group the item renders under */
  group: "starter" | "meme";
  /** where the file came from: a Kenney CC0 pack, or our own synthesis (2026-11-11) */
  licenceSource: "kenney" | "synth";
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
    source: item.licenceSource,
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
    // A source URL must be recorded: an https URL for found recordings, or
    // the site's own /credits anchor for our synthesized originals (their
    // source IS this site's credits page — an absolute old-domain URL here
    // used to leak the retired Vercel host into the live /credits page).
    const sourceOk =
      /^https:\/\//.test(it.sourceUrl ?? "") ||
      (it.licenceSource === "synth" && (it.sourceUrl ?? "").startsWith("/credits#"));
    if (!sourceOk) problems.push(`${tag}: source URL missing, not https, or not the /credits anchor`);
    if (it.licence !== "CC0 1.0") problems.push(`${tag}: licence is "${it.licence}", not CC0 1.0 — only CC0 ships bundled`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(it.retrievedAt ?? "")) problems.push(`${tag}: retrieval date missing or not an ISO date`);
    if (!(it.durationMs > 0 && it.durationMs <= 30_000)) problems.push(`${tag}: duration ${it.durationMs}ms is not a sane SFX length`);
    if (it.group !== "starter" && it.group !== "meme") problems.push(`${tag}: group "${it.group}" is not a bundled group`);
    // A synthesized item must SAY so — it can never pose as a found recording:
    // author is Captionit and the title carries the synthesis label.
    if (it.licenceSource === "synth") {
      if (it.author !== "Captionit") problems.push(`${tag}: a synth item's author must be Captionit`);
      if (!/synthesis/i.test(it.title ?? "")) problems.push(`${tag}: a synth item's title must say "original synthesis"`);
      if (!/synthes/i.test(it.format ?? "")) problems.push(`${tag}: a synth item's format must say it was synthesized`);
    }
    if (it.licenceSource !== "kenney" && it.licenceSource !== "synth") problems.push(`${tag}: licence source "${it.licenceSource}" is not a bundled source`);
  }
  const starter = items.filter((i) => i.group === "starter").length;
  const meme = items.filter((i) => i.group === "meme").length;
  if (starter < 8 || starter > 15) problems.push(`pack has ${starter} starter items — the starter pack is meant to stay small (8–15)`);
  if (meme > 12) problems.push(`pack has ${meme} meme items — the meme group is meant to stay small (≤12)`);
  return problems;
}
