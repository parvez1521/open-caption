"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { canTranscribeInBrowser, isSpeechModelSaved, type BrowserStatus } from "@/features/transcribe/browserWhisper";
import { getSession, startSession, useSessionView, type SessionView } from "@/features/transcribe/session";
import { getLocalVideo } from "@/features/upload/localVideos";
import { studioService, type StudioJob } from "@/services/studio";
import { CaptionProgress } from "@/components/brand/CaptionProgress";
import { LoadingMark } from "@/components/brand/LoadingMark";
import { Button } from "./controls";

interface Props {
  projectId: string;
  job: StudioJob | null;
  canTranscribe: boolean;
  onChanged: () => void;
  onReplaceVideo: () => void;
  videoId?: string | null;
  /** the video is kept on this device (the browser writes its captions) */
  local: boolean;
  language?: string | null;
}

/**
 * The wait between "video is in" and "the first captions appear". The run itself lives in features/transcribe/session.ts
 * (it starts the moment a video is dropped); this screen only shows it, and starts one when the page was reloaded.
 */
export const ProcessingPanel: React.FC<Props> = ({ projectId, job, canTranscribe, onChanged, onReplaceVideo, videoId, local, language }) => {
  const [busy, setBusy] = useState(false);
  const view = useSessionView(projectId);
  const isPhone = useSyncExternalStore(
    () => () => {},
    () => window.matchMedia("(max-width: 767px), (pointer: coarse) and (hover: none)").matches,
    () => false,
  );
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  // page reloaded (or opened in another tab) while a transcribe job is open: pick it up from the saved copy of the video
  const wantsRun = !view && local && !!videoId && job?.kind === "transcribe" && (job.status === "queued" || (job.status === "processing" && (job.stage ?? "").startsWith("browser"))) && canTranscribeInBrowser();
  const [missing, setMissing] = useState(false);
  const picked = useRef<string | null>(null);
  useEffect(() => {
    if (!wantsRun || !videoId || !job || picked.current === job.id) return;
    picked.current = job.id;
    let alive = true;
    void getLocalVideo(videoId).then((blob) => {
      if (!alive) return;
      if (!blob) return setMissing(true);
      void startSession({ projectId, videoId, file: blob, language: language ?? null }).attachJob(job.id);
    });
    return () => { alive = false; };
  }, [wantsRun, videoId, job, projectId, language]);

  if (view && (view.phase === "starting" || view.phase === "running" || view.phase === "saving")) {
    return <WritingCaptions view={view} isPhone={isPhone} onStop={() => getSession(projectId)?.stop()} />;
  }

  if (view?.phase === "failed") {
    return (
      <Center>
        <div className="mb-2 text-3xl">🎙️</div>
        <h2 className="text-lg font-semibold">Couldn&apos;t finish the captions</h2>
        <p className="mt-2 rounded-lg border border-st-or/60 bg-st-or/15 px-3 py-2 text-sm text-st-text">{view.error}</p>
        {view.detail ? <p className="mt-2 break-words text-[11px] text-st-faint">{view.detail}</p> : null}
        <div className="mt-5 flex justify-center gap-2">
          <Button tone="primary" onClick={() => getSession(projectId)?.retry()}>Try again</Button>
          <Button onClick={onReplaceVideo}>Upload a different video</Button>
        </div>
      </Center>
    );
  }

  if (view?.phase === "stopped") {
    return (
      <Center>
        <div className="mb-2 text-3xl">⏸️</div>
        <h2 className="text-lg font-semibold">Captions stopped</h2>
        <p className="mt-2 text-sm text-st-muted">Nothing is lost: pick up where it left off whenever you like.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button tone="primary" onClick={() => getSession(projectId)?.retry()}>Continue</Button>
          <Button onClick={onReplaceVideo}>Upload a different video</Button>
        </div>
      </Center>
    );
  }

  if (missing) {
    return (
      <Center>
        <h2 className="text-lg font-semibold">We can&apos;t find the video on this device</h2>
        <p className="mt-2 text-sm text-st-muted">Choose the same video again and the captions will continue.</p>
        <div className="mt-5 flex justify-center"><Button tone="primary" onClick={onReplaceVideo}>Choose the video</Button></div>
      </Center>
    );
  }

  if (job?.status === "failed") {
    return (
      <Center>
        <div className="mb-2 text-3xl">⚠️</div>
        <h2 className="text-lg font-semibold">We couldn&apos;t finish this one</h2>
        <p className="mt-2 rounded-lg border border-st-or/60 bg-st-or/15 px-3 py-2 text-sm text-st-text">{friendlyError(job)}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button tone="primary" disabled={busy} onClick={() => act(() => studioService.retryJob(job.id))}>Try again</Button>
          <Button onClick={onReplaceVideo}>Upload a different video</Button>
        </div>
      </Center>
    );
  }

  if (job) {
    const pct = Math.max(2, Math.min(100, job.progress ?? 0));
    return (
      <Center>
        <div className="mb-4 flex justify-center" aria-hidden>
          <LoadingMark height={48} />
        </div>
        <h2 className="text-lg font-semibold">{job.status === "queued" ? "Starting…" : "Working…"}</h2>
        <p className="mt-1 text-sm text-st-muted">{job.kind === "transcribe" ? "Listening to your video and writing the captions." : "This can take a moment."}</p>
        <CaptionProgress className="mt-5" percent={pct} caption={`${Math.round(job.progress ?? 0)}%`} />
        <Button className="mt-4" disabled={busy} onClick={() => act(() => studioService.cancelJob(job.id))}>Cancel</Button>
      </Center>
    );
  }

  if (canTranscribe) {
    return (
      <Center>
        <div className="mb-2 text-3xl">🎙️</div>
        <h2 className="text-lg font-semibold">Your video is ready for captions</h2>
        <p className="mt-2 text-sm text-st-muted">This project doesn&apos;t have captions yet. They&apos;re made right here in your browser, privately.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button tone="primary" disabled={busy} onClick={() => act(() => studioService.transcribe(projectId))}>Generate captions</Button>
          <Button onClick={onReplaceVideo}>Upload a different video</Button>
        </div>
      </Center>
    );
  }

  return (
    <Center>
      <h2 className="text-lg font-semibold">Your video is in</h2>
      <p className="mt-2 text-sm text-st-muted">Captions will appear here as soon as they are ready.</p>
    </Center>
  );
};

