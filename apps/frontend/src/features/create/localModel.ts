"use client";

import { LOCAL_MODEL } from "./model";
import type { TextIn, TextOut } from "./text.worker";

/**
 * Main-thread owner of the text-model worker, mirroring browserWhisper.ts: one worker per tab,
 * created lazily and ONLY after the creator explicitly opts in (nothing here runs on page load).
 * Disabling terminates the worker and frees the model's memory; the downloaded files stay in the
 * browser cache, so re-enabling later does not download again.
 */

export type ModelState =
  | { status: "off" }
  | { status: "loading"; progress: number }
  | { status: "ready"; device: "webgpu" | "wasm" }
  | { status: "error"; message: string };

let worker: Worker | null = null;
let state: ModelState = { status: "off" };
let loadPromise: Promise<void> | null = null;
let loadSettle: { resolve: () => void; reject: (e: Error) => void } | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (text: string) => void; reject: (e: Error) => void }>();
const listeners = new Set<(s: ModelState) => void>();

const setState = (s: ModelState) => {
  state = s;
  listeners.forEach((fn) => fn(s));
};

export const getModelState = (): ModelState => state;
export const onModelState = (fn: (s: ModelState) => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Can this browser run a local model at all? (Web Workers + WebAssembly, same gate as transcription.) */
export const canRunLocalModel = () =>
  typeof window !== "undefined" && typeof Worker !== "undefined" && typeof WebAssembly !== "undefined";

const failAll = (message: string) => {
  loadSettle?.reject(new Error(message));
  loadSettle = null;
  loadPromise = null;
  pending.forEach((p) => p.reject(new Error(message)));
  pending.clear();
};

function ensureWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./text.worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<TextOut>) => {
    const m = e.data;
    if (m.type === "progress") {
      if (state.status === "loading") setState({ status: "loading", progress: m.progress });
    } else if (m.type === "ready") {
      setState({ status: "ready", device: m.device });
      loadSettle?.resolve();
      loadSettle = null;
      loadPromise = null;
    } else if (m.type === "result") {
      const p = pending.get(m.id);
      if (p) {
        pending.delete(m.id);
        p.resolve(m.text);
      }
    } else if (m.type === "error") {
      if (m.id !== undefined) {
        const p = pending.get(m.id);
        if (p) {
          pending.delete(m.id);
          p.reject(new Error(m.message));
        }
      } else {
        setState({ status: "error", message: m.message });
        failAll(m.message);
      }
    }
  };
  w.onerror = () => {
    setState({ status: "error", message: "The model worker stopped unexpectedly." });
    failAll("The model worker stopped unexpectedly.");
  };
  worker = w;
  return w;
}

const send = (m: TextIn) => ensureWorker().postMessage(m);

/** The explicit opt-in: downloads (first time only) and loads the model. Rejects on any failure. */
export function enableLocalModel(): Promise<void> {
  if (state.status === "ready") return Promise.resolve();
  if (loadPromise) return loadPromise;
  if (!canRunLocalModel()) return Promise.reject(new Error("This browser cannot run a local model."));
  setState({ status: "loading", progress: 0 });
  loadPromise = new Promise<void>((resolve, reject) => {
    loadSettle = { resolve, reject };
    send({ type: "load" });
  });
  return loadPromise;
}

/** Off means off: terminate the worker and free the memory. Cached files stay for next time. */
export function disableLocalModel() {
  worker?.terminate();
  worker = null;
  loadPromise = null;
  loadSettle = null;
  pending.forEach((p) => p.reject(new Error("The local model was turned off.")));
  pending.clear();
  setState({ status: "off" });
}

/** The ModelRunner the generation service calls. Rejects unless the model is loaded. */
export async function runLocalModel(prompt: { system: string; user: string }): Promise<string> {
  if (state.status !== "ready") throw new Error("The local model is not loaded.");
  const id = nextId++;
  return new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ type: "generate", id, system: prompt.system, user: prompt.user });
  });
}

export { LOCAL_MODEL };
