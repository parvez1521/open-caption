"use client";

import { uploadLimitLabel } from "@/lib/billing/pricingDisplay";

/**
 * Direct-link fetch for the Studio upload: paste a link to a video file and
 * get back the File the upload pipeline already knows how to handle — the
 * same prepareVideo -> uploadVideo -> transcribe path a picked file takes.
 * No server is involved; the browser downloads the file itself.
 *
 * What works: a direct link to a video file (MP4, MOV, WebM, MKV) on a host
 * that allows cross-origin downloads. What does not: YouTube, Instagram and
 * TikTok links — those hosts share no direct file, so there is nothing to
 * fetch. Plain errors, one per cause:
 * - bad URL (not http/https) -> "Paste a full link..."
 * - a link from a host that never shares files -> "Links from ... don't share the video file."
 * - dead/unreachable link -> "Couldn't reach this link..."
 * - host answers but blocks cross-origin reads -> "This link blocks downloads..."
 * - HTTP error status -> "This link couldn't be opened (HTTP n)..."
 * - not a video (content-type, then prepareVideo) -> "This link isn't a video file."
 * - over the size cap -> the same over-limit line as uploads.
 *
 * A failed fetch can't tell a dead link from a CORS block on its own, so a
 * failure is probed once with a no-cors request: an opaque success means the
 * host is up and CORS is the block; a second failure means the link is dead.
 *
 * History: /transcribe had this same fetch (fetchTranscribeLink) and the
 * owner removed link mode from that page in 2026-11-12 (upload-only). This
 * helper is the Studio upload's version — same behaviour, but the size cap
 * comes from the project's plan limits instead of the transcribe page's
 * frozen Free limits, and audio-only links are refused here because the
 * Studio needs a video track.
 */

/** Media extension by served content-type, for links whose URL carries no filename. */
const LINK_EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/x-matroska": ".mkv",
};

/** Hosts that serve watch pages, not video files — named plainly instead of failing as a mystery. */
const NO_FILE_HOSTS = ["youtube.com", "youtu.be", "music.youtube.com", "instagram.com", "tiktok.com"];

function knownNoFileHost(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  for (const h of NO_FILE_HOSTS) {
    if (host === h || host.endsWith(`.${h}`)) return h;
  }
  return null;
}

/** A filename for a fetched file: the URL's last segment when it looks like a video, else a plain name. */
export function linkFileName(url: URL, contentType: string | null): string {
  const last = decodeURIComponent(url.pathname.split("/").pop() ?? "").trim();
  if (last && /\.(mp4|mov|webm|mkv)$/i.test(last)) return last;
  const ext = contentType ? LINK_EXT_BY_TYPE[contentType.split(";")[0]!.trim().toLowerCase()] : undefined;
  return `linked-video${ext ?? ".mp4"}`;
}

export interface MediaLinkLimits {
  maxBytes: number;
}

/**
 * Fetch a direct video-file link in the browser and return it as a File.
 * The caller feeds the File into the normal upload path (prepareVideo),
 * which still checks duration, readability and conversion.
 */
export async function fetchMediaLink(rawUrl: string, limits: MediaLinkLimits, signal?: AbortSignal): Promise<File> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("Paste a full link starting with http:// or https://.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Paste a full link starting with http:// or https://.");
  }
  const noFile = knownNoFileHost(url);
  if (noFile) {
    throw new Error(`Links from ${noFile} don't share the video file — download it first, then upload it.`);
  }
  const overLimit = () => `This file is over the ${uploadLimitLabel(limits.maxBytes)} limit. Trim it and try again.`;
  // Pre-check the size before downloading the body (best effort: some hosts refuse HEAD, and then
  // the GET below still enforces the cap from its own headers and the final file size).
  try {
    const head = await fetch(url.toString(), { method: "HEAD", signal });
    const len = head.headers.get("content-length");
    if (head.ok && len !== null && Number(len) > limits.maxBytes) throw new Error(overLimit());
  } catch (e) {
    if (e instanceof Error && e.message === overLimit()) throw e;
    // HEAD blocked or failed: continue to the GET, which enforces the cap itself.
  }
  let res: Response;
  try {
    res = await fetch(url.toString(), { signal });
  } catch (e) {
    if (signal?.aborted || (e as { name?: string }).name === "AbortError") throw e;
    try {
      await fetch(url.toString(), { method: "GET", mode: "no-cors", signal });
    } catch {
      throw new Error("Couldn't reach this link — check it and try again.");
    }
    throw new Error("This link blocks downloads — download the file and upload it instead.");
  }
  if (!res.ok) throw new Error(`This link couldn't be opened (HTTP ${res.status}). Check the link and try again.`);
  const type = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (type && !type.startsWith("video/")) {
    throw new Error("This link isn't a video file.");
  }
  const len = res.headers.get("content-length");
  if (len !== null && Number(len) > limits.maxBytes) throw new Error(overLimit());
  const blob = await res.blob();
  const file = new File([blob], linkFileName(url, type || null), { type: type || blob.type });
  if (file.size === 0) throw new Error("This link is empty.");
  if (file.size > limits.maxBytes) throw new Error(overLimit());
  return file;
}
