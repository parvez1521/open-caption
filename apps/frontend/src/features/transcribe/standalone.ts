"use client";

import { fromWhisperCaptions, toSrt, toTxt, toVtt } from "@motion-ai/caption-engine/core";
import { PLANS, type Page, type Word } from "@capseasy/shared";
import { uploadLimitLabel } from "@/lib/billing/pricingDisplay";
import { MODELS, type SpeechLanguage } from "./runtime";
import { dropRepeatedRuns } from "./speech";
import type { In, Out } from "./whisper.worker";

/**
 * Standalone Transcribe: upload a file, get its transcript. No Studio project,
 * no server round-trip, no link/URL input (G6 verdict: no free + terms-clean
 * path to fetch remote media). The speech model runs in this browser, exactly
 * like the Studio's transcription — only the project/server half is missing.
 *
 * Limits are the frozen Free tier (50 MB, 5 min) for everyone on this page:
 * there is no project here to read a paid plan from, and the full Studio
 * keeps the paid headroom. The page says so plainly.
 */

export const TRANSCRIBE_ACCEPT =
  "video/mp4,video/quicktime,video/webm,video/x-matroska,audio/mpeg,audio/mp4,audio/wav,audio/webm,audio/ogg,.mp4,.mov,.webm,.mkv,.mp3,.m4a,.wav,.ogg";

export const TRANSCRIBE_LIMITS = {
  maxBytes: PLANS.free.maxUploadBytes,
  maxDurationSec: PLANS.free.maxDurationSec,
};

const AUDIO_EXTS = [".mp3", ".m4a", ".wav", ".ogg", ".flac", ".aac"];
const VIDEO_EXTS = [".mp4", ".mov", ".webm", ".mkv"];

/** Synchronous file check: kind + size. Duration and audio presence need a probe (probeMediaFile). */
export function validateTranscribeFile(file: File): string | null {
  const name = file.name.toLowerCase();
  const knownExt = [...AUDIO_EXTS, ...VIDEO_EXTS].some((e) => name.endsWith(e));
  const knownType = file.type.startsWith("video/") || file.type.startsWith("audio/");
  if (!knownType && !knownExt) return "Choose a video or audio file (MP4, MOV, WebM, MKV, MP3, M4A, WAV, OGG).";
  if (file.size > TRANSCRIBE_LIMITS.maxBytes) {
    return `This file is over the ${uploadLimitLabel(TRANSCRIBE_LIMITS.maxBytes)} limit for this tool. Trim it and try again.`;
  }
  if (file.size === 0) return "This file is empty.";
  return null;
}

export interface ProbedMedia {
  durationMs: number;
  hasAudio: boolean;
  hasVideo: boolean;
}

/**
 * Read duration + audio presence with Mediabunny (the same decoder the Studio
 * uses), without requiring a video track — audio-only files transcribe too —
 * and without converting anything: transcription only needs the audio.
 */
export async function probeMediaFile(file: File, signal?: AbortSignal): Promise<ProbedMedia> {
  const { Input, BlobSource, ALL_FORMATS } = await import("mediabunny");
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const [video, audio] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()]);
    if (signal?.aborted) throw Object.assign(new Error("Cancelled."), { code: "ABORTED" });
    const durationS = await input.computeDuration();
    if (!audio) throw new Error("This file has no audio track to transcribe.");
    if (durationS > TRANSCRIBE_LIMITS.maxDurationSec) {
      throw new Error(
        `This file is ${Math.ceil(durationS / 60)} minutes long. Transcribe handles up to ${Math.round(TRANSCRIBE_LIMITS.maxDurationSec / 60)} minutes for now.`,
      );
    }
    return { durationMs: Math.round(durationS * 1000), hasAudio: true, hasVideo: !!video };
  } catch (e) {
    if (e instanceof Error && (e.message.startsWith("This file") || e.message.startsWith("This video") || e.message === "Cancelled.")) throw e;
    throw new Error("We couldn't read this file. It may be damaged or in a format this browser can't open.");
  } finally {
    input.dispose?.();
  }
}

/** A silence at least this long starts a new transcript segment. */
export const TRANSCRIPT_GAP_MS = 900;
/** Segments stay short enough to read at a glance. */
export const TRANSCRIPT_MAX_MS = 8000;
export const TRANSCRIPT_MAX_WORDS = 16;

/**
 * Words -> timed segments, as Pages the existing SRT/VTT/TXT exporters already
 * understand. One line per segment; no styling, no hero words — this is a
 * transcript, not captions.
 */
