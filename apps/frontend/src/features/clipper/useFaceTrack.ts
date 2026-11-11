"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { boxToSource, letterboxParams, YUNET_INPUT_SIZE } from "./yunet";
import { sampleTimesForRange } from "./faceReframe";
import type { TimedFaces } from "./cropPath";
import type { FaceIn, FaceOut } from "./face.worker";

/**
 * Face-track sampling for smart reframing v2 — the browser glue that feeds
 * cropPath.ts. Same discipline as the Level-1 assist (useFaceReframe), whose
 * consent it shares (same on-device model, same disclosure, same
 * `ce_face_assist` device flag):
 *
 *   - nothing is downloaded or run until the user has consented;
 *   - sampling happens on a hidden <video> + the YuNet worker, entirely
 *     on-device; frames never leave the browser;
 *   - `sampleRange` resolves with EVERY frame's faces (timestamped, source
 *     pixel coordinates) or null on any failure — a failed sample degrades
 *     the crop to the centre window, never blocks clip creation.
 */

export type FaceTrackState =
  | { kind: "idle" }
  | { kind: "working"; done: number; total: number }
  | { kind: "error"; message: string };

const CONSENT_KEY = "ce_face_assist";
/** Track sampling cap: ~3 fps over a 90 s clip ≈ 270 frames. */
export const TRACK_MAX_SAMPLES = 300;

export function faceAssistConsented(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function grantFaceAssistConsent(): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, "1");
  } catch {
    /* the run still proceeds; consent just won't persist */
  }
}

export function useFaceTrack(input: { sourceUrl: string | null; sourceWidth: number; sourceHeight: number }): {
  state: FaceTrackState;
  sampleRange: (startMs: number, endMs: number) => Promise<TimedFaces[] | null>;
  cancel: () => void;
} {
  const [state, setState] = useState<FaceTrackState>({ kind: "idle" });
  const runRef = useRef(0);
  const workerRef = useRef<Worker | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;

  const stopWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(() => stopWorker, [stopWorker]);

  const cancel = useCallback(() => {
    runRef.current += 1;
    stopWorker();
    setState({ kind: "idle" });
  }, [stopWorker]);

  const sampleRange = useCallback(
    async (startMs: number, endMs: number): Promise<TimedFaces[] | null> => {
      const { sourceUrl, sourceWidth, sourceHeight } = inputRef.current;
      if (!sourceUrl || !(endMs > startMs)) return null;
      const runId = ++runRef.current;
      const alive = () => runRef.current === runId;
      const times = sampleTimesForRange(startMs, endMs, 3, TRACK_MAX_SAMPLES);
      if (times.length === 0) return null;
      setState({ kind: "working", done: 0, total: times.length });

      const worker = new Worker(new URL("./face.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      const pending = new Map<number, { resolve: (f: TimedFaces["faces"]) => void; reject: (e: Error) => void }>();
      worker.addEventListener("message", (e: MessageEvent<FaceOut>) => {
        const msg = e.data;
        if (msg.type === "faces") {
          pending.get(msg.id)?.resolve(msg.faces);
          pending.delete(msg.id);
        } else if (msg.type === "error") {
          if (msg.id != null) {
            pending.get(msg.id)?.reject(new Error(msg.message));
            pending.delete(msg.id);
          } else {
            for (const p of pending.values()) p.reject(new Error(msg.message));
            pending.clear();
          }
        }
      });
      worker.addEventListener("error", () => {
        for (const p of pending.values()) p.reject(new Error("The face checker stopped unexpectedly."));
        pending.clear();
      });
      const detect = (id: number, rgba: ArrayBuffer): Promise<TimedFaces["faces"]> =>
        new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject });
          worker.postMessage({ type: "detect", id, rgba } satisfies FaceIn, [rgba]);
        });

      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.preload = "auto";
      video.playsInline = true;
      video.src = sourceUrl;
      const canvas = document.createElement("canvas");
      canvas.width = YUNET_INPUT_SIZE;
      canvas.height = YUNET_INPUT_SIZE;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const seek = (ms: number) =>
        new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("seek timeout")), 8000);
          video.onseeked = () => {
            clearTimeout(t);
            resolve();
          };
          video.onerror = () => {
            clearTimeout(t);
            reject(new Error("decode error"));
          };
          video.currentTime = ms / 1000;
        });

      try {
        worker.postMessage({ type: "load" } satisfies FaceIn);
        await new Promise<void>((resolve, reject) => {
          if (video.readyState >= 1) return resolve();
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error("The source video could not be read."));
        });
        const params = letterboxParams(sourceWidth, sourceHeight);
        const samples: TimedFaces[] = [];
        for (let i = 0; i < times.length; i++) {
          if (!alive()) return null;
          await seek(times[i]!);
          if (!alive() || !ctx) return null;
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, YUNET_INPUT_SIZE, YUNET_INPUT_SIZE);
          ctx.drawImage(video, params.padX, params.padY, params.drawnW, params.drawnH);
          const image = ctx.getImageData(0, 0, YUNET_INPUT_SIZE, YUNET_INPUT_SIZE);
          const buffer = image.data.buffer.slice(0) as ArrayBuffer;
          const faces = await detect(i, buffer);
          if (!alive()) return null;
          samples.push({ atMs: times[i]!, faces: faces.map((f) => boxToSource(f, params)) });
          setState({ kind: "working", done: i + 1, total: times.length });
        }
        if (alive()) setState({ kind: "idle" });
        return samples;
      } catch (e) {
        if (alive()) {
          setState({ kind: "error", message: e instanceof Error ? e.message : "Face detection didn't work on this device." });
        }
        return null;
      } finally {
        if (alive()) stopWorker();
        video.removeAttribute("src");
        video.load();
      }
    },
    [stopWorker],
  );

  return { state, sampleRange, cancel };
}
