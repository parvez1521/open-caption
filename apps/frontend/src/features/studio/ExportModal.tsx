"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import type { CaptionedVideoInput } from "@capseasy/compositions";
import {
  EXPORT_RESOLUTION_LABEL, exportMemoryErrorMessage,
  type ExportResolution, type ExportSettings,
} from "@capseasy/shared";
import { canExportInBrowser, exportMp4InBrowser, saveBlob } from "./browserExport";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { studioService, type ExportKind, type ExportRow } from "@/services/studio";
import { loadCashfreeSdk } from "@/lib/billing/cashfreeClient";
import { WATERMARK_REMOVAL_PRICE_INR } from "@capseasy/shared";
import { EXPORT_OPTIONS, exportDimsWithCanvas, optionKey, translatedTextOptions, type ExportOption } from "./exportOptions";
import type { CanvasSettings } from "./canvas";
import { ApiError } from "@/services/api-client";
import { TurnstileWidget, isTurnstileConfigured } from "@/components/auth/TurnstileWidget";
import { Button, fmtBytes, fmtTime, triggerDownload } from "./controls";
import { exportPreflightNote, fourKBlockReason } from "./preflight";
import { VideoReady } from "./VideoReady";
import { track } from "@/lib/track";

/**
 * Export resolution options (owner 2026-11-10). The dims follow the shared short-edge rule from the
 * project's aspect; the hints are honest about the cost — 2K/4K are slower and 4K needs a strong device.
 */
const RESOLUTION_OPTIONS: Array<{ id: ExportResolution; hint: string }> = [
  { id: "720p", hint: "Fastest to render, smallest file." },
  { id: "1080p", hint: "Full HD. The usual choice for Reels, Shorts and TikTok." },
  { id: "2k", hint: "2K — slower to render, bigger file." },
  { id: "4k", hint: "4K — much slower, needs a strong device." },
];

/** Frame-rate hints. 60fps is NEVER described as adding motion: a lower-fps source just repeats frames. */
const FPS_OPTIONS: Array<{ id: 30 | 60; label: string; hint: string }> = [
  { id: 30, label: "30 fps", hint: "Standard frame rate. Matches most phone videos." },
  { id: 60, label: "60 fps", hint: "Twice as many frames, slower to render. If your original video is below 60 fps, its frames are repeated — 60 fps does not add new motion." },
];

/** Same resolution either way: this only trades sharpness for file size. */
const QUALITY_OPTIONS = [
  { id: "high", label: "Best", hint: "Sharpest picture, biggest file. Best for posting to Reels, Shorts or TikTok." },
  { id: "balanced", label: "Balanced", hint: "Looks almost the same, file about a third smaller." },
  { id: "small", label: "Smaller file", hint: "Smallest file, slightly softer. Good for WhatsApp or slow internet." },
] as const;

/** wall-clock for "made in …" (kept out of render: only called from event handlers) */
const clock = () => performance.now();

const KIND_LABEL: Record<string, string> = { mp4: "MP4", mov_alpha: "ProRes overlay", webm_alpha: "WebM overlay", srt: "SRT", vtt: "VTT", ass: "ASS", txt: "TXT", json: "JSON", png: "PNG" };

interface Props {
  projectId: string;
  title?: string;
  video: { width: number; height: number; durationMs: number; fps: number };
  /** exactly what the preview Player renders; the in-browser export renders the same thing */
  renderInput: CaptionedVideoInput | null;
  /** set when an MP4 can't be made yet (picture unreadable, or the export copy is still being prepared) */
  mp4Block?: { reason: string; progress?: number } | null;
  saving: boolean;
  onClose: () => void;
  flushSave: () => Promise<void>;
  /** the project's saved export choice (resolution + frame rate), persisted per project via settings */
  exportSettings: ExportSettings;
  onExportSettings: (next: ExportSettings) => void;
  /** the project's canvas choice: when its aspect isn't "source", exports are authored at that aspect */
  canvas?: CanvasSettings | null;
  /** Run 3 audio mix (present only when the mix is active): shown under the MP4 option, and
   *  applied to the browser-rendered MP4 before it is saved. renderInput is already muted in
   *  that case, so the muxed mix is the file's only sound. */
  audioMix?: { note: string; apply: (videoBlob: Blob) => Promise<Blob> } | null;
  /** saved translated tracks (slice 5.1): each adds translated SRT/VTT export rows */
  translationTracks?: { lang: string; label: string }[];
}