/** Job errors in plain words, with what to do next. Raw provider messages never reach the screen. */
function friendlyError(job: StudioJob): string {
  const raw = `${job.error_code ?? ""} ${job.error_message ?? ""}`.toLowerCase();
  if (raw.includes("no_audio") || raw.includes("no audio")) return "This video has no sound, so there is nothing to caption. Upload a video with speech, or add captions yourself.";
  if (raw.includes("lease_expired")) return "The tab making your captions was closed or went to sleep. Press Try again and keep this tab open.";
  if (raw.includes("too large") || raw.includes("file_too_large") || raw.includes("413")) return "This video is too big to process. Trim it to a shorter clip and upload again.";
  if (raw.includes("decode") || raw.includes("unsupported")) return "We couldn't read the audio in this video. Try exporting it again as MP4 from your phone or editor.";
  if (raw.includes("out_of_memory") || raw.includes("out of memory")) return "Your device ran out of memory while rendering. Pick a lower resolution (1080p or 720p) in the export options and try again.";
  if (job.kind === "render") return "The export stopped before it finished. Press Try again.";
  return "Something interrupted the captions. Press Try again; it usually works the second time.";
}

const STAGE_TEXT: Record<BrowserStatus["stage"], string> = {
  audio: "Listening to your video…",
  download: "Downloading the speech model (about 90 MB, first time only)…",
  load: "Getting everything ready…",
  transcribe: "Writing your captions…",
  save: "Putting the finishing touches…",
};

/** Share of the whole wait that each stage owns, so the bar moves smoothly from drop to done. */
export const overall = (s: BrowserStatus | null, view?: Pick<SessionView, "progress">) =>
  !s ? 2 : s.stage === "audio" ? 3 + s.progress * 7 : s.stage === "download" ? 10 + s.progress * 20 : s.stage === "load" ? 30 : s.stage === "transcribe" ? 32 + (view?.progress ?? s.progress) * 66 : 99;

