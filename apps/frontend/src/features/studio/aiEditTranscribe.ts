/**
 * Planning-only transcription for AI Edit (Studio revision, Task 9).
 *
 * This runs the EXISTING in-browser Whisper pipeline on the uploaded video
 * and returns timestamped words for the planner — and NOTHING else: it never
 * starts a caption session, never saves progress, never writes a caption
 * document, and never touches the project's captions. That is the whole
 * point of a blank AI-Edit project.
 *
 * It uses its own dedicated worker (not the shared caption worker in
 * `browserWhisper.ts`), so a planning run can never disturb a caption run
 * in another tab/project. The worker is terminated when the run settles.
 * The speech model files are the same ones the caption flow already
 * downloads (cached in the browser); no key, no upload, no cost.
 */

import { fromWhisperCaptions } from "@motion-ai/caption-engine/core";
import { decodeAudio, type Out } from "../transcribe/browserWhisper";
import {
  MODELS,
  likelySpeechLanguage,
  savedSpeechLanguage,
  webgpuMarkedBroken,
  type SpeechLanguage,
} from "../transcribe/runtime";
import { dropRepeatedRuns } from "../transcribe/speech";
import type { TranscriptWord } from "./aiEditPlanner";

export interface PlanTranscriptionProgress {
  /** 0..1 share of the audio covered so far. */
  progress: number;
  /** Stage label for the panel (no model names). */
  stage: "audio" | "download" | "load" | "transcribe";
}

export interface TranscribeForPlanningOptions {
  onProgress?: (p: PlanTranscriptionProgress) => void;
  signal?: AbortSignal;
}

/**
 * The Whisper language token for a planning run. The panel asks no language
 * question, so the Studio session's rule is mirrored for a run with no
 * explicit choice: a SAVED choice forces its model's token, a mere browser
 * guess keeps auto-detect (null) so a wrong guess can't force the wrong
 * token onto the stock model. One exception: the Hinglish fine-tune was
 * trained with the "en" token only — letting Whisper auto-detect ("hi" for
 * Hindi speech) would decode with a token the model never saw, so its token
 * is always forced. Passing null before this fix was the leak: Hinglish
 * planning transcripts were decoded window by window with whatever token
 * auto-detect picked.
 */
export function planningLanguageToken(model: SpeechLanguage): string | null {
  if (model === "hinglish") return MODELS.hinglish.language;
  const saved = savedSpeechLanguage();
  return saved ? MODELS[saved].language : null;
}

/**
 * Transcribe a video file's audio in this tab and return timestamped words.
 * Resolves to an empty array when the video has no readable audio — the
 * planner then returns an empty plan and the panel says so, instead of
 * failing the whole flow.
 */
export async function transcribeVideoForPlanning(
  file: Blob,
  opts: TranscribeForPlanningOptions = {},
): Promise<TranscriptWord[]> {
  if (typeof window === "undefined" || typeof Worker === "undefined" || typeof WebAssembly === "undefined") {
    throw new Error("This browser cannot transcribe in the tab.");
  }
  const worker = new Worker(new URL("../transcribe/whisper.worker.ts", import.meta.url), { type: "module" });
  const raw: { text: string; startMs: number; endMs: number }[] = [];
  let durationMs = 0;
  let settled = false;

  const finish = (words: TranscriptWord[]): TranscriptWord[] => {
    if (!settled) {
      settled = true;
      worker.terminate();
    }
    return words;
  };

  return new Promise<TranscriptWord[]>((resolve, reject) => {
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      reject(err instanceof Error ? err : new Error("Transcription failed."));
    };
    if (opts.signal?.aborted) {
      fail(new Error("Transcription stopped."));
      return;
    }
    const onAbort = () => fail(new Error("Transcription stopped."));
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    const model = likelySpeechLanguage();
    const language = planningLanguageToken(model);
    const start = (audio?: Float32Array) => {
      worker.postMessage(
        {
          type: "run",
          model,
          file: audio ? null : file,
          audio,
          language,
          forceWasm: webgpuMarkedBroken(),
        },
        audio ? [audio.buffer] : [],
      );
    };

    worker.onmessage = (e: MessageEvent<Out>) => {
      const m = e.data;
      if (m.type === "status") {
        opts.onProgress?.({ progress: m.progress, stage: m.stage });
      } else if (m.type === "partial") {
        raw.push(...m.words);
        if (m.durationMs > 0) durationMs = m.durationMs;
        opts.onProgress?.({ progress: m.progress, stage: "transcribe" });
      } else if (m.type === "done") {
        if (m.durationMs > 0) durationMs = m.durationMs;
        const words = m.noAudio
          ? []
          : fromWhisperCaptions(dropRepeatedRuns(raw), durationMs > 0 ? { durationMs } : {});
        resolve(finish(words.map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs }))));
      } else if (m.type === "error") {
        if (m.code === "NO_AUDIO") {
          resolve(finish([]));
        } else if (m.code === "AUDIO_UNSUPPORTED") {
          // the worker's decoder can't read this audio: the browser's own decoder (same fallback as the caption flow)
          decodeAudio(file).then(
            (a) => start(a),
            (err: unknown) => {
              if ((err as { code?: string }).code === "NO_AUDIO") resolve(finish([]));
              else fail(err);
            },
          );
        } else {
          fail(new Error(m.message || "Transcription failed."));
        }
      }
    };
    worker.onerror = () => fail(new Error("Transcription stopped unexpectedly."));

    start();
  });
}
