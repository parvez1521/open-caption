"use client";

import * as Sentry from "@sentry/nextjs";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { preloadSpeechModel } from "@/features/transcribe/browserWhisper";
import { getSession, startSession } from "@/features/transcribe/session";
import { MODELS, PROJECT_LANGUAGE, SHIPPED_LANGUAGES, isConstrainedDevice, likelySpeechLanguage, saveSpeechLanguage, savedSpeechLanguage, speechLanguageOf, type SpeechLanguage } from "@/features/transcribe/runtime";
import { studioService } from "@/services/studio";
import { track } from "@/lib/track";
import { ApiError } from "@/services/api-client";
import { PrepareError, prepareVideo, type PrepareStage, type PreparedVideo } from "@/features/upload/prepareVideo";
import { START_DOORS, type ProjectStartMode } from "./projectMode";
import { transcribePreflightWarning } from "./preflight";
import { uploadLimitLabel } from "@/lib/billing/pricingDisplay";
import { BadgeCheck, Check, Film, ShieldCheck, Upload } from "@/components/ui/icons";
import { Button } from "./controls";

interface Props {
  projectId: string;
  onUploaded: () => void;
  note?: string;
  limits?: { maxBytes: number; maxDurationSec: number };
  language?: string | null;
  /** Package 2 item G — which door this project started through. "editor" (Normal Editor):
   *  the upload opens the Studio directly, no transcription, no language question. */
  mode?: ProjectStartMode;
  onModeChange?: (m: ProjectStartMode) => void;
}

const DEFAULT_LIMITS = { maxBytes: 2 * 1024 * 1024 * 1024, maxDurationSec: 5 * 60 };

