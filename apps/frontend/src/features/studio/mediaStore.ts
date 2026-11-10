"use client";

import type { MediaAssetKind } from "./mediaAssets";

/**
 * The media bin's bytes: a sibling `assets` store in the SAME IndexedDB database the device-video
 * store uses (`captionseasy-videos`, see features/upload/localVideos.ts — the DB version is shared,
 * so both modules open it at v3). Records are keyed by asset id and carry their projectId; listing
 * filters by project. Bytes never leave the device, exactly like the project video: reopening the
 * project on another browser/device shows an empty bin there.
 */

const DB = "captionseasy-videos";
const ASSETS = "assets";

export interface MediaAssetRecord {
  id: string;
  projectId: string;
  kind: MediaAssetKind;
  name: string;
  mime: string;
  size: number;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  /** the file itself */
  blob: Blob;
  /** a small JPEG still for video/image rows (null for audio) */
  thumb: Blob | null;
  /** normalised waveform peaks for audio rows (null otherwise) */
  peaks: number[] | null;
  createdAt: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ["videos", "compat", "progress", ASSETS]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("This browser can't store media (private mode?)."));
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(ASSETS, mode);
        const req = fn(tx.objectStore(ASSETS));
        tx.oncomplete = () => { db.close(); resolve(req.result); };
        tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Couldn't save the media in this browser.")); };
      }),
  );
}

export async function listProjectAssets(projectId: string): Promise<MediaAssetRecord[]> {
  try {
    const all = (await run("readonly", (s) => s.getAll())) as MediaAssetRecord[];
    return all.filter((a) => a.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

/** Every asset in the bin, across all projects, newest first — the Media Library's view of this device. */
export async function listAllAssets(): Promise<MediaAssetRecord[]> {
  try {
    const all = (await run("readonly", (s) => s.getAll())) as MediaAssetRecord[];
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function saveAsset(rec: MediaAssetRecord): Promise<void> {
  void navigator.storage?.persist?.().catch(() => false);
  try {
    await run("readwrite", (s) => s.put(rec));
  } catch (e) {
    const full = e instanceof DOMException && e.name === "QuotaExceededError";
    throw new Error(full ? "Your device is out of space for this file. Free some space and try again." : e instanceof Error ? e.message : "Couldn't save the media in this browser.");
  }
}

export async function deleteAsset(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id)).catch(() => undefined);
}

/**
 * Strip a record's embedded PREVIEW data (thumbnail Blob + waveform peaks —
 * see derivedCache.ts) in place, for the derived-cache cleanup. The record
 * and its own media bytes are untouched; only the re-creatable preview
 * fields are nulled, exactly the shape a probe that found nothing writes.
 * Best-effort like deleteAsset: a failure leaves the record as it was.
 */
export async function clearAssetPreviews(id: string): Promise<void> {
  try {
    const rec = (await run("readonly", (s) => s.get(id))) as MediaAssetRecord | undefined;
    if (!rec || (!rec.thumb && !rec.peaks)) return;
    await run("readwrite", (s) => s.put({ ...rec, thumb: null, peaks: null }));
  } catch {
    // best-effort — the cleanup re-measures afterwards, so a miss shows up honestly there
  }
}
