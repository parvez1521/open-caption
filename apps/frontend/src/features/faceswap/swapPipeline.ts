/**
 * Face swap — the ONNX pipeline (runs in the Web Worker; the Node
 * verification test imports these same functions).
 *
 * This is the official InsightFace recipe (deepinsight/insightface,
 * model_zoo/inswapper.py + arcface_onnx.py + utils/face_align.py),
 * verified end to end against the real models in this sandbox
 * (2026-11-18). The three details that matter, all easy to get wrong:
 *  - swap target: RGB, x/255 (blobFromImage scale 1/255, mean 0,
 *    swapRB=True) — NOT BGR (x-127.5)/127.5, which gives a dead output.
 *  - swap output: RGB in [0,1], denormalise with x*255.
 *  - source latent: normed_embedding @ emap, then re-normalised. The
 *    emap is the inswapper file's last initializer ("buff2fs"); without
 *    it the swap reconstructs the target instead of transferring the
 *    source identity. It ships as a 1 MB asset (public/models/buff2fs.bin).
 *  - the 128 template is arcface_dst + (8, 0), not arcface_dst * 128/112.
 *
 * Sessions:
 *  - detection: the vendored YuNet model (same-origin, ~0.25 MB — already
 *    used by the clipper's face worker, MIT, see public/models/).
 *  - recognition: ArcFace w600k_r50 (buffalo_l), ~166 MB, loaded at
 *    runtime from the public Immich mirror on the Hugging Face hub.
 *    (The lighter w600k_mbf was tried and rejected: its embeddings
 *    transfer identity far more weakly through the emap.)
 *  - swap: inswapper_128 (fp16), ~265 MB, loaded at runtime from a
 *    public mirror on the Hugging Face hub. The fp16 file is the same
 *    weights as the fp32 release (verified: same swap result).
 *
 * Nothing is bundled into the repo or the deploy except the 1 MB emap
 * and the 0.25 MB YuNet model: the two big files are fetched at runtime
 * (cached by the browser afterwards) and the swap runs entirely on the
 * user's device. Both hosts are already in the site's
 * Content-Security-Policy connect-src (huggingface.co / *.huggingface.co),
 * so no CSP change is needed.
 *
 * Progress copy never mentions models or downloads — see ./copy.ts.
 */
import * as ort from "onnxruntime-web";
import {
  boxToSource,
  decodeYuNetOutputs,
  letterboxParams,
  tensorFromLetterboxedRgba,
  YUNET_INPUT_SIZE,
  type FaceBox,
} from "../clipper/yunet";
import { UI_COPY } from "./copy";
import {
  ARCFACE_DST_112,
  ARCFACE_DST_128,
  estimateSimilarity,
  faceMask128,
  invertSimilarity,
  l2Normalize,
  projectEmbedding,
  warpMask,
  warpRgba,
  type Point,
} from "./swapMath";

export const MODEL_URLS = {
  /** Vendored with the site, same-origin. */
  detection: "/models/face_detection_yunet_2023mar.onnx",
  /** The inswapper emap ("buff2fs", 512×512 float32), vendored with the site. */
  emap: "/models/buff2fs.bin",
  /** ArcFace w600k_r50 (buffalo_l recognition), public Immich mirror. */
  recognition: "https://huggingface.co/immich-app/buffalo_l/resolve/main/recognition/model.onnx",
  /** inswapper_128 (fp16), public mirror. */
  swap: "https://huggingface.co/nguyenhoanghuy/inswapper_128_fp16/resolve/main/inswapper_128_fp16.onnx",
} as const;

/** Byte sizes from the hosts' Content-Length headers (2026-11-18). */
export const MODEL_BYTES = {
  detection: 232_589,
  emap: 1_048_576,
  recognition: 174_383_860,
  swap: 277_680_829,
} as const;

export interface SwapSessions {
  detect: ort.InferenceSession;
  recog: ort.InferenceSession;
  swap: ort.InferenceSession;
  /** The inswapper emap ("buff2fs"), 512×512 float32, row-major. */
  emap: Float32Array;
}

