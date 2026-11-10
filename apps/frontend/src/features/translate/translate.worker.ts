/// <reference lib="webworker" />
/**
 * On-device caption translation in a Web Worker (Transformers.js + OPUS-MT), mirroring the
 * whisper worker's pattern (whisper.worker.ts): one model in memory at a time, per-file byte
 * progress posted back as one overall download percentage, the page never blocked.
 *
 * The models are the VERIFIED OPUS-MT pairs from the shared registry (@capseasy/shared
 * TRANSLATION_MODELS) — the worker only ever loads a model ID + pinned revision handed to it
 * from that registry by browserTranslate.ts, never an arbitrary repo.
 *
 * Translation is card-by-card: each caption card's text goes through the Marian model on its
 * own, so outputs line up 1:1 with the input lines (the caller rebuilds a CaptionDoc from them).
 */
import { pipeline, env, type TranslationPipeline } from "@huggingface/transformers";

env.allowLocalModels = false;

export type TranslateIn =
  | { type: "translate"; modelId: string; revision: string; lines: string[] }
  | { type: "preload"; modelId: string; revision: string };
export type TranslateOut =
  | { type: "status"; stage: "download" | "load" | "translate"; progress: number }
  | { type: "done"; lines: string[] }
  | { type: "error"; message: string };

const post = (m: TranslateOut) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

let translator: TranslationPipeline | null = null;
/** which model `translator` / `loading` hold: one model in memory at a time */
let loadedFor: string | null = null;
let loading: Promise<TranslationPipeline> | null = null;

function load(modelId: string, revision: string): Promise<TranslationPipeline> {
  const key = `${modelId}@${revision}`;
  if (loadedFor !== key) {
    const old = translator;
    const pending = loading;
    translator = null;
    loading = null;
    loadedFor = key;
    void old?.dispose().catch(() => undefined);
    void pending?.then((m) => m.dispose()).catch(() => undefined);
  }
  if (translator) return Promise.resolve(translator);
  if (loading) return loading;
  const p = (async () => {
    // per-file byte progress -> one overall download percentage (same as the whisper worker)
    const files = new Map<string, { loaded: number; total: number }>();
    const onProgress = (pr: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (pr.status !== "progress" || !pr.file || !pr.total) return;
      files.set(pr.file, { loaded: pr.loaded ?? 0, total: pr.total });
      let l = 0, t = 0;
      files.forEach((f) => { l += f.loaded; t += f.total; });
      post({ type: "status", stage: "download", progress: t ? l / t : 0 });
    };
    const made = (await pipeline("translation", modelId, {
      dtype: "q8",
      revision,
      progress_callback: onProgress,
    })) as TranslationPipeline;
    if (loadedFor !== key) {
      // the creator switched language while this one was loading: it's no longer wanted
      void made.dispose().catch(() => undefined);
      return load(modelId, revision);
    }
    translator = made;
    post({ type: "status", stage: "load", progress: 1 });
    return made;
  })().finally(() => { if (loading === p) loading = null; });
  loading = p;
  return p;
}

self.onmessage = async (e: MessageEvent<TranslateIn>) => {
  if (e.data.type === "preload") {
    load(e.data.modelId, e.data.revision).catch(() => { /* the real run retries and reports */ });
    return;
  }
  try {
    const model = await load(e.data.modelId, e.data.revision);
    const out: string[] = [];
    for (let i = 0; i < e.data.lines.length; i++) {
      const res = (await model(e.data.lines[i]!)) as { translation_text: string } | { translation_text: string }[];
      const one = Array.isArray(res) ? res[0] : res;
      out.push((one?.translation_text ?? "").trim());
      post({ type: "status", stage: "translate", progress: (i + 1) / Math.max(1, e.data.lines.length) });
    }
    post({ type: "done", lines: out });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
