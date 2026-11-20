"use client";

import { createWorker, type Worker as TesseractWorker } from "tesseract.js";
import type { TextBox } from "./types";

/**
 * Text detection with Tesseract.js (v6), entirely in the tab.
 *
 * Same-origin assets only (the site CSP does not allow the jsDelivr CDN the
 * library defaults to): the worker, the WASM core and the English language
 * data live in /public/tesseract/ and are served with the site.
 *
 * v6 returns only `text` unless asked: word boxes need `{ blocks: true }`.
 * Low-confidence words (a shape mistaken for a letter, e.g. a circle read
 * as "®") are dropped here — the editor only offers text it is fairly sure
 * about.
 */
const MIN_WORD_CONFIDENCE = 70;

let worker: TesseractWorker | null = null;
let starting: Promise<TesseractWorker> | null = null;

async function getWorker(onProgress: (progress: number) => void): Promise<TesseractWorker> {
  if (worker) return worker;
  if (starting) return starting;
  starting = (async () => {
    const w = await createWorker("eng", 1, {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract/tesseract-core-simd.wasm.js",
      langPath: "/tesseract",
      gzip: false,
      logger: (m) => {
        if (m.status === "recognizing text" && typeof m.progress === "number") onProgress(m.progress);
      },
    });
    worker = w;
    starting = null;
    return w;
  })();
  return starting;
}

export async function detectText(
  image: HTMLCanvasElement | Blob,
  onProgress: (progress: number) => void,
): Promise<TextBox[]> {
  const w = await getWorker(onProgress);
  const { data } = await w.recognize(image, {}, { blocks: true });
  const words: TextBox[] = [];
  for (const b of data.blocks ?? []) {
    for (const p of b.paragraphs ?? []) {
      for (const l of p.lines ?? []) {
        for (const wd of l.words ?? []) {
          if (!wd.text.trim()) continue;
          if (wd.confidence < MIN_WORD_CONFIDENCE) continue;
          words.push({
            text: wd.text,
            x0: wd.bbox.x0,
            y0: wd.bbox.y0,
            x1: wd.bbox.x1,
            y1: wd.bbox.y1,
            conf: Math.round(wd.confidence),
          });
        }
      }
    }
  }
  return words;
}

export function disposeOcrWorker() {
  if (!worker) return;
  void worker.terminate().catch(() => undefined);
  worker = null;
  starting = null;
}
