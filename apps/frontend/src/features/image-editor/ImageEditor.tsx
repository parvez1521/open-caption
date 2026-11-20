"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { detectText, disposeOcrWorker } from "./ocr";
import { disposeSamWorker, loadImageForSam, segmentPoint } from "./sam";
import {
  drawBoxOutline,
  drawMaskTint,
  exportPng,
  renderPreview,
  type BaseImage,
} from "./render";
import { extractCutout, groupWordsIntoLines, maskBbox, maskPixelCount } from "./layers";
import {
  MAX_FILE_BYTES,
  MAX_IMAGE_EDGE,
  PREVIEW_MAX_EDGE,
  TEXT_FONTS,
  type CutoutLayer,
  type Layer,
  type Mask,
  type TextFontId,
  type TextLayer,
  type TextLine,
} from "./types";

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type SamStatus = { status: "idle" | "loading" | "ready" | "error"; progress: number; message?: string };
type OcrStatus = { status: "idle" | "loading" | "done" | "error"; progress: number; message?: string };

/** Decode a file to RGBA at most MAX_IMAGE_EDGE on the long side. */
async function decodeFile(file: File): Promise<{ base: BaseImage; downscaled: boolean }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const data = ctx.getImageData(0, 0, w, h);
  return { base: { data: data.data, width: w, height: h }, downscaled: scale < 1 };
}

