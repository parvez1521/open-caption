/**
 * Media-bin file rules (pure): what counts as video / audio / image, and how big a file may be.
 * Kept free of DOM and storage so the validation can be unit-tested; probing and IndexedDB live in
 * mediaProbe.ts / mediaStore.ts.
 */

export type MediaAssetKind = "video" | "audio" | "image";

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
