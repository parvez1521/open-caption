"use client";

import { useEffect, useState } from "react";

const cache = new Map<string, Float32Array>();
const MAX_BYTES = 300 * 1024 * 1024;
export const PEAKS_PER_SECOND = 50;

/** Scale a peak train so its loudest peak is 1 (the Waveform canvas's contract). */
function normalise(peaks: Float32Array): Float32Array {
  let max = 0;
  for (let i = 0; i < peaks.length; i++) if (peaks[i]! > max) max = peaks[i]!;
  if (max <= 0) return peaks;
  const out = new Float32Array(peaks.length);
  for (let i = 0; i < peaks.length; i++) out[i] = peaks[i]! / max;
  return out;
}

/** Peaks from a WebAudio decode of the whole file (the original path). Null on ANY failure. */
async function peaksViaWebAudio(buf: ArrayBuffer): Promise<Float32Array | null> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const ch = audio.getChannelData(0);
    const n = Math.max(1, Math.ceil(audio.duration * PEAKS_PER_SECOND));
    const step = Math.max(1, Math.floor(ch.length / n));
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let peak = 0;
      const end = Math.min(ch.length, (i + 1) * step);
      for (let j = i * step; j < end; j += 4) {
        const v = Math.abs(ch[j]!);
        if (v > peak) peak = v;
      }
      out[i] = peak;
    }
    return normalise(out);
  } catch {
    return null;
  } finally {
    void ctx.close().catch(() => undefined);
  }
}

/**
 * Peaks for the timeline. First tried through WebAudio's decodeAudioData; when that rejects the
 * file, the Mediabunny decoder the audio mix already uses (audio/decode.ts) gets a turn.
 *
 * Phase 9 W2, quirk (b): decodeAudioData demuxes the WHOLE container and refuses files whose
 * video track it cannot handle (e.g. an HEVC MP4) even when the audio track is perfectly fine —
 * the clip plays, transcription (Mediabunny) reads it, but the waveform reported the file as
 * unusable. Mediabunny decodes just the audio track through WebCodecs, so it succeeds for
 * exactly those files. "unavailable" now means neither decoder could read the audio (or the
 * file is over the size cap) — not "WebAudio said no".
 */
export async function loadWaveformPeaks(blob: Blob): Promise<Float32Array | null> {
  const viaWebAudio = await peaksViaWebAudio(await blob.arrayBuffer());
  if (viaWebAudio) return viaWebAudio;
  try {
    const { decodeAudioPeaks } = await import("./audio/decode");
    const viaMediabunny = await decodeAudioPeaks(blob, 1000 / PEAKS_PER_SECOND);
    return viaMediabunny && viaMediabunny.length > 0 ? normalise(viaMediabunny) : null;
  } catch {
    return null;
  }
}

/**
 * Audio peaks for the timeline, decoded in the browser from the playable video URL.
 * Cached per video; skipped for very large files so the editor never stalls. Returns null while loading.
 */
export function useWaveform(videoId: string | null | undefined, url: string | null | undefined, sizeBytes: number | null | undefined) {
  const [peaks, setPeaks] = useState<Float32Array | null>(() => (videoId ? cache.get(videoId) ?? null : null));
  const [state, setState] = useState<"idle" | "loading" | "ready" | "unavailable">(videoId && cache.has(videoId) ? "ready" : "idle");

  useEffect(() => {
    if (!videoId || !url) return;
    if (cache.has(videoId)) {
      setPeaks(cache.get(videoId)!);
      setState("ready");
      return;
    }
    if (sizeBytes && sizeBytes > MAX_BYTES) {
      setState("unavailable");
      return;
    }
    let alive = true;
    const ac = new AbortController();
    setState("loading");
    (async () => {
      const blob = await (await fetch(url, { signal: ac.signal })).blob();
      const out = await loadWaveformPeaks(blob);
      if (!out) throw new Error("no readable audio");
      cache.set(videoId, out);
      if (alive) {
        setPeaks(out);
        setState("ready");
      }
    })().catch(() => alive && setState("unavailable"));
    return () => {
      alive = false;
      ac.abort();
    };
  }, [videoId, url, sizeBytes]);

  return { peaks, state };
}
