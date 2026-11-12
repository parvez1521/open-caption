/**
 * Naming for a media file fetched from a link (Transcribe link mode). Kept in
 * its own module with no browser or client-only imports so both the browser
 * side (features/transcribe/standalone.ts) and the same-origin proxy route
 * (app/api/v1/transcribe/proxy/route.ts) can use the one implementation.
 */

/** Media extension by served content-type, for links whose URL carries no filename. */
export const LINK_EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/x-matroska": ".mkv",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/wav": ".wav",
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
};

/** A filename for a fetched file: the URL's last segment when it looks like media, else a plain name. */
export function linkFileName(url: URL, contentType: string | null): string {
  const last = decodeURIComponent(url.pathname.split("/").pop() ?? "").trim();
  if (last && /\.(mp4|mov|webm|mkv|mp3|m4a|wav|ogg)$/i.test(last)) return last;
  const ext = contentType ? LINK_EXT_BY_TYPE[contentType.split(";")[0]!.trim().toLowerCase()] : undefined;
  return `transcribed-file${ext ?? ".mp4"}`;
}
