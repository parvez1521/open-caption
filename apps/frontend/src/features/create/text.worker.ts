/// <reference lib="webworker" />
/**
 * The local text model in a dedicated Web Worker (Transformers.js), mirroring whisper.worker.ts:
 * the model loads inside the worker so the page stays smooth, file progress is posted back as one
 * overall percentage, a WebGPU load that fails is retried on WASM, and every failure is posted as
 * an "error" message so the main thread can fall back to the template engine.
 *
 * The model is OFF by default: this worker is only created when the creator explicitly chooses
 * "Download & enable" on the generators page. Files download once from the Hugging Face CDN
 * (open weights, no API key, no paid API) and are cached by the browser (Cache Storage).
 */
import { pipeline, env, type TextGenerationPipeline } from "@huggingface/transformers";
import { LOCAL_MODEL } from "./model";
import { isConstrainedDevice, webgpuF16 } from "../transcribe/runtime";

env.allowLocalModels = false;

export type TextIn =
  | { type: "load" }
  | { type: "generate"; id: number; system: string; user: string };
export type TextOut =
  | { type: "progress"; progress: number }
  | { type: "ready"; device: "webgpu" | "wasm" }
  | { type: "result"; id: number; text: string }
  | { type: "error"; message: string; id?: number };

const post = (m: TextOut) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

let generator: TextGenerationPipeline | null = null;
let loading: Promise<TextGenerationPipeline> | null = null;
let device: "webgpu" | "wasm" = "wasm";

function load(): Promise<TextGenerationPipeline> {
  if (generator) return Promise.resolve(generator);
  if (loading) return loading;
  const p = loadModel().finally(() => { if (loading === p) loading = null; });
  loading = p;
  return p;
}

async function loadModel(): Promise<TextGenerationPipeline> {
  // Phones and low-memory devices stay on WASM, same rule as the speech worker.
  const useGpu = !isConstrainedDevice() && (await webgpuF16());
  device = useGpu ? "webgpu" : "wasm";
  if (isConstrainedDevice()) env.backends.onnx.wasm!.numThreads = 1;
  // per-file byte progress -> one overall download percentage (same pattern as the speech worker)
  const files = new Map<string, { loaded: number; total: number }>();
  const onProgress = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status !== "progress" || !p.file || !p.total) return;
    files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
    let l = 0, t = 0;
    files.forEach((f) => { l += f.loaded; t += f.total; });
    post({ type: "progress", progress: t ? l / t : 0 });
  };
  const make = (dev: "webgpu" | "wasm") =>
    pipeline("text-generation", LOCAL_MODEL.id, {
      device: dev,
      dtype: dev === "webgpu" ? "q4f16" : "q4",
      progress_callback: onProgress,
    }) as Promise<TextGenerationPipeline>;
  try {
    generator = await make(device);
  } catch (e) {
    if (device !== "webgpu") throw e;
    device = "wasm"; // GPU advertised support but failed: retry on the processor, like the speech worker
    generator = await make("wasm");
  }
  post({ type: "ready", device });
  return generator;
}

/** Chat output arrives as the full message list; plain output as a string. Normalise to the reply text. */
function replyText(out: unknown): string {
  const first = (out as { generated_text?: unknown }[])[0];
  const gt = first?.generated_text;
  if (typeof gt === "string") return gt;
  if (Array.isArray(gt)) {
    const last = gt[gt.length - 1] as { content?: unknown } | undefined;
    return typeof last?.content === "string" ? last.content : "";
  }
  return "";
}

self.onmessage = async (e: MessageEvent<TextIn>) => {
  if (e.data.type === "load") {
    try {
      await load();
    } catch (err) {
      post({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  const { id, system, user } = e.data;
  try {
    const model = await load();
    const out = await model(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { max_new_tokens: LOCAL_MODEL.maxNewTokens, do_sample: false },
    );
    post({ type: "result", id, text: replyText(out) });
  } catch (err) {
    post({ type: "error", id, message: err instanceof Error ? err.message : String(err) });
  }
};
