"use client";

/**
 * Videos live on the user's device, not in our storage: the file is kept in this browser's IndexedDB, keyed by
 * the video id. Supabase only holds the captions and settings. Reopening on another device (or after the
 * browser's data is cleared) asks the user to pick the same file again.
 *
 * Besides the video, three small things are kept here so a closed tab or a crash never costs the work:
 * - `compat`: a browser-friendly copy of a video the picture decoder can't read (made after captioning, for MP4 export);
 * - `progress`: the words already written by the speech model, so a retry continues where it stopped.
 */

const DB = "captionseasy-videos";
const VIDEOS = "videos";
const COMPAT = "compat";
const PROGRESS = "progress";
/** the studio media bin's store (features/studio/mediaStore.ts) — same database, shared version */
const ASSETS = "assets";

interface Entry { id: string; file: Blob; name: string; size: number; savedAt: number }

export interface TranscriptProgress {
  id: string; // video id
  modelKey: string;
  audioEndMs: number;
  durationMs: number;
  words: { text: string; startMs: number; endMs: number }[];
  savedAt: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [VIDEOS, COMPAT, PROGRESS, ASSETS]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("This browser can't store videos (private mode?)."));
  });
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error("Couldn't save the video in this browser."));
        };
      }),
  );
}

/** Is there room for this file? Fails early and in plain words instead of half-way through writing it. */
export async function ensureRoomFor(bytes: number) {
  try {
    const e = await navigator.storage?.estimate?.();
    if (e?.quota != null && e.usage != null && e.quota - e.usage < bytes * 1.1) {
      throw new Error("Your device is out of space for this video. Free some space and try again.");
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Your device")) throw err;
  }
}

export async function saveLocalVideo(id: string, file: File | Blob) {
  // ask the browser not to evict our videos under storage pressure (granted silently on most browsers)
  void navigator.storage?.persist?.().catch(() => false);
  const entry: Entry = { id, file, name: file instanceof File ? file.name : "video.mp4", size: file.size, savedAt: Date.now() };
  try {
    await run(VIDEOS, "readwrite", (s) => s.put(entry));
  } catch (e) {
    const full = e instanceof DOMException && e.name === "QuotaExceededError";
    throw new Error(full ? "Your device is out of space for this video. Free some space and try again." : e instanceof Error ? e.message : "Couldn't save the video in this browser.");
  }
}

export async function getLocalVideo(id: string): Promise<Blob | null> {
  try {
    const e = (await run(VIDEOS, "readonly", (s) => s.get(id))) as Entry | undefined;
    return e?.file ?? null;
  } catch {
    return null;
  }
}

export async function saveCompat(id: string, file: Blob) {
  await run(COMPAT, "readwrite", (s) => s.put({ id, file, name: "compat.mp4", size: file.size, savedAt: Date.now() } satisfies Entry)).catch(() => undefined);
}

export async function getCompat(id: string): Promise<Blob | null> {
  try {
    const e = (await run(COMPAT, "readonly", (s) => s.get(id))) as Entry | undefined;
    return e?.file ?? null;
  } catch {
    return null;
  }
}

export async function saveProgress(p: TranscriptProgress) {
  await run(PROGRESS, "readwrite", (s) => s.put(p)).catch(() => undefined);
}

export async function getProgress(id: string): Promise<TranscriptProgress | null> {
  try {
    return ((await run(PROGRESS, "readonly", (s) => s.get(id))) as TranscriptProgress | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function deleteProgress(id: string) {
  await run(PROGRESS, "readwrite", (s) => s.delete(id)).catch(() => undefined);
}

export async function deleteLocalVideo(id: string) {
  await Promise.all([
    run(VIDEOS, "readwrite", (s) => s.delete(id)).catch(() => undefined),
    run(COMPAT, "readwrite", (s) => s.delete(id)).catch(() => undefined),
    run(PROGRESS, "readwrite", (s) => s.delete(id)).catch(() => undefined),
  ]);
}
