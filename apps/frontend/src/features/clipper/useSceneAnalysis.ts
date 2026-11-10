"use client";

import { useEffect, useState } from "react";
import { detectSceneChanges, type LumaFrame, type SceneChange } from "./analysis";

/**
 * Browser glue for scene-change detection (slice 5.3) — deliberately thin and separate
 * from the pure core in analysis.ts. A hidden <video> is seeked through the source at a
 * fixed interval, each frame is drawn into a small canvas and reduced to a grayscale
 * luma plane (64×36), and the planes go to the tested pure core. Sampling is capped so
 * a long video costs at most MAX_SAMPLES seeks; results are cached per video id.
 * Mirrors the useFilmstrip pattern. Returns empty cuts while loading / on any decode
 * failure — the clipper then ranks on transcript + silence alone and says so.
 */

const LUMA_W = 64;
const LUMA_H = 36;
const MAX_SAMPLES = 90;
const MIN_INTERVAL_MS = 500;

const cache = new Map<string, SceneChange[]>();

export function useSceneAnalysis(
  videoId: string | null | undefined,
  url: string | null | undefined,
  durationMs: number,
): { cuts: SceneChange[]; state: "idle" | "loading" | "ready" | "unavailable" } {
  const [cuts, setCuts] = useState<SceneChange[]>(() => (videoId ? cache.get(videoId) ?? [] : []));
  const [state, setState] = useState<"idle" | "loading" | "ready" | "unavailable">(
    videoId && cache.has(videoId) ? "ready" : "idle",
  );

  useEffect(() => {
    if (!videoId || !url || durationMs <= 0) return;
    const hit = cache.get(videoId);
    if (hit) {
      setCuts(hit);
      setState("ready");
      return;
    }
    let alive = true;
    setState("loading");
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.preload = "auto";
    v.playsInline = true;
    v.src = url;

    const seek = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("seek timeout")), 8000);
        v.onseeked = () => { clearTimeout(t); resolve(); };
        v.onerror = () => { clearTimeout(t); reject(new Error("decode error")); };
        v.currentTime = ms / 1000;
      });

    (async () => {
      await new Promise<void>((resolve, reject) => {
        if (v.readyState >= 1) return resolve();
        v.onloadedmetadata = () => resolve();
        v.onerror = () => reject(new Error("load error"));
      });
      const c = document.createElement("canvas");
      c.width = LUMA_W;
      c.height = LUMA_H;
      const g = c.getContext("2d", { willReadFrequently: true })!;
      const intervalMs = Math.max(MIN_INTERVAL_MS, Math.ceil(durationMs / MAX_SAMPLES));
      const frames: LumaFrame[] = [];
      for (let ms = 0; ms < durationMs && alive; ms += intervalMs) {
        await seek(ms);
        g.drawImage(v, 0, 0, LUMA_W, LUMA_H);
        const px = g.getImageData(0, 0, LUMA_W, LUMA_H).data;
        const luma = new Uint8Array(LUMA_W * LUMA_H);
        for (let i = 0; i < luma.length; i++) {
          // Rec. 601 luma from the RGBA quad
          luma[i] = Math.round(0.299 * px[i * 4]! + 0.587 * px[i * 4 + 1]! + 0.114 * px[i * 4 + 2]!);
        }
        frames.push({ atMs: ms, luma });
      }
      if (!alive) return;
      const found = detectSceneChanges(frames).cuts;
      cache.set(videoId, found);
      setCuts(found);
      setState("ready");
    })().catch(() => alive && setState("unavailable"));

    return () => {
      alive = false;
      v.removeAttribute("src");
      v.load();
    };
  }, [videoId, url, durationMs]);

  return { cuts, state };
}
