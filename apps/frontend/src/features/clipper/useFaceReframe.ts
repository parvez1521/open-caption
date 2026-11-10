"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { boxToSource, letterboxParams, YUNET_INPUT_SIZE, type FaceBox } from "./yunet";
import { sampleTimesForRange, suggestWindowFromFaces } from "./faceReframe";
import type { CropWindow } from "./reframe";
import type { FaceIn, FaceOut } from "./face.worker";

/**
 * Face-centring assist for the clipper's reframe control (G5 Level 1) — the
 * main-thread half. Deliberately thin browser glue around the tested pure
 * cores (yunet.ts decode, faceReframe.ts aggregation), mirroring
 * useSceneAnalysis' hidden-<video> sampling pattern:
 *
 *   - OPT-IN, with the model disclosure up front: nothing is downloaded or
 *     run until the user confirms (the consent is remembered on this device,
 *     like other editor preferences);
 *   - samples the CLIP's range at ~3 fps (capped), draws each frame
 *     letterboxed at 640×640, and sends the pixels to face.worker.ts;
 *   - a suggestion is applied ONLY through onSuggest (the control's own
 *     window setter), so the user sees the window and can drag it back;
 *   - no face / low presence / any failure → the window is left exactly as
 *     it was, and the state says which happened. Never blocks clip creation.
 */
export type FaceAssistState =
  | { kind: "idle" }
  | { kind: "consent" }
  | { kind: "working"; done: number; total: number }
  | { kind: "applied" }
  | { kind: "noface" }
  | { kind: "error"; message: string };

const CONSENT_KEY = "ce_face_assist";

export function useFaceReframe(input: {
  sourceUrl: string | null;
  startMs: number;
  endMs: number;
  sourceWidth: number;
  sourceHeight: number;
  /** the window as it stands when the run starts — its zoom is preserved */
  currentWindow: CropWindow;
  onSuggest: (win: CropWindow) => void;
}): { state: FaceAssistState; begin: () => void; confirm: () => void; dismiss: () => void; cancel: () => void } {
  const [state, setState] = useState<FaceAssistState>({ kind: "idle" });
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

  const run = useCallback(async () => {
    const { sourceUrl, startMs, endMs, sourceWidth, sourceHeight, currentWindow, onSuggest } = inputRef.current;
    if (!sourceUrl) {
      setState({ kind: "error", message: "The source video isn't available to check." });
      return;
    }
    const runId = ++runRef.current;
    const alive = () => runRef.current === runId;
    const times = sampleTimesForRange(startMs, endMs);
    if (times.length === 0) {
      setState({ kind: "noface" });
      return;
    }
    setState({ kind: "working", done: 0, total: times.length });

    const worker = new Worker(new URL("./face.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    const pending = new Map<number, { resolve: (f: FaceBox[]) => void; reject: (e: Error) => void }>();
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
    const detect = (id: number, rgba: ArrayBuffer): Promise<FaceBox[]> =>
      new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ type: "detect", id, rgba } satisfies FaceIn, [rgba]);
      });
    const send = (m: FaceIn) => worker.postMessage(m);

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
        video.onseeked = () => { clearTimeout(t); resolve(); };
        video.onerror = () => { clearTimeout(t); reject(new Error("decode error")); };
        video.currentTime = ms / 1000;
      });

    try {
      send({ type: "load" });
      await new Promise<void>((resolve, reject) => {
        if (video.readyState >= 1) return resolve();
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("The source video could not be read."));
      });
      const params = letterboxParams(sourceWidth, sourceHeight);
      const samples: FaceBox[][] = [];
      for (let i = 0; i < times.length; i++) {
        if (!alive()) return;
        await seek(times[i]!);
        if (!alive() || !ctx) return;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, YUNET_INPUT_SIZE, YUNET_INPUT_SIZE);
        ctx.drawImage(video, params.padX, params.padY, params.drawnW, params.drawnH);
        const image = ctx.getImageData(0, 0, YUNET_INPUT_SIZE, YUNET_INPUT_SIZE);
        const buffer = image.data.buffer.slice(0) as ArrayBuffer;
        const faces = await detect(i, buffer);
        if (!alive()) return;
        samples.push(faces.map((f) => boxToSource(f, params)));
        setState({ kind: "working", done: i + 1, total: times.length });
      }
      const suggestion = suggestWindowFromFaces(samples, sourceWidth, sourceHeight, currentWindow);
      if (!alive()) return;
      if (suggestion) {
        onSuggest(suggestion);
        setState({ kind: "applied" });
      } else {
        setState({ kind: "noface" });
      }
    } catch (e) {
      if (alive()) setState({ kind: "error", message: e instanceof Error ? e.message : "Face detection didn't work on this device." });
    } finally {
      if (alive()) stopWorker();
      video.removeAttribute("src");
      video.load();
    }
  }, [stopWorker]);

  const begin = useCallback(() => {
    let consented = false;
    try {
      consented = window.localStorage.getItem(CONSENT_KEY) === "1";
    } catch { /* storage unavailable — ask every time */ }
    if (consented) void run();
    else setState({ kind: "consent" });
  }, [run]);

  const confirm = useCallback(() => {
    try {
      window.localStorage.setItem(CONSENT_KEY, "1");
    } catch { /* the run still proceeds; consent just won't persist */ }
    void run();
  }, [run]);

  const dismiss = useCallback(() => setState({ kind: "idle" }), []);

  return { state, begin, confirm, dismiss, cancel };
}
