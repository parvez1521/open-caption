"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { UI_COPY } from "./copy";
import { pickLargestFace, recordSwap, scaleToMaxEdge, swapsLeftToday, type CounterStore } from "./swapMath";
import type { SwapIn, SwapOut } from "./swap.worker";
import type { FaceBox } from "../clipper/yunet";

type Step = "upload" | "pickFace" | "selfie" | "ready" | "swapping" | "done";

interface Progress {
  phase: "preparing" | "finding" | "swapping" | "finishing";
  fraction: number | null;
}

const phaseCopy: Record<Progress["phase"], string> = {
  preparing: UI_COPY.preparing,
  finding: UI_COPY.findingFaces,
  swapping: UI_COPY.swapping,
  finishing: UI_COPY.finishing,
};

const store: CounterStore =
  typeof window !== "undefined"
    ? window.localStorage
    : { getItem: () => null, setItem: () => {} };

function imageDataFromFile(file: File): Promise<{ rgba: Uint8ClampedArray; width: number; height: number; scaled: boolean }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { w, h, scaled } = scaleToMaxEdge(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas unavailable."));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      resolve({ rgba: new Uint8ClampedArray(data), width: w, height: h, scaled });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    img.src = url;
  });
}

function rgbaToUrl(rgba: Uint8ClampedArray, w: number, h: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  return canvas.toDataURL("image/png");
}

