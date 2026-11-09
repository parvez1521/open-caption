"use client";

import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import type { MediaAssetKind } from "./mediaAssets";

/**
 * Metadata probing for media-bin imports, using the same stack the upload flow probes with:
 * Mediabunny (`Input` over a BlobSource, as in features/upload/prepareVideo.ts) for duration and
 * dimensions of video/audio, the platform image decoder for stills, a <video> frame capture for
 * thumbnails, and WebAudio decode for audio peaks. Every probe is best-effort per file: a file that
 * can't be probed still imports with whatever metadata could be read (duration/dimensions null),
 * and a hard read failure surfaces as that file's own error — never the whole batch's.
 */

export interface ProbedMedia {
  durationMs: number | null;
  width: number | null;
  height: number | null;
  thumb: Blob | null;
  peaks: number[] | null;
}

const empty: ProbedMedia = { durationMs: null, width: null, height: null, thumb: null, peaks: null };

async function probeAv(file: File, kind: "video" | "audio"): Promise<ProbedMedia> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const [video, audio, durationS] = await Promise.all([
    input.getPrimaryVideoTrack().catch(() => null),
    input.getPrimaryAudioTrack().catch(() => null),
    input.computeDuration().catch(() => Number.NaN),
  ]);
  if (kind === "video" && !video) throw new Error("That file has no video track in it.");
  if (kind === "audio" && !audio) throw new Error("That file has no audio track in it.");
  const durationMs = Number.isFinite(durationS) ? Math.round(durationS * 1000) : null;
  const out: ProbedMedia = {
    ...empty,
    durationMs,
    width: video?.displayWidth ?? null,
    height: video?.displayHeight ?? null,
  };
  if (kind === "video") out.thumb = await captureVideoFrame(file, durationMs).catch(() => null);
  if (kind === "audio") out.peaks = await audioPeaks(file).catch(() => null);
  return out;
}

/** Seek a throwaway <video> to ~10% in and draw one frame — the bin's thumbnail for a video asset. */
function captureVideoFrame(file: File, durationMs: number | null): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    const done = (b: Blob | null) => {
      clearTimeout(t);
      URL.revokeObjectURL(url);
      v.removeAttribute("src");
      v.load();
      resolve(b);
    };
    const t = setTimeout(() => done(null), 5000);
    v.onloadedmetadata = () => {
      const target = Math.min(0.6, (durationMs ? durationMs / 1000 : v.duration || 0) * 0.1);
      try { v.currentTime = target; } catch { done(null); }
    };
    v.onseeked = () => {
      try {
        if (!v.videoWidth) return done(null);
        const w = 320;
        const h = Math.max(1, Math.round((w * v.videoHeight) / v.videoWidth));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d")!.drawImage(v, 0, 0, w, h);
        c.toBlob((b) => done(b), "image/jpeg", 0.72);
      } catch { done(null); }
    };
    v.onerror = () => done(null);
    v.src = url;
  });
}

/** 64 normalised peaks from a WebAudio decode — drawn as the audio row's waveform tile. */
async function audioPeaks(file: File): Promise<number[] | null> {
  const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const ch = buf.getChannelData(0);
    const N = 64;
    const per = Math.max(1, Math.floor(ch.length / N));
    const peaks: number[] = [];
    for (let i = 0; i < N; i++) {
      let m = 0;
      for (let j = i * per; j < Math.min(ch.length, (i + 1) * per); j += 16) m = Math.max(m, Math.abs(ch[j]!));
      peaks.push(Math.round(m * 1000) / 1000);
    }
    return peaks;
  } finally {
    void ctx.close().catch(() => undefined);
  }
}

async function probeImage(file: File): Promise<ProbedMedia> {
  try {
    const bmp = await createImageBitmap(file);
    const out = { ...empty, width: bmp.width, height: bmp.height };
    bmp.close();
    return out;
  } catch {
    // some formats (e.g. SVG) don't decode through createImageBitmap in every browser — try <img>
    const url = URL.createObjectURL(file);
    try {
      const dims = await new Promise<{ w: number; h: number } | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve(null);
        img.src = url;
      });
      return dims ? { ...empty, width: dims.w, height: dims.h } : { ...empty };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function probeMediaFile(file: File, kind: MediaAssetKind): Promise<ProbedMedia> {
  if (kind === "image") return probeImage(file);
  return probeAv(file, kind);
}