async function fetchWithProgress(
  url: string,
  onProgress: (loaded: number, total: number | null) => void,
): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  const total = res.headers.get("content-length") ? Number(res.headers.get("content-length")) : null;
  if (!res.body) {
    const buf = await res.arrayBuffer();
    onProgress(buf.byteLength, total);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out.buffer;
}

export interface LoadOptions {
  /** Fraction 0..1 across all three files, or null while the total is unknown. */
  onProgress?: (fraction: number | null) => void;
  /** Override for tests: read a file from disk instead of fetching it. */
  readFile?: (url: string) => Promise<ArrayBuffer | Uint8Array>;
  /** Override the WASM thread count (tests only: 1 keeps peak memory down). */
  numThreads?: number;
}

function readDefault(url: string, onProgress: (loaded: number, total: number | null) => void): Promise<ArrayBuffer> {
  return fetchWithProgress(url, onProgress);
}

/** Load all three sessions plus the emap. Progress is weighted by file size so the bar moves steadily. */
export async function loadSessions(opts: LoadOptions = {}): Promise<SwapSessions> {
  if (opts.numThreads) ort.env.wasm.numThreads = opts.numThreads;
  const onProgress = opts.onProgress ?? (() => {});
  const totalBytes = MODEL_BYTES.detection + MODEL_BYTES.emap + MODEL_BYTES.recognition + MODEL_BYTES.swap;
  let doneBytes = 0;
  const loadOne = async (url: string, bytes: number): Promise<ArrayBuffer | Uint8Array> => {
    const start = doneBytes;
    const data = opts.readFile
      ? await opts.readFile(url)
      : await readDefault(url, (loaded) => onProgress((start + loaded) / totalBytes));
    doneBytes = start + bytes;
    onProgress(doneBytes / totalBytes);
    return data;
  };
  // Sessions are created one at a time and each file's bytes are dropped
  // right after, so peak memory stays near one session's weights instead
  // of all three files plus all three weight sets at once.
  // A view, never a copy: new Uint8Array(ArrayBuffer) shares the bytes.
  const toUint8 = (data: ArrayBuffer | Uint8Array): Uint8Array =>
    data instanceof Uint8Array ? data : new Uint8Array(data);
  let detBytes: ArrayBuffer | Uint8Array | null = await loadOne(MODEL_URLS.detection, MODEL_BYTES.detection);
  const detect = await ort.InferenceSession.create(toUint8(detBytes), { executionProviders: ["wasm"] });
  detBytes = null;
  const emapData = await loadOne(MODEL_URLS.emap, MODEL_BYTES.emap);
  // View the bytes as float32 without copying (the file is raw float32 LE).
  const emap = emapData instanceof ArrayBuffer
    ? new Float32Array(emapData)
    : new Float32Array(emapData.buffer, emapData.byteOffset, emapData.byteLength / 4);
  if (emap.length !== 512 * 512) throw new Error("Bad emap file (expected 512×512 float32).");
  let recogBytes: ArrayBuffer | Uint8Array | null = await loadOne(MODEL_URLS.recognition, MODEL_BYTES.recognition);
  const recog = await ort.InferenceSession.create(toUint8(recogBytes), { executionProviders: ["wasm"] });
  recogBytes = null;
  let swapBytes: ArrayBuffer | Uint8Array | null = await loadOne(MODEL_URLS.swap, MODEL_BYTES.swap);
  const swap = await ort.InferenceSession.create(toUint8(swapBytes), { executionProviders: ["wasm"] });
  swapBytes = null;
  return { detect, recog, swap, emap };
}

/** RGBA pixels → the 640×640 letterboxed frame YuNet wants. */
export function letterboxRgba(rgba: Uint8ClampedArray, w: number, h: number): { data: Uint8ClampedArray; params: ReturnType<typeof letterboxParams> } {
  const params = letterboxParams(w, h);
  // Output pixel (x, y) samples source ((x − padX) / scale, (y − padY) / scale).
  const data = warpRgba(rgba, w, h, { a: 1 / params.scale, b: 0, tx: -params.padX / params.scale, ty: -params.padY / params.scale }, YUNET_INPUT_SIZE, YUNET_INPUT_SIZE);
  return { data, params };
}

