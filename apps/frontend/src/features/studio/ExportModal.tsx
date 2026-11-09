"use client";

import * as Sentry from "@sentry/nextjs";
import React, { useEffect, useRef, useState } from "react";
import type { CaptionedVideoInput } from "@capseasy/compositions";
import { canExportInBrowser, exportMp4InBrowser, saveBlob } from "./browserExport";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { studioService, type ExportKind, type ExportRow } from "@/services/studio";
import { ApiError } from "@/services/api-client";
import { Button, fmtBytes, fmtTime, triggerDownload } from "./controls";
import { VideoReady } from "./VideoReady";
import { track } from "@/lib/track";

/** Same resolution either way: this only trades sharpness for file size. */
const QUALITY_OPTIONS = [
  { id: "high", label: "Best", hint: "Sharpest picture, biggest file. Best for posting to Reels, Shorts or TikTok." },
  { id: "balanced", label: "Balanced", hint: "Looks almost the same, file about a third smaller." },
  { id: "small", label: "Smaller file", hint: "Smallest file, slightly softer. Good for WhatsApp or slow internet." },
] as const;

interface Option { kind: ExportKind; title: string; desc: string; usesRange: boolean; popular?: boolean }
/** Browser-first launch: the two exports that work everywhere with nothing installed. */
const OPTIONS: Option[] = [
  { kind: "mp4", title: "Video with captions (MP4)", desc: "Ready to post on Reels, Shorts and TikTok. Made right here in your browser.", usesRange: true, popular: true },
  { kind: "srt", title: "Subtitles file (.srt)", desc: "For YouTube, LinkedIn, Premiere, CapCut and every editor.", usesRange: false },
];

/** wall-clock for "made in …" (kept out of render: only called from event handlers) */
const clock = () => performance.now();

const KIND_LABEL: Record<string, string> = { mp4: "MP4", mov_alpha: "ProRes overlay", webm_alpha: "WebM overlay", srt: "SRT", vtt: "VTT", ass: "ASS", txt: "TXT", json: "JSON" };

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
}