export const FaceSwapTool: React.FC = () => {
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [thumbSize, setThumbSize] = useState<{ w: number; h: number } | null>(null);
  const [thumbScaled, setThumbScaled] = useState(false);
  const [faces, setFaces] = useState<FaceBox[]>([]);
  const [selectedFace, setSelectedFace] = useState<number>(0);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [swapsLeft, setSwapsLeft] = useState<number>(() => swapsLeftToday(store));
  const [cameraOn, setCameraOn] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<number, { resolve: (m: SwapOut) => void; reject: (e: Error) => void }>());
  const idRef = useRef(1);
  const thumbRgbaRef = useRef<Uint8ClampedArray | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const getWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL("./swap.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<SwapOut>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        setProgress({ phase: msg.phase, fraction: msg.fraction });
        return;
      }
      if (msg.type === "error") {
        const pending = msg.id !== undefined ? pendingRef.current.get(msg.id) : undefined;
        if (pending) {
          pendingRef.current.delete(msg.id!);
          pending.reject(new Error(msg.message));
        } else {
          setError(msg.message);
          setProgress(null);
        }
        return;
      }
      if (msg.type === "ready" || msg.type === "faces" || msg.type === "sourceReady" || msg.type === "swapped") {
        const id = "id" in msg ? msg.id : undefined;
        if (id !== undefined) {
          const pending = pendingRef.current.get(id);
          if (pending) {
            pendingRef.current.delete(id);
            pending.resolve(msg);
          }
        }
        if (msg.type === "ready" || msg.type === "sourceReady") setProgress(null);
      }
    };
    worker.onerror = () => {
      setError(UI_COPY.loadFailed);
      setProgress(null);
    };
    workerRef.current = worker;
    return worker;
  }, []);

  const callWorker = useCallback(
    (msg: SwapIn, transfer?: Transferable[]): Promise<SwapOut> => {
      const worker = getWorker();
      const id = idRef.current++;
      const full = { ...msg, id } as SwapIn & { id: number };
      return new Promise<SwapOut>((resolve, reject) => {
        pendingRef.current.set(id, { resolve, reject });
        worker.postMessage(full, transfer ?? []);
      });
    },
    [getWorker],
  );

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  const resetAll = useCallback(() => {
    stopCamera();
    setStep("upload");
    setError(null);
    setProgress(null);
    setThumbUrl(null);
    setThumbSize(null);
    setThumbScaled(false);
    setFaces([]);
    setSelectedFace(0);
    setSelfieUrl(null);
    setResultUrl(null);
    thumbRgbaRef.current = null;
  }, [stopCamera]);

  const onThumbFile = useCallback(
    async (file: File) => {
      setError(null);
      setProgress({ phase: "finding", fraction: null });
      try {
        const { rgba, width, height, scaled } = await imageDataFromFile(file);
        thumbRgbaRef.current = rgba;
        setThumbUrl(rgbaToUrl(rgba, width, height));
        setThumbSize({ w: width, h: height });
        setThumbScaled(scaled);
        const buf = rgba.buffer.slice(rgba.byteOffset, rgba.byteOffset + rgba.byteLength) as ArrayBuffer;
        const res = await callWorker({ type: "detect", rgba: buf, width, height } as SwapIn, [buf]);
        if (res.type !== "faces") throw new Error(UI_COPY.loadFailed);
        setProgress(null);
        if (res.faces.length === 0) {
          setError(UI_COPY.noFaceInThumbnail);
          setStep("upload");
          return;
        }
        const largest = pickLargestFace(res.faces);
        setFaces(res.faces);
        setSelectedFace(largest ? res.faces.indexOf(largest) : 0);
        setStep("pickFace");
      } catch (e) {
        setProgress(null);
        setError(e instanceof Error ? e.message : UI_COPY.loadFailed);
      }
    },
    [callWorker],
  );

  const startCamera = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(UI_COPY.noCamera);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      setCameraOn(true);
      setStep("selfie");
      // The video element mounts with the step; attach the stream on the next frame.
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
    } catch {
      setError(UI_COPY.cameraDenied);
    }
  }, []);

  const takeSelfie = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    setError(null);
    setProgress({ phase: "finding", fraction: null });
    try {
      const { w, h } = scaleToMaxEdge(video.videoWidth, video.videoHeight);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0, w, h);
      const rgba = new Uint8ClampedArray(ctx.getImageData(0, 0, w, h).data);
      const buf = rgba.buffer.slice(rgba.byteOffset, rgba.byteOffset + rgba.byteLength) as ArrayBuffer;
      const res = await callWorker({ type: "detect", rgba: buf, width: w, height: h } as SwapIn, [buf]);
      if (res.type !== "faces") throw new Error(UI_COPY.loadFailed);
      setProgress(null);
      if (res.faces.length === 0) {
        setError(UI_COPY.noFaceInSelfie);
        return;
      }
      if (res.faces.length > 1) {
        setError(UI_COPY.tooManyFacesInSelfie);
        return;
      }
      const box = res.faces[0]!;
      const srcBuf = rgba.buffer.slice(rgba.byteOffset, rgba.byteOffset + rgba.byteLength) as ArrayBuffer;
      const setRes = await callWorker({ type: "setSource", rgba: srcBuf, width: w, height: h, box } as SwapIn, [srcBuf]);
      if (setRes.type !== "sourceReady") throw new Error(UI_COPY.loadFailed);
      setSelfieUrl(rgbaToUrl(rgba, w, h));
      stopCamera();
      setStep("ready");
    } catch (e) {
      setProgress(null);
      setError(e instanceof Error ? e.message : UI_COPY.loadFailed);
    }
  }, [callWorker, stopCamera]);

  const runSwap = useCallback(async () => {
    if (!thumbRgbaRef.current || !thumbSize || faces.length === 0) return;
    if (swapsLeftToday(store) <= 0) {
      setError(UI_COPY.limitReached);
      return;
    }
    const box = faces[selectedFace]!;
    setError(null);
    setStep("swapping");
    setProgress({ phase: "swapping", fraction: null });
    try {
      const rgba = thumbRgbaRef.current;
      const buf = rgba.buffer.slice(rgba.byteOffset, rgba.byteOffset + rgba.byteLength) as ArrayBuffer;
      const res = await callWorker({ type: "swap", rgba: buf, width: thumbSize.w, height: thumbSize.h, box } as SwapIn, [buf]);
      if (res.type !== "swapped") throw new Error(UI_COPY.swapFailed);
      // The worker transferred the buffer; keep a fresh copy for a retry.
      const out = new Uint8ClampedArray(res.rgba);
      setResultUrl(rgbaToUrl(out, res.width, res.height));
      setSwapsLeft(recordSwap(store));
      setProgress(null);
      setStep("done");
    } catch (e) {
      setProgress(null);
      setStep("ready");
      setError(e instanceof Error ? e.message : UI_COPY.swapFailed);
    }
  }, [callWorker, faces, selectedFace, thumbSize]);

  const downloadResult = useCallback(() => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = "captionit-face-swap.png";
    a.click();
  }, [resultUrl]);

  const selectedBox = faces[selectedFace] ?? null;

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-4 rounded-xl border border-[#FFA946]/60 bg-[#FFA946]/15 px-4 py-3 text-sm text-[#FFFFEB]">
          {error}
        </p>
      ) : null}

      {progress ? (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4" aria-live="polite">
          <p className="text-sm font-semibold text-[#FFFFEB]">{phaseCopy[progress.phase]}</p>
          {progress.phase === "preparing" ? <p className="mt-1 text-xs text-[#FFFFEB]/60">{UI_COPY.preparingDetail}</p> : null}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            {progress.fraction !== null ? (
              <div className="h-full rounded-full bg-[#34D399] transition-[width] duration-300" style={{ width: `${Math.max(2, progress.fraction * 100)}%` }} />
            ) : (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-[#34D399]" />
            )}
          </div>
          {progress.fraction !== null ? <p className="mt-2 text-xs text-[#FFFFEB]/60">{Math.round(progress.fraction * 100)}%</p> : null}
        </div>
      ) : null}

      {step === "upload" ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
          <h2 className="font-sora text-[18px] font-bold">1. Your thumbnail</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#FFFFEB]/70">Upload the thumbnail or photo you want your face in. It never leaves this tab.</p>
          <label className="mt-5 flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/25 px-4 py-8 text-center hover:border-[#34D399]/60">
            <span className="font-sora text-sm font-bold text-[#FFFFEB]">Choose an image</span>
            <span className="text-xs text-[#FFFFEB]/60">PNG, JPG or WebP · up to 1280 px on the long edge</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onThumbFile(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      ) : null}

      {step === "pickFace" && thumbUrl && thumbSize && selectedBox ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
          <h2 className="font-sora text-[18px] font-bold">1. Pick the face to replace</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#FFFFEB]/70">
            {faces.length > 1 ? `${faces.length} faces found. Tap the one to replace.` : "One face found. This is the face that will be replaced."}
            {thumbScaled ? ` ${UI_COPY.resizedNote}` : ""}
          </p>
          <div className="relative mx-auto mt-5 max-w-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbUrl} alt="Your thumbnail" className="w-full rounded-xl" />
            {faces.map((f, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Face ${i + 1}${i === selectedFace ? ", selected" : ""}`}
                aria-pressed={i === selectedFace}
                onClick={() => setSelectedFace(i)}
                className={`absolute rounded-lg border-2 ${i === selectedFace ? "border-[#34D399]" : "border-white/50"}`}
                style={{
                  left: `${(f.x / thumbSize.w) * 100}%`,
                  top: `${(f.y / thumbSize.h) * 100}%`,
                  width: `${(f.w / thumbSize.w) * 100}%`,
                  height: `${(f.h / thumbSize.h) * 100}%`,
                }}
              />
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => void startCamera()} className="inline-flex items-center justify-center rounded-full bg-[#34D399] px-6 py-3 font-sora text-[14px] font-bold text-[#0B1512]">
              Continue to your selfie
            </button>
            <button type="button" onClick={resetAll} className="inline-flex items-center justify-center rounded-full border border-white/25 px-6 py-3 font-sora text-[14px] font-semibold text-[#FFFFEB]">
              Use a different image
            </button>
          </div>
        </div>
      ) : null}

      {step === "selfie" ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
          <h2 className="font-sora text-[18px] font-bold">2. Your selfie</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#FFFFEB]/70">Face the camera, front-on, in good light. Your selfie is used only for this swap and never leaves this tab.</p>
          <div className="relative mx-auto mt-5 max-w-md overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} autoPlay playsInline muted className="w-full" />
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 aspect-[3/4] h-[78%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-[#34D399]" />
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => void takeSelfie()} disabled={!cameraOn} className="inline-flex items-center justify-center rounded-full bg-[#34D399] px-6 py-3 font-sora text-[14px] font-bold text-[#0B1512] disabled:opacity-50">
              Take selfie
            </button>
            <button type="button" onClick={resetAll} className="inline-flex items-center justify-center rounded-full border border-white/25 px-6 py-3 font-sora text-[14px] font-semibold text-[#FFFFEB]">
              Start over
            </button>
          </div>
        </div>
      ) : null}

      {step === "ready" && thumbUrl && selfieUrl ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
          <h2 className="font-sora text-[18px] font-bold">3. Swap your face</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#FFFFEB]/70">Your selfie is ready. One swap at a time — {UI_COPY.swapsLeft(swapsLeft)}.</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl} alt="Your thumbnail" className="w-full rounded-xl" />
              <figcaption className="mt-2 text-center text-xs text-[#FFFFEB]/60">Thumbnail</figcaption>
            </figure>
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selfieUrl} alt="Your selfie" className="w-full rounded-xl" />
              <figcaption className="mt-2 text-center text-xs text-[#FFFFEB]/60">Your selfie</figcaption>
            </figure>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => void runSwap()} className="inline-flex items-center justify-center rounded-full bg-[#34D399] px-6 py-3 font-sora text-[14px] font-bold text-[#0B1512]">
              Swap my face
            </button>
            <button type="button" onClick={() => void startCamera()} className="inline-flex items-center justify-center rounded-full border border-white/25 px-6 py-3 font-sora text-[14px] font-semibold text-[#FFFFEB]">
              Retake selfie
            </button>
          </div>
        </div>
      ) : null}

      {step === "swapping" ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
          <h2 className="font-sora text-[18px] font-bold">3. Swapping your face</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#FFFFEB]/70">Keep this tab open. The swap runs on this device.</p>
        </div>
      ) : null}

      {step === "done" && resultUrl && thumbUrl ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
          <h2 className="font-sora text-[18px] font-bold">Done</h2>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl} alt="Before — your thumbnail" className="w-full rounded-xl" />
              <figcaption className="mt-2 text-center text-xs text-[#FFFFEB]/60">Before</figcaption>
            </figure>
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resultUrl} alt="After — your face in the thumbnail" className="w-full rounded-xl" />
              <figcaption className="mt-2 text-center text-xs text-[#FFFFEB]/60">After</figcaption>
            </figure>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={downloadResult} className="inline-flex items-center justify-center rounded-full bg-[#34D399] px-6 py-3 font-sora text-[14px] font-bold text-[#0B1512]">
              {UI_COPY.downloadPng}
            </button>
            <button type="button" onClick={resetAll} className="inline-flex items-center justify-center rounded-full border border-white/25 px-6 py-3 font-sora text-[14px] font-semibold text-[#FFFFEB]">
              Swap another thumbnail
            </button>
          </div>
          <p className="mt-4 text-xs text-[#FFFFEB]/60">{UI_COPY.swapsLeft(swapsLeft)}.</p>
        </div>
      ) : null}

      <p className="mt-6 text-xs leading-relaxed text-[#FFFFEB]/50">{UI_COPY.safetyLine} {UI_COPY.qualityNote}</p>
    </div>
  );
};
