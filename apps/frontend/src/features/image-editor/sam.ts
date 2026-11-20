"use client";

import type { Mask } from "./types";
import type { SamIn, SamOut } from "./sam.worker";

/**
 * SAM client: owns one worker per tab and serialises its calls (a segment
 * takes ~1-2 s, so clicks queue instead of overlapping). A new image loads
 * fresh embeddings; the worker keeps the model itself in memory.
 */
type Pending<T> = {
  resolve: (v: T) => void;
  reject: (e: Error) => void;
};

let worker: Worker | null = null;
let queue: Promise<unknown> = Promise.resolve();
let maskWaiters = new Map<string, Pending<{ mask: Mask; score: number }>>();
let progressCb: ((stage: "download" | "encode", progress: number) => void) | null = null;
let readyWaiter: Pending<void> | null = null;

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./sam.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<SamOut>) => {
    const msg = e.data;
    if (msg.type === "progress") progressCb?.(msg.stage, msg.progress);
    else if (msg.type === "ready") {
      const w = readyWaiter;
      readyWaiter = null;
      w?.resolve();
    }
    else if (msg.type === "mask") {
      const key = `${msg.imageId}:${msg.x},${msg.y}`;
      const w = maskWaiters.get(key);
      if (w) {
        maskWaiters.delete(key);
        w.resolve({
          mask: { width: msg.width, height: msg.height, data: new Uint8Array(msg.mask) } as Mask,
          score: msg.score,
        });
      }
    } else if (msg.type === "error") {
      const err = new Error(msg.message);
      const rw = readyWaiter;
      readyWaiter = null;
      rw?.reject(err);
      for (const [, w] of maskWaiters) w.reject(err);
      maskWaiters.clear();
    }
  };
  worker.onerror = () => {
    const err = new Error("The segmentation worker crashed. Reload the page and try again.");
    const rw = readyWaiter;
    readyWaiter = null;
    rw?.reject(err);
    for (const [, w] of maskWaiters) w.reject(err);
    maskWaiters.clear();
  };
  return worker;
}

function send(msg: SamIn, transfer: Transferable[] = []) {
  getWorker().postMessage(msg, transfer);
}

/** Start (or reuse) SAM for an image; resolves when embeddings are ready. */
export function loadImageForSam(
  imageId: string,
  data: Uint8ClampedArray,
  width: number,
  height: number,
  onProgress: (stage: "download" | "encode", progress: number) => void,
): Promise<void> {
  progressCb = onProgress;
  const run = async () => {
    const done = new Promise<void>((resolve, reject) => {
      readyWaiter = { resolve, reject };
    });
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    send({ type: "load", imageId, data: buf, width, height }, [buf]);
    await done;
  };
  queue = queue.then(run, run);
  return queue as Promise<void>;
}

/** Segment the object under a point (base-image coordinates). */
export function segmentPoint(imageId: string, x: number, y: number): Promise<{ mask: Mask; score: number }> {
  const run = async () => {
    const key = `${imageId}:${x},${y}`;
    const p = new Promise<{ mask: Mask; score: number }>((resolve, reject) => {
      maskWaiters.set(key, { resolve, reject });
    });
    send({ type: "segment", imageId, x, y });
    return p;
  };
  queue = queue.then(run, run);
  return queue as Promise<{ mask: Mask; score: number }>;
}

/** Drop the worker entirely (new image, or leaving the page). */
export function disposeSamWorker() {
  if (!worker) return;
  try {
    worker.postMessage({ type: "dispose" } satisfies SamIn);
  } catch {
    /* already gone */
  }
  worker.terminate();
  worker = null;
  queue = Promise.resolve();
  maskWaiters.clear();
  readyWaiter = null;
}
