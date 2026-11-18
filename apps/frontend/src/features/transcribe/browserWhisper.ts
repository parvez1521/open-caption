"use client";

import { isModelSaved, networkAllowsPrefetch, prefetchModel, likelySpeechLanguage, webgpuMarkedBroken, type SpeechLanguage } from "./runtime";
import type { In, Out } from "./whisper.worker";

/**
 * Captions made inside the tab: the speech model runs in a worker (whisper.worker.ts). This file owns that worker
 * and the small helpers around it; the run itself (progress, partial captions, saving, resuming) lives in session.ts.
 */

export type BrowserStatus = { stage: "audio" | "download" | "load" | "transcribe" | "save"; progress: number; device?: string };

const SR = 16_000;

/** Fallback for audio the worker's decoder can't read: the browser's own decoder (needs the whole file in memory). */
export async function decodeAudio(src: Blob): Promise<Float32Array> {
  const buf = await src.arrayBuffer();
  const ctx = new OfflineAudioContext({ numberOfChannels: 1, length: 1, sampleRate: SR });
  let audio: AudioBuffer;
  try {
    audio = await ctx.decodeAudioData(buf);
  } catch {
    throw Object.assign(new Error("This video has no audio track the browser can read."), { code: "NO_AUDIO" });
  }
  if (audio.numberOfChannels === 1) return audio.getChannelData(0);
  const out = new Float32Array(audio.length);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const ch = audio.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i]! += ch[i]! / audio.numberOfChannels;
  }
  return out;
}

/**
 * One speech worker per tab, kept alive between runs so a model that was preloaded (or used once) stays in memory.
 * Stopping a run terminates it; the next run starts a fresh one.
 *
 * Two different runs must NEVER share that worker (PER-05-B): each session used
 * to assign `worker.onmessage` on the shared worker, so a second run starting in
 * the same tab overwrote the first run's handler, and a failing session's
 * `dropWorker` terminated the worker out from under the other run. So a run now
 * gets its OWN worker from `createSpeechWorker` and owns it end to end; the
 * shared worker is only the warm preload target (preloadSpeechModel) and is
 * never handed to a session. `dropWorker` still only clears the shared slot
 * when the worker being dropped IS the shared one.
 */
let shared: Worker | null = null;
export const speechWorker = () => (shared ??= new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" }));
/** A fresh worker for one transcription run; the caller owns it and drops it when the run ends. */
export const createSpeechWorker = () => new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
export const dropWorker = (w: Worker) => {
  w.terminate();
  if (shared === w) {
    shared = null;
    preloaded = null;
  }
};
export const sendToWorker = (w: Worker, m: In, transfer: Transferable[] = []) => w.postMessage(m, transfer);
export type { Out };

/** Has this browser saved the speech model already? (transformers.js keeps it in Cache Storage.) */
export const isSpeechModelSaved = isModelSaved;

/**
 * Get the speech model ready in the background so captions start the moment a video is in.
 * `full` loads it into memory too (desktop upload screen); otherwise only the files are downloaded (cheap, any device).
 */
let preloaded: SpeechLanguage | null = null;
export function preloadSpeechModel(full = true, lang: SpeechLanguage = likelySpeechLanguage()) {
  if (!canTranscribeInBrowser()) return;
  if (!full) {
    if (networkAllowsPrefetch()) void prefetchModel(lang);
    return;
  }
  if (preloaded === lang) return;
  preloaded = lang;
  void navigator.storage?.persist?.().catch(() => false);
  sendToWorker(speechWorker(), { type: "preload", model: lang, forceWasm: webgpuMarkedBroken() });
}

/**
 * Called while someone is on their way to the studio (/start, dashboard): when the browser is idle and the connection
 * allows, get the model ready. Desktops load it into memory too (the worker survives in-app navigation, so the studio
 * starts with a warm model); phones only download the files.
 */
export function warmSpeechModel() {
  if (typeof window === "undefined" || !canTranscribeInBrowser() || !networkAllowsPrefetch()) return;
  const phone = window.matchMedia("(max-width: 767px), (pointer: coarse) and (hover: none)").matches;
  const go = () => preloadSpeechModel(!phone);
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(go, { timeout: 3000 });
  else setTimeout(go, 1000);
}

/** Retries a save on network/server errors (not on 4xx answers), backing off 2 s, 5 s, 10 s, 20 s. */
export async function withRetry<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const waits = [2000, 5000, 10000, 20000];
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const status = (e as { status?: number }).status;
      const clientError = typeof status === "number" && status >= 400 && status < 500;
      if (clientError || i >= waits.length || signal?.aborted) throw e;
      await new Promise((r) => setTimeout(r, waits[i]));
    }
  }
}

/** Can this browser run it at all? (Web Workers + WebAssembly.) */
export const canTranscribeInBrowser = () => typeof window !== "undefined" && typeof Worker !== "undefined" && typeof WebAssembly !== "undefined";
