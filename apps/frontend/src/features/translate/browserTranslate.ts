"use client";

import { translationModelFor, type TranslationModel } from "@capseasy/shared";
import type { TranslateIn, TranslateOut } from "./translate.worker";

/**
 * Main-thread owner of the translation worker, mirroring browserWhisper.ts: one shared worker
 * per tab, kept alive between runs so a downloaded model stays in memory. Only models from the
 * verified registry (@capseasy/shared TRANSLATION_MODELS) can be requested — an unregistered
 * language is refused here, before any worker or network work happens.
 */

export type TranslateProgress = { stage: "download" | "load" | "translate"; progress: number };

let shared: Worker | null = null;
export const translateWorker = () =>
  (shared ??= new Worker(new URL("./translate.worker.ts", import.meta.url), { type: "module" }));
export const dropTranslateWorker = (w: Worker) => {
  w.terminate();
  if (shared === w) shared = null;
};

/** Can this browser run it at all? (Web Workers + WebAssembly, same floor as transcription.) */
export const canTranslateInBrowser = () =>
  typeof window !== "undefined" && typeof Worker !== "undefined" && typeof WebAssembly !== "undefined";

/**
 * Translate `lines` (caption cards) into `targetLang` on-device. Resolves with the translated
 * lines in the SAME order and count — the contract buildTranslatedDoc relies on.
 * `makeWorker` exists for tests: a fake worker can stand in for the real one.
 */
export function translateLines(
  targetLang: string,
  lines: string[],
  onProgress?: (p: TranslateProgress) => void,
  makeWorker: () => Worker = translateWorker,
): Promise<string[]> {
  const model: TranslationModel | null = translationModelFor(targetLang);
  if (!model) return Promise.reject(new Error(`"${targetLang}" is not a verified translation language.`));
  if (lines.length === 0) return Promise.resolve([]);
  const w = makeWorker();
  return new Promise<string[]>((resolve, reject) => {
    const cleanup = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
    };
    const onMessage = (e: MessageEvent<TranslateOut>) => {
      const m = e.data;
      if (m.type === "status") onProgress?.({ stage: m.stage, progress: m.progress });
      else if (m.type === "done") {
        cleanup();
        if (m.lines.length !== lines.length) reject(new Error("The translation model returned the wrong number of lines."));
        else resolve(m.lines);
      } else if (m.type === "error") {
        cleanup();
        reject(new Error(m.message));
      }
    };
    const onError = (e: ErrorEvent) => {
      cleanup();
      reject(new Error(e.message || "The translation worker failed."));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    const msg: TranslateIn = { type: "translate", modelId: model.modelId, revision: model.revision, lines };
    w.postMessage(msg);
  });
}
