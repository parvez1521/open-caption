"use client";

import { newId } from "@capseasy/shared";
import { validateMediaFile, type AssetLicenceRecord } from "./mediaAssets";
import { probeMediaFile, type ProbedMedia } from "./mediaProbe";
import { saveAsset, type MediaAssetRecord } from "./mediaStore";
import { licenceRecordForStockItem, stockItemUrl, type StockSfxItem } from "./stockCatalogue";
import type { PixabayTrack } from "./pixabay";
import { pixabayLicenceRecord } from "./pixabay";

/**
 * Stock → media-bin handoff (Phase 8, A10). A stock import lands in the bin
 * EXACTLY the way a user upload does (useMediaAssets.importFiles): validate
 * (mediaAssets) → probe (mediaProbe) → saveAsset (mediaStore), producing an
 * ordinary MediaAssetRecord the Audio panel / timeline / export paths can't
 * tell apart from an upload — plus the one extra field an upload doesn't
 * have: the licence record, stored with the asset.
 *
 * The core takes its probe/save/id/clock through a seam so the handoff is
 * unit-tested without IndexedDB or Mediabunny; the production adapters below
 * wire the real ones.
 */

export interface StockImportDeps {
  probe: (file: File) => Promise<ProbedMedia>;
  save: (rec: MediaAssetRecord) => Promise<void>;
  newId: () => string;
  now: () => number;
}

export const realStockImportDeps: StockImportDeps = {
  probe: (file) => probeMediaFile(file, "audio"),
  save: saveAsset,
  newId,
  now: () => Date.now(),
};

export interface StockImportInput {
  projectId: string;
  blob: Blob;
  /** the file name the asset is stored under in the bin */
  name: string;
  licence: AssetLicenceRecord;
}

/** Validate → probe → save one audio blob as a bin asset carrying its licence record. */
export async function importAudioToBin(deps: StockImportDeps, input: StockImportInput): Promise<MediaAssetRecord> {
  const file = input.blob instanceof File ? input.blob : new File([input.blob], input.name, { type: input.blob.type });
  const v = validateMediaFile({ name: input.name, size: file.size, type: file.type });
  if (!v.ok) throw new Error(v.error);
  if (v.kind !== "audio") throw new Error("That stock file is not an audio file.");
  const probed = await deps.probe(file);
  const rec: MediaAssetRecord = {
    id: deps.newId(),
    projectId: input.projectId,
    kind: "audio",
    name: input.name,
    mime: file.type,
    size: file.size,
    durationMs: probed.durationMs,
    width: null,
    height: null,
    blob: file,
    thumb: null,
    peaks: probed.peaks,
    licence: input.licence,
    createdAt: deps.now(),
  };
  await deps.save(rec);
  return rec;
}

type FetchFn = (url: string) => Promise<Response>;

/** "Add to media bin" for a bundled starter-pack item: fetch the static file, then the shared handoff. */
export async function importStockItemToBin(
  projectId: string,
  item: StockSfxItem,
  deps: StockImportDeps = realStockImportDeps,
  fetchFn: FetchFn = (url) => fetch(url),
): Promise<MediaAssetRecord> {
  const res = await fetchFn(stockItemUrl(item));
  if (!res.ok) throw new Error(`Couldn't load the bundled sound (HTTP ${res.status}).`);
  const blob = await res.blob();
  return importAudioToBin(deps, {
    projectId,
    blob,
    name: item.file,
    licence: licenceRecordForStockItem(item),
  });
}

/**
 * Import for a Pixabay track: download the track's audio file from Pixabay's
 * CDN (the URL the API returned — the only download target), then the shared
 * handoff with the per-track Pixabay licence record built at import time.
 */
export async function importPixabayTrackToBin(
  projectId: string,
  track: PixabayTrack,
  retrievedAt: string,
  deps: StockImportDeps = realStockImportDeps,
  fetchFn: FetchFn = (url) => fetch(url),
): Promise<MediaAssetRecord> {
  if (!track.audioUrl) throw new Error("That track has no downloadable audio file in the API response.");
  const res = await fetchFn(track.audioUrl);
  if (!res.ok) throw new Error(`Couldn't download that track (HTTP ${res.status}).`);
  const blob = await res.blob();
  const ext = /\.mp3($|\?)/i.test(track.audioUrl) ? "mp3" : /\.wav($|\?)/i.test(track.audioUrl) ? "wav" : /\.ogg($|\?)/i.test(track.audioUrl) ? "ogg" : "mp3";
  const safeTitle = track.title.replace(/[\\/:*?"<>|]+/g, " ").trim().replace(/\s+/g, " ").slice(0, 80) || `Pixabay track ${track.id}`;
  return importAudioToBin(deps, {
    projectId,
    blob,
    name: `${safeTitle}.${ext}`,
    licence: pixabayLicenceRecord(track, retrievedAt),
  });
}
