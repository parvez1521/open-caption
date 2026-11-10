/// <reference lib="webworker" />
/**
 * YuNet face detection in a dedicated Web Worker (G5 Level 1), modelled on
 * whisper.worker.ts / text.worker.ts: the model + ONNX session live here so
 * the page stays smooth, and every failure is posted back as an "error"
 * message the caller turns into "couldn't check for a face" — the crop
 * window is never touched on failure.
 *
 * The model file is vendored with the site (public/models/, MIT — see
 * /credits), so "loading the model" is a same-origin fetch of ~0.25 MB; the
 * ONNX Runtime Web WASM ships with the app bundle exactly as it already
 * does for the speech and text workers. Nothing is uploaded: frames arrive
 * from the main thread as raw pixels and only boxes go back.
 */
import * as ort from "onnxruntime-web";
import { decodeYuNetOutputs, tensorFromLetterboxedRgba, type FaceBox } from "./yunet";

export type FaceIn =
  | { type: "load" }
  | { type: "detect"; id: number; rgba: ArrayBuffer };
export type FaceOut =
  | { type: "ready" }
  | { type: "faces"; id: number; faces: FaceBox[] }
  | { type: "error"; message: string; id?: number };

const post = (m: FaceOut) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

const MODEL_URL = "/models/face_detection_yunet_2023mar.onnx";

let session: ort.InferenceSession | null = null;
let loading: Promise<ort.InferenceSession> | null = null;

function load(): Promise<ort.InferenceSession> {
  if (session) return Promise.resolve(session);
  if (loading) return loading;
  const p = (async () => {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`Face model download failed (${res.status}).`);
    const bytes = await res.arrayBuffer();
    const created = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"] });
    session = created;
    return created;
  })().finally(() => {
    if (loading === p) loading = null;
  });
  loading = p;
  return p;
}

async function detect(id: number, rgba: ArrayBuffer): Promise<void> {
  const s = await load();
  const data = tensorFromLetterboxedRgba(new Uint8ClampedArray(rgba));
  const input = new ort.Tensor("float32", data, [1, 3, 640, 640]);
  const results = await s.run({ [s.inputNames[0]!]: input });
  const outputs: Record<string, { data: Float32Array }> = {};
  for (const name of s.outputNames) {
    const t = results[name];
    if (t) outputs[name] = { data: t.data as Float32Array };
  }
  post({ type: "faces", id, faces: decodeYuNetOutputs(outputs) });
}

(self as unknown as DedicatedWorkerGlobalScope).addEventListener("message", (e: MessageEvent<FaceIn>) => {
  const msg = e.data;
  if (msg.type === "load") {
    load().then(
      () => post({ type: "ready" }),
      (err: unknown) => post({ type: "error", message: err instanceof Error ? err.message : "The face model could not be loaded." }),
    );
  } else if (msg.type === "detect") {
    detect(msg.id, msg.rgba).catch((err: unknown) =>
      post({ type: "error", id: msg.id, message: err instanceof Error ? err.message : "Face detection failed." }),
    );
  }
});