const VERBS = [
  "Synthesizing", "Listening closely", "Tuning in", "Catching every word", "Untangling syllables",
  "Polishing punchlines", "Lining up words", "Finding the beat", "Counting syllables", "Sharpening timing",
  "Warming up the mic", "Sprinkling style", "Herding words",
  "Pondering", "Choreographing", "Brewing", "Calibrating", "Kerning", "Riffing", "Composing", "Harmonizing",
  "Stitching sentences", "Spotting the hook", "Marinating", "Percolating", "Crafting", "Orchestrating",
  "Noodling", "Smoothing edges", "Measuring pauses", "Finessing", "Wrangling commas",
  "Conjuring", "Assembling", "Fine-tuning", "Making it pop",
];

export function etaText(sec: number) {
  if (sec < 8) return "Just a few seconds left";
  if (sec < 60) return `About ${Math.max(10, Math.round(sec / 5) * 5)} seconds left`;
  const m = Math.round(sec / 60);
  return `About ${m} minute${m === 1 ? "" : "s"} left`;
}

/** The loading mark: the "something is happening" animation. */
const Mark = () => (
  <div className="mb-4 flex justify-center" aria-hidden>
    <LoadingMark height={48} />
  </div>
);

/** Captions being made in this tab, before the first window is ready. Nothing is installed and the audio never leaves the device. */
const WritingCaptions: React.FC<{ view: SessionView; isPhone: boolean; onStop: () => void }> = ({ view, isPhone, onStop }) => {
  const status = view.status;
  const [saved, setSaved] = useState<boolean | null>(null);
  useEffect(() => { void isSpeechModelSaved(view.model).then(setSaved); }, [view.model]);
  const [now, setNow] = useState(() => Date.now());
  const [verb, setVerb] = useState(() => Math.floor(Math.random() * VERBS.length));
  const [display, setDisplay] = useState(2);
  const loadSince = useRef<number | null>(null);

  // 2 Hz tick: rotate the verb and keep the bar creeping while the model compiles
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n % 2500 < 500) setVerb((v) => v + 1);
      setDisplay((d) => {
        let target = overall(status, view);
        if (status?.stage === "load") {
          loadSince.current ??= n;
          target = 30 + 2 * (1 - Math.exp(-(n - loadSince.current) / 20000));
        } else loadSince.current = null;
        return Math.max(d, d + (target - d) * 0.3); // never goes backwards
      });
    }, 500);
    return () => clearInterval(t);
  }, [status, view]);

  const firstTime = saved === false || status?.stage === "download";
  const elapsed = (now - view.startedAt) / 1000;
  const shown = Math.max(2, Math.round(display));
  const eta = view.etaSec ?? (shown > 12 && elapsed > 6 ? (elapsed * (100 - shown)) / shown : null);
  const title = !status ? (firstTime ? "Downloading the speech model (about 90 MB, first time only)…" : "Warming up…") : status.stage === "load" && firstTime ? "Loading the speech model…" : STAGE_TEXT[status.stage];
  return (
    <Center>
      <Mark />
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm font-medium text-st-text/70" aria-live="polite">{VERBS[verb % VERBS.length]}…</p>
      <CaptionProgress
        className="mt-5"
        percent={shown}
        caption={
          <>
            {shown}% · {eta != null ? etaText(eta) : firstTime ? "First time takes about a minute or two" : "Just a moment"}
          </>
        }
      />
      {view.resumed ? <p className="mt-2 text-xs text-st-muted">Continuing from where it stopped.</p> : null}
      {firstTime ? (
        <p className="mt-3 text-sm text-st-muted">This first run downloads the speech model, so it takes a little longer. Don&apos;t close this tab{isPhone ? " or lock your screen" : ""}. Next time it&apos;s instant.</p>
      ) : (
        <p className="mt-3 text-xs text-st-faint">{isPhone ? "Keep this tab open and your screen on." : "Keep this tab open."}</p>
      )}
      <Button className="mt-4" onClick={onStop}>Stop</Button>
    </Center>
  );
};

const Center: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex h-full items-center justify-center p-6">
    <div className="w-full max-w-md text-center">{children}</div>
  </div>
);
