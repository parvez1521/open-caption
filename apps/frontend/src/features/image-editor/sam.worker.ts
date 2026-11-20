/// <reference lib="webworker" />
/**
 * SAM (Segment Anything) in a Web Worker (transformers.js + onnxruntime-web).
 *
 * The vision encoder runs ONCE per image and its embeddings are cached, so
 * each click after the first only runs the tiny prompt encoder + mask decoder
 * (~1-2 s). A new image terminates the old embeddings — the encoder's peak
 * memory is the heavy part, and a fresh image deserves a clean slate.
 *
 * Model: Xenova/sam-vit-base, quantized (q8) on WASM, fp16 on WebGPU.
 * The model downloads once (~90 MB quantized) and is cached by the browser.
 * Fixed working size: the model only accepts 1024×1024 input (verified:
 * a 512 override is rejected), so the processor downscales any photo to
 * 1024 on the long edge and upscales the mask back to full size.
 */
import { AutoProcessor, RawImage, SamModel, env, type SamModel as SamModelType } from "@huggingface/transformers";
import { useBundledOnnxWasm } from "../transcribe/onnxWasm";

env.allowLocalModels = false;
// OC-003: self-hosted ONNX WASM (bundled assets) instead of the jsDelivr CDN
// default — must run before the first pipeline() call.
useBundledOnnxWasm();

const MODEL_ID = "Xenova/sam-vit-base";

export type SamIn =
  | { type: "load"; imageId: string; data: ArrayBuffer; width: number; height: number }
  | { type: "segment"; imageId: string; x: number; y: number }
  | { type: "dispose" };

export type SamOut =
  | { type: "progress"; stage: "download" | "encode"; progress: number }
  | { type: "ready"; imageId: string; encodeMs: number }
  | { type: "mask"; imageId: string; x: number; y: number; mask: ArrayBuffer; width: number; height: number; score: number }
  | { type: "error"; message: string; code?: string };

const post = (m: SamOut, transfer: Transferable[] = []) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer);

type Embeddings = {
  imageId: string;
  raw: RawImage;
  imageEmbeddings: unknown;
  imagePositionalEmbeddings: unknown;
  originalSizes: [number, number][];
  reshapedInputSizes: [number, number][];
  width: number;
  height: number;
};

type SamProcessorLike = {
  (input: unknown, opts?: { input_points?: unknown }): Promise<{
    pixel_values: import("@huggingface/transformers").Tensor;
    original_sizes: [number, number][];
    reshaped_input_sizes: [number, number][];
    input_points?: import("@huggingface/transformers").Tensor;
    input_labels?: import("@huggingface/transformers").Tensor;
  }>;
  post_process_masks: (
    masks: import("@huggingface/transformers").Tensor,
    original_sizes: [number, number][],
    reshaped_input_sizes: [number, number][],
  ) => Promise<import("@huggingface/transformers").Tensor[]>;
};

let model: SamModelType | null = null;
let processor: SamProcessorLike | null = null;
let loading: Promise<void> | null = null;
let device: "webgpu" | "wasm" = "wasm";
let cached: Embeddings | null = null;

const safeDispose = (t: unknown) => {
  try {
    (t as { dispose?: () => void } | null | undefined)?.dispose?.();
  } catch {
    /* a tensor that is already gone is not an error */
  }
};

function pickDevice(): "webgpu" | "wasm" {
  return typeof navigator !== "undefined" && "gpu" in navigator ? "webgpu" : "wasm";
}

