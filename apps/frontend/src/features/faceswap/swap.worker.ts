/// <reference lib="webworker" />
/**
 * Face swap in a dedicated Web Worker, modelled on the clipper's
 * face.worker.ts: the three ONNX sessions live here so the page stays
 * smooth, and every failure is posted back as an "error" message the
 * caller turns into neutral copy (see ./copy.ts — the word "model" never
 * reaches the user).
 *
 * The source embedding is held here after "setSource", so the raw
 * identity vector never crosses into page code.
 */
import { UI_COPY } from "./copy";
import { detectFaces, loadSessions, runSwap, type SwapSessions } from "./swapPipeline";
import type { FaceBox } from "../clipper/yunet";

export type SwapIn =
  | { type: "prepare" }
  | { type: "detect"; id: number; rgba: ArrayBuffer; width: number; height: number }
  | { type: "setSource"; id: number; rgba: ArrayBuffer; width: number; height: number; box: FaceBox }
  | { type: "swap"; id: number; rgba: ArrayBuffer; width: number; height: number; box: FaceBox };

export type SwapOut =
  | { type: "progress"; phase: "preparing" | "finding" | "swapping" | "finishing"; fraction: number | null }
  | { type: "ready" }
  | { type: "faces"; id: number; faces: FaceBox[] }
  | { type: "sourceReady"; id: number }
  | { type: "swapped"; id: number; rgba: ArrayBuffer; width: number; height: number }
  | { type: "error"; message: string; id?: number };

const post = (m: SwapOut) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

let sessions: SwapSessions | null = null;
let loading: Promise<SwapSessions> | null = null;
let source: { rgba: Uint8ClampedArray; width: number; height: number; box: FaceBox } | null = null;

function prepare(): Promise<SwapSessions> {
  if (sessions) return Promise.resolve(sessions);
  if (loading) return loading;
  const p = loadSessions({
    onProgress: (fraction) => post({ type: "progress", phase: "preparing", fraction }),
  })
    .then((s) => {
      sessions = s;
      return s;
    })
    .finally(() => {
      if (loading === p) loading = null;
    });
  loading = p;
  return p;
}

async function detect(id: number, rgba: ArrayBuffer, width: number, height: number): Promise<void> {
  const s = await prepare();
  post({ type: "progress", phase: "finding", fraction: null });
  const faces = await detectFaces(s.detect, new Uint8ClampedArray(rgba), width, height);
  post({ type: "faces", id, faces });
}

async function swap(id: number, rgba: ArrayBuffer, width: number, height: number, box: FaceBox): Promise<void> {
  const s = await prepare();
  if (!source) throw new Error(UI_COPY.swapFailed);
  post({ type: "progress", phase: "swapping", fraction: null });
  const out = await runSwap(s, {
    targetRgba: new Uint8ClampedArray(rgba),
    targetW: width,
    targetH: height,
    targetBox: box,
    sourceRgba: source.rgba,
    sourceW: source.width,
    sourceH: source.height,
    sourceBox: source.box,
  });
  post({ type: "progress", phase: "finishing", fraction: null });
  const buf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  post({ type: "swapped", id, rgba: buf, width, height });
}

(self as unknown as DedicatedWorkerGlobalScope).addEventListener("message", (e: MessageEvent<SwapIn>) => {
  const msg = e.data;
  // Raw errors are logged for debugging but never reach the page: the
  // user only ever sees the neutral copy from ./copy.ts.
  const fail = (err: unknown, id?: number, message: string = UI_COPY.loadFailed) => {
    // eslint-disable-next-line no-console
    console.error("[face-swap]", err);
    post({ type: "error", message, id });
  };
  if (msg.type === "prepare") {
    prepare().then(
      () => post({ type: "ready" }),
      (err: unknown) => fail(err),
    );
  } else if (msg.type === "detect") {
    detect(msg.id, msg.rgba, msg.width, msg.height).catch((err: unknown) => fail(err, msg.id));
  } else if (msg.type === "setSource") {
    source = { rgba: new Uint8ClampedArray(msg.rgba), width: msg.width, height: msg.height, box: msg.box };
    post({ type: "sourceReady", id: msg.id });
  } else if (msg.type === "swap") {
    swap(msg.id, msg.rgba, msg.width, msg.height, msg.box).catch((err: unknown) => fail(err, msg.id, UI_COPY.swapFailed));
  }
});
