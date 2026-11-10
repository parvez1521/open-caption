"use client";

import React, { useEffect, useRef, useState } from "react";
import { computeColorScopes, type ColorScopesData } from "../colorScopes";
import { samplePreviewFrame, SCOPES_SAMPLE_INTERVAL_MS, type FrameSample } from "../scopesSampling";

/**
 * A14 Colour Scopes (Phase 8) — histogram + waveform for the CURRENT preview
 * frame, inside the Adjust panel's colour surface.
 *
 * DISPLAY-ONLY invariant: this component receives no project state and no
 * callbacks at all (its one optional prop is a frame sampler, injectable for
 * tests). It reads pixels from the preview's video element via
 * scopesSampling.ts, aggregates them with the pure math in colorScopes.ts,
 * and draws the result on two canvases. Nothing here can change the project.
 *
 * Refresh: one sample on mount, then one every SCOPES_SAMPLE_INTERVAL_MS
 * (250 ms / 4 Hz) while expanded — the playhead moving or playback advancing
 * changes the frame between ticks, and 4 Hz follows it without jank. When
 * collapsed, no sampling runs at all. When a frame cannot be read (no video
 * on screen, frame not ready, cross-origin taint), the honest note shows
 * instead of any chart — never a fake flat graph.
 */

type ScopesStatus =
  | { kind: "waiting" }
  | { kind: "unavailable"; reason: string }
  | { kind: "ready" };

const HIST_HEIGHT = 84;
const WAVE_HEIGHT = 96;