export default function ImageEditor() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [base, setBase] = useState<BaseImage | null>(null);
  const [downscaled, setDownscaled] = useState(false);
  const [imageId, setImageId] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [sam, setSam] = useState<SamStatus>({ status: "idle", progress: 0 });
  const [ocr, setOcr] = useState<OcrStatus>({ status: "idle", progress: 0 });
  const [textLines, setTextLines] = useState<TextLine[]>([]);
  const [samPick, setSamPick] = useState<{ mask: Mask; score: number; x: number; y: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewScale, setPreviewScale] = useState(1);

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const baseRef = useRef<BaseImage | null>(null);
  const imageIdRef = useRef<string | null>(null);
  baseRef.current = base;
  imageIdRef.current = imageId;

  const selected = layers.find((l) => l.id === selectedId) ?? null;

  const resetForNewImage = useCallback(() => {
    disposeSamWorker();
    disposeOcrWorker();
    setLayers([]);
    setSelectedId(null);
    setSamPick(null);
    setTextLines([]);
    setSam({ status: "idle", progress: 0 });
    setOcr({ status: "idle", progress: 0 });
    setError(null);
  }, []);

  const onFile = useCallback(
    async (file: File) => {
      if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
        setError("That file is not a PNG, JPG or WebP image.");
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError("That image is over 25 MB. Pick a smaller file.");
        return;
      }
      setError(null);
      setBusy("Reading your image…");
      try {
        resetForNewImage();
        const { base: decoded, downscaled: ds } = await decodeFile(file);
        const id = uid();
        setFileName(file.name);
        setBase(decoded);
        setDownscaled(ds);
        setImageId(id);
      } catch {
        setError("That image could not be read in this browser. Try a PNG or JPG.");
      } finally {
        setBusy(null);
      }
    },
    [resetForNewImage],
  );

  /** Start both detectors for the current image. */
  const startDetection = useCallback(async () => {
    const b = baseRef.current;
    const id = imageIdRef.current;
    if (!b || !id) return;
    setEditMode(true);
    setSam({ status: "loading", progress: 0 });
    setOcr({ status: "loading", progress: 0 });
    void loadImageForSam(id, b.data, b.width, b.height, (stage, p) =>
      setSam((s) => (s.status === "loading" ? { ...s, progress: stage === "download" ? p * 0.8 : 0.8 + p * 0.2 } : s)),
    )
      .then(() => setSam({ status: "ready", progress: 1 }))
      .catch((e: Error) => setSam({ status: "error", progress: 0, message: e.message }));
    // OCR runs on a downscaled copy: text boxes come back at that size and are scaled up.
    const small = document.createElement("canvas");
    const s = Math.min(1, 1600 / Math.max(b.width, b.height));
    small.width = Math.max(1, Math.round(b.width * s));
    small.height = Math.max(1, Math.round(b.height * s));
    const sctx = small.getContext("2d")!;
    const bmp = await createImageBitmap(new ImageData(new Uint8ClampedArray(b.data), b.width, b.height));
    sctx.drawImage(bmp, 0, 0, small.width, small.height);
    bmp.close();
    void detectText(small, (p) => setOcr((o) => (o.status === "loading" ? { ...o, progress: p } : o)))
      .then((words) => {
        const lines = groupWordsIntoLines(words.map((w) => ({ ...w, x0: w.x0 / s, y0: w.y0 / s, x1: w.x1 / s, y1: w.y1 / s })));
        setTextLines(lines);
        setOcr({ status: "done", progress: 1 });
      })
      .catch((e: Error) => setOcr({ status: "error", progress: 0, message: e.message }));
  }, []);

  // render the preview whenever the base or layers change
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas || !base) return;
    const scale = renderPreview(canvas, base, layers, PREVIEW_MAX_EDGE);
    setPreviewScale(scale);
  }, [base, layers]);

  // overlay: text boxes, SAM pick tint, selection outline
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const main = mainCanvasRef.current;
    if (!canvas || !main || !base) return;
    canvas.width = main.width;
    canvas.height = main.height;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (editMode) {
      for (const line of textLines) {
        drawBoxOutline(ctx, line.x0, line.y0, line.x1, line.y1, previewScale, "#FFA946");
      }
    }
    if (samPick) {
      drawMaskTint(ctx, samPick.mask, previewScale);
      const bb = maskBbox(samPick.mask);
      if (bb) drawBoxOutline(ctx, bb.x0, bb.y0, bb.x1, bb.y1, previewScale, "#34D399");
    }
    if (selected) {
      if (selected.kind === "recolour" || selected.kind === "erase") {
        const bb = maskBbox(selected.mask);
        if (bb) drawBoxOutline(ctx, bb.x0, bb.y0, bb.x1, bb.y1, previewScale, "#34D399");
      } else if (selected.kind === "cutout") {
        const bb = maskBbox(selected.mask);
        if (bb) {
          drawBoxOutline(
            ctx,
            bb.x0 + selected.x,
            bb.y0 + selected.y,
            bb.x1 + selected.x,
            bb.y1 + selected.y,
            previewScale,
            "#34D399",
          );
        }
      } else if (selected.kind === "text") {
        const font = TEXT_FONTS.find((f) => f.id === selected.font) ?? TEXT_FONTS[0]!;
        ctx.font = `${selected.bold ? 700 : 400} ${selected.size}px ${font.family}`;
        const lines = selected.text.split("\n");
        const w = Math.max(...lines.map((line) => ctx.measureText(line).width), 1);
        drawBoxOutline(ctx, selected.x, selected.y - selected.size, selected.x + w, selected.y + 10, previewScale, "#34D399");
      }
    }
  }, [base, editMode, textLines, samPick, selected, previewScale]);

  useEffect(() => () => {
    disposeSamWorker();
    disposeOcrWorker();
  }, []);

  const toBaseCoords = (e: React.PointerEvent): { x: number; y: number } | null => {
    const canvas = mainCanvasRef.current;
    if (!canvas || !base) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * base.width,
      y: ((e.clientY - rect.top) / rect.height) * base.height,
    };
  };

  const hitTextLine = (x: number, y: number): TextLine | null => {
    for (const line of textLines) {
      if (x >= line.x0 - 6 && x <= line.x1 + 6 && y >= line.y0 - 6 && y <= line.y1 + 6) return line;
    }
    return null;
  };

  const onCanvasPointerDown = async (e: React.PointerEvent) => {
    const p = toBaseCoords(e);
    if (!p || !base) return;
    if (editMode) {
      const line = hitTextLine(p.x, p.y);
      if (line) {
        setSamPick(null);
        editTextLine(line);
        return;
      }
      if (sam.status !== "ready") return;
      setBusy("Finding that object…");
      try {
        const { mask, score } = await segmentPoint(imageId!, Math.round(p.x), Math.round(p.y));
        if (maskPixelCount(mask) < 50) {
          setError("Nothing clear there — try clicking the middle of an object.");
          setSamPick(null);
          return;
        }
        setError(null);
        setSamPick({ mask, score, x: p.x, y: p.y });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Segmentation failed.");
      } finally {
        setBusy(null);
      }
      return;
    }
    // not in edit mode: pick a layer to drag
    const hit = [...layers].reverse().find((l) => {
      if (!l.visible) return false;
      if (l.kind === "text") return p.x >= l.x && p.x <= l.x + 240 && p.y >= l.y - l.size && p.y <= l.y + 10;
      if (l.kind === "shape") return p.x >= l.x && p.x <= l.x + l.w && p.y >= l.y && p.y <= l.y + l.h;
      if (l.kind === "cutout") {
        const bb = maskBbox(l.mask);
        return bb ? p.x >= bb.x0 + l.x && p.x <= bb.x1 + l.x && p.y >= bb.y0 + l.y && p.y <= bb.y1 + l.y : false;
      }
      return false;
    });
    if (hit) {
      setSelectedId(hit.id);
      const orig = hit.kind === "cutout" || hit.kind === "text" || hit.kind === "shape" ? { x: hit.x, y: hit.y } : null;
      if (orig) dragRef.current = { id: hit.id, startX: p.x, startY: p.y, origX: orig.x, origY: orig.y };
    } else {
      setSelectedId(null);
    }
  };

  const onCanvasPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const p = toBaseCoords(e);
    if (!drag || !p) return;
    const dx = p.x - drag.startX, dy = p.y - drag.startY;
    setLayers((ls) =>
      ls.map((l) =>
        l.id === drag.id && (l.kind === "cutout" || l.kind === "text" || l.kind === "shape")
          ? { ...l, x: drag.origX + dx, y: drag.origY + dy }
          : l,
      ),
    );
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  /** Turn a detected text line into an editable text layer (+ erase the old words). */
  const editTextLine = (line: TextLine) => {
    if (!base) return;
    const pad = 4;
    const maskData = new Uint8Array(base.width * base.height);
    const x0 = Math.max(0, Math.floor(line.x0) - pad), y0 = Math.max(0, Math.floor(line.y0) - pad);
    const x1 = Math.min(base.width - 1, Math.ceil(line.x1) + pad), y1 = Math.min(base.height - 1, Math.ceil(line.y1) + pad);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) maskData[y * base.width + x] = 1;
    const mask: Mask = { width: base.width, height: base.height, data: maskData };
    const size = Math.max(12, Math.round(line.y1 - line.y0));
    const textLayer: TextLayer = {
      id: uid(), kind: "text", label: `Text: ${line.text.slice(0, 24)}`, visible: true,
      text: line.text, font: "jakarta", size, color: "#141412", bold: true,
      x: line.x0, y: line.y1, rotation: 0, opacity: 1,
    };
    setLayers((ls) => [
      ...ls,
      { id: uid(), kind: "erase", label: `Erased: ${line.text.slice(0, 24)}`, visible: true, mask },
      textLayer,
    ]);
    setSelectedId(textLayer.id);
  };

  const addRecolourFromPick = () => {
    if (!samPick) return;
    const layer: Layer = {
      id: uid(), kind: "recolour", label: "Recoloured object", visible: true,
      mask: samPick.mask, hue: 0, saturation: 1, brightness: 1, opacity: 1,
    };
    setLayers((ls) => [...ls, layer]);
    setSelectedId(layer.id);
    setSamPick(null);
  };

  const addCutoutFromPick = (duplicate: boolean) => {
    if (!samPick || !base) return;
    const cutout = extractCutout(base.data, base.width, base.height, samPick.mask);
    const layer: CutoutLayer = {
      id: uid(), kind: "cutout", label: duplicate ? "Duplicated object" : "Moved object", visible: true,
      cutout, mask: samPick.mask, eraseSource: !duplicate,
      x: 0, y: 0, scale: 1, rotation: 0, opacity: 1,
    };
    if (!duplicate) {
      setLayers((ls) => [
        ...ls,
        { id: uid(), kind: "erase", label: "Moved from here", visible: true, mask: samPick.mask },
        layer,
      ]);
    } else {
      setLayers((ls) => [...ls, layer]);
    }
    setSelectedId(layer.id);
    setSamPick(null);
  };

  const addEraseFromPick = () => {
    if (!samPick) return;
    const layer: Layer = { id: uid(), kind: "erase", label: "Erased object", visible: true, mask: samPick.mask };
    setLayers((ls) => [...ls, layer]);
    setSelectedId(layer.id);
    setSamPick(null);
  };

  const addTextLayer = () => {
    if (!base) return;
    const layer: TextLayer = {
      id: uid(), kind: "text", label: "New text", visible: true,
      text: "Your text", font: "jakarta", size: Math.round(base.width / 12), color: "#FFFFEB", bold: true,
      x: base.width * 0.1, y: base.height * 0.5, rotation: 0, opacity: 1,
    };
    setLayers((ls) => [...ls, layer]);
    setSelectedId(layer.id);
  };

  const addShapeLayer = () => {
    if (!base) return;
    const layer: Layer = {
      id: uid(), kind: "shape", label: "Rectangle", visible: true, shape: "rect", fill: "#34D399",
      x: base.width * 0.3, y: base.height * 0.3, w: base.width * 0.4, h: base.height * 0.2, rotation: 0, opacity: 1,
    };
    setLayers((ls) => [...ls, layer]);
    setSelectedId(layer.id);
  };

  const updateSelected = (patch: Partial<Layer>) => {
    if (!selectedId) return;
    setLayers((ls) => ls.map((l) => (l.id === selectedId ? ({ ...l, ...patch } as Layer) : l)));
  };

  const deleteLayer = (id: string) => {
    setLayers((ls) => ls.filter((l) => l.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const updateSelectedLayerVisibility = (id: string) => {
    setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
  };

  const moveLayer = (id: string, dir: -1 | 1) => {
    setLayers((ls) => {
      const i = ls.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ls.length) return ls;
      const next = [...ls];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  };

  const onExport = async () => {
    if (!base) return;
    setBusy("Making your PNG…");
    try {
      const blob = await exportPng(base, layers);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (fileName ?? "image").replace(/\.[^.]+$/, "") + "-edited.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The PNG could not be made.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-28 sm:pt-32">
      <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#34D399]">Free tool</p>
      <h1 className="mt-3 font-serif text-4xl font-semibold leading-[1.08] tracking-[-0.015em] sm:text-5xl">
        Image elements editor
      </h1>
      <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-[#FFFFEB]/80">
        Drop in any photo. Click an object or a line of text and change it — colour, size, place. Your image never
        leaves this tab: the AI runs in your browser.
      </p>

      {!base ? (
        <div
          className="mt-10 rounded-2xl border border-dashed border-white/25 bg-[#1C1C1A] p-10 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void onFile(f);
          }}
        >
          <p className="font-sora text-[18px] font-bold">Drop an image here</p>
          <p className="mt-2 text-[14px] text-[#FFFFEB]/70">PNG, JPG or WebP · up to 25 MB · up to 3000 px on the long side</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-[#34D399] px-6 py-3 font-sora text-[14px] font-bold text-[#0B1512]"
          >
            Choose an image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <div className="mt-10">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (editMode) {
                  setEditMode(false);
                  setSamPick(null);
                } else {
                  void startDetection();
                }
              }}
              disabled={busy !== null}
              className="inline-flex items-center justify-center rounded-full bg-[#34D399] px-5 py-2.5 font-sora text-[14px] font-bold text-[#0B1512] disabled:opacity-50"
            >
              {editMode ? "Done editing elements" : "Edit elements"}
            </button>
            <button
              type="button"
              onClick={addTextLayer}
              className="inline-flex items-center justify-center rounded-full border border-white/25 px-5 py-2.5 font-sora text-[14px] font-semibold text-[#FFFFEB]"
            >
              Add text
            </button>
            <button
              type="button"
              onClick={addShapeLayer}
              className="inline-flex items-center justify-center rounded-full border border-white/25 px-5 py-2.5 font-sora text-[14px] font-semibold text-[#FFFFEB]"
            >
              Add shape
            </button>
            <button
              type="button"
              onClick={() => void onExport()}
              disabled={busy !== null}
              className="inline-flex items-center justify-center rounded-full bg-[#FFA946] px-5 py-2.5 font-sora text-[14px] font-bold text-[#141412] disabled:opacity-50"
            >
              Download PNG
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center rounded-full border border-white/25 px-5 py-2.5 font-sora text-[14px] font-semibold text-[#FFFFEB]"
            >
              New image
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
          </div>

          {busy ? <p className="mt-4 text-[14px] text-[#FFFFEB]/70">{busy}</p> : null}
          {error ? (
            <p role="alert" className="mt-4 rounded-lg border border-[#FFA946]/60 bg-[#FFA946]/15 px-3 py-2 text-[14px] text-[#FFFFEB]">
              {error}
            </p>
          ) : null}
          {downscaled ? (
            <p className="mt-4 text-[13px] text-[#FFFFEB]/60">
              Your photo was larger than 3000 px, so it was scaled down for editing. The download keeps this size.
            </p>
          ) : null}
          {editMode ? (
            <div className="mt-4 space-y-1 text-[13px] text-[#FFFFEB]/70">
              {sam.status === "loading" ? (
                <p>Finding objects… {Math.round(sam.progress * 100)}% — the model downloads once (about 90 MB) and then stays on your device.</p>
              ) : sam.status === "error" ? (
                <p>
                  Object detection failed: {sam.message ?? "unknown error"}{" "}
                  <button type="button" className="underline decoration-[#34D399]/60 underline-offset-2" onClick={() => void startDetection()}>
                    Try again
                  </button>
                </p>
              ) : sam.status === "ready" ? (
                <p>Objects ready — click any object to select it.</p>
              ) : null}
              {ocr.status === "loading" ? (
                <p>Reading text… {Math.round(ocr.progress * 100)}%</p>
              ) : ocr.status === "error" ? (
                <p>
                  Text detection failed: {ocr.message ?? "unknown error"}{" "}
                  <button type="button" className="underline decoration-[#34D399]/60 underline-offset-2" onClick={() => void startDetection()}>
                    Try again
                  </button>
                </p>
              ) : ocr.status === "done" ? (
                <p>{textLines.length > 0 ? `${textLines.length} line${textLines.length === 1 ? "" : "s"} of text found — click one to rewrite it.` : "No text found in this image."}</p>
              ) : null}
            </div>
          ) : null}

          {samPick ? (
            <div className="mt-4 rounded-xl border border-[#34D399]/50 bg-[#34D399]/10 p-3">
              <p className="text-[14px] font-semibold">Object selected</p>
              <p className="mt-1 text-[13px] text-[#FFFFEB]/70">What do you want to do with it?</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={addRecolourFromPick} className="rounded-full bg-[#34D399] px-4 py-2 font-sora text-[13px] font-bold text-[#0B1512]">
                  Recolour
                </button>
                <button type="button" onClick={() => addCutoutFromPick(false)} className="rounded-full border border-white/25 px-4 py-2 font-sora text-[13px] font-semibold">
                  Move it
                </button>
                <button type="button" onClick={() => addCutoutFromPick(true)} className="rounded-full border border-white/25 px-4 py-2 font-sora text-[13px] font-semibold">
                  Duplicate
                </button>
                <button type="button" onClick={addEraseFromPick} className="rounded-full border border-white/25 px-4 py-2 font-sora text-[13px] font-semibold">
                  Delete it
                </button>
                <button type="button" onClick={() => setSamPick(null)} className="rounded-full border border-white/25 px-4 py-2 font-sora text-[13px] font-semibold">
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
            <div
              className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#1C1C1A]"
              onPointerDown={(e) => void onCanvasPointerDown(e)}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={endDrag}
              onPointerLeave={endDrag}
            >
              <canvas ref={mainCanvasRef} className="block w-full" />
              <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
              {editMode && sam.status === "ready" ? (
                <p className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-[12px] text-[#FFFFEB]">
                  Click an object or a line of text
                </p>
              ) : null}
            </div>

            <div className="space-y-6">
              {selected ? (
                <section aria-label="Selected element" className="rounded-2xl border border-white/10 bg-[#1C1C1A] p-4">
                  <h2 className="font-sora text-[16px] font-bold">{selected.label}</h2>
                  <SelectedControls layer={selected} onChange={updateSelected} onDelete={() => deleteLayer(selected.id)} />
                </section>
              ) : (
                <section className="rounded-2xl border border-white/10 bg-[#1C1C1A] p-4">
                  <h2 className="font-sora text-[16px] font-bold">Nothing selected</h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-[#FFFFEB]/70">
                    {editMode
                      ? "Click an object or a line of text on the image to select it."
                      : "Press “Edit elements” to select objects and text, or drag a text or shape layer to move it."}
                  </p>
                </section>
              )}

              <section aria-label="Layers" className="rounded-2xl border border-white/10 bg-[#1C1C1A] p-4">
                <h2 className="font-sora text-[16px] font-bold">Layers ({layers.length})</h2>
                {layers.length === 0 ? (
                  <p className="mt-2 text-[13px] text-[#FFFFEB]/70">No edits yet. Every change you make becomes a layer here.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {[...layers].reverse().map((layer) => (
                      <li key={layer.id} className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-[13px] ${layer.id === selectedId ? "border-[#34D399]/60 bg-[#34D399]/10" : "border-white/10"}`}>
                        <button
                          type="button"
                          aria-label={layer.visible ? `Hide ${layer.label}` : `Show ${layer.label}`}
                          onClick={() => updateSelectedLayerVisibility(layer.id)}
                          className="shrink-0 rounded px-1 text-[#FFFFEB]/80"
                        >
                          {layer.visible ? "Hide" : "Show"}
                        </button>
                        <button type="button" onClick={() => setSelectedId(layer.id)} className="min-w-0 flex-1 truncate text-left">
                          {layer.label}
                        </button>
                        <button type="button" aria-label={`Move ${layer.label} up`} onClick={() => moveLayer(layer.id, 1)} className="shrink-0 rounded px-1">
                          ↑
                        </button>
                        <button type="button" aria-label={`Move ${layer.label} down`} onClick={() => moveLayer(layer.id, -1)} className="shrink-0 rounded px-1">
                          ↓
                        </button>
                        <button type="button" aria-label={`Delete ${layer.label}`} onClick={() => deleteLayer(layer.id)} className="shrink-0 rounded px-1 text-[#FFA946]">
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>

          <section className="mt-10 rounded-2xl border border-white/10 bg-[#1C1C1A] p-5">
            <h2 className="font-sora text-[16px] font-bold">What this can and cannot do</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-[#FFFFEB]/70">
              A photo has no layers. Editing works by cutting a piece out, changing it, and putting it back — so a
              moved object leaves a soft patch behind, and erasing on a busy background stays visible as a blur.
              Detected text is rewritten in a close font, not the original one, because the original font is not
              stored in the image. Colours, size and position are exact.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-[13px] text-[#FFFFEB]/80">
        <span>{label}</span>
        <span>{format ? format(value) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[#34D399]"
      />
    </label>
  );
}

function SelectedControls({
  layer,
  onChange,
  onDelete,
}: {
  layer: Layer;
  onChange: (patch: Partial<Layer>) => void;
  onDelete: () => void;
}) {
  if (layer.kind === "recolour") {
    return (
      <div className="mt-3 space-y-3">
        <Slider label="Hue" value={layer.hue} min={-180} max={180} step={1} onChange={(v) => onChange({ hue: v })} format={(v) => `${v > 0 ? "+" : ""}${v}°`} />
        <Slider label="Saturation" value={layer.saturation} min={0} max={2} step={0.05} onChange={(v) => onChange({ saturation: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Brightness" value={layer.brightness} min={0} max={2} step={0.05} onChange={(v) => onChange({ brightness: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Strength" value={layer.opacity} min={0} max={1} step={0.05} onChange={(v) => onChange({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <button type="button" onClick={onDelete} className="mt-1 text-[13px] font-semibold text-[#FFA946]">
          Remove this recolour
        </button>
      </div>
    );
  }
  if (layer.kind === "cutout") {
    return (
      <div className="mt-3 space-y-3">
        <p className="text-[13px] text-[#FFFFEB]/70">Drag it on the image, or use the sliders.</p>
        <Slider label="Size" value={layer.scale} min={0.2} max={3} step={0.05} onChange={(v) => onChange({ scale: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <Slider label="Rotate" value={layer.rotation} min={-180} max={180} step={1} onChange={(v) => onChange({ rotation: v })} format={(v) => `${v}°`} />
        <Slider label="Opacity" value={layer.opacity} min={0} max={1} step={0.05} onChange={(v) => onChange({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <button type="button" onClick={onDelete} className="mt-1 text-[13px] font-semibold text-[#FFA946]">
          Remove this object
        </button>
      </div>
    );
  }
  if (layer.kind === "text") {
    return (
      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="text-[13px] text-[#FFFFEB]/80">Text</span>
          <textarea
            value={layer.text}
            rows={2}
            onChange={(e) => onChange({ text: e.target.value })}
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#141412] px-3 py-2 text-[14px] text-[#FFFFEB]"
          />
        </label>
        <label className="block">
          <span className="text-[13px] text-[#FFFFEB]/80">Font</span>
          <select
            value={layer.font}
            onChange={(e) => onChange({ font: e.target.value as TextFontId })}
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#141412] px-3 py-2 text-[14px] text-[#FFFFEB]"
          >
            {TEXT_FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <Slider label="Size" value={layer.size} min={8} max={400} step={1} onChange={(v) => onChange({ size: v })} format={(v) => `${v} px`} />
        <label className="block">
          <span className="text-[13px] text-[#FFFFEB]/80">Colour</span>
          <input
            type="color"
            value={layer.color}
            onChange={(e) => onChange({ color: e.target.value })}
            className="mt-1 block h-10 w-full cursor-pointer rounded-lg border border-white/15 bg-[#141412]"
          />
        </label>
        <label className="flex items-center gap-2 text-[13px] text-[#FFFFEB]/80">
          <input type="checkbox" checked={layer.bold} onChange={(e) => onChange({ bold: e.target.checked })} className="accent-[#34D399]" />
          Bold
        </label>
        <Slider label="Rotate" value={layer.rotation} min={-180} max={180} step={1} onChange={(v) => onChange({ rotation: v })} format={(v) => `${v}°`} />
        <Slider label="Opacity" value={layer.opacity} min={0} max={1} step={0.05} onChange={(v) => onChange({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <button type="button" onClick={onDelete} className="mt-1 text-[13px] font-semibold text-[#FFA946]">
          Remove this text
        </button>
      </div>
    );
  }
  if (layer.kind === "shape") {
    return (
      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="text-[13px] text-[#FFFFEB]/80">Shape</span>
          <select
            value={layer.shape}
            onChange={(e) => onChange({ shape: e.target.value as "rect" | "ellipse" })}
            className="mt-1 w-full rounded-lg border border-white/15 bg-[#141412] px-3 py-2 text-[14px] text-[#FFFFEB]"
          >
            <option value="rect">Rectangle</option>
            <option value="ellipse">Ellipse</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[13px] text-[#FFFFEB]/80">Fill</span>
          <input
            type="color"
            value={layer.fill}
            onChange={(e) => onChange({ fill: e.target.value })}
            className="mt-1 block h-10 w-full cursor-pointer rounded-lg border border-white/15 bg-[#141412]"
          />
        </label>
        <Slider label="Width" value={layer.w} min={10} max={2000} step={1} onChange={(v) => onChange({ w: v })} format={(v) => `${Math.round(v)} px`} />
        <Slider label="Height" value={layer.h} min={10} max={2000} step={1} onChange={(v) => onChange({ h: v })} format={(v) => `${Math.round(v)} px`} />
        <Slider label="Rotate" value={layer.rotation} min={-180} max={180} step={1} onChange={(v) => onChange({ rotation: v })} format={(v) => `${v}°`} />
        <Slider label="Opacity" value={layer.opacity} min={0} max={1} step={0.05} onChange={(v) => onChange({ opacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <button type="button" onClick={onDelete} className="mt-1 text-[13px] font-semibold text-[#FFA946]">
          Remove this shape
        </button>
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-3">
      <p className="text-[13px] leading-relaxed text-[#FFFFEB]/70">
        This part of the image is filled with a soft blur of the background around it. On a busy background the patch
        stays visible — that is the limit of erasing a flat photo.
      </p>
      <button type="button" onClick={onDelete} className="mt-1 text-[13px] font-semibold text-[#FFA946]">
        Undo this erase
      </button>
    </div>
  );
}