export const ExportModal: React.FC<Props> = ({ projectId, title, video, renderInput, mp4Block = null, saving, onClose, flushSave }) => {
  const qc = useQueryClient();
  const [busyKind, setBusyKind] = useState<ExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState<"high" | "balanced" | "small">("high");
  const [res, setRes] = useState<"source" | "1080" | "720">("source");
  const [trim, setTrim] = useState(false);
  const [startS, setStartS] = useState(0);
  const [endS, setEndS] = useState(Math.round(video.durationMs / 100) / 10);
  const totalS = Math.round(video.durationMs / 100) / 10;
  const short = Math.min(video.width, video.height);
  // scale by the SHORT edge so portrait and landscape both mean "720p/1080p"; keep even dimensions for H.264
  const dims = (): { width: number; height: number } | undefined => {
    if (res === "source" || short <= Number(res)) return undefined;
    const k = Number(res) / short;
    const even = (n: number) => Math.max(2, Math.round((n * k) / 2) * 2);
    return { width: even(video.width), height: even(video.height) };
  };
  const trimValid = !trim || (endS - startS >= 0.5 && startS >= 0 && endS <= totalS + 0.05);

  // MP4 is made in this tab
  const [web, setWeb] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [webProgress, setWebProgress] = useState<number | null>(null);
  const [webDone, setWebDone] = useState<string | null>(null);
  const [made, setMade] = useState<{ blob: Blob; name: string } | null>(null);
  const [showReady, setShowReady] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    let alive = true;
    void canExportInBrowser(video.width, video.height).then((r) => alive && setWeb(r));
    return () => {
      alive = false;
      abort.current?.abort();
    };
  }, [video.width, video.height]);
  const webReady = !!web?.ok && !!renderInput?.src;

  const [restarted, setRestarted] = useState(false);
  /**
   * Leaving the tab pauses the render; normally it carries on when they come back. If a phone dropped the video
   * encoder meanwhile the render never moves again, so a render that makes no progress for 45 s while the tab is
   * visible is stopped and started again by itself (a render can't resume half-way).
   */
  const exportHere = async (attempt = 0) => {
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
      const d = dims();
      const started = clock();
      const blob = await exportMp4InBrowser({
        input: renderInput,
        width: video.width,
        height: video.height,
        fps: video.fps,
        durationMs: video.durationMs,
        scale: d ? d.width / video.width : 1,
        range: trim ? { startMs: Math.round(startS * 1000), endMs: Math.round(endS * 1000) } : undefined,
        quality,
        signal: ctrl.signal,
        onProgress: (f) => {
          last = Date.now();
          setWebProgress(f);
        },
      });
      const name = `${(title || "captionseasy").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "captionseasy"}.mp4`;
      saveBlob(blob, name);
      setWebDone(`${fmtBytes(blob.size)} · made in ${fmtTime(clock() - started)}`);
      setMade({ blob, name });
      setShowReady(true);
      track("export_done", { kind: "mp4", quality, trimmed: trim });
    } catch (e) {
      if (stalled && attempt < 2) again = true;
      else if (stalled) setError("The export kept stalling. Keep this tab open and in front while it renders, then try again.");
      else if (!ctrl.signal.aborted) {
        Sentry.captureException(e, { tags: { area: "browser-export" } });
        track("export_failed", { kind: "mp4" });
        setError(e instanceof Error ? `Couldn't render in the browser: ${e.message}` : "Couldn't render in the browser.");
      }
    } finally {
      clearInterval(guard);
      document.removeEventListener("visibilitychange", onVisible);
      setWebProgress(null);
      abort.current = null;
    }
    if (again) {
      Sentry.captureMessage("export: restarted after a stall", { level: "info", extra: { attempt } });
      setRestarted(true);
      await exportHere(attempt + 1);
    }
  };

  const exportsQ = useQuery({
    queryKey: ["exports", projectId],
    queryFn: () => studioService.listExports(projectId),
    refetchInterval: (q) => ((q.state.data as ExportRow[] | undefined)?.some((e) => e.status_v2 === "queued" || e.status_v2 === "rendering") ? 2500 : false),
  });

  const download = async (id: string) => {
    try {
      triggerDownload(await studioService.exportDownloadUrl(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not download.");
    }
  };

  const start = async (o: Option) => {
    if (o.kind === "mp4") {
      // MP4 is made in the browser only; a click while the support check is still running waits for it
      if (mp4Block) {
        setError(mp4Block.reason);
        return;
      }
      let w = web;
      if (!w) {
        setBusyKind("mp4");
        w = await canExportInBrowser(video.width, video.height);
        setWeb(w);
        setBusyKind(null);
      }
      if (w.ok && renderInput?.src) return exportHere();
      setError(w.ok ? "The video isn't loaded yet. Wait a moment and try again." : w.reason ?? "This browser can't make MP4s. Use Chrome, Edge or Safari.");
      return;
    }
    setError(null);
    setBusyKind(o.kind);
    try {
      await flushSave(); // never export stale captions
      const body = {
        kind: o.kind,
        crf: quality === "high" ? 20 : quality === "balanced" ? 24 : 29,
        ...(o.usesRange ? dims() ?? {} : {}),
        ...(o.usesRange && trim ? { range: { startMs: Math.round(startS * 1000), endMs: Math.round(endS * 1000) } } : {}),
      };
      const created = await studioService.createExport(projectId, body);
      if (created.ready && created.downloadUrl) triggerDownload(created.downloadUrl);
      track("export_done", { kind: o.kind });
      await qc.invalidateQueries({ queryKey: ["exports", projectId] });
      await qc.invalidateQueries({ queryKey: ["studio", projectId] });
    } catch (e) {
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

          <div className="mb-3 flex flex-col gap-1.5 text-sm text-st-text/80 sm:flex-row sm:items-center sm:justify-between">
            <span>Resolution</span>
            <div className="grid grid-cols-3 rounded-lg border border-st-line bg-st-raised p-0.5 sm:inline-flex">
              {([["source", `Original (${short}p)`], ["1080", "1080p"], ["720", "720p"]] as const).map(([v, label]) => (
                <button key={v} disabled={v !== "source" && short <= Number(v)} onClick={() => setRes(v)} className={`whitespace-nowrap rounded-md px-2.5 py-2 text-xs disabled:opacity-30 sm:py-1 ${res === v ? "bg-st-lav text-obsidian" : "text-st-text/80"}`}>{label}</button>
              ))}
            </div>
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

          <div className="grid gap-2">
            {OPTIONS.map((o) => {
              const unavailable = o.kind === "mp4" && (!!mp4Block || (web !== null && !webReady));
              return (
                <button
                  key={o.kind}
                  disabled={busyKind !== null || webProgress !== null || unavailable || (o.usesRange && !trimValid)}
                  onClick={() => void start(o)}
                  className={`relative rounded-xl border p-4 text-left transition disabled:opacity-50 ${o.popular ? "border-st-ink bg-st-lav/40 hover:bg-st-lav/60" : "border-st-line bg-st-raised/50 hover:border-st-ink/30 hover:bg-st-lav/30"}`}
                >
                  {o.popular ? <span className="absolute -top-2.5 right-3 rounded-full bg-st-or px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-obsidian">Most popular</span> : null}
                  <div className={`text-sm ${o.popular ? "font-semibold" : "font-medium"} text-st-text`}>{busyKind === o.kind ? "Working…" : o.title}</div>
                  <div className="mt-0.5 text-xs text-st-muted">{unavailable ? mp4Block?.reason ?? web?.reason ?? "This browser can't make MP4s. Use Chrome, Edge or Safari." : o.desc}</div>
                </button>
              );
            })}
          </div>
          {webProgress !== null ? (
            <div className="mt-3 rounded-xl border border-st-line bg-st-raised/60 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-st-text">Rendering your MP4 in this tab… {Math.round(webProgress * 100)}%</span>
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
          {error ? <p role="alert" className="mt-3 rounded-lg border border-st-or/60 bg-st-or/15 px-3 py-2 text-sm text-st-text">{error}</p> : null}

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
