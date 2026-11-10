"use client";

import { useSyncExternalStore } from "react";
import { fromWhisperCaptions } from "@motion-ai/caption-engine/core";
import type { Word } from "@capseasy/shared";
import { apiClient } from "@/services/api-client";
import { decodeAudio, dropWorker, sendToWorker, speechWorker, withRetry, type BrowserStatus, type Out } from "./browserWhisper";
import { MODELS, PROJECT_LANGUAGE, markWebgpuBroken, modelKeyOf, speechLanguageOf, webgpuMarkedBroken, type SpeechLanguage, type SpeechModel } from "./runtime";
import { dropRepeatedRuns } from "./speech";
import { mark, note, report } from "./timing";
import { track } from "@/lib/track";
import { deleteProgress, getProgress, saveProgress } from "@/features/upload/localVideos";

/**
 * One captioning run for one project, owned by the module (not by a React component) so it can start the instant a
 * video is dropped, keep going while the studio re-renders, and show captions while they're still being written.
 *
 *   start()      -> audio + speech model start immediately, in parallel with registering the video on the server
 *   attachJob()  -> once the server has made the transcribe job, claim it and report progress (keeps its lease alive)
 *   partials     -> every finished window updates `words`, so the editor can show them live
 *   done + job   -> save the final words through the regular job route
 *
 * A closed tab or a crash loses nothing: every window is written to IndexedDB and a retry resumes after it.
 *
 * Leaving the tab: phones (and desktop Chrome's background throttling) can freeze or kill the speech worker without
 * any error, and the server's hold on the job can lapse meanwhile. So on return (and whenever the worker goes
 * silent for longer than its current stage can explain) the run is "revived": a fresh worker continues from the
 * last saved window and the job is claimed again. Nothing ever sits on a frozen progress bar.
 */

export type Phase = "starting" | "running" | "saving" | "saved" | "failed" | "stopped";

export interface SessionView {
  phase: Phase;
  /** which speech model writes these captions */
  model: SpeechLanguage;
  status: BrowserStatus | null;
  /** normalized, id-stamped words written so far */
  words: Word[];
  /** 0..1 share of the speech windows finished */
  progress: number;
  windowsDone: number;
  windowsTotal: number;
  /** length of the whole clip */
  durationMs: number;
  /** the clip time captions have been written up to */
  audioEndMs: number;
  device: string | null;
  error: string | null;
  /** the raw reason, shown small under the friendly message so a failure can be diagnosed */
  detail: string | null;
  resumed: boolean;
  startedAt: number;
  /** seconds until the rest of the captions are written (null until a window has finished) */
  etaSec: number | null;
}

type Raw = { text: string; startMs: number; endMs: number };

const sessions = new Map<string, TranscriptionSession>();
const listeners = new Set<() => void>();