export function wordsToTranscriptPages(words: Word[]): Page[] {
  const pages: Page[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    pages.push({
      id: `transcript-${pages.length}`,
      index: pages.length,
      startMs: cur[0]!.startMs,
      endMs: cur[cur.length - 1]!.endMs,
      words: cur,
      lines: [cur],
      heroIndex: 0,
      emotion: "neutral",
      position: null,
      styleOverride: null,
    });
    cur = [];
  };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    const gap = prev ? w.startMs - prev.endMs : 0;
    const span = cur.length ? w.endMs - cur[0]!.startMs : 0;
    if (prev && (gap >= TRANSCRIPT_GAP_MS || span > TRANSCRIPT_MAX_MS || cur.length >= TRANSCRIPT_MAX_WORDS)) flush();
    cur.push(w);
  }
  flush();
  return pages;
}

export const pageText = (p: Page): string => p.words.map((w) => w.text.trim()).join(" ");

export function transcriptPlainText(pages: Page[]): string {
  return pages.map(pageText).join("\n");
}

export interface TranscriptDownloads {
  txt: string;
  srt: string;
  vtt: string;
}

/** The transcript in all three download formats, from the shared exporters — nothing reinvented. */
export function buildTranscriptDownloads(words: Word[]): TranscriptDownloads {
  const pages = wordsToTranscriptPages(words);
  return { txt: toTxt(pages), srt: toSrt(pages), vtt: toVtt(pages) };
}

export type StandaloneStage = "audio" | "download" | "load" | "transcribe";

export const STAGE_LABELS: Record<StandaloneStage, string> = {
  audio: "Reading audio",
  download: "Downloading speech model",
  load: "Loading model",
  transcribe: "Transcribing",
};

export interface StandaloneEvents {
  onStatus: (stage: StandaloneStage, progress: number, device?: string) => void;
  onPartial: (words: Word[], progress: number, audioEndMs: number) => void;
}

export interface StandaloneResult {
  words: Word[];
  durationMs: number;
  device: string;
}

export interface StandaloneRun {
  promise: Promise<StandaloneResult>;
  cancel: () => void;
}

const aborted = () => Object.assign(new Error("Transcription cancelled."), { code: "ABORTED" });

/**
 * One transcription run in a dedicated worker (not the Studio's shared one,
 * so cancelling here never touches an editor run). The model downloads once
 * into the browser cache; progress comes from the worker's real status
 * events — never invented. No project, no server job, no upload.
 */
export function runStandaloneTranscribe(file: Blob, language: SpeechLanguage, events: StandaloneEvents): StandaloneRun {
  let worker: Worker | null = null;
  let settled = false;
  let rejectFn: ((e: Error) => void) | null = null;
  const raw: { text: string; startMs: number; endMs: number }[] = [];
  let durationMs = 0;
  let device = "";

  const promise = new Promise<StandaloneResult>((resolve, reject) => {
    rejectFn = reject;
    if (typeof window === "undefined" || typeof Worker === "undefined" || typeof WebAssembly === "undefined") {
      reject(new Error("This browser can't run transcription (it needs Web Workers and WebAssembly)."));
      return;
    }
    worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<Out>) => {
      const m = e.data;
      if (m.type === "status") {
        events.onStatus(m.stage, m.progress, m.device);
        if (m.device) device = m.device;
      } else if (m.type === "partial") {
        raw.push(...m.words);
        durationMs = m.durationMs || durationMs;
        events.onPartial(fromWhisperCaptions(dropRepeatedRuns(raw), durationMs > 0 ? { durationMs } : {}), m.progress, m.audioEndMs);
      } else if (m.type === "done") {
        if (settled) return;
        settled = true;
        durationMs = m.durationMs || durationMs;
        const words = fromWhisperCaptions(dropRepeatedRuns(raw), durationMs > 0 ? { durationMs } : {});
        worker?.terminate();
        resolve({ words, durationMs, device: m.device || device });
      } else if (m.type === "error") {
        if (settled) return;
        settled = true;
        worker?.terminate();
        reject(Object.assign(new Error(m.message), { code: m.code }));
      }
      // "timing" and "gpu-broken" need no action: the worker retries on WASM itself.
    };
    worker.onerror = () => {
      if (settled) return;
      settled = true;
      worker?.terminate();
      reject(new Error("The speech worker stopped unexpectedly. Try again."));
    };
    const msg: In = { type: "run", model: language, file, language: MODELS[language].language };
    worker.postMessage(msg);
  });

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      worker?.terminate();
      worker = null;
      rejectFn?.(aborted());
    },
  };
}
