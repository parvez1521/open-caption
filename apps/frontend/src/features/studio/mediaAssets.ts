/**
 * Media-bin file rules (pure): what counts as video / audio / image, and how big a file may be.
 * Kept free of DOM and storage so the validation can be unit-tested; probing and IndexedDB live in
 * mediaProbe.ts / mediaStore.ts.
 */

export type MediaAssetKind = "video" | "audio" | "image";

/**
 * Where a media-bin asset came from, licence-wise (Phase 8, A10). A record is
 * stored WITH the asset (mediaStore) for anything that did not come from the
 * user's own files: a bundled starter-pack item or a Pixabay browse-import.
 * User uploads carry no record (null) — there is nothing to attribute.
 * `contentIdRegistered` is Pixabay-only: true/false when the source data
 * actually says, null when it does not say either way (the UI must then use
 * the standing "check the track page" note, never claim the track is clear).
 */
export interface AssetLicenceRecord {
  source: "kenney" | "freesound" | "pixabay";
  /** the work's title at the source (for a pack item: pack name + original file name) */
  title: string;
  author: string | null;
  /** the page the work came from — where a reader can re-check the licence themselves */
  sourceUrl: string;
  /** licence name as the source states it, e.g. "CC0 1.0" / "Pixabay Content License" */
  licence: string;
  /** ISO date (yyyy-mm-dd) the file was retrieved / imported */
  retrievedAt: string;
  /** honest format note when what we hold differs from the source's headline format */
  formatNote?: string;
  contentIdRegistered?: boolean | null;
}

/** One-line licence summary for an asset row: "Kenney · CC0 1.0" / "Pixabay Content License". */
export function describeAssetLicence(l: AssetLicenceRecord): string {
  const who = l.author ?? (l.source === "pixabay" ? "Pixabay" : l.source === "kenney" ? "Kenney" : "Freesound");
  return `${who} · ${l.licence}`;
}

/** Per-file caps for the on-device bin: generous for video, small for stills. Over the cap the file
 *  is refused with an honest message (it is never truncated or silently dropped). */
export const MEDIA_SIZE_CAPS: Record<MediaAssetKind, number> = {
  video: 2 * 1024 * 1024 * 1024, // 2 GiB
  audio: 200 * 1024 * 1024, // 200 MiB
  image: 25 * 1024 * 1024, // 25 MiB
};

const EXT_KIND: Record<string, MediaAssetKind> = {
  mp4: "video", mov: "video", webm: "video", mkv: "video", m4v: "video", avi: "video",
  mp3: "audio", wav: "audio", m4a: "audio", aac: "audio", ogg: "audio", oga: "audio", flac: "audio", opus: "audio",
  png: "image", jpg: "image", jpeg: "image", webp: "image", gif: "image", avif: "image", bmp: "image", svg: "image",
};

/** Kind by MIME type first (browsers know it for picked files), then by extension. Null = not media we take. */
export function mediaKindFor(name: string, mime: string): MediaAssetKind | null {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("image/")) return "image";
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return EXT_KIND[ext] ?? null;
}

export type MediaValidation = { ok: true; kind: MediaAssetKind } | { ok: false; error: string };

export function validateMediaFile(file: { name: string; size: number; type: string }): MediaValidation {
  const kind = mediaKindFor(file.name, file.type);
  if (!kind) return { ok: false, error: "Not a video, audio or image file." };
  if (file.size <= 0) return { ok: false, error: "That file is empty." };
  const cap = MEDIA_SIZE_CAPS[kind];
  if (file.size > cap) {
    return { ok: false, error: `Too large for the media bin: a ${kind} file can be up to ${formatBytes(cap)} here (this one is ${formatBytes(file.size)}).` };
  }
  return { ok: true, kind };
}

/**
 * Image-field rule (avatar / QR uploads in Motion Studio + the Studio overlay
 * editor): the generic bin validator accepts video and audio too, but an image
 * field must refuse them BEFORE the file is probed/stored — the picker's
 * `accept="image/*"` is only a hint and can be bypassed in the file dialog.
 * Kind comes from validateMediaFile (MIME first, extension fallback, size cap);
 * the probe (mediaProbe) then has to actually decode the image before it is stored.
 */
export function validateImageFile(file: { name: string; size: number; type: string }): MediaValidation {
  const v = validateMediaFile(file);
  if (!v.ok) return v;
  if (v.kind !== "image") {
    return { ok: false, error: `That file is a ${v.kind} file — this field needs an image (PNG, JPG, WebP, GIF or SVG).` };
  }
  return v;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10} ${units[u]}`;
}

/** Short metadata line for a bin row: "0:42 · 1080 × 1920 · 12.4 MB" (parts omitted when unknown). */
export function describeAssetMeta(a: { kind: MediaAssetKind; durationMs?: number | null; width?: number | null; height?: number | null; size: number }): string {
  const parts: string[] = [];
  if (a.durationMs != null && a.kind !== "image") {
    const s = Math.round(a.durationMs / 1000);
    parts.push(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
  }
  if (a.width && a.height) parts.push(`${a.width} × ${a.height}`);
  parts.push(formatBytes(a.size));
  return parts.join(" · ");
}