/** Drag & drop / pick a video: checked and saved on this device — the file itself is never uploaded, only its name, size, length and format are registered with the project — then captions start, or, through the Normal Editor door, the editor opens directly with no transcription. */
export const UploadPanel: React.FC<Props> = ({ projectId, onUploaded, note, limits = DEFAULT_LIMITS, language = null, mode = "captions", onModeChange }) => {
  const editorMode = mode === "editor";
  // get the speech model ready while they pick a video, so captions start the moment it's in.
  // Desktop loads it into memory; phones only download the files (their memory is for the video).
  // Which model writes the captions depends on what's spoken: asked here, remembered for next time.
  // (Normal Editor door: no model, no language question — captions can be generated later.)
  const [constrained] = useState(() => isConstrainedDevice());
  const [lang, setLang] = useState<SpeechLanguage | null>(() => {
    const fromProject = speechLanguageOf(language);
    return fromProject !== "en" ? fromProject : savedSpeechLanguage();
  });
  const [pending, setPending] = useState<File | null>(null);
  useEffect(() => {
    if (editorMode) return;
    preloadSpeechModel(!window.matchMedia("(max-width: 767px), (pointer: coarse) and (hover: none)").matches, lang ?? likelySpeechLanguage());
  }, [lang, editorMode]);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** pre-flight hold: a long clip on a constrained device waits here for the user's call — nothing is uploaded or transcribed until they choose */
  const [warn, setWarn] = useState<{ ready: PreparedVideo; spoken: SpeechLanguage | null; message: string } | null>(null);
  const [over, setOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [prep, setPrep] = useState<PrepareStage | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = progress !== null || prep !== null;

  /** save the prepared video and start captions (or open the editor directly, Normal Editor door) */
  const runPrepared = useCallback(
    async (ready: PreparedVideo, spoken: SpeechLanguage | null) => {
      const projectLanguage = spoken ? PROJECT_LANGUAGE[spoken] : null;
      setProgress(0);
      // captions start as soon as the video has an id (in parallel with saving it), not after the server round trips
      const done = await studioService.uploadVideo(projectId, ready, setProgress, (abort) => (abortRef.current = abort), (videoId) => {
        if (editorMode || !ready.hasAudio) return;
        track("video_added", { language: projectLanguage ?? "en", durationS: Math.round(ready.durationMs / 1000) });
        startSession({ projectId, videoId, file: ready.file, language: projectLanguage, info: { codec: ready.videoCodec, converted: ready.converted, previewMode: ready.previewMode, durationS: Math.round(ready.durationMs / 1000) } });
      }, editorMode ? { editorMode: true } : undefined);
      if (done.jobId) void getSession(projectId)?.attachJob(done.jobId);
      setProgress(100);
      onUploaded();
    },
    [projectId, onUploaded, editorMode],
  );

  const start = useCallback(
    async (file: File, spoken: SpeechLanguage | null) => {
      setError(null);
      setPending(null);
      setWarn(null);
      const projectLanguage = spoken ? PROJECT_LANGUAGE[spoken] : null;
      // saved on the project so a reload (or the next run) uses the same model
      if (spoken) void studioService.savePatch(projectId, { language: projectLanguage }).catch(() => undefined);
      setFileName(file.name);
      const ctrl = new AbortController();
      abortRef.current = () => ctrl.abort();
      try {
        // check (and if needed shrink / convert) on this device first: bad files never get uploaded
        const ready = await prepareVideo(file, limits, setPrep, ctrl.signal);
        setPrep(null);
        // pre-flight (Phase 2B): a long clip on a constrained device warns BEFORE
        // anything is uploaded or transcribed — the user picks "Start anyway" or cancels
        if (!editorMode && ready.hasAudio) {
          const message = transcribePreflightWarning(ready.durationMs);
          if (message) { setWarn({ ready, spoken, message }); return; }
        }
        await runPrepared(ready, spoken);
      } catch (e) {
        setPrep(null);
        setProgress(null);
        if (e instanceof DOMException && e.name === "AbortError") return;
        // a refused file (too long, unreadable) is the user's file, not our bug: only report the unexpected
        if (!(e instanceof PrepareError) || e.code === "CANT_CONVERT") Sentry.captureException(e, { tags: { area: "upload" } });
        setError(e instanceof PrepareError || e instanceof ApiError || e instanceof Error ? e.message : "Upload failed. Please try again.");
      }
    },
    [projectId, onUploaded, limits, runPrepared, editorMode],
  );
  /** a video picked before the language was: ask first, then start (the editor door never asks) */
  const pick = (f: File) => (editorMode ? void start(f, null) : lang ? void start(f, lang) : setPending(f));
  const choose = (l: SpeechLanguage) => {
    setLang(l);
    saveSpeechLanguage(l);
    if (pending) void start(pending, l);
  };

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div
        onDragOver={(e) => { e.preventDefault(); if (!busy) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !busy) pick(f);
        }}
        className={`w-full max-w-xl rounded-2xl border-2 border-dashed p-10 text-center transition ${over ? "border-st-ink bg-st-lav/40" : "border-st-hover bg-st-panel"}`}
      >
        {onModeChange && !busy && !prep ? (
          <div className="mx-auto mb-5 grid max-w-md grid-cols-3 gap-1 rounded-xl border border-st-line bg-st-raised/60 p-1" role="radiogroup" aria-label="How this project starts">
            {START_DOORS.map((o) => (
              <button
                key={o.mode}
                role="radio"
                aria-checked={mode === o.mode}
                onClick={() => onModeChange(o.mode)}
                className={`rounded-lg px-3 py-2 text-left transition ${mode === o.mode ? "bg-st-panel shadow-sm" : "opacity-70 hover:opacity-100"}`}
              >
                <span className="block text-sm font-semibold text-st-text">{o.label}</span>
                <span className="block text-[11px] leading-tight text-st-muted">{o.sub}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className={`mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-st-line bg-st-lav/60 text-obsidian transition-transform ${over ? "scale-110" : ""}`} aria-hidden>
          <Upload className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold">
          {prep?.stage === "check" ? "Checking your video…" : prep?.stage === "convert" ? "Preparing your video…" : busy ? "Saving your video…" : "Drop your video here"}
        </h2>
        <p className="mt-1 text-sm text-st-muted">
          {prep?.stage === "convert"
            ? "Converting it so it plays in every browser. This happens on your device."
            : note ?? (busy ? "" : "or choose one from your device")}
        </p>
        {constrained && !busy && !prep ? (
          <p className="mx-auto mt-3 max-w-md rounded-xl border border-st-line bg-st-lav/40 px-3 py-2 text-xs leading-relaxed text-st-muted">
            On a phone, shorter clips work best — a couple of minutes at a time is kindest to your phone&rsquo;s memory.
            Your captions save as they are written, so if this tab ever closes you can pick the project up again where you left off.
          </p>
        ) : null}

        {prep ? (
          <div className="mx-auto mt-6 max-w-sm">
            <div className="mb-1 flex justify-between text-xs text-st-muted">
              <span className="truncate pr-3">{fileName}</span>
              <span className="tabular-nums">{prep.stage === "convert" ? `${Math.round(prep.progress * 100)}%` : ""}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-st-raised">
              <div className="h-full rounded-full bg-st-lav transition-all" style={{ width: prep.stage === "convert" ? `${Math.max(3, prep.progress * 100)}%` : "8%" }} />
            </div>
            <p className="mt-2 text-xs text-st-faint">Keep this tab open.</p>
            <Button className="mt-4" onClick={() => abortRef.current?.()}>Cancel</Button>
          </div>
        ) : busy ? (
          <div className="mx-auto mt-6 max-w-sm">
            <div className="mb-1 flex justify-between text-xs text-st-muted">
              <span className="truncate pr-3">{fileName}</span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-st-raised">
              <div className="h-full rounded-full bg-st-em transition-all" style={{ width: `${progress}%` }} />
            </div>
            <Button className="mt-4" onClick={() => abortRef.current?.()}>Cancel</Button>
          </div>
        ) : warn ? (
          <div role="alert" className="mx-auto mt-5 max-w-md rounded-xl border border-st-or/60 bg-st-or/15 px-3 py-3 text-left">
            <p className="text-sm text-st-text">{warn.message}</p>
            <div className="mt-3 flex gap-2">
              <Button tone="primary" onClick={() => { const w = warn; setWarn(null); void runPrepared(w.ready, w.spoken); }}>Start anyway</Button>
              <Button onClick={() => setWarn(null)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <>
            {editorMode ? null : <LanguageChoice value={lang} onChange={choose} asking={!!pending} />}
            {pending ? (
              <p className="mt-3 text-xs text-st-muted">Pick the language and <span className="font-medium text-st-text">{pending.name}</span> starts right away.</p>
            ) : (
              <Button tone="primary" className="mt-5 inline-flex items-center gap-2 !px-5 !py-2.5" onClick={() => inputRef.current?.click()}>
                <Upload className="h-4 w-4" aria-hidden /> Choose a video
              </Button>
            )}
            <ul className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-st-muted">
              <li className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Video file stays on your device</li>
              <li className="flex items-center gap-1.5"><BadgeCheck className="h-3.5 w-3.5" aria-hidden /> No watermark</li>
              <li className="flex items-center gap-1.5"><Film className="h-3.5 w-3.5" aria-hidden /> MP4, MOV or WebM · up to {Math.round(limits.maxDurationSec / 60)} min · {uploadLimitLabel(limits.maxBytes)} max on this device</li>
            </ul>
            <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} />
          </>
        )}
        {error ? <p role="alert" className="mt-4 rounded-lg border border-st-or/60 bg-st-or/15 px-3 py-2 text-sm text-st-text">{error}</p> : null}
      </div>
    </div>
  );
};

/**
 * "What's spoken in the video?" The choices come straight from the transcription model map (SHIPPED_LANGUAGES in
 * features/transcribe/runtime): a language is offered only when it is wired end to end, and each choice shows that
 * model's honest one-time download size from the same map.
 */
const LanguageChoice: React.FC<{ value: SpeechLanguage | null; onChange: (l: SpeechLanguage) => void; asking: boolean }> = ({ value, onChange, asking }) => (
  <div className={`mx-auto mt-6 max-w-md rounded-xl p-2 text-left ${asking ? "bg-st-lav/50 ring-2 ring-st-ink" : ""}`} role="radiogroup" aria-label="Language spoken in the video">
    <p className="mb-2 px-1 text-sm font-medium text-st-text">Language spoken in the video</p>
    <div className="grid grid-cols-2 gap-2">
      {SHIPPED_LANGUAGES.map((m) => (
        <button
          key={m.key}
          role="radio"
          aria-checked={value === m.key}
          onClick={() => onChange(m.key)}
          className={`flex min-h-14 items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${value === m.key ? "border-st-ink bg-st-lav text-obsidian" : "border-st-line bg-st-panel hover:bg-st-lav/30"}`}
        >
          <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${value === m.key ? "border-st-ink bg-st-ink text-st-panel" : "border-st-hover"}`} aria-hidden>
            {value === m.key ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{m.choiceLabel}</span>
            <span className="block text-[11px] leading-tight text-st-muted">{m.choiceHint}</span>
            <span className="block text-[11px] leading-tight text-st-muted">Speech model ~{m.approxDownloadMb} MB, one download — captions are made on your device</span>
          </span>
        </button>
      ))}
    </div>
    {value === "hinglish" ? <p className="mt-2 px-1 text-[11px] text-st-muted">Captions are written in English letters, like &ldquo;yeh trick kamaal hai&rdquo;.</p> : null}
    {value === "hindi" ? <p className="mt-2 px-1 text-[11px] text-st-muted">Captions are written in Devanagari script, like &ldquo;यह ट्रिक कमाल है&rdquo;. Uses the same model download as English{MODELS.hindi.id === MODELS.en.id ? " — if English captions were used before, there is nothing new to download" : ""}.</p> : null}
    {value && value !== "en" && value !== "hinglish" && value !== "hindi" && MODELS[value].id === MODELS.en.id ? <p className="mt-2 px-1 text-[11px] text-st-muted">Uses the same model download as English — if English captions were used before, there is nothing new to download.</p> : null}
  </div>
);