/** All faces in an image, in the image's own pixel space. */
export async function detectFaces(session: ort.InferenceSession, rgba: Uint8ClampedArray, w: number, h: number): Promise<FaceBox[]> {
  const { data, params } = letterboxRgba(rgba, w, h);
  const input = new ort.Tensor("float32", tensorFromLetterboxedRgba(data), [1, 3, YUNET_INPUT_SIZE, YUNET_INPUT_SIZE]);
  const results = await session.run({ [session.inputNames[0]!]: input });
  const outputs: Record<string, { data: Float32Array }> = {};
  for (const name of session.outputNames) {
    const t = results[name];
    if (t) outputs[name] = { data: t.data as Float32Array };
  }
  return decodeYuNetOutputs(outputs).map((box) => boxToSource(box, params));
}

/**
 * The aligned face crop for a set of landmarks: planar RGB floats, 0–255,
 * in the given square size. Used for both the 112 recognition crop and the
 * 128 swap crop (different templates). RGB, not BGR: the official recipe
 * feeds both models RGB (blobFromImage swapRB=True).
 */
export function alignedCropRgb(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  landmarks: readonly Point[],
  size: 112 | 128,
): Float32Array {
  const dst = size === 112 ? ARCFACE_DST_112 : ARCFACE_DST_128;
  const forward = estimateSimilarity(landmarks, dst);
  const back = invertSimilarity(forward);
  const aligned = warpRgba(rgba, w, h, back, size, size);
  const out = new Float32Array(3 * size * size);
  const px = size * size;
  for (let i = 0; i < px; i++) {
    out[i] = aligned[i * 4]!; // R
    out[px + i] = aligned[i * 4 + 1]!; // G
    out[2 * px + i] = aligned[i * 4 + 2]!; // B
  }
  return out;
}

/** ArcFace input normalisation: (x − 127.5) / 127.5. */
function normalizeArcFace(rgb: Float32Array): Float32Array {
  const out = new Float32Array(rgb.length);
  for (let i = 0; i < rgb.length; i++) out[i] = (rgb[i]! - 127.5) / 127.5;
  return out;
}

/** Inswapper input normalisation: x / 255 (input_mean 0, input_std 255). */
function normalizeSwapTarget(rgb: Float32Array): Float32Array {
  const out = new Float32Array(rgb.length);
  for (let i = 0; i < rgb.length; i++) out[i] = rgb[i]! / 255;
  return out;
}

/** The 512-d identity embedding of one face (L2-normalised). */
export async function embeddingForFace(
  session: ort.InferenceSession,
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  landmarks: readonly Point[],
): Promise<Float32Array> {
  const rgb = alignedCropRgb(rgba, w, h, landmarks, 112);
  const input = new ort.Tensor("float32", normalizeArcFace(rgb), [1, 3, 112, 112]);
  const results = await session.run({ [session.inputNames[0]!]: input });
  const out = results[session.outputNames[0]!]!.data as Float32Array;
  return l2Normalize(Float32Array.from(out.slice(0, 512)));
}

/**
 * Run inswapper: the projected latent + the aligned 128 target face →
 * the swapped 128×128 face as RGBA. The latent is the emap-projected,
 * re-normalised embedding (see projectEmbedding in ./swapMath) — the
 * raw normed embedding on its own does not transfer identity.
 * Inputs are matched by shape (latent is the [1, 512] input, the face
 * is the [1, 3, 128, 128] input) so a mirror with different input names
 * still works.
 */
