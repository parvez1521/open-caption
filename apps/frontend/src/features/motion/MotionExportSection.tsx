"use client";

import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { MotionConfigSchema, type MotionConfig } from "@capseasy/motion";
import { canExportVideoInBrowser, exportVideoInBrowser, saveBlob } from "@/features/studio/browserExport";
import { fmtBytes } from "@/features/studio/controls";
import { alphaUnavailableLine, probeAlphaCapability, type AlphaCapability } from "./alphaCapability";
import { verifyAlphaExport } from "./alphaVerify";
import type { MotionAssetRef } from "./addToProject";
import {
  MOTION_EXPORT_ASPECTS,
  MOTION_EXPORT_BACKGROUNDS,
  MOTION_EXPORT_FORMATS,
  MOTION_EXPORT_FPS_OPTIONS,
  MOTION_EXPORT_SHORT_EDGES,
  SOLID_BACKGROUND_FORMAT_NOTE,
  TRANSPARENT_EXPORT_NOTE,
  buildMotionExport,
  initialMotionExportState,
  motionExportBackgroundColor,
  motionExportDimensions,
  motionExportReducer,
  runStandaloneExport,
  DEFAULT_MOTION_EXPORT_SELECTION,
  type MotionExportSelection,
} from "./exportConfig";

/**
 * "Export this animation" — the standalone overlay export on the Motion Studio customize
 * page (Wave 3 mount point). Renders the CURRENT config on its own over the chosen
 * background and downloads it, entirely in this tab: no project is created, nothing is
 * uploaded, and no sign-in is needed (guest-safe — the render path touches no service,
 * only WebCodecs).
 *
 * MP4/WebM are opaque files on the chosen solid background. The transparent WebM format
 * appears when the alpha probe (alphaCapability, probe v2) proves this browser can encode
 * VP9 with alpha at the chosen size; when it cannot, the section's note names the gate
 * stage that withheld it. Every transparent render is verified for real alpha after
 * encoding (alphaVerify) before it downloads — see exportConfig.
 * Cancellation mirrors the Studio export: an AbortController whose signal the renderer
 * checks between frames, so Cancel really stops the render and saves nothing.
 */

interface Props {
  config: MotionConfig;
  asset?: MotionAssetRef | null;
  assetSrc?: string;
}

const pill = (active: boolean) =>
  `relative rounded-full border px-3 py-1.5 text-[12px] font-semibold transition before:absolute before:-inset-y-1.5 before:-inset-x-1 before:content-[''] ${active ? "border-ink bg-ink text-[#141412]" : "border-sand-200 bg-sand-50 text-sand-800 hover:border-sand-300"}`;

