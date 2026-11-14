"use client";

import { fromWhisperCaptions, toSrt, toTxt, toVtt } from "@motion-ai/caption-engine/core";
import { PLANS, type Page, type Word } from "@capseasy/shared";
import { uploadLimitLabel } from "@/lib/billing/pricingDisplay";
import { decodeAudio } from "./browserWhisper";
import { MODELS, isConstrainedDevice, type SpeechLanguage } from "./runtime";
import { dropRepeatedRuns } from "./speech";
import type { In, Out } from "./whisper.worker";

/**
 * Standalone Transcribe: upload a file and get its transcript. No Studio project,
 * no server round-trip for the transcription itself. The speech model runs in this browser, exactly like the Studio's
 * transcription — only the project/server half is missing.
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

/**
 * The Whisper language token for a standalone run — the Studio session's rule, mirrored exactly
 * (session.ts:146-149). English uses its token only when the choice is explicit (a saved choice,
 * or one just picked on the page); a guessed or default English keeps auto-detect (null), so a
 * Hinglish video is never forced through the English token. Every other choice always uses its
 * model's token.
 */
export function standaloneLanguageToken(language: SpeechLanguage, explicit: boolean): string | null {
  return language !== "en" || explicit ? MODELS[language].language : null;
}

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

export interface StandaloneOptions {
  /**
   * True when the user picked this language (a saved choice, or one just selected on the page).
   * False for the browser guess: a guessed English keeps Whisper auto-detect, like a Studio
   * project with no language. Defaults to false — never assume the user chose.
   */
  explicitLanguage?: boolean;
}

const aborted = () => Object.assign(new Error("Transcription cancelled."), { code: "ABORTED" });

/**
 * One transcription run in a dedicated worker (not the Studio's shared one,
 * so cancelling here never touches an editor run). The model downloads once
 * into the browser cache; progress comes from the worker's real status
 * events — never invented. No project, no server job, no upload.
 *
 * Two Studio behaviours are mirrored here: the language-token rule above, and the decode fallback —
 * when the worker's decoder can't read the audio (AUDIO_UNSUPPORTED / NO_AUDIO), the browser's own
 * decoder (decodeAudio) is tried once and the run restarts with raw audio. Constrained devices run
 * in safe mode (one thread, processor only), same as the worker does for the Studio.
 */
export function runStandaloneTranscribe(
  file: Blob,
  language: SpeechLanguage,
  events: StandaloneEvents,
  options: StandaloneOptions = {},
): StandaloneRun {
  const token = standaloneLanguageToken(language, options.explicitLanguage ?? false);
  const safe = isConstrainedDevice();
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
    let fallbackTried = false;
    const start = (audio?: Float32Array) => {
      const msg: In = { type: "run", model: language, file: audio ? null : file, ...(audio ? { audio } : {}), language: token, safe };
      worker!.postMessage(msg, audio ? [audio.buffer] : []);
    };
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
        // The worker's decoder couldn't read this audio: one try with the browser's own decoder,
        // then re-run with raw audio (the Studio session's fallback). A file with genuinely no
        // audio ends as an empty transcript, not an error.
        if (!fallbackTried && (m.code === "AUDIO_UNSUPPORTED" || m.code === "NO_AUDIO")) {
          fallbackTried = true;
          raw.length = 0;
          durationMs = 0;
          decodeAudio(file).then(
            (audio) => {
              if (!settled) start(audio);
            },
            (err: unknown) => {
              if (settled) return;
              settled = true;
              worker?.terminate();
              if ((err as { code?: string }).code === "NO_AUDIO") resolve({ words: [], durationMs: 0, device: device || "none" });
              else reject(err instanceof Error ? err : new Error("Transcription failed."));
            },
          );
          return;
        }
        settled = true;
        worker?.terminate();
        // A failed model download surfaces as a raw fetch TypeError ("Failed to fetch").
        // Say it in plain words, the same way the Studio session does — the raw error
        // tells an offline user nothing. Only the standalone path maps it here: the
        // Studio session maps the raw message itself, so changing the shared worker
        // would break its mapping.
        const message = /network|fetch|load failed|failed to fetch/i.test(m.message)
          ? "Couldn't download the transcription model. Check your connection and try again."
          : m.message;
        reject(Object.assign(new Error(message), { code: m.code }));
      }
      // "timing" and "gpu-broken" need no action: the worker retries on WASM itself.
    };
    worker.onerror = () => {
      if (settled) return;
      settled = true;
      worker?.terminate();
      reject(new Error("The speech worker stopped unexpectedly. Try again."));
    };
    start();
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