export async function swapFace(
  session: ort.InferenceSession,
  latent: Float32Array,
  targetRgba: Uint8ClampedArray,
  targetW: number,
  targetH: number,
  targetLandmarks: readonly Point[],
): Promise<Uint8ClampedArray> {
  const rgb = alignedCropRgb(targetRgba, targetW, targetH, targetLandmarks, 128);
  const targetTensor = new ort.Tensor("float32", normalizeSwapTarget(rgb), [1, 3, 128, 128]);
  const latentTensor = new ort.Tensor("float32", latent, [1, 512]);
  // Input names vary by mirror ("src"/"target" in the original,
  // "source"/"target" in the fp16 mirror): match by name first, and if the
  // runtime rejects the shapes, retry once with the two tensors swapped.
  // With exactly two inputs one of the two assignments must be right.
  const feedsFor = (embeddingFirst: boolean): Record<string, ort.Tensor> => {
    const feeds: Record<string, ort.Tensor> = {};
    for (const name of session.inputNames) {
      const lower = name.toLowerCase();
      const isEmbedding = /src|source|embed|latent/.test(lower);
      const isTarget = /target|tgt|face|image/.test(lower);
      feeds[name] = (isEmbedding && !isTarget) || (!isEmbedding && !isTarget && embeddingFirst) ? latentTensor : targetTensor;
    }
    return feeds;
  };
  let results: ort.InferenceSession.ReturnType;
  try {
    results = await session.run(feedsFor(true));
  } catch (e) {
    if (session.inputNames.length !== 2) throw e;
    results = await session.run(feedsFor(false));
  }
  const out = results[session.outputNames[0]!]!.data as Float32Array;
  // The output is RGB in [0,1] (the model's last step is a [0,1] range,
  // denormalised with x*255 in the official code) — no channel swap.
  const px = 128 * 128;
  const rgba = new Uint8ClampedArray(px * 4);
  for (let i = 0; i < px; i++) {
    rgba[i * 4] = Math.min(255, Math.max(0, out[i]! * 255));
    rgba[i * 4 + 1] = Math.min(255, Math.max(0, out[px + i]! * 255));
    rgba[i * 4 + 2] = Math.min(255, Math.max(0, out[2 * px + i]! * 255));
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

/** Paste the swapped 128 face back onto the target image with a feathered mask. */
export function pasteSwapped(
  targetRgba: Uint8ClampedArray,
  w: number,
  h: number,
  swapped128: Uint8ClampedArray,
  targetLandmarks: readonly Point[],
): Uint8ClampedArray {
  const forward = estimateSimilarity(targetLandmarks, ARCFACE_DST_128);
  // dstToSrc for these warps is the forward transform itself: it maps a
  // target-space pixel back to its aligned-crop coordinates.
  const warpedFace = warpRgba(swapped128, 128, 128, forward, w, h);
  const warpedMask = warpMask(faceMask128(), 128, 128, forward, w, h);
  const out = new Uint8ClampedArray(targetRgba);
  for (let i = 0; i < w * h; i++) {
    const m = warpedMask[i]!;
    if (m <= 0) continue;
    const o = i * 4;
    for (let c = 0; c < 3; c++) {
      out[o + c] = Math.round(targetRgba[o + c]! * (1 - m) + warpedFace[o + c]! * m);
    }
  }
  return out;
}

export interface SwapInput {
  targetRgba: Uint8ClampedArray;
  targetW: number;
  targetH: number;
  targetBox: FaceBox;
  sourceRgba: Uint8ClampedArray;
  sourceW: number;
  sourceH: number;
  sourceBox: FaceBox;
}

/** Full swap for one target face: embed the source face, project the
 *  embedding through the emap, swap, paste back. */
export async function runSwap(sessions: SwapSessions, input: SwapInput): Promise<Uint8ClampedArray> {
  const embedding = await embeddingForFace(
    sessions.recog,
    input.sourceRgba,
    input.sourceW,
    input.sourceH,
    input.sourceBox.landmarks,
  );
  const latent = projectEmbedding(embedding, sessions.emap);
  const swapped = await swapFace(
    sessions.swap,
    latent,
    input.targetRgba,
    input.targetW,
    input.targetH,
    input.targetBox.landmarks,
  );
  return pasteSwapped(input.targetRgba, input.targetW, input.targetH, swapped, input.targetBox.landmarks);
}

export { UI_COPY };