function drawHistogram(canvas: HTMLCanvasElement | null, data: ColorScopesData): void {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const { histogram } = data;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#131311";
  ctx.fillRect(0, 0, w, h);
  if (histogram.maxCount <= 0) return;
  // sqrt display scaling (data itself stays linear counts) so small bins are
  // visible next to a dominant peak; the shape is still the frame's own.
  const scale = (count: number) => Math.sqrt(count / histogram.maxCount) * (h - 6);
  const channels: { bins: Uint32Array; colour: string }[] = [
    { bins: histogram.r, colour: "rgba(248,113,113,0.85)" },
    { bins: histogram.g, colour: "rgba(52,211,153,0.85)" },
    { bins: histogram.b, colour: "rgba(96,165,250,0.85)" },
  ];
  ctx.globalCompositeOperation = "lighter";
  for (const { bins, colour } of channels) {
    ctx.fillStyle = colour;
    for (let i = 0; i < bins.length; i++) {
      const bh = scale(bins[i]!);
      if (bh <= 0) continue;
      ctx.fillRect(i, h - bh, 1, bh);
    }
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawWaveform(canvas: HTMLCanvasElement | null, data: ColorScopesData): void {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const { waveform } = data;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#131311";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (waveform.maxDensity <= 0) return;
  // one canvas pixel per (column, luma level) cell; level 0 (black) is the
  // BOTTOM row, so the stored row order is flipped when painting.
  const img = ctx.createImageData(waveform.columns, waveform.levels);
  for (let level = 0; level < waveform.levels; level++) {
    const y = waveform.levels - 1 - level;
    for (let col = 0; col < waveform.columns; col++) {
      const density = waveform.density[level * waveform.columns + col]!;
      if (density <= 0) continue;
      const o = (y * waveform.columns + col) * 4;
      const t = density / waveform.maxDensity;
      img.data[o] = 30 + Math.round(40 * t);
      img.data[o + 1] = 90 + Math.round(165 * t);
      img.data[o + 2] = 70 + Math.round(90 * t);
      img.data[o + 3] = 255;
    }
  }
  // paint through a same-size scratch canvas so the CSS size can stretch it
  const scratch = document.createElement("canvas");
  scratch.width = waveform.columns;
  scratch.height = waveform.levels;
  const sctx = scratch.getContext("2d");
  if (!sctx) return;
  sctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0, canvas.width, canvas.height);
}

export const ColorScopes: React.FC<{ sampleFrame?: () => FrameSample }> = ({ sampleFrame }) => {
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState<ScopesStatus>({ kind: "waiting" });
  const dataRef = useRef<ColorScopesData | null>(null);
  const histRef = useRef<HTMLCanvasElement | null>(null);
  const waveRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      let sample: FrameSample;
      try {
        sample = (sampleFrame ?? samplePreviewFrame)();
      } catch (e) {
        sample = { kind: "unavailable", reason: e instanceof Error ? e.message : "reading this frame failed" };
      }
      if (sample.kind === "unavailable") {
        dataRef.current = null;
        setStatus((prev) =>
          prev.kind === "unavailable" && prev.reason === sample.reason ? prev : { kind: "unavailable", reason: sample.reason },
        );
        return;
      }
      try {
        dataRef.current = computeColorScopes(sample.pixels, sample.width, sample.height);
      } catch (e) {
        dataRef.current = null;
        setStatus({ kind: "unavailable", reason: e instanceof Error ? e.message : "this frame could not be measured" });
        return;
      }
      setStatus((prev) => (prev.kind === "ready" ? prev : { kind: "ready" }));
      drawHistogram(histRef.current, dataRef.current);
      drawWaveform(waveRef.current, dataRef.current);
    };
    tick();
    const id = setInterval(tick, SCOPES_SAMPLE_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [open, sampleFrame]);

  // after the ready state mounts the canvases, paint the latest data once
  useEffect(() => {
    if (status.kind !== "ready" || !dataRef.current) return;
    drawHistogram(histRef.current, dataRef.current);
    drawWaveform(waveRef.current, dataRef.current);
  }, [status.kind]);

  return (
    <section className="border-b border-st-line px-4 py-4" aria-label="Colour scopes">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider text-st-muted">Colour scopes</span>
        <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-st-muted transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-st-faint">
            Preview-resolution analysis — sampled from the preview frame, not the full-resolution export. Reads the
            preview&apos;s video picture only; captions and overlays drawn over it are not measured.
          </p>
          {status.kind === "unavailable" ? (
            <p data-testid="scopes-unavailable" role="status" className="text-xs text-st-muted">
              Scopes unavailable for this frame — {status.reason}.
            </p>
          ) : status.kind === "waiting" ? (
            <p data-testid="scopes-waiting" role="status" className="text-xs text-st-muted">
              Waiting for a preview frame…
            </p>
          ) : (
            <>
              <figure className="space-y-1">
                <figcaption className="flex items-baseline justify-between text-xs text-st-muted">
                  <span>Histogram</span>
                  <span aria-hidden className="flex gap-2">
                    <span className="text-red-400">R</span>
                    <span className="text-emerald-400">G</span>
                    <span className="text-blue-400">B</span>
                  </span>
                </figcaption>
                <canvas
                  ref={histRef}
                  data-testid="scopes-histogram"
                  width={256}
                  height={HIST_HEIGHT}
                  className="w-full rounded-md ring-1 ring-st-line"
                  style={{ height: HIST_HEIGHT }}
                  role="img"
                  aria-label="Histogram of red, green and blue values in the current preview frame"
                />
                <div className="flex justify-between text-[10px] tabular-nums text-st-faint" aria-hidden>
                  <span>0</span>
                  <span>255</span>
                </div>
              </figure>
              <figure className="space-y-1">
                <figcaption className="flex items-baseline justify-between text-xs text-st-muted">
                  <span>Waveform — luma by column</span>
                  <span className="text-[10px] tabular-nums text-st-faint">top 255 · bottom 0</span>
                </figcaption>
                <canvas
                  ref={waveRef}
                  data-testid="scopes-waveform"
                  width={160}
                  height={WAVE_HEIGHT}
                  className="w-full rounded-md ring-1 ring-st-line"
                  style={{ height: WAVE_HEIGHT }}
                  role="img"
                  aria-label="Waveform of brightness across the current preview frame"
                />
              </figure>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
};
