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
import { fetchMediaLink } from "@/features/upload/fetchMediaLink";
import { formatClockMs, needsFootageSwapDriftWarning } from "./footageSwap";
import { START_DOORS, type ProjectStartMode } from "./projectMode";
import { transcribePreflightWarning } from "./preflight";
import { uploadLimitLabel } from "@/lib/billing/pricingDisplay";
import { BadgeCheck, Check, Film, ShieldCheck, Upload } from "@/components/ui/icons";
import { Button } from "./controls";

interface Props {
  projectId: string;
  /** called with the new video's id once its local save lands — the studio uses it to sync that video */
  onUploaded: (videoId: string) => void;
  note?: string;
  limits?: { maxBytes: number; maxDurationSec: number };
  language?: string | null;
  /** Package 2 item G — which door this project started through. "editor" (Normal Editor):
   *  the upload opens the Studio directly, no transcription, no language question. */
  mode?: ProjectStartMode;
  onModeChange?: (m: ProjectStartMode) => void;
  /** Replace mode: the panel offers "keep my captions" vs "start fresh". Absent for a first upload. */
  videoId?: string | null;
  replaceMode?: "keep" | "fresh";
  onReplaceModeChange?: (m: "keep" | "fresh") => void;
  /** the current video's length, for the drift warning when the new cut is a different length */
  previousDurationMs?: number | null;
  /** keep is only possible for a video stored on this device (a server upload keeps its old bytes elsewhere) */
  keepAllowed?: boolean;
  /** Keep path: swap the bytes + video row for the prepared file, captions untouched. */
  onKeepFootage?: (ready: PreparedVideo) => Promise<void>;
  /**
   * PER-05-A: re-attaching the missing video of a project that already has
   * captions (video gone on this device, same file picked again). The upload
   * registers a new video id but starts NO transcription and resets nothing —
   * the copied captions stay, exactly like the keep path.
   */
  reattachOnly?: boolean;
}

const DEFAULT_LIMITS = { maxBytes: 2 * 1024 * 1024 * 1024, maxDurationSec: 5 * 60 };

