"use client";

import type React from "react";
import { CaptionedVideo, type CaptionedVideoInput } from "@capseasy/compositions";
import { framesForDurationMs } from "@capseasy/shared";

/**
 * Video export without the Companion: the SAME composition the preview shows, rendered frame by frame in this tab
 * (@remotion/web-renderer: WebCodecs + Mediabunny), then downloaded. Nothing is uploaded.
 *
 * Two containers are offered, both OPAQUE (the renderer is always called without `transparent`):
 * MP4/H.264 (the original path) and WebM/VP9 (added for Motion Studio standalone exports).
 * Transparent WebM would need the renderer's alpha path, which this app does not use — see
 * features/motion/alphaCapability.ts for the capability probe and why it stays off.
 */

export interface BrowserExportJob {
  input: CaptionedVideoInput;
  /** OUTPUT width/height: the chosen export resolution resolved from the project's aspect (short-edge rule) */
  width: number;
  height: number;
  /** OUTPUT frame rate: the chosen export fps (30 or 60), NOT necessarily the source video's fps */
  fps: number;
  durationMs: number;
  range?: { startMs: number; endMs: number };
  quality: "high" | "balanced" | "small";
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

export type BrowserExportContainer = "mp4" | "webm";
export type BrowserExportVideoCodec = "h264" | "vp9";

export interface BrowserVideoExportJob extends BrowserExportJob {
  container: BrowserExportContainer;
  videoCodec: BrowserExportVideoCodec;
}

const LICENSE = process.env.NEXT_PUBLIC_REMOTION_LICENSE_KEY || "free-license";
const QUALITY = { high: "very-high", balanced: "high", small: "medium" } as const;

/** Can this browser encode video at this size in this container/codec? (Chrome, Edge, Safari 17+, recent Firefox.) */
export async function canExportVideoInBrowser(opts: {
  container: BrowserExportContainer;
  videoCodec: BrowserExportVideoCodec;
  width: number;
  height: number;
}): Promise<{ ok: boolean; reason?: string }> {
  if (typeof window === "undefined" || typeof VideoEncoder === "undefined") return { ok: false, reason: "This browser can't encode video. Use Chrome, Edge or Safari." };
  try {
    const { canRenderMediaOnWeb } = await import("@remotion/web-renderer");
    const r = await canRenderMediaOnWeb({ container: opts.container, videoCodec: opts.videoCodec, width: opts.width, height: opts.height });
    return r.canRender ? { ok: true } : { ok: false, reason: r.issues.map((i) => i.message).join(" ") || "Not supported in this browser." };
  } catch {
    return { ok: true }; // the render itself reports real problems
  }
}

/** Can this browser encode H.264 MP4 at this size? (Chrome, Edge, Safari 17+, recent Firefox.) */
export async function canExportInBrowser(width: number, height: number): Promise<{ ok: boolean; reason?: string }> {
  return canExportVideoInBrowser({ container: "mp4", videoCodec: "h264", width, height });
}

export async function exportVideoInBrowser(job: BrowserVideoExportJob): Promise<Blob> {
  const { renderMediaOnWeb } = await import("@remotion/web-renderer");
  // the composition is authored AT the output size/rate: captions are drawn natively for the chosen
  // resolution, and because all timing is ms-based, durationInFrames = ms x fps keeps every caption
  // at the same instant at 60fps as at 30fps (the source video's frames simply repeat if it is
  // lower-fps — the web renderer samples it; nothing is interpolated).
  const durationInFrames = framesForDurationMs(job.durationMs, job.fps);
  const frame = (ms: number) => Math.min(durationInFrames - 1, Math.max(0, Math.round((ms / 1000) * job.fps)));
  const result = await renderMediaOnWeb({
    composition: {
      id: "CaptionedVideo",
      component: CaptionedVideo as unknown as React.ComponentType<Record<string, unknown>>,
      width: job.width,
      height: job.height,
      fps: job.fps,
      durationInFrames,
    },
    inputProps: { ...job.input, videoEngine: "media" } as Record<string, unknown>,
    container: job.container,
    videoCodec: job.videoCodec,
    videoBitrate: QUALITY[job.quality],
    frameRange: job.range ? [frame(job.range.startMs), frame(job.range.endMs)] : null,
    signal: job.signal ?? null,
    onProgress: (p) => job.onProgress?.(p.progress),
    licenseKey: LICENSE,
    isProduction: process.env.NODE_ENV === "production",
    delayRenderTimeoutInMilliseconds: 60_000,
  });
  return result.getBlob();
}

export async function exportMp4InBrowser(job: BrowserExportJob): Promise<Blob> {
  return exportVideoInBrowser({ ...job, container: "mp4", videoCodec: "h264" });
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