export const ExportModal: React.FC<Props> = ({ projectId, title, video, renderInput, mp4Block = null, saving, onClose, flushSave, exportSettings, onExportSettings, canvas = null, audioMix = null, translationTracks = [] }) => {
  const qc = useQueryClient();
  const allOptions: ExportOption[] = [...EXPORT_OPTIONS, ...translatedTextOptions(translationTracks)];
  /** busy identity is the option KEY (kind, or kind:language for translated rows), not just the kind */
  const [busyKind, setBusyKind] = useState<string | null>(null);
  /** picked option KEY: choosing an option only selects it — rendering starts from the Render button below */
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = allOptions.find((o) => optionKey(o) === selectedKey) ?? null;
  /** the selected option's Render button label: video renders "Render", text files "Export" */
  const renderLabel = (o: ExportOption): string => {
    if (o.language) return `Export ${o.title}`;
    const verb = o.kind === "mp4" || o.kind === "mov_alpha" || o.kind === "webm_alpha" ? "Render" : "Export";
    return `${verb} ${KIND_LABEL[o.kind] ?? o.kind}`;
  };
  const [error, setError] = useState<string | null>(null);
  /** Turnstile challenge for the free trial (Builder 5): set when the
   * server refuses a grant because this network already used the trial
   * (or signup velocity is suspicious). The widget below collects a
   * token and the same export is retried with it. */
  const [trialChallenge, setTrialChallenge] = useState<{ option: ExportOption } | null>(null);
  /** set when a companion render (alpha overlay) was queued instead of made right away */
  const [queuedNote, setQueuedNote] = useState<string | null>(null);
  const [quality, setQuality] = useState<"high" | "balanced" | "small">("high");
  const [trim, setTrim] = useState(false);
  const [startS, setStartS] = useState(0);
  const [endS, setEndS] = useState(Math.round(video.durationMs / 100) / 10);
  const totalS = Math.round(video.durationMs / 100) / 10;
  // 4K is off on low-memory devices (Phase 2B pre-flight): the gate reuses the
  // same constrained-device signal as transcription (phone, or <= 4 GB reported
  // memory). A project that saved 4K on a stronger device falls back to 2K here —
  // the render below uses the effective resolution, never a 4K attempt.
  const [blocked4kReason] = useState(() => fourKBlockReason());
  const effectiveResolution: ExportResolution = blocked4kReason && exportSettings.resolution === "4k" ? "2k" : exportSettings.resolution;
  const exportNote = exportPreflightNote(effectiveResolution);
  // the chosen resolution as absolute output dims, from the project's EFFECTIVE aspect — the
  // canvas aspect when one is chosen, else the source's own (shared short-edge rule: 9:16 at
  // 1080p is 1080x1920, 16:9 is 1920x1080). This drives BOTH render paths below: the in-browser
  // render (exportHere) and the dims sent in the server/companion export payload (start).
  const outDims = exportDimsWithCanvas(video, canvas, effectiveResolution);
  const outFps = exportSettings.fps;
  const trimValid = !trim || (endS - startS >= 0.5 && startS >= 0 && endS <= totalS + 0.05);

  // MP4 is made in this tab
  const [web, setWeb] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [webProgress, setWebProgress] = useState<number | null>(null);
  /** phase label for the progress card (rendering, then "Mixing sound…" while the audio mix is muxed in) */
  const [phaseLabel, setPhaseLabel] = useState<string | null>(null);
  const [webDone, setWebDone] = useState<string | null>(null);
  const [made, setMade] = useState<{ blob: Blob; name: string } | null>(null);
  const [showReady, setShowReady] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    let alive = true;
    // encoder support is checked at the OUTPUT size: a browser that encodes 1080p may refuse 4K
    void canExportInBrowser(outDims.width, outDims.height).then((r) => alive && setWeb(r));
    return () => {
      alive = false;
      abort.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outDims.width, outDims.height]);
  const webReady = !!web?.ok && !!renderInput?.src;
  /** Effective plan, for the MOV gate below. Same query key as the Looks
   * panel, so the plan loads once per session. While it loads — or if it
   * fails — the MOV row is disabled (fail closed). Display only: the
   * server export routes re-check the plan before anything renders. */
  const planQ = useQuery({ queryKey: ["billing-plan"], queryFn: () => studioService.billingPlan(), staleTime: 60_000 });
  const movPaid = planQ.data?.plan !== undefined && planQ.data.plan !== "free";
  /** the Render button stays off while the picked option can't run (MP4 blocked, or a bad trim range) */
  const selectedUnavailable = selected?.kind === "mp4" && (!!mp4Block || (web !== null && !webReady));
  const selectedMovBlocked = selected?.kind === "mov_alpha" && !movPaid;
  const renderDisabled = busyKind !== null || webProgress !== null || !selected || !!selectedUnavailable || !!selectedMovBlocked || (selected.usesRange && !trimValid);

  const [restarted, setRestarted] = useState(false);
  /**
   * Leaving the tab pauses the render; normally it carries on when they come back. If a phone dropped the video
   * encoder meanwhile the render never moves again, so a render that makes no progress for 45 s while the tab is
   * visible is stopped and started again by itself (a render can't resume half-way).
   */
  const exportHere = async (exportId: string, reservedMinutes: number, watermark: { text: string } | null, attempt = 0) => {
    if (!renderInput) return;
    setError(null);
    setWebDone(null);
    setWebProgress(0);
    if (attempt === 0) setRestarted(false);
    const ctrl = new AbortController();
    abort.current = ctrl;
    let last = Date.now();
    let stalled = false;
    let again = false;
    // set once the file is saved and the settle call is fired — the
    // finally block refunds the hold on every other exit
    let settled = false;
    const settleFailed = () => {
      void studioService
        .settleBrowserExport(projectId, { exportId, kind: "mp4", outcome: "failed" })
        .catch(() => {})
        .finally(() => void qc.invalidateQueries({ queryKey: ["minutes", projectId] }));
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") last = Date.now();
    };
    document.addEventListener("visibilitychange", onVisible);
    const guard = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - last > 45_000) {
        stalled = true;
        ctrl.abort();
      }
    }, 5000);
    try {
      await flushSave();
      const started = clock();
      setPhaseLabel(null);
      let blob = await exportMp4InBrowser({
        // Watermark: the reserve endpoint's server-side decision wins — it
        // is what the preview showed, resolved at render time. A modified
        // client can skip the reserve call on the browser path, so this is
        // a deterrent here and a guarantee only on the server path.
        input: { ...renderInput, watermark },
        width: outDims.width,
        height: outDims.height,
        fps: outFps,
        durationMs: video.durationMs,
        range: trim ? { startMs: Math.round(startS * 1000), endMs: Math.round(endS * 1000) } : undefined,
        quality,
        signal: ctrl.signal,
        onProgress: (f) => {
          last = Date.now();
          setWebProgress(f);
        },
      });
      if (audioMix) {
        // the rendered MP4 is silent (muted render input), so a failed mix must NOT
        // fall through to saving it: surface the failure and save nothing.
        setPhaseLabel("Mixing sound…");
        setWebProgress(1);
        try {
          blob = await audioMix.apply(blob);
        } catch (mixErr) {
          setError(`Sound mix failed: ${mixErr instanceof Error ? mixErr.message : "the mix could not be made on this device."}`);
          return;
        }
      }
      const name = `${(title || "captionit").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "captionit"}.mp4`;
      saveBlob(blob, name);
      // Settle the reservation made before the render: completion charges
      // the reserved minutes (the server computed them from the video and
      // the trim). A failed settle just means the hold is swept later by
      // the stale-hold cleanup — the file is already saved.
      void studioService
        .settleBrowserExport(projectId, { exportId, kind: "mp4", outcome: "completed", actualMinutes: reservedMinutes })
        .catch(() => {})
        .finally(() => void qc.invalidateQueries({ queryKey: ["minutes", projectId] }));
      settled = true;
      setWebDone(`${fmtBytes(blob.size)} · made in ${fmtTime(clock() - started)}`);
      setMade({ blob, name });
      setShowReady(true);
      track("export_done", { kind: "mp4", quality, trimmed: trim, resolution: effectiveResolution, fps: outFps });
    } catch (e) {
      if (stalled && attempt < 2) again = true;
      else if (stalled) setError("The export kept stalling. Keep this tab open and in front while it renders. Then try again.");
      else if (!ctrl.signal.aborted) {
        Sentry.captureException(e, { tags: { area: "browser-export" } });
        track("export_failed", { kind: "mp4" });
        // a memory failure gets plain words + the fix (lower resolution), never a generic failure
        const oom = exportMemoryErrorMessage(e, effectiveResolution);
        setError(oom ?? (e instanceof Error ? `Couldn't render in the browser: ${e.message}` : "Couldn't render in the browser."));
      }
    } finally {
      clearInterval(guard);
      document.removeEventListener("visibilitychange", onVisible);
      setWebProgress(null);
      setPhaseLabel(null);
      abort.current = null;
      // Every exit except a saved file or a stall restart refunds the
      // hold: a failed, cancelled, or stalled-out render never consumes
      // minutes. A stall that restarts keeps the same reservation.
      if (!settled && !again) settleFailed();
    }
    if (again) {
      Sentry.captureMessage("export: restarted after a stall", { level: "info", extra: { attempt } });
      setRestarted(true);
      await exportHere(exportId, reservedMinutes, watermark, attempt + 1);
    }
  };

  const exportsQ = useQuery({
    queryKey: ["exports", projectId],
    queryFn: () => studioService.listExports(projectId),
    refetchInterval: (q) => ((q.state.data as ExportRow[] | undefined)?.some((e) => e.status_v2 === "queued" || e.status_v2 === "rendering") ? 2500 : false),
  });

  /** Minutes balance: remaining minutes in the current cycle. Text files never count. */
  const minutesQ = useQuery({
    queryKey: ["minutes", projectId],
    queryFn: () => studioService.minutesUsage(),
    staleTime: 60_000,
  });
  const minutes = minutesQ.data?.minutes ?? null;

  /** Watermark state for this project — the server-side truth. The preview shows the same value. */
  const watermarkQ = useQuery({
    queryKey: ["watermark", projectId],
    queryFn: () => studioService.watermarkStatus(projectId),
    staleTime: 60_000,
  });
  const watermarkState = watermarkQ.data ?? null;
  const [watermarkBusy, setWatermarkBusy] = useState(false);
  const [watermarkNotice, setWatermarkNotice] = useState<string | null>(null);

  /**
   * Buy the ₹69 one-time removal for this project. Checkout opens on the
   * billing page's return URL, where the payment is confirmed with
   * Cashfree directly — the webhook then grants the removal, and this
   * project exports clean from the next open of this panel.
   */
  const buyWatermark = async () => {
    setWatermarkBusy(true);
    setWatermarkNotice(null);
    try {
      const res = await studioService.buyWatermarkRemoval(projectId);
      if (res.alreadyEntitled) {
        setWatermarkNotice("This video already exports clean.");
        await qc.invalidateQueries({ queryKey: ["watermark", projectId] });
        return;
      }
      if (!res.configured || !res.paymentSessionId) {
        setWatermarkNotice("Watermark removal checkout isn't switched on yet. Your export is unchanged.");
        return;
      }
      const cashfree = await loadCashfreeSdk();
      await cashfree({ mode: res.env ?? "sandbox" }).checkout({ paymentSessionId: res.paymentSessionId, returnTarget: "_self" });
    } catch (e) {
      setWatermarkNotice(e instanceof ApiError || e instanceof Error ? e.message : "Checkout didn't start. Please try again.");
    } finally {
      setWatermarkBusy(false);
    }
  };

  const download = async (id: string) => {
    try {
      triggerDownload(await studioService.exportDownloadUrl(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not download.");
    }
  };

  const start = async (o: ExportOption, turnstileToken?: string) => {
    // MOV gate (display only — the server export routes enforce it): a
    // Free user cannot start a MOV export. The row is disabled too; this
    // guard covers a MOV picked before the plan loaded.
    if (o.kind === "mov_alpha" && !movPaid) {
      setError("MOV export is a paid plan feature.");
      return;
    }
    if (o.kind === "mp4") {
      // MP4 is made in the browser only; a click while the support check is still running waits for it
      if (mp4Block) {
        setError(mp4Block.reason);
        return;
      }
      // Minutes gate: the render happens on this device, so the minutes
      // are reserved on the server BEFORE it starts. A 402 means the
      // minutes are used up — the render never starts. (Server renders
      // are gated by the API the same way.)
      const exportId = crypto.randomUUID();
      let reservation;
      try {
        reservation = await studioService.reserveBrowserExport(projectId, {
          exportId,
          kind: "mp4",
          ...(trim ? { range: { startMs: Math.round(startS * 1000), endMs: Math.round(endS * 1000) } } : {}),
        }, turnstileToken ? { turnstileToken } : undefined);
      } catch (e) {
        // A trial challenge (this network already used the free trial):
        // show the Turnstile widget and retry with its token, instead
        // of a dead end. Any other reserve failure is a plain error.
        if (e instanceof ApiError && (e.details as Record<string, unknown> | null)?.trialChallenge === true) {
          setTrialChallenge({ option: o });
        }
        setError(e instanceof ApiError || e instanceof Error ? e.message : "Could not reserve minutes for this export.");
        return;
      }
      let w = web;
      if (!w) {
        setBusyKind("mp4");
        w = await canExportInBrowser(outDims.width, outDims.height);
        setWeb(w);
        setBusyKind(null);
      }
      if (w.ok && renderInput?.src) {
        // The reserve endpoint's watermark decision wins over the preview's
        // copy (same server truth, resolved at render time); the preview's
        // value is only the fallback when the server sent none.
        return exportHere(exportId, reservation.minutes, reservation.watermark ?? renderInput.watermark ?? null);
      }
      // The render cannot start after all: give the hold straight back.
      void studioService.settleBrowserExport(projectId, { exportId, kind: "mp4", outcome: "failed" }).catch(() => {});
      setError(w.ok ? "The video isn't loaded yet. Wait a moment and try again." : w.reason ?? "This browser can't make MP4s. Use Chrome, Edge or Safari.");
      return;
    }
    setError(null);
    setQueuedNote(null);
    setBusyKind(optionKey(o));
    try {
      await flushSave(); // never export stale captions
      const body = {
        kind: o.kind,
        // translated rows export the translated track (slice 5.1); the API validates the language
        ...(o.language ? { language: o.language } : {}),
        crf: quality === "high" ? 20 : quality === "balanced" ? 24 : 29,
        // the same chosen resolution + fps the browser path uses, as absolute dims for the render job
        ...(o.usesRange ? { width: outDims.width, height: outDims.height, fps: outFps } : {}),
        ...(o.usesRange && trim ? { range: { startMs: Math.round(startS * 1000), endMs: Math.round(endS * 1000) } } : {}),
      };
      const created = await studioService.createExport(projectId, body, turnstileToken ? { turnstileToken } : undefined);
      if (created.ready && created.downloadUrl) triggerDownload(created.downloadUrl);
      // alpha overlays are not made here: the API queues a render for the paired desktop app, and
      // with no companion online the job simply waits — say so instead of implying a file is coming
      if (!created.ready) {
        setQueuedNote(created.companionOnline
          ? "Rendering on your paired computer now. Your file will appear under “Your exports” below when it is ready."
          : "Queued. No paired computer is online right now. This will start rendering when your desktop app is next online. It will appear under “Your exports” below.");
      }
      track("export_done", { kind: o.kind });
      await qc.invalidateQueries({ queryKey: ["exports", projectId] });
      await qc.invalidateQueries({ queryKey: ["minutes", projectId] });
      await qc.invalidateQueries({ queryKey: ["studio", projectId] });
    } catch (e) {
      // Same trial challenge as the MP4 reserve above, for server renders.
      if (e instanceof ApiError && (e.details as Record<string, unknown> | null)?.trialChallenge === true) {
        setTrialChallenge({ option: o });
      }
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusyKind(null);
    }
  };

  const rows = exportsQ.data ?? [];
  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-label="Export" onClick={(e) => e.stopPropagation()} className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-st-line bg-st-panel pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-st-line px-5 py-4">
          <h2 className="text-lg font-semibold">Export</h2>
          <button onClick={onClose} aria-label="Close" className="-mr-2 grid h-10 w-10 place-items-center rounded-full text-st-muted hover:bg-st-raised hover:text-st-text">✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {saving ? <p className="mb-3 rounded-lg bg-st-raised/70 px-3 py-2 text-xs text-st-muted">Saving your latest edits first…</p> : null}
          <div className="mb-3 text-sm text-st-text/80">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <span>Video quality</span>
              <div role="radiogroup" aria-label="Video quality" className="grid grid-cols-3 rounded-lg border border-st-line bg-st-raised p-0.5 sm:inline-flex">
                {QUALITY_OPTIONS.map((q) => (
                  <button key={q.id} role="radio" aria-checked={quality === q.id} onClick={() => setQuality(q.id)} className={`rounded-md px-2.5 py-2 text-xs sm:py-1 ${quality === q.id ? "bg-st-lav text-obsidian" : "text-st-text/80"}`}>{q.label}</button>
                ))}
              </div>
            </div>
            <p className="mt-1 text-xs text-st-faint sm:text-right">{QUALITY_OPTIONS.find((q) => q.id === quality)?.hint}</p>
          </div>

          <div className="mb-3 text-sm text-st-text/80">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <span>Resolution</span>
              <div role="radiogroup" aria-label="Export resolution" className="grid grid-cols-4 rounded-lg border border-st-line bg-st-raised p-0.5 sm:inline-flex">
                {RESOLUTION_OPTIONS.map((r) => {
                  const blocked = r.id === "4k" && blocked4kReason !== null;
                  return (
                    <button key={r.id} role="radio" aria-checked={effectiveResolution === r.id} aria-disabled={blocked || undefined} disabled={blocked} title={blocked ? blocked4kReason ?? undefined : undefined} onClick={() => onExportSettings({ ...exportSettings, resolution: r.id })} className={`whitespace-nowrap rounded-md px-2.5 py-2 text-xs sm:py-1 ${effectiveResolution === r.id ? "bg-st-lav text-obsidian" : "text-st-text/80"} ${blocked ? "opacity-40" : ""}`}>{EXPORT_RESOLUTION_LABEL[r.id]}</button>
                  );
                })}
              </div>
            </div>
            <p className="mt-1 text-xs text-st-faint sm:text-right">{RESOLUTION_OPTIONS.find((r) => r.id === effectiveResolution)?.hint} Exports at {outDims.width} × {outDims.height} · {exportSettings.fps} fps.</p>
            {blocked4kReason ? <p className="mt-1 text-xs text-st-faint sm:text-right">{blocked4kReason}</p> : exportNote ? <p className="mt-1 text-xs text-st-faint sm:text-right">{exportNote}</p> : null}
          </div>

          <div className="mb-3 text-sm text-st-text/80">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <span>Frame rate</span>
              <div role="radiogroup" aria-label="Export frame rate" className="grid grid-cols-2 rounded-lg border border-st-line bg-st-raised p-0.5 sm:inline-flex">
                {FPS_OPTIONS.map((f) => (
                  <button key={f.id} role="radio" aria-checked={exportSettings.fps === f.id} onClick={() => onExportSettings({ ...exportSettings, fps: f.id })} className={`whitespace-nowrap rounded-md px-2.5 py-2 text-xs sm:py-1 ${exportSettings.fps === f.id ? "bg-st-lav text-obsidian" : "text-st-text/80"}`}>{f.label}</button>
                ))}
              </div>
            </div>
            <p className="mt-1 text-xs text-st-faint sm:text-right">{FPS_OPTIONS.find((f) => f.id === exportSettings.fps)?.hint}</p>
          </div>
          <div className="mb-4 rounded-xl bg-st-raised/50 p-3 text-sm text-st-text/80">
            <label className="flex min-h-8 cursor-pointer items-center gap-2">
              <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} className="accent-[#34D399]" />
              Only export part of the video
            </label>
            {trim ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span>From</span>
                <input type="number" min={0} max={totalS} step={0.1} value={startS} onChange={(e) => setStartS(Number(e.target.value))} className="w-20 rounded border border-st-line bg-st-raised px-2 py-1" aria-label="Trim start (seconds)" />
                <span>to</span>
                <input type="number" min={0} max={totalS} step={0.1} value={endS} onChange={(e) => setEndS(Number(e.target.value))} className="w-20 rounded border border-st-line bg-st-raised px-2 py-1" aria-label="Trim end (seconds)" />
                <span className="text-st-faint">seconds of {totalS}s</span>
                {!trimValid ? <span className="text-st-text">Pick a range of at least 0.5 s</span> : null}
              </div>
            ) : null}
          </div>

          <p className="mb-3 text-xs leading-relaxed text-st-faint">
            Quality, resolution, frame rate and trim apply to the video formats (MP4 and the two
            overlays). The text files below always contain all your captions, in full.
          </p>
          <div className="grid gap-2">
            {allOptions.map((o) => {
              const unavailable = o.kind === "mp4" && (!!mp4Block || (web !== null && !webReady));
              // MOV is a paid plan feature: the row is disabled for Free
              // users (display only — the server refuses it either way).
              const movBlocked = o.kind === "mov_alpha" && !movPaid;
              const key = optionKey(o);
              const isSelected = selectedKey === key;
              return (
                <button
                  key={key}
                  disabled={busyKind !== null || webProgress !== null || unavailable || movBlocked || (o.usesRange && !trimValid)}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedKey(key)}
                  className={`relative rounded-xl border p-4 text-left transition disabled:opacity-50 ${isSelected ? "border-st-em bg-st-em/10" : o.popular ? "border-st-ink bg-st-lav/40 hover:bg-st-lav/60" : "border-st-line bg-st-raised/50 hover:border-st-ink/30 hover:bg-st-lav/30"}`}
                >
                  {o.popular ? <span className="absolute -top-2.5 right-3 rounded-full bg-st-or px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#141412]">Most popular</span> : null}
                  <div className={`text-sm ${o.popular ? "font-semibold" : "font-medium"} text-st-text`}>{busyKind === key ? "Working…" : o.title}</div>
                  <div className="mt-0.5 text-xs text-st-muted">{movBlocked ? "MOV export is a paid plan feature." : unavailable ? mp4Block?.reason ?? web?.reason ?? "This browser can't make MP4s. Use Chrome, Edge or Safari." : o.desc}</div>
                  {o.kind === "mp4" && audioMix ? <div className="mt-0.5 text-xs text-st-muted">{audioMix.note}</div> : null}
                </button>
              );
            })}
          </div>
          {selected ? (
            <Button tone="primary" className="mt-3 w-full !py-3 text-sm font-semibold" disabled={renderDisabled} onClick={() => void start(selected)}>
              {busyKind === optionKey(selected) ? "Working…" : renderLabel(selected)}
            </Button>
          ) : null}
          {watermarkState?.watermark && selected?.kind === "mp4" ? (
            <div className="mt-3 rounded-xl border border-st-line bg-st-raised/50 p-3 text-sm text-st-text/80">
              <p>Free MP4 exports carry a small Captionit watermark.</p>
              <p className="mt-1 text-xs text-st-muted">Remove it from this video for ₹{WATERMARK_REMOVAL_PRICE_INR}, once. Re-exports stay clean.</p>
              {watermarkState.watermarkReady ? (
                <Button className="mt-2 !px-3 !py-2 text-xs font-semibold" disabled={watermarkBusy} onClick={() => void buyWatermark()}>
                  {watermarkBusy ? "Opening checkout…" : `Remove the watermark — ₹${WATERMARK_REMOVAL_PRICE_INR} once`}
                </Button>
              ) : (
                <p className="mt-2 text-xs text-st-muted">Watermark removal checkout isn&apos;t set up yet.</p>
              )}
              {watermarkNotice ? <p role="status" className="mt-2 text-xs text-st-text">{watermarkNotice}</p> : null}
            </div>
          ) : null}
          {minutes ? (
            <p className="mt-2 text-xs text-st-muted">
              {minutes.remaining} of {minutes.granted} minutes left.
              {minutes.remaining <= 0 ? (
                <>
                  {" "}
                  <Link href="/settings/billing" className="font-semibold text-st-text underline">
                    Upgrade
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
          {webProgress !== null ? (
            <div className="mt-3 rounded-xl border border-st-line bg-st-raised/60 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-st-text">{phaseLabel ?? `Rendering your MP4 in this tab… ${Math.round(webProgress * 100)}%`}</span>
                <Button className="!px-2 !py-1 text-xs" onClick={() => abort.current?.abort()}>Cancel</Button>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-st-line">
                <div className="h-full rounded-full bg-st-em transition-[width] duration-300" style={{ width: `${Math.max(2, webProgress * 100)}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-st-muted">{restarted ? "It paused while you were away, so it started again. " : ""}Keep this tab open. Nothing is uploaded: the video is made on this device.</p>
            </div>
          ) : webDone ? (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-st-em/15 px-3 py-2 text-sm text-st-text">
              <span>✓ Your MP4 is downloading ({webDone}).</span>
              {made ? <Button className="!px-2.5 !py-1 text-xs" onClick={() => setShowReady(true)}>Share</Button> : null}
            </div>
          ) : null}
          {queuedNote ? <p role="status" className="mt-3 rounded-lg bg-st-raised/70 px-3 py-2 text-sm text-st-text">{queuedNote}</p> : null}
          {error ? <p role="alert" className="mt-3 rounded-lg border border-st-or/60 bg-st-or/15 px-3 py-2 text-sm text-st-text">{error}</p> : null}
          {trialChallenge && isTurnstileConfigured() ? (
            <div className="mt-3 rounded-lg border border-st-line bg-st-raised/50 p-3">
              <p className="text-sm text-st-text">Confirm you are human to use the free trial.</p>
              <div className="mt-2">
                <TurnstileWidget
                  onToken={(token) => {
                    const option = trialChallenge.option;
                    setTrialChallenge(null);
                    setError(null);
                    void start(option, token);
                  }}
                  onError={() => setError("The check did not load. Try again.")}
                />
              </div>
            </div>
          ) : null}

          {rows.length > 0 ? (
            <div className="mt-6">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-st-muted">Your exports</h3>
              <ul className="divide-y divide-white/5 rounded-xl border border-st-line">
                {rows.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate text-st-text">{KIND_LABEL[r.kind ?? ""] ?? r.kind}{r.resolution ? <span className="text-st-faint"> · {r.resolution}</span> : null}</div>
                      <div className="text-xs text-st-faint">{new Date(r.created_at).toLocaleString()}{r.file_size ? ` · ${fmtBytes(r.file_size)}` : ""}{r.render_duration_ms ? ` · rendered in ${fmtTime(r.render_duration_ms)}` : ""}</div>
                    </div>
                    {r.status_v2 === "ready" ? (
                      <Button tone="primary" onClick={() => void download(r.id)}>Download</Button>
                    ) : r.status_v2 === "queued" || r.status_v2 === "rendering" ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-st-text">Rendering…</span>
                        {r.job_id ? <Button className="!px-2 !py-1 text-xs" onClick={() => void studioService.cancelJob(r.job_id!).then(() => exportsQ.refetch())}>Cancel</Button> : null}
                      </div>
                    ) : r.status_v2 === "failed" || r.status_v2 === "cancelled" ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-st-text capitalize">{r.status_v2}</span>
                        {r.job_id ? <Button className="!px-2 !py-1 text-xs" onClick={() => void studioService.retryJob(r.job_id!).then(() => exportsQ.refetch())}>Retry</Button> : null}
                      </div>
                    ) : (
                      <span className="text-xs text-st-faint">Expired</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
    {made && showReady ? (
      <VideoReady blob={made.blob} filename={made.name} detail={webDone} onDownload={() => saveBlob(made.blob, made.name)} onClose={() => setShowReady(false)} />
    ) : null}
    </>
  );
};