/** Drag & drop / pick a video: checked and saved on this device — the file itself is never uploaded, only its name, size, length and format are registered with the project — then captions start, or, through the Normal Editor door, the editor opens directly with no transcription. */
export const UploadPanel: React.FC<Props> = ({ projectId, onUploaded, note, limits = DEFAULT_LIMITS, language = null, mode = "captions", onModeChange, videoId = null, replaceMode, onReplaceModeChange, previousDurationMs = null, keepAllowed = true, onKeepFootage, reattachOnly = false }) => {
  const editorMode = mode === "editor";
  // PER-05-A: a re-attach is an editor-door upload (no transcription, no reset) even
  // though the project came through the captions door — the captions already exist.
  const noTranscribe = editorMode || reattachOnly;
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
  /** paste-a-link: the URL being fetched, and its own error (kept apart from upload errors) */
  const [linkUrl, setLinkUrl] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  /** pre-flight hold: a long clip on a constrained device waits here for the user's call — nothing is uploaded or transcribed until they choose */
  const [warn, setWarn] = useState<{ ready: PreparedVideo; spoken: SpeechLanguage | null; message: string } | null>(null);
  /** duration drift: the new cut is a different length, so caption timing may drift — the user confirms the keep */
  const [drift, setDrift] = useState<{ ready: PreparedVideo; spoken: SpeechLanguage | null } | null>(null);
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
        if (noTranscribe || !ready.hasAudio) return;
        track("video_added", { language: projectLanguage ?? "en", durationS: Math.round(ready.durationMs / 1000) });
        startSession({ projectId, videoId, file: ready.file, language: projectLanguage, info: { codec: ready.videoCodec, converted: ready.converted, previewMode: ready.previewMode, durationS: Math.round(ready.durationMs / 1000) } });
      }, noTranscribe ? { editorMode: true } : undefined);
      if (done.jobId) void getSession(projectId)?.attachJob(done.jobId);
      setProgress(100);
      onUploaded(done.videoId);
    },
    [projectId, onUploaded, noTranscribe],
  );

  /** Keep path: swap the footage under the same video id, captions untouched. */
  const runKeep = useCallback(
    async (ready: PreparedVideo) => {
      if (!onKeepFootage || !videoId) return;
      setProgress(0);
      await onKeepFootage(ready);
      setProgress(100);
      onUploaded(videoId);
    },
    [onKeepFootage, videoId, onUploaded],
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
        // keep path: no transcription, so no pre-flight and no language question — but a
        // different-length cut warns first, because caption timing may drift
        if (replaceMode === "keep") {
          if (needsFootageSwapDriftWarning(previousDurationMs, ready.durationMs)) {
            setDrift({ ready, spoken });
            return;
          }
          await runKeep(ready);
          return;
        }
        // pre-flight (Phase 2B): a long clip on a constrained device warns BEFORE
        // anything is uploaded or transcribed — the user picks "Start anyway" or cancels
        if (!noTranscribe && ready.hasAudio) {
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
    [projectId, onUploaded, limits, runPrepared, runKeep, editorMode, replaceMode, previousDurationMs],
  );
  /** a video picked before the language was: ask first, then start (the editor door never asks; the keep path needs no language — nothing is transcribed) */
  const pick = (f: File) => (noTranscribe || replaceMode === "keep" ? void start(f, null) : lang ? void start(f, lang) : setPending(f));
  /** paste a link: fetch the file in this browser, then take the exact path a picked file takes */
  const submitLink = useCallback(async () => {
    const raw = linkUrl.trim();
    if (!raw || linkBusy) return;
    setLinkError(null);
    setLinkBusy(true);
    const ctrl = new AbortController();
    abortRef.current = () => ctrl.abort();
    try {
      const file = await fetchMediaLink(raw, limits, ctrl.signal);
      setLinkUrl("");
      pick(file);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setLinkError(e instanceof Error ? e.message : "Couldn't fetch this link. Try again.");
    } finally {
      setLinkBusy(false);
    }
  }, [linkUrl, linkBusy, limits, pick]);
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
          if (f && !busy && !linkBusy) pick(f);
        }}
        className={`w-full max-w-xl rounded-2xl border-2 border-dashed p-10 text-center transition ${over ? "border-st-ink bg-st-lav/40" : "border-st-hover bg-st-panel"}`}
      >
        {onModeChange && !busy && !prep && !linkBusy ? (
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
        {replaceMode !== undefined && !busy && !prep ? (
          <div className="mx-auto mb-5 max-w-md rounded-xl border border-st-line bg-st-raised/60 p-2 text-left" role="radiogroup" aria-label="What happens to your captions">
            <button
              role="radio"
              aria-checked={replaceMode === "keep"}
              disabled={!keepAllowed}
              onClick={() => onReplaceModeChange?.("keep")}
              className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition ${replaceMode === "keep" ? "bg-st-panel shadow-sm" : "opacity-70 hover:opacity-100"} ${keepAllowed ? "" : "cursor-not-allowed opacity-40"}`}
            >
              <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${replaceMode === "keep" ? "border-st-ink bg-st-ink text-st-panel" : "border-st-hover"}`} aria-hidden>
                {replaceMode === "keep" ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-st-text">Keep my captions</span>
                <span className="block text-[11px] leading-tight text-st-muted">Captions stay on the same timeline. No re-transcribe.</span>
              </span>
            </button>
            <button
              role="radio"
              aria-checked={replaceMode === "fresh"}
              onClick={() => onReplaceModeChange?.("fresh")}
              className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition ${replaceMode === "fresh" ? "bg-st-panel shadow-sm" : "opacity-70 hover:opacity-100"}`}
            >
              <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${replaceMode === "fresh" ? "border-st-ink bg-st-ink text-st-panel" : "border-st-hover"}`} aria-hidden>
                {replaceMode === "fresh" ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-st-text">Start fresh with new captions</span>
                <span className="block text-[11px] leading-tight text-st-muted">The old captions are deleted and new ones are generated.</span>
              </span>
            </button>
            {!keepAllowed ? (
              <p className="px-3 pb-1 pt-1 text-[11px] leading-relaxed text-st-muted">This video was uploaded to our servers — captions can only be kept for videos stored on this device.</p>
            ) : null}
          </div>
        ) : null}
        <div className={`mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-st-line bg-st-lav/60 text-obsidian transition-transform ${over ? "scale-110" : ""}`} aria-hidden>
          <Upload className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold">
          {linkBusy ? "Fetching your video…" : prep?.stage === "check" ? "Checking your video…" : prep?.stage === "convert" ? "Preparing your video…" : busy ? "Saving your video…" : "Drop your video here"}
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
        ) : drift ? (
          <div role="alert" className="mx-auto mt-5 max-w-md rounded-xl border border-st-or/60 bg-st-or/15 px-3 py-3 text-left">
            <p className="text-sm text-st-text">
              The new video is {formatClockMs(drift.ready.durationMs)} — the old one was {formatClockMs(previousDurationMs ?? 0)}. The lengths don&apos;t match, so your caption timing may drift.
            </p>
            <p className="mt-1 text-xs text-st-muted">Colour grading and small tweaks keep the audio identical, so timings usually hold. A re-cut or trimmed version can shift them.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button tone="primary" onClick={() => { const d = drift; setDrift(null); void runKeep(d.ready); }}>Keep captions anyway</Button>
              <Button onClick={() => { const d = drift; setDrift(null); onReplaceModeChange?.("fresh"); void runPrepared(d.ready, d.spoken); }}>Regenerate captions instead</Button>
              <Button onClick={() => setDrift(null)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <>
            {editorMode || replaceMode === "keep" ? null : <LanguageChoice value={lang} onChange={choose} asking={!!pending} />}
            {pending ? (
              <p className="mt-3 text-xs text-st-muted">Pick the language and <span className="font-medium text-st-text">{pending.name}</span> starts right away.</p>
            ) : (
              <Button tone="primary" className="mt-5 inline-flex items-center gap-2 !px-5 !py-2.5" disabled={linkBusy} onClick={() => inputRef.current?.click()}>
                <Upload className="h-4 w-4" aria-hidden /> Choose a video
              </Button>
            )}
            <div className="mx-auto mt-6 max-w-md text-left">
              <label htmlFor="upload-link" className="block text-sm font-medium text-st-text">Or paste a direct video link</label>
              <div className="mt-2 flex gap-2">
                <input
                  id="upload-link"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  value={linkUrl}
                  disabled={busy || linkBusy}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submitLink(); } }}
                  placeholder="https://…/video.mp4"
                  className="min-w-0 flex-1 rounded-xl border border-st-line bg-st-panel px-3 py-2.5 text-sm text-st-text placeholder:text-st-faint disabled:opacity-50"
                />
                <Button tone="primary" disabled={busy || linkBusy || !linkUrl.trim()} onClick={() => void submitLink()}>
                  {linkBusy ? "Fetching…" : "Add from link"}
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-st-muted">Direct MP4 or WebM links only. YouTube links don&apos;t work.</p>
              {linkError ? <p role="alert" className="mt-2 rounded-lg border border-st-or/60 bg-st-or/15 px-3 py-2 text-sm text-st-text">{linkError}</p> : null}
              {linkBusy ? (
                <button type="button" onClick={() => abortRef.current?.()} className="mt-2 text-[13px] font-semibold text-st-muted underline underline-offset-4">
                  Cancel fetch
                </button>
              ) : null}
            </div>
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
 * features/transcribe/runtime): a language is offered only when it is wired end to end, and each card shows
 * only the language name.
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
          </span>
        </button>
      ))}
    </div>
    {value === "hinglish" ? <p className="mt-2 px-1 text-[11px] text-st-muted">Captions are written in English letters, like &ldquo;yeh trick kamaal hai&rdquo;.</p> : null}
    {value === "hindi" ? <p className="mt-2 px-1 text-[11px] text-st-muted">Captions are written in Devanagari script, like &ldquo;यह ट्रिक कमाल है&rdquo;. Uses the same model download as English{MODELS.hindi.id === MODELS.en.id ? " — if English captions were used before, there is nothing new to download" : ""}.</p> : null}
    {value && value !== "en" && value !== "hinglish" && value !== "hindi" && MODELS[value].id === MODELS.en.id ? <p className="mt-2 px-1 text-[11px] text-st-muted">Uses the same model download as English — if English captions were used before, there is nothing new to download.</p> : null}
  </div>
);
