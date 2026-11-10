/**
 * YuNet face detection — the pure half (G5 Level 1, per
 * research/g5-face-tracking-evaluation.md): letterbox geometry, the ONNX
 * output decode, and NMS. No DOM, no runtime imports — the worker
 * (face.worker.ts) feeds this real tensors, and the tests feed it synthetic
 * ones built from the same formulas.
 *
 * The decode implements OpenCV's FaceDetectorYN post-processing for
 * face_detection_yunet_2023mar.onnx (MIT, OpenCV Zoo; vendored at
 * public/models/ with its licence), verified empirically on 2026-11-11
 * against the real model: a portrait produced exactly one detection
 * (score 0.95) whose box framed the face and whose 5 landmarks landed on
 * the eyes, nose tip and mouth corners.
 *
 * Model facts: input is a 640×640 letterboxed frame, BGR channel order,
 * raw 0–255 values (OpenCV blobFromImage defaults — scale 1, no mean
 * subtraction). Outputs are 12 tensors named cls/obj/bbox/kps × strides
 * {8, 16, 32}, each [1, (640/s)², C]. cls/obj are ALREADY probabilities:
 * score = sqrt(cls · obj). Boxes decode as centre = (cell + offset) · stride,
 * size = exp(size) · stride; landmarks likewise as (cell + offset) · stride.
 */
export const YUNET_INPUT_SIZE = 640;
export const YUNET_STRIDES = [8, 16, 32] as const;
export const YUNET_SCORE_THRESHOLD = 0.6;
export const YUNET_NMS_THRESHOLD = 0.3;
/** The vendored model's byte size — what the opt-in disclosure quotes. */
export const YUNET_MODEL_BYTES = 232_589;

export interface FaceBox {
  /** left, in the coordinate space of the frame the box was decoded from */
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
  /** 5 landmarks (right eye, left eye, nose tip, right mouth corner, left mouth corner), same space */
  landmarks: Array<readonly [number, number]>;
}

export interface LetterboxParams {
  scale: number;
  padX: number;
  padY: number;
  /** the drawn (resized) frame size inside the 640×640 canvas */
  drawnW: number;
  drawnH: number;
}

/** How a source frame of (srcW × srcH) maps into the 640×640 model input. */
export function letterboxParams(srcW: number, srcH: number): LetterboxParams {
  const scale = YUNET_INPUT_SIZE / Math.max(srcW, srcH);
  const drawnW = Math.round(srcW * scale);
  const drawnH = Math.round(srcH * scale);
  return { scale, padX: Math.floor((YUNET_INPUT_SIZE - drawnW) / 2), padY: Math.floor((YUNET_INPUT_SIZE - drawnH) / 2), drawnW, drawnH };
}

/** A box decoded in letterbox space → the original frame's pixel space. */
export function boxToSource(box: FaceBox, p: LetterboxParams): FaceBox {
  const inv = 1 / p.scale;
  return {
    x: (box.x - p.padX) * inv,
    y: (box.y - p.padY) * inv,
    w: box.w * inv,
    h: box.h * inv,
    score: box.score,
    landmarks: box.landmarks.map(([lx, ly]) => [(lx - p.padX) * inv, (ly - p.padY) * inv] as const),
  };
}

/**
 * An already-letterboxed 640×640 RGBA buffer → the model's input tensor:
 * planar BGR, raw 0–255 floats (see the header for why BGR and unscaled).
 */
export function tensorFromLetterboxedRgba(rgba: Uint8ClampedArray | Uint8Array): Float32Array {
  const px = YUNET_INPUT_SIZE * YUNET_INPUT_SIZE;
  const out = new Float32Array(3 * px);
  for (let i = 0; i < px; i++) {
    out[i] = rgba[i * 4 + 2]!; // B
    out[px + i] = rgba[i * 4 + 1]!; // G
    out[2 * px + i] = rgba[i * 4]!; // R
  }
  return out;
}

export interface YuNetOutputs {
  [name: string]: { data: Float32Array | number[] } | undefined;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function iou(a: FaceBox, b: FaceBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter <= 0) return 0;
  return inter / (a.w * a.h + b.w * b.h - inter);
}

/** Non-maximum suppression: highest score first, drop boxes overlapping a kept box by ≥ threshold IoU. */
export function nmsFaces(faces: FaceBox[], threshold = YUNET_NMS_THRESHOLD): FaceBox[] {
  const sorted = [...faces].sort((a, b) => b.score - a.score);
  const kept: FaceBox[] = [];
  for (const f of sorted) {
    if (kept.every((k) => iou(f, k) < threshold)) kept.push(f);
  }
  return kept;
}

/**
 * Decode the 12 output tensors (letterbox coordinate space), threshold and
 * NMS. Missing or malformed tensors decode to no faces rather than throwing —
 * a detector hiccup must read as "no face found", never as a crash.
 */
export function decodeYuNetOutputs(
  outputs: YuNetOutputs,
  opts: { scoreThreshold?: number; nmsThreshold?: number } = {},
): FaceBox[] {
  const scoreThreshold = opts.scoreThreshold ?? YUNET_SCORE_THRESHOLD;
  const faces: FaceBox[] = [];
  for (const stride of YUNET_STRIDES) {
    const cls = outputs[`cls_${stride}`]?.data;
    const obj = outputs[`obj_${stride}`]?.data;
    const bbox = outputs[`bbox_${stride}`]?.data;
    const kps = outputs[`kps_${stride}`]?.data;
    if (!cls || !obj || !bbox || !kps) continue;
    const grid = YUNET_INPUT_SIZE / stride;
    const cells = grid * grid;
    if (cls.length < cells || obj.length < cells || bbox.length < cells * 4 || kps.length < cells * 10) continue;
    for (let n = 0; n < cells; n++) {
      const score = Math.sqrt(clamp01(cls[n]!) * clamp01(obj[n]!));
      if (score < scoreThreshold) continue;
      const row = Math.floor(n / grid);
      const col = n % grid;
      const cx = (col + bbox[n * 4]!) * stride;
      const cy = (row + bbox[n * 4 + 1]!) * stride;
      const w = Math.exp(bbox[n * 4 + 2]!) * stride;
      const h = Math.exp(bbox[n * 4 + 3]!) * stride;
      const landmarks: FaceBox["landmarks"] = [];
      for (let k = 0; k < 5; k++) {
        landmarks.push([(col + kps[n * 10 + 2 * k]!) * stride, (row + kps[n * 10 + 2 * k + 1]!) * stride]);
      }
      faces.push({ x: cx - w / 2, y: cy - h / 2, w, h, score, landmarks });
    }
  }
  return nmsFaces(faces, opts.nmsThreshold ?? YUNET_NMS_THRESHOLD);
}