export const MotionExportSection: React.FC<Props> = ({ config, asset = null, assetSrc }) => {
  const [selection, setSelection] = useState<MotionExportSelection>(DEFAULT_MOTION_EXPORT_SELECTION);
  const [state, dispatch] = useReducer(motionExportReducer, initialMotionExportState);
  const abortRef = useRef<AbortController | null>(null);
  const configValid = MotionConfigSchema.safeParse(config).success;

  const format = MOTION_EXPORT_FORMATS.find((f) => f.id === selection.format) ?? MOTION_EXPORT_FORMATS[0]!;
  const dims = useMemo(() => motionExportDimensions(selection.aspect, selection.shortEdge), [selection.aspect, selection.shortEdge]);
  const backgroundColor = motionExportBackgroundColor(selection);

  /* Transparent WebM gating (probe v2): the option exists when the probe proves this
     browser can encode VP9 with alpha AT the chosen size (VideoEncoder present + the
     at-size isConfigSupported check). The renderer's own transparent check rides along
     as a probe diagnostic only — the encode attempt and the post-encode alpha guard
     decide the truth, so a diagnostic failure never hides the option. The probe re-runs
     when the size changes, because the gate is asked at the chosen size. */
  const [alphaCap, setAlphaCap] = useState<AlphaCapability | null>(null);
  useEffect(() => {
    let alive = true;
    void probeAlphaCapability(
      {
        renderCheck: (width, height) =>
          canExportVideoInBrowser({ container: "webm", videoCodec: "vp9", width, height, transparent: true }).then((r) => r.ok),
      },
      { width: dims.width, height: dims.height },
    ).then((cap) => {
      if (alive) setAlphaCap(cap);
    });
    return () => {
      alive = false;
    };
  }, [dims.width, dims.height]);
  const alphaReady = alphaCap?.available === true;
  const visibleFormats = MOTION_EXPORT_FORMATS.filter((f) => !f.transparent || alphaReady);
  // if the transparent format was selected and the gate stops passing (e.g. the size
  // changed), fall back to plain WebM rather than rendering something unproven
  useEffect(() => {
    if (format.transparent && alphaCap !== null && !alphaReady) {
      setSelection((s) => (s.format === "webm-alpha" ? { ...s, format: "webm" } : s));
    }
  }, [format.transparent, alphaCap, alphaReady]);

  // encoder support is checked at the chosen format + output size, like the Studio export
  const [capability, setCapability] = useState<{ ok: boolean; reason?: string } | null>(null);
  useEffect(() => {
    let alive = true;
    setCapability(null);
    void canExportVideoInBrowser({ container: format.container, videoCodec: format.videoCodec, width: dims.width, height: dims.height, transparent: format.transparent }).then((r) => {
      if (alive) setCapability(r);
    });
    return () => {
      alive = false;
    };
  }, [format.container, format.videoCodec, format.transparent, dims.width, dims.height]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const rendering = state.status === "rendering";
  const pick = (patch: Partial<MotionExportSelection>) => {
    setSelection((s) => ({ ...s, ...patch }));
    if (!rendering) dispatch({ type: "cancelled" }); // a changed choice clears a stale done/error note
  };

  const startExport = async () => {
    if (rendering || !configValid) return;
    let cap = capability;
    if (!cap) {
      cap = await canExportVideoInBrowser({ container: format.container, videoCodec: format.videoCodec, width: dims.width, height: dims.height, transparent: format.transparent });
      setCapability(cap);
    }
    if (!cap.ok) {
      dispatch({ type: "failure", message: cap.reason ?? "This browser can't encode video. Use Chrome, Edge or Safari." });
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    dispatch({ type: "start" });
    try {
      const built = buildMotionExport(config, selection, asset, assetSrc);
      const outcome = await runStandaloneExport({
        built,
        deps: { render: exportVideoInBrowser, save: saveBlob, verify: verifyAlphaExport },
        signal: ctrl.signal,
        onProgress: (fraction) => dispatch({ type: "progress", fraction }),
      });
      if (outcome.cancelled) dispatch({ type: "cancelled" });
      else dispatch({ type: "success", filename: outcome.filename, sizeBytes: outcome.sizeBytes });
    } catch (e) {
      if (ctrl.signal.aborted) dispatch({ type: "cancelled" });
      else dispatch({ type: "failure", message: e instanceof Error ? e.message : "The export failed. Try again." });
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  };

  const pct = state.status === "rendering" ? Math.round(state.progress * 100) : 0;

  return (
    <section aria-label="Export this animation" className="border-t border-sand-200 pt-6">
      <h2 className="font-sora text-[13px] font-bold uppercase tracking-wider text-sand-600">Export this animation</h2>
      <p className="mt-1.5 text-[12px] text-sand-600">
        Make a video of just this animation. On the background you choose below. Ready to drop into any editor. It is rendered in this browser. No project is created.
      </p>

      <div className="mt-4 space-y-4">
        {format.transparent ? (
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-sand-800">Background</span>
            <p className="text-[12px] text-sand-600">Transparent — the file contains only the animation, with an alpha channel. Pick a solid format below to bake a background in instead.</p>
          </div>
        ) : (
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-sand-800" id="motion-export-background-label">Background</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="motion-export-background-label">
            {MOTION_EXPORT_BACKGROUNDS.map((b) => (
              <button key={b.id} type="button" aria-pressed={selection.background === b.id} onClick={() => pick({ background: b.id })} className={pill(selection.background === b.id)}>
                {b.label}
              </button>
            ))}
          </div>
          {selection.background === "chroma" ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                value={selection.chromaColor}
                onChange={(e) => pick({ chromaColor: e.target.value })}
                aria-label="Chroma colour"
                className="h-8 w-12 cursor-pointer rounded border border-sand-200 bg-sand-50 p-0.5"
              />
              <span className="text-[12px] tabular-nums text-sand-600">{selection.chromaColor.toUpperCase()}</span>
              <span className="text-[12px] text-sand-600">Key this colour out in your editor. Place the animation over your own footage.</span>
            </div>
          ) : null}
        </div>
        )}

        <div className="flex flex-wrap gap-x-6 gap-y-4">
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-sand-800" id="motion-export-aspect-label">Aspect</span>
            <div className="flex gap-1.5" role="group" aria-labelledby="motion-export-aspect-label">
              {MOTION_EXPORT_ASPECTS.map((a) => (
                <button key={a} type="button" aria-pressed={selection.aspect === a} onClick={() => pick({ aspect: a })} className={pill(selection.aspect === a)}>
                  {a}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-sand-800" id="motion-export-size-label">Size</span>
            <div className="flex gap-1.5" role="group" aria-labelledby="motion-export-size-label">
              {MOTION_EXPORT_SHORT_EDGES.map((edge) => (
                <button key={edge} type="button" aria-pressed={selection.shortEdge === edge} onClick={() => pick({ shortEdge: edge })} className={pill(selection.shortEdge === edge)}>
                  {edge}p
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-sand-800" id="motion-export-fps-label">Frame rate</span>
            <div className="flex gap-1.5" role="group" aria-labelledby="motion-export-fps-label">
              {MOTION_EXPORT_FPS_OPTIONS.map((o) => (
                <button key={o.fps} type="button" aria-pressed={selection.fps === o.fps} onClick={() => pick({ fps: o.fps })} className={pill(selection.fps === o.fps)}>
                  {o.fps} fps
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-[12px] text-sand-600">
          Exports at {dims.width} × {dims.height} · {selection.fps} fps. {MOTION_EXPORT_FPS_OPTIONS.find((o) => o.fps === selection.fps)?.hint}
        </p>

        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-sand-800" id="motion-export-format-label">Format</span>
          <div className="flex gap-1.5" role="group" aria-labelledby="motion-export-format-label">
            {visibleFormats.map((f) => (
              <button key={f.id} type="button" aria-pressed={selection.format === f.id} onClick={() => pick({ format: f.id })} className={pill(selection.format === f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          {format.transparent ? (
            <p className="mt-1.5 text-[12px] text-sand-600">This file has a transparent background — after rendering, the file is checked for real transparency before it downloads.</p>
          ) : (
            <>
              <p className="mt-1.5 text-[12px] text-sand-600">{SOLID_BACKGROUND_FORMAT_NOTE} — the background above is baked into every frame.</p>
              {alphaCap && !alphaCap.available && alphaCap.blockedBy ? (
                <p className="mt-1 text-[12px] text-sand-600">{alphaUnavailableLine(alphaCap.blockedBy)}</p>
              ) : (
                <p className="mt-1 text-[12px] text-sand-600">{TRANSPARENT_EXPORT_NOTE}</p>
              )}
            </>
          )}
        </div>

        {capability && !capability.ok ? (
          <p role="alert" className="text-[12px] text-orange-accent">{capability.reason ?? "This browser can't encode video. Use Chrome, Edge or Safari."}</p>
        ) : null}
        {!configValid ? (
          <p role="alert" className="text-[12px] text-orange-accent">Check the colour (it needs a #rrggbb hex value) — the animation can&apos;t be exported until it is valid.</p>
        ) : null}

        {rendering ? (
          <div>
            <div className="flex items-center gap-3">
              <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Export progress" className="h-2 min-w-32 flex-1 overflow-hidden rounded-full bg-sand-200">
                <div className="h-full bg-ink transition-[width]" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[12px] tabular-nums text-sand-600">{pct}%</span>
              <button type="button" onClick={() => abortRef.current?.abort()} className="rounded-full border border-sand-200 bg-sand-50 px-3.5 py-1.5 text-[12px] font-semibold text-ink transition hover:border-sand-300">
                Cancel
              </button>
            </div>
            <p className="mt-1.5 text-[12px] text-sand-600">Rendering in this tab — keep it open until it finishes.</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void startExport()}
            disabled={!configValid || (capability !== null && !capability.ok)}
            className="w-full rounded-full bg-ink px-5 py-2.5 font-sora text-[13px] font-semibold text-[#141412] transition hover:opacity-85 disabled:opacity-50 cursor-pointer"
          >
            Export {format.label}
          </button>
        )}

        {state.status === "error" ? (
          <div>
            <p role="alert" className="text-[12px] text-orange-accent">{state.message}</p>
            <button type="button" onClick={() => void startExport()} className="mt-2 rounded-full border border-sand-200 bg-sand-50 px-4 py-2 text-[13px] font-semibold text-ink transition hover:border-sand-300">
              Retry
            </button>
          </div>
        ) : null}
        {state.status === "done" ? (
          <p role="status" className="text-[12px] text-sand-600">
            Downloaded {state.filename} · {fmtBytes(state.sizeBytes)} · background {format.transparent ? "transparent" : backgroundColor.toUpperCase()}
          </p>
        ) : null}
      </div>
    </section>
  );
};