async function loadModel(): Promise<void> {
  if (model && processor) return;
  if (loading) return loading;
  loading = (async () => {
    device = pickDevice();
    const files = new Map<string, { loaded: number; total: number }>();
    const onProgress = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== "progress" || !p.file || !p.total) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
      let l = 0, t = 0;
      files.forEach((f) => { l += f.loaded; t += f.total; });
      post({ type: "progress", stage: "download", progress: t ? l / t : 0 });
    };
    const make = (dev: "webgpu" | "wasm") =>
      SamModel.from_pretrained(MODEL_ID, {
        device: dev,
        dtype: dev === "webgpu" ? "fp16" : "q8",
        progress_callback: onProgress,
      });
    try {
      model = (await make(device)) as unknown as SamModelType;
    } catch (e) {
      if (device !== "webgpu") throw e;
      // some GPUs advertise fp16 but fail to compile the graph
      device = "wasm";
      model = (await make("wasm")) as unknown as SamModelType;
    }
    processor = (await AutoProcessor.from_pretrained(MODEL_ID)) as unknown as SamProcessorLike;
  })().finally(() => {
    loading = null;
  });
  return loading;
}

function dropEmbeddings() {
  if (!cached) return;
  safeDispose(cached.imageEmbeddings);
  safeDispose(cached.imagePositionalEmbeddings);
  cached = null;
}

async function loadImage(imageId: string, data: ArrayBuffer, width: number, height: number) {
  await loadModel();
  if (cached?.imageId === imageId) {
    post({ type: "ready", imageId, encodeMs: 0 });
    return;
  }
  dropEmbeddings();
  const t0 = performance.now();
  const raw = new RawImage(new Uint8ClampedArray(data), width, height, 4);
  const base = await processor!(raw);
  post({ type: "progress", stage: "encode", progress: 0.5 });
  const { image_embeddings, image_positional_embeddings } = await model!.get_image_embeddings({
    pixel_values: base.pixel_values,
  });
  safeDispose(base.pixel_values);
  cached = {
    imageId,
    raw,
    imageEmbeddings: image_embeddings,
    imagePositionalEmbeddings: image_positional_embeddings,
    originalSizes: base.original_sizes as [number, number][],
    reshapedInputSizes: base.reshaped_input_sizes as [number, number][],
    width,
    height,
  };
  post({ type: "ready", imageId, encodeMs: Math.round(performance.now() - t0) });
}

async function segment(imageId: string, x: number, y: number) {
  if (!cached || cached.imageId !== imageId) throw new Error("Load an image before segmenting it.");
  const pInputs = await processor!(cached.raw, { input_points: [[[x, y]]] });
  const outputs = await model!({
    input_points: pInputs.input_points,
    input_labels: pInputs.input_labels,
    image_embeddings: cached.imageEmbeddings,
    image_positional_embeddings: cached.imagePositionalEmbeddings,
  });
  const masks = await processor!.post_process_masks(
    outputs.pred_masks,
    cached.originalSizes,
    cached.reshapedInputSizes,
  );
  const scores = Array.from(outputs.iou_scores.data as Float32Array);
  const best = scores.indexOf(Math.max(...scores));
  const [b, c, h, w] = masks[0]!.dims;
  const total = h * w;
  const slice = (masks[0]!.data as Uint8Array).slice(best * total, (best + 1) * total);
  const score = scores[best] ?? 0;
  safeDispose(pInputs.input_points);
  safeDispose(pInputs.input_labels);
  safeDispose(pInputs.pixel_values);
  safeDispose(outputs.pred_masks);
  safeDispose(outputs.iou_scores);
  safeDispose(masks[0]);
  const buf = slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) as ArrayBuffer;
  post(
    { type: "mask", imageId, x, y, mask: buf, width: w, height: h, score },
    [buf],
  );
}

self.onmessage = (e: MessageEvent<SamIn>) => {
  const msg = e.data;
  void (async () => {
    try {
      if (msg.type === "load") await loadImage(msg.imageId, msg.data, msg.width, msg.height);
      else if (msg.type === "segment") await segment(msg.imageId, msg.x, msg.y);
      else if (msg.type === "dispose") {
        dropEmbeddings();
        await model?.dispose().catch(() => undefined);
        model = null;
        processor = null;
      }
    } catch (err) {
      post({ type: "error", message: err instanceof Error ? err.message : "Segmentation failed." });
    }
  })();
};