export const getSession = (projectId: string) => sessions.get(projectId) ?? null;
export function subscribeSessions(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
const emit = () => listeners.forEach((l) => l());

// leaving / returning to the tab, for every run in it (one listener set per page)
if (typeof document !== "undefined") {
  const onChange = () => sessions.forEach((s) => (document.visibilityState === "hidden" ? s.slept() : s.wake()));
  document.addEventListener("visibilitychange", onChange);
  document.addEventListener("freeze", () => sessions.forEach((s) => s.slept()));
  document.addEventListener("resume", onChange);
  window.addEventListener("pageshow", onChange);
  window.addEventListener("online", () => sessions.forEach((s) => s.wake()));
}

/** After this many revivals in one run the problem isn't the tab switch: show the error (with Try again). */
const MAX_REVIVES = 4;

/** True while a run for this project is in this tab (the studio then doesn't need to poll the server for it). */
export const hasActiveSession = (projectId: string) => {
  const p = sessions.get(projectId)?.view.phase;
  return p === "starting" || p === "running" || p === "saving";
};

export interface StartOptions {
  projectId: string;
  videoId: string;
  file: Blob;
  language: string | null;
  /** extra facts for the timing report (file size, codec ...) */
  info?: Record<string, unknown>;
}

export function startSession(o: StartOptions): TranscriptionSession {
  const existing = sessions.get(o.projectId);
  if (existing && existing.videoId === o.videoId && existing.view.phase !== "failed" && existing.view.phase !== "stopped") return existing;
  existing?.stop();
  const s = new TranscriptionSession(o);
  sessions.set(o.projectId, s);
  emit();
  void s.run();
  return s;
}

export class TranscriptionSession {
  view: SessionView;
  readonly videoId: string;
  private readonly file: Blob;
  private readonly language: string | null;
  private readonly model: SpeechModel;
  private readonly runId = `run-${Math.random().toString(36).slice(2, 8)}`;
  private raw: Raw[] = [];
  private durationMs = 0;
  private jobId: string | null = null;
  private claimed = false;
  private finished: { device: string; noAudio: boolean } | null = null;
  private completing = false;
  private worker: Worker | null = null;
  private lastReport = 0;
  private settled: Array<() => void> = [];
  private windowMs: number[] = [];
  private transcribeStart = 0;
  private lastHeard = 0;
  private safe = false;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private windowsThisRun = 0;
  private hiddenAt = 0;
  private revives = 0;
  private probe: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly o: StartOptions) {
    this.videoId = o.videoId;
    this.file = o.file;
    this.model = MODELS[speechLanguageOf(o.language)];
    // Every shipped non-English choice is decoded with its model's own language token (Hinglish "en", Hindi "hi");
    // English uses its token when the project names a language, and older "auto" projects keep auto-detect.
    this.language = this.model.key !== "en" || (o.language && o.language !== "auto") ? this.model.language : null;
    this.view = { phase: "starting", model: this.model.key, status: null, words: [], progress: 0, windowsDone: 0, windowsTotal: 0, durationMs: 0, audioEndMs: 0, device: null, error: null, detail: null, resumed: false, startedAt: Date.now(), etaSec: null };
    mark(this.runId, "drop");
    note(this.runId, { fileMb: Math.round(o.file.size / 1048576), model: this.model.key, ...o.info });
  }

  private set(patch: Partial<SessionView>) {
    this.view = { ...this.view, ...patch };
    emit();
  }

  /** Called when the run has ended for good (saved, failed or stopped). */
  onSettled(fn: () => void) {
    if (["saved", "failed", "stopped"].includes(this.view.phase)) fn();
    else this.settled.push(fn);
    return () => void (this.settled = this.settled.filter((f) => f !== fn));
  }
  private settle() {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    if (this.probe) clearTimeout(this.probe);
    this.probe = null;
    this.settled.splice(0).forEach((f) => f());
  }

  stop() {
    if (["saved", "failed", "stopped"].includes(this.view.phase)) return;
    if (this.worker) dropWorker(this.worker);
    this.worker = null;
    this.set({ phase: "stopped" });
    void this.releaseJob("stopped");
    this.settle();
  }

  /** Run again after a failure; finished windows are not redone. */
  retry() {
    if (this.view.phase !== "failed" && this.view.phase !== "stopped") return;
    this.finished = null;
    this.completing = false;
    this.transcribeStart = 0;
    this.windowsThisRun = 0;
    this.revives = 0;
    this.set({ phase: "starting", error: null, status: null, etaSec: null });
    void this.run();
  }

  // ---------- leaving and coming back

  private get live() {
    return this.view.phase === "starting" || this.view.phase === "running";
  }

  /** How long the worker may stay quiet in its current stage before it is presumed frozen or gone. */
  private quietLimitMs(onReturn: boolean): number {
    const stage = this.view.status?.stage;
    if (stage === "transcribe") {
      const avg = this.windowMs.length ? this.windowMs.reduce((a, b) => a + b, 0) / this.windowMs.length : 20_000;
      return onReturn ? Math.min(60_000, Math.max(10_000, avg * 1.5 + 4_000)) : Math.max(120_000, avg * 5);
    }
    // downloading reports every chunk; loading the model into memory (shader/wasm compile) is quiet for a while
    if (stage === "download") return onReturn ? 15_000 : 60_000;
    return onReturn ? 45_000 : 120_000;
  }

  slept() {
    if (this.live && !this.hiddenAt) this.hiddenAt = Date.now();
  }

  /** Back in the tab: let a healthy worker speak up; a frozen or killed one is replaced and continues where it stopped. */
  wake() {
    if (document.visibilityState === "hidden") return;
    const away = this.hiddenAt ? Date.now() - this.hiddenAt : 0;
    this.hiddenAt = 0;
    if (this.view.phase === "saving") return void this.maybeComplete();
    if (!this.live) return;
    // the server may have given the job back to the queue while we were away
    if (away > 0) void this.reclaim();
    if (this.probe) clearTimeout(this.probe);
    const heard = this.lastHeard;
    const limit = this.quietLimitMs(true);
    // already silent for too long (common after a long absence on a phone): don't make them wait again
    if (Date.now() - heard > limit) return this.revive("no answer after returning to the tab");
    this.probe = setTimeout(() => {
      this.probe = null;
      if (this.live && this.lastHeard === heard && document.visibilityState === "visible") this.revive("no answer after returning to the tab");
    }, limit - (Date.now() - heard));
  }

  /** Replace the worker and continue from the last saved window (the model reloads from the browser's cache). */
  private revive(reason: string) {
    if (!this.live) return;
    if (this.revives >= MAX_REVIVES) return this.fail(new Error(`The speech model stopped responding (${reason}).`), false);
    this.revives++;
    console.warn(`[captions] restarting the speech model: ${reason}`);
    import("@sentry/nextjs").then((S) => S.captureMessage("captions: revived after the tab was left", { level: "info", extra: { reason, stage: this.view.status?.stage, revives: this.revives } })).catch(() => undefined);
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    if (this.probe) clearTimeout(this.probe);
    this.probe = null;
    if (this.worker) dropWorker(this.worker);
    this.worker = null;
    this.finished = null;
    this.completing = false;
    this.transcribeStart = 0;
    this.windowsThisRun = 0;
    this.set({ phase: "starting", status: null, etaSec: null });
    void this.run();
  }

  /** Hold the server job again (after a lapse it is back in the queue; claim takes it from there). */
  private async reclaim() {
    if (!this.jobId) return false;
    try {
      await this.call({ action: "claim" });
      this.claimed = true;
      return true;
    } catch {
      return false;
    }
  }

  // ---------- the job on the server

  /** The server has made the transcribe job: claim it (so nothing else takes it) and report progress from now on. */
  async attachJob(jobId: string) {
    if (this.jobId === jobId) return;
    this.jobId = jobId;
    mark(this.runId, "jobCreated");
    try {
      await this.call({ action: "claim" });
      this.claimed = true;
    } catch (e) {
      const status = (e as { status?: number }).status;
      // someone else finished or took it (another tab): ours is a draft only
      if (status === 409 || status === 404) {
        this.jobId = null;
        return;
      }
    }
    void this.maybeComplete();
  }

  private call(body: Record<string, unknown>) {
    return apiClient.post(`/jobs/${this.jobId}/browser`, { json: body });
  }

  private releaseJob(reason: string) {
    if (!this.jobId || !this.claimed) return Promise.resolve();
    this.claimed = false;
    return this.call({ action: "release", reason }).catch(() => undefined);
  }

  private reportProgress(s: BrowserStatus, force = false) {
    if (!this.jobId || !this.claimed) return;
    const now = Date.now();
    if (!force && now - this.lastReport < 4000) return;
    this.lastReport = now;
    const overall = s.stage === "audio" ? 3 : s.stage === "download" || s.stage === "load" ? 5 + s.progress * 25 : s.stage === "transcribe" ? 30 + s.progress * 65 : 97;
    void this.call({ action: "progress", stage: s.stage, progress: overall }).catch((e: { status?: number }) => {
      if (e?.status === 409) void this.reclaim();
    });
  }

  private async maybeComplete() {
    if (!this.finished || !this.jobId || !this.claimed || this.completing) return;
    this.completing = true;
    this.set({ phase: "saving", status: { stage: "save", progress: 1, device: this.finished.device } });
    try {
      const words = this.finished.noAudio ? [] : fromWhisperCaptions(dropRepeatedRuns(this.raw), { durationMs: this.durationMs });
      const body = { action: "complete", language: this.model.key === "en" ? (this.language ?? "en") : PROJECT_LANGUAGE[this.model.key], model: this.model.label, ...(this.finished!.noAudio ? {} : { durationMs: Math.round(this.durationMs) }), words };
      try {
        await withRetry(() => this.call(body));
      } catch (e) {
        if ((e as { status?: number }).status !== 409 || !(await this.reclaim())) throw e;
        await withRetry(() => this.call(body));
      }
      mark(this.runId, "saved");
      note(this.runId, { device: this.finished.device, words: words.length });
      await deleteProgress(this.videoId);
      this.set({ phase: "saved" });
      // The words are saved: free the speech model and its worker so the editor gets the memory back.
      // Holding the ONNX session next to the video Player is what gets heavy mobile tabs killed; the
      // next run rebuilds the worker and reloads the model from the browser's file cache.
      if (this.worker) { dropWorker(this.worker); this.worker = null; }
      track("captions_ready", { model: this.model.key, words: words.length, device: this.finished.device ?? null });
      report(this.runId);
    } catch (e) {
      this.completing = false;
      this.fail(e);
      return;
    }
    this.settle();
  }

  // ---------- the model run

  async run() {
    const resume = await getProgress(this.videoId);
    let resumeFromMs = 0;
    if (resume && resume.modelKey === modelKeyOf(this.model) && resume.words.length) {
      this.raw = resume.words;
      this.durationMs = resume.durationMs;
      resumeFromMs = resume.audioEndMs;
      this.set({ resumed: true, words: fromWhisperCaptions(dropRepeatedRuns(this.raw), { durationMs: this.durationMs }), audioEndMs: resumeFromMs, durationMs: this.durationMs });
    } else this.raw = [];
    this.set({ phase: "running" });

    const worker = speechWorker();
    this.worker = worker;
    const forceWasm = webgpuMarkedBroken();
    const start = (audio?: Float32Array) =>
      sendToWorker(worker, { type: "run", model: this.model.key, file: audio ? null : this.file, audio, language: this.language, resumeFromMs, forceWasm, safe: this.safe }, audio ? [audio.buffer] : []);
    let seenPartial = false;
    // a worker that goes silent (blocked script, crashed GPU process) must end in a clear error, not an endless spinner
    this.lastHeard = Date.now();
    this.watchdog ??= setInterval(() => {
      // while the tab is hidden the browser may pause the worker on purpose: judge it when they come back (wake)
      if (this.view.phase === "running" && document.visibilityState === "visible" && !this.probe && Date.now() - this.lastHeard > this.quietLimitMs(false)) this.revive("went silent");
    }, 5000);
    worker.onmessage = (e: MessageEvent<Out>) => {
      this.lastHeard = Date.now();
      const m = e.data;
      if (m.type === "status") {
        const status: BrowserStatus = { stage: m.stage, progress: m.progress, device: m.device };
        this.set({ status, ...(m.device ? { device: m.device } : {}) });
        if (m.stage === "load") mark(this.runId, "modelReady");
        if (m.stage === "transcribe" && !this.transcribeStart) this.transcribeStart = Date.now();
        if (m.stage === "audio" && m.progress >= 1) mark(this.runId, "audioReady");
        this.reportProgress(status);
      } else if (m.type === "timing") {
        if (m.phase === "window") this.windowMs.push(m.ms);
        else note(this.runId, { [`${m.phase}Ms`]: m.ms });
      } else if (m.type === "gpu-broken") {
        markWebgpuBroken();
        note(this.runId, { gpuBroken: m.reason });
      } else if (m.type === "partial") {
        if (!seenPartial) { seenPartial = true; mark(this.runId, "firstWindow"); }
        this.raw = [...this.raw, ...m.words];
        // the head-start window arrives before the clip length is known (0)
        if (m.durationMs > 0) this.durationMs = m.durationMs;
        const words = fromWhisperCaptions(dropRepeatedRuns(this.raw), this.durationMs > 0 ? { durationMs: this.durationMs } : {});
        // time left from how fast the clip's audio is being covered (skipped silence only makes this pessimistic)
        const elapsed = Date.now() - this.transcribeStart;
        const eta = this.durationMs > 0 && m.audioEndMs > 0 && elapsed > 0 ? Math.max(0, Math.round(((this.durationMs - m.audioEndMs) * (elapsed / m.audioEndMs)) / 1000)) : null;
        this.windowsThisRun++;
        this.set({ etaSec: eta, words, progress: m.windows > 0 ? m.progress : this.view.progress, windowsDone: this.view.windowsDone + 1, windowsTotal: m.windows || this.view.windowsTotal, durationMs: this.durationMs, audioEndMs: m.audioEndMs, device: m.device });
        void saveProgress({ id: this.videoId, modelKey: modelKeyOf(this.model), audioEndMs: m.audioEndMs, durationMs: this.durationMs, words: this.raw, savedAt: Date.now() });
      } else if (m.type === "done") {
        mark(this.runId, "allWindows");
        this.durationMs = m.durationMs;
        note(this.runId, { device: m.device, windows: m.windowsTotal, windowsSkipped: m.windowsSkipped, avgWindowMs: this.windowMs.length ? Math.round(this.windowMs.reduce((a, b) => a + b, 0) / this.windowMs.length) : 0, maxWindowMs: Math.max(0, ...this.windowMs), resumed: this.view.resumed });
        this.finished = { device: m.device, noAudio: false };
        this.set({ progress: 1, status: { stage: "transcribe", progress: 1, device: m.device } });
        void this.maybeComplete();
      } else if (m.type === "error") {
        if (m.code === "NO_AUDIO") {
          // no sound: finish with an empty document so the editor opens for typed captions
          this.finished = { device: "none", noAudio: true };
          void this.maybeComplete();
        } else if (m.code === "AUDIO_UNSUPPORTED") {
          // the worker's decoder can't read this audio: use the browser's own
          decodeAudio(this.file).then((a) => start(a), (err: unknown) => {
            if ((err as { code?: string }).code === "NO_AUDIO") {
              this.finished = { device: "none", noAudio: true };
              void this.maybeComplete();
            } else this.fail(err);
          });
        } else {
          dropWorker(worker);
          this.worker = null;
          this.fail(new Error(m.message));
        }
      }
    };
    worker.onerror = (e) => {
      dropWorker(worker);
      this.worker = null;
      this.fail(new Error(`${e.message || "The speech model crashed in this browser"} [worker error, ${e.filename ? e.filename.split("/").pop() : "no file"}:${e.lineno ?? 0}, isolated=${typeof crossOriginIsolated === "boolean" && crossOriginIsolated}, ${navigator.hardwareConcurrency} cores]`));
    };
    start();
  }

  private fail(e: unknown, allowGentle = true) {
    const message = e instanceof Error ? e.message : "failed";
    // first failure: quietly try again in gentle mode (one thread, processor only) before showing an error;
    // phones that run out of memory or lose their GPU usually succeed that way
    if (allowGentle && !this.safe && this.view.phase !== "saving") {
      this.safe = true;
      console.warn("[captions] retrying in gentle mode after:", message);
      import("@sentry/nextjs").then((S) => S.captureMessage("captions: gentle-mode retry", { level: "warning", extra: { message } })).catch(() => undefined);
      if (this.watchdog) clearInterval(this.watchdog);
      this.watchdog = null;
      if (this.worker) dropWorker(this.worker);
      this.worker = null;
      this.completing = false;
      this.finished = null;
      this.transcribeStart = 0;
      this.windowsThisRun = 0;
      this.set({ phase: "starting", status: null, etaSec: null });
      void this.run();
      return;
    }
    // terminal failure: release the worker too — the error screen can sit open a while, and a retry
    // starts a fresh worker anyway (see run()).
    if (this.worker) { dropWorker(this.worker); this.worker = null; }
    console.warn("[captions] in-browser transcription failed:", e);
    import("@sentry/nextjs").then((S) => S.captureException(e, { tags: { area: "browser-transcription" } })).catch(() => undefined);
    const m = message.toLowerCase();
    this.set({
      detail: message.slice(0, 200),
      phase: "failed",
      error: /memory|allocat|oom|array buffer/.test(m)
        ? "This device ran out of memory while listening. Close other apps and tabs, then try again, or use a shorter clip."
        : /network|fetch|load failed|failed to fetch/.test(m)
          ? "Setup didn't finish because the connection dropped. Check your internet and try again."
          : "Something interrupted the captions. Try again: it continues from where it stopped, so it's faster now.",
    });
    track("captions_failed", { model: this.model.key });
    void this.releaseJob(message.slice(0, 280));
    this.settle();
  }
}

/** The live view of this project's run (null when there is none). Re-renders on every change. */
export function useSessionView(projectId: string): SessionView | null {
  return useSyncExternalStore(
    subscribeSessions,
    () => sessions.get(projectId)?.view ?? null,
    () => null,
  );
}
