"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Film, Image as ImageIcon } from "@/components/ui/icons";
import { getPuter, puterErrorMessage } from "../../ai-generator/puter";
import { usePuterSdk } from "../../ai-generator/usePuterSdk";
import { Button, Section } from "../controls";
import { listProjectAssets } from "../mediaStore";
import type { ImportError } from "../useMediaAssets";
import { aiEditStyleById, DEFAULT_AI_EDIT_STYLE_ID } from "../aiEditStyles";
import {
  planImageDurationMs,
  requestAiEditPlan,
  segmentsOfTranscript,
  type AiEditPlanItem,
  type AiEditPlanRequest,
  type TranscriptWord,
} from "../aiEditPlanner";
import {
  AI_VIDEO_SECONDS,
  AI_VIDEO_SIZE,
  aiGenerateFile,
  aiVideoInsertDurationMs,
  findImportedAsset,
  formatAtMs,
  validateAiGeneratePrompt,
  type AiGenerateMode,
} from "../aiGenerate";
import { AiEditStyleChooser } from "./AiEditStyleChooser";

/**
 * AI Edit — its own flow, never mixed with caption projects. The panel runs
 * inside the Studio timeline of a BLANK AI-Edit project (see
 * `features/studio/aiEditFlow.ts`): no transcribe/caption pipeline is
 * attached to the project, and nothing here lists caption projects.
 *
 * The owner's flow is two choices, then everything runs itself:
 *   1. Upload your video — works on a blank project too, no sign-in needed.
 *   2. Pick a look — then press "Create visuals" once.
 * From there the panel runs the whole chain on its own: it listens to the
 * video in this tab (planning-only transcription, nothing saved as
 * captions), the free plan turns the transcript into per-segment prompts,
 * each visual generates with the visitor's OWN free Puter account
 * (User-Pays, never the owner's cost), and each one lands on the timeline
 * at its prompt's time. The plan is shown as it runs — nothing waits on a
 * review, and no step asks for another tap. A visual that fails is listed
 * with a retry; the rest carry on.
 *
 * Images land as timed overlays, videos as B-roll segments, both through
 * the existing systems — so they show in the preview and burn into export
 * exactly like any other overlay or segment. No model or provider name
 * appears anywhere in this UI.
 */

/** Planning-only transcript state, owned by StudioPage (phase 2 wires `onTranscribe` to `transcribeVideoForPlanning`). */
export interface AiEditTranscriptState {
  state: "idle" | "transcribing" | "ready" | "error";
  words: TranscriptWord[];
  /** 0..1 while transcribing. */
  progress?: number;
  error?: string;
}

export interface AiGeneratePanelProps {
  projectId: string;
  getTimeMs: () => number;
  /** false when the project has no video (or its source is gone): there is no timeline to place onto */
  hasVideo: boolean;
  videoLocked: boolean;
  onImportMedia: (files: File[]) => Promise<ImportError[]>;
  onPlaceImage: (asset: { id: string; name: string }) => void;
  /** Place an image overlay at an exact time (plan items); falls back to onPlaceImage (playhead) when not wired. */
  onPlaceImageAt?: (asset: { id: string; name: string }, atMs: number) => void;
  /** insert a video segment at a time; false when the insert was refused (e.g. too close to a cut) */
  onInsertVideo: (asset: { id: string; name: string; durationMs: number }, atMs: number) => boolean;
  /** Upload the source video (StudioPage wires the device attach path). Locked until Puter sign-in. */
  onUploadVideo: (files: File[]) => Promise<ImportError[]>;
  /** Planning-only transcript; phase 2 fills this from `transcribeVideoForPlanning`. */
  transcript?: AiEditTranscriptState;
  /** Start the planning-only transcription of the uploaded video. */
  onTranscribe?: () => void;
  /** Injected planner (default: the free server-side plan route). Tests pass a mock. */
  planRunner?: (req: AiEditPlanRequest) => Promise<{ plan: AiEditPlanItem[]; dropped: number }>;
  /** Total video length in ms, when known (plan clamping). Falls back to the last transcript word. */
  durationMs?: number;
}

const MODE_COPY: Record<AiGenerateMode, { label: string; placeholder: string; button: string; waiting: string }> = {
  image: {
    label: "What should it draw?",
    placeholder: "e.g. A robot mascot with a red headband, standing in front of a phone showing captions",
    button: "Generate image",
    waiting: "Generating…",
  },
  video: {
    label: "What should the clip show?",
    placeholder: "e.g. A slow aerial shot over a forest at sunrise, mist between the trees",
    button: "Generate video",
    waiting: "Generating your clip — this can take a while. Video usually takes tens of seconds to a few minutes, so leave this tab open.",
  },
};

const planKey = (item: AiEditPlanItem) => `${item.startMs}-${item.endMs}-${item.kind}`;

/** One run of the chain, and where it is. A run id guards stale chains: starting over or stopping bumps it, and every awaited step bails when it no longer matches. */
type RunPhase = "idle" | "listening" | "planning" | "waiting-signin" | "generating" | "done";
type ItemStatus = "queued" | "generating" | "adding" | "added" | "failed";

/** How often the chain re-checks the transcript / Puter sign-in while it waits on them. */
const WAIT_POLL_MS = 400;
/** Listening runs in-browser Whisper on the whole video — give it up to ten minutes before calling it stuck. */
const LISTEN_TIMEOUT_MS = 10 * 60 * 1000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const AiGeneratePanel: React.FC<AiGeneratePanelProps> = ({
  projectId,
  getTimeMs,
  hasVideo,
  videoLocked,
  onImportMedia,
  onPlaceImage,
  onPlaceImageAt,
  onInsertVideo,
  onUploadVideo,
  transcript = { state: "idle", words: [] },
  onTranscribe,
  planRunner = requestAiEditPlan,
  durationMs,
}) => {
  const { sdkStatus, signedIn, loadAttempt, signInError, retryLoad, signIn, refreshSignedIn, handleScriptLoad, handleScriptError } = usePuterSdk();
  const [styleId, setStyleId] = useState(DEFAULT_AI_EDIT_STYLE_ID);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // the run: one phase, one error, per-item progress
  const [runPhase, setRunPhase] = useState<RunPhase>("idle");
  const [runError, setRunError] = useState("");
  const [plan, setPlan] = useState<AiEditPlanItem[]>([]);
  const [planDropped, setPlanDropped] = useState(0);
  const [itemStatus, setItemStatus] = useState<Record<string, ItemStatus>>({});
  const [itemResults, setItemResults] = useState<Record<string, { mode: AiGenerateMode; src: string }>>({});
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [itemAdded, setItemAdded] = useState<Record<string, string>>({});
  const runIdRef = useRef(0);
  // the chain waits on props the parent owns — mirror them in refs so the polling loop always sees the latest.
  const transcriptRef = useRef(transcript);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  const signedInRef = useRef(signedIn);
  useEffect(() => { signedInRef.current = signedIn; }, [signedIn]);
  const sdkStatusRef = useRef(sdkStatus);
  useEffect(() => { sdkStatusRef.current = sdkStatus; }, [sdkStatus]);

  // one-off visual state
  const [mode, setMode] = useState<AiGenerateMode>("image");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [validation, setValidation] = useState("");
  const [result, setResult] = useState<{ mode: AiGenerateMode; src: string } | null>(null);
  const [resultFailed, setResultFailed] = useState(false);
  const [addedMsg, setAddedMsg] = useState("");

  const copy = MODE_COPY[mode];
  const showSignIn = sdkStatus === "ready" && signedIn === false;
  /** Generation needs the visitor's own free Puter account — upload, listen and plan run without it. */
  const generationLocked = signedIn !== true;
  const style = aiEditStyleById(styleId);
  const videoDurationMs = durationMs ?? (transcript.words.length > 0 ? Math.max(...transcript.words.map((w) => w.endMs)) : 0);
  const runActive = runPhase !== "idle" && runPhase !== "done";
  const addedCount = Object.values(itemStatus).filter((s) => s === "added").length;
  const failedKeys = Object.entries(itemStatus).filter(([, s]) => s === "failed").map(([k]) => k);

  const pickVideo = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const resetRun = useCallback(() => {
    runIdRef.current += 1;
    setRunPhase("idle");
    setRunError("");
    setPlan([]);
    setPlanDropped(0);
    setItemStatus({});
    setItemResults({});
    setItemErrors({});
    setItemAdded({});
  }, []);

  const onVideoPicked = useCallback(async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || uploading) return;
    setUploading(true);
    setUploadError("");
    try {
      const errs = await onUploadVideo([file]);
      if (errs.length > 0) setUploadError(errs[0]!.error);
      else resetRun();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "The video could not be added.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [onUploadVideo, uploading, resetRun]);

  /** Changing the look after a run discards that run's plan — it was planned for the old look. */
  const changeStyle = useCallback((next: string) => {
    setStyleId(next);
    if (plan.length > 0) resetRun();
  }, [plan.length, resetRun]);

  const waitForTranscript = useCallback(async (runId: number) => {
    const started = Date.now();
    for (;;) {
      if (runId !== runIdRef.current) throw new Error("__cancelled__");
      const t = transcriptRef.current;
      if (t.state === "ready") {
        if (t.words.length === 0) throw new Error("No speech was found in this video — make one visual at a time below instead.");
        return;
      }
      if (t.state === "error") throw new Error(t.error ?? "The video could not be listened to.");
      if (Date.now() - started > LISTEN_TIMEOUT_MS) throw new Error("Listening took too long — try a shorter video, or try again.");
      await sleep(WAIT_POLL_MS);
    }
  }, []);

  const waitForSignIn = useCallback(async (runId: number) => {
    for (;;) {
      if (runId !== runIdRef.current) throw new Error("__cancelled__");
      if (sdkStatusRef.current === "failed") throw new Error("The free generation service could not be loaded — check your connection and try again.");
      if (signedInRef.current === true) return;
      await sleep(WAIT_POLL_MS);
    }
  }, []);

  /** Generate one plan item's visual; returns the result, or throws with the message for that item. */
  const generateItemResult = useCallback(async (item: AiEditPlanItem, runId: number) => {
    const puter = getPuter();
    if (!puter) throw new Error("The free generation service is not loaded yet.");
    const key = planKey(item);
    setItemStatus((prev) => ({ ...prev, [key]: "generating" }));
    setItemErrors((prev) => ({ ...prev, [key]: "" }));
    try {
      const fullPrompt = `${item.prompt}, ${style.promptSuffix}`;
      if (item.kind === "image") {
        const image = await puter.ai.txt2img(fullPrompt);
        if (runId !== runIdRef.current) throw new Error("__cancelled__");
        if (!image?.src) throw new Error("No image came back. Try again.");
        setItemResults((prev) => ({ ...prev, [key]: { mode: "image", src: image.src } }));
        return { mode: "image" as AiGenerateMode, src: image.src };
      }
      const video = await puter.ai.txt2vid(fullPrompt, { seconds: AI_VIDEO_SECONDS, size: AI_VIDEO_SIZE });
      if (runId !== runIdRef.current) throw new Error("__cancelled__");
      if (!video?.src) throw new Error("No clip came back. Try again.");
      setItemResults((prev) => ({ ...prev, [key]: { mode: "video", src: video.src } }));
      return { mode: "video" as AiGenerateMode, src: video.src };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not generate this visual.";
      if (message !== "__cancelled__") {
        setItemErrors((prev) => ({ ...prev, [key]: puterErrorMessage(err) }));
        setItemStatus((prev) => ({ ...prev, [key]: "failed" }));
      }
      throw err;
    } finally {
      refreshSignedIn();
    }
  }, [style, refreshSignedIn]);

  /** Import a generated file and place it on the timeline at a plan item's time. */
  const placeGenerated = useCallback(async (item: AiEditPlanItem, mode: AiGenerateMode, src: string, runId: number) => {
    const key = planKey(item);
    setItemStatus((prev) => ({ ...prev, [key]: "adding" }));
    setItemErrors((prev) => ({ ...prev, [key]: "" }));
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      const file = aiGenerateFile(mode, await res.blob(), Date.now());
      if (!file) throw new Error("the generated file came back empty");
      const errs = await onImportMedia([file]);
      if (errs.length > 0) throw new Error(errs[0]!.error);
      const record = findImportedAsset(await listProjectAssets(projectId), file.name);
      if (!record) throw new Error("saved to the media bin, but it could not be found again — add it from Media.");
      if (runId !== runIdRef.current) throw new Error("__cancelled__");
      if (mode === "image") {
        const placeAt = onPlaceImageAt ?? ((asset: { id: string; name: string }) => onPlaceImage(asset));
        placeAt({ id: record.id, name: record.name }, item.startMs);
        setItemAdded((prev) => ({ ...prev, [key]: `Added at ${formatAtMs(item.startMs)} for ${Math.max(1, Math.round(planImageDurationMs(item) / 1000))}s.` }));
      } else {
        const dur = aiVideoInsertDurationMs(record);
        const ok = onInsertVideo({ id: record.id, name: record.name, durationMs: dur }, item.startMs);
        if (!ok) throw new Error("Could not add the clip here — move the playhead away from a cut and try again.");
        setItemAdded((prev) => ({ ...prev, [key]: `Added a ${Math.max(1, Math.round(dur / 1000))}-second clip at ${formatAtMs(item.startMs)}.` }));
      }
      setItemResults((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setItemStatus((prev) => ({ ...prev, [key]: "added" }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save the generated file.";
      if (message !== "__cancelled__") {
        setItemErrors((prev) => ({ ...prev, [key]: message }));
        setItemStatus((prev) => ({ ...prev, [key]: "failed" }));
      }
      throw err;
    }
  }, [onImportMedia, projectId, onPlaceImageAt, onPlaceImage, onInsertVideo]);

  /** Generate + place each item in turn; one failure never stops the rest. */
  const runItems = useCallback(async (items: AiEditPlanItem[], runId: number) => {
    for (const item of items) {
      if (runId !== runIdRef.current) throw new Error("__cancelled__");
      try {
        const res = await generateItemResult(item, runId);
        await placeGenerated(item, res.mode, res.src, runId);
      } catch (err) {
        if (err instanceof Error && err.message === "__cancelled__") throw err;
        // the item already carries its failure — carry on with the next one.
      }
    }
  }, [generateItemResult, placeGenerated]);

  /** The whole chain, in order: listen → plan → (sign in if needed) → generate each → add each. */
  const startRun = useCallback(async () => {
    if (!hasVideo || runActive) return;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setRunError("");
    setPlan([]);
    setPlanDropped(0);
    setItemStatus({});
    setItemResults({});
    setItemErrors({});
    setItemAdded({});
    try {
      const t = transcriptRef.current;
      if (t.state !== "ready" || t.words.length === 0) {
        setRunPhase("listening");
        if (t.state === "idle" || t.state === "error") onTranscribe?.();
        await waitForTranscript(runId);
      }
      setRunPhase("planning");
      const { plan: items, dropped } = await planRunner({
        segments: segmentsOfTranscript(transcriptRef.current.words),
        styleId,
        durationMs: videoDurationMs,
      });
      if (runId !== runIdRef.current) return;
      setPlan(items);
      setPlanDropped(dropped);
      setItemStatus(Object.fromEntries(items.map((it) => [planKey(it), "queued" as ItemStatus])));
      // The transcript is guaranteed to have words here (waitForTranscript
      // throws first when it is empty), so "no clear speech" would be a
      // lie — the model answered but made nothing usable from them.
      if (items.length === 0) throw new Error("The free AI answered but made no visuals from this transcript. Try again.");
      if (signedInRef.current !== true) {
        setRunPhase("waiting-signin");
        await waitForSignIn(runId);
      }
      setRunPhase("generating");
      await runItems(items, runId);
      if (runId !== runIdRef.current) return;
      setRunPhase("done");
    } catch (err) {
      if (err instanceof Error && err.message === "__cancelled__") return;
      if (runId !== runIdRef.current) return;
      setRunError(err instanceof Error ? err.message : "The visuals could not be made. Try again.");
      setRunPhase("idle");
    }
  }, [hasVideo, runActive, onTranscribe, waitForTranscript, planRunner, styleId, videoDurationMs, waitForSignIn, runItems]);

  /** Re-run only the items that failed, with the plan as it stands. */
  const retryFailed = useCallback(async () => {
    if (runActive || failedKeys.length === 0) return;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setRunError("");
    try {
      if (signedInRef.current !== true) {
        setRunPhase("waiting-signin");
        await waitForSignIn(runId);
      }
      setRunPhase("generating");
      const failed = plan.filter((it) => failedKeys.includes(planKey(it)));
      setItemStatus((prev) => ({ ...prev, ...Object.fromEntries(failed.map((it) => [planKey(it), "queued" as ItemStatus])) }));
      await runItems(failed, runId);
      if (runId !== runIdRef.current) return;
      setRunPhase("done");
    } catch (err) {
      if (err instanceof Error && err.message === "__cancelled__") return;
      if (runId !== runIdRef.current) return;
      setRunError(err instanceof Error ? err.message : "The retry could not finish. Try again.");
      setRunPhase("idle");
    }
  }, [runActive, failedKeys, plan, waitForSignIn, runItems]);

  const stopRun = useCallback(() => {
    runIdRef.current += 1;
    setRunPhase("idle");
  }, []);

  const generate = useCallback(async () => {
    const puter = getPuter();
    if (!puter) return;
    const problem = validateAiGeneratePrompt(prompt);
    if (problem) {
      setValidation(problem);
      return;
    }
    setValidation("");
    setError("");
    setAddedMsg("");
    setResult(null);
    setResultFailed(false);
    setBusy(true);
    try {
      if (mode === "image") {
        const image = await puter.ai.txt2img(prompt.trim());
        if (!image?.src) {
          setError("No image came back. Try again.");
        } else {
          setResult({ mode, src: image.src });
        }
      } else {
        const video = await puter.ai.txt2vid(prompt.trim(), { seconds: AI_VIDEO_SECONDS, size: AI_VIDEO_SIZE });
        if (!video?.src) {
          setError("No clip came back. Try again.");
        } else {
          setResult({ mode, src: video.src });
        }
      }
    } catch (err) {
      setError(puterErrorMessage(err));
    } finally {
      setBusy(false);
      refreshSignedIn();
    }
  }, [mode, prompt, refreshSignedIn]);

  const addToTimeline = useCallback(async () => {
    if (!result || adding) return;
    setAdding(true);
    setError("");
    setAddedMsg("");
    try {
      const res = await fetch(result.src);
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      const file = aiGenerateFile(result.mode, await res.blob(), Date.now());
      if (!file) throw new Error("the generated file came back empty");
      const errs = await onImportMedia([file]);
      if (errs.length > 0) throw new Error(errs[0]!.error);
      const record = findImportedAsset(await listProjectAssets(projectId), file.name);
      if (!record) throw new Error("saved to the media bin, but it could not be found again — add it from Media.");
      const atMs = getTimeMs();
      if (result.mode === "image") {
        onPlaceImage({ id: record.id, name: record.name });
        setAddedMsg(`Added at ${formatAtMs(atMs)} — open Elements to move it.`);
      } else {
        const dur = aiVideoInsertDurationMs(record);
        const ok = onInsertVideo({ id: record.id, name: record.name, durationMs: dur }, atMs);
        if (!ok) throw new Error("Could not add the clip here — move the playhead away from a cut and try again.");
        setAddedMsg(`Added a ${Math.max(1, Math.round(dur / 1000))}-second clip at ${formatAtMs(atMs)}.`);
      }
      setResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the generated file.");
    } finally {
      setAdding(false);
    }
  }, [result, adding, onImportMedia, projectId, getTimeMs, onPlaceImage, onInsertVideo]);

  const generatingIndex = plan.findIndex((it) => itemStatus[planKey(it)] === "generating" || itemStatus[planKey(it)] === "adding");
  const runStatusText =
    runPhase === "listening"
      ? transcript.state === "transcribing"
        ? `Listening to your video… ${Math.round((transcript.progress ?? 0) * 100)}%`
        : "Listening to your video…"
      : runPhase === "planning"
        ? "Planning your visuals…"
        : runPhase === "waiting-signin"
          ? "Waiting for Puter sign-in…"
          : runPhase === "generating"
            ? `Generating visual ${generatingIndex >= 0 ? generatingIndex + 1 : addedCount + 1} of ${plan.length}…`
            : runPhase === "done"
              ? `${addedCount} visual${addedCount === 1 ? "" : "s"} on your timeline${failedKeys.length > 0 ? ` — ${failedKeys.length} failed` : ""}.`
              : "";

  return (
    <div className="h-full overflow-y-auto">
      <Script key={loadAttempt} src="https://js.puter.com/v2/" strategy="afterInteractive" onLoad={handleScriptLoad} onError={handleScriptError} />
      <Section title="AI Edit" hint="Upload a video, pick a look — the visuals plan themselves, generate, and land on your timeline.">
        {sdkStatus === "failed" ? (
          <div role="alert" className="rounded-lg border border-st-or/60 bg-st-or/15 px-3 py-2 text-sm text-st-text">
            <p>The free generation service could not be loaded — check your connection and try again.</p>
            <Button tone="ghost" onClick={retryLoad} className="mt-2">Try loading again</Button>
          </div>
        ) : null}

        {/* your video: no sign-in needed, and this is the first upload on a blank project too */}
        <div>
          <p className="font-sora text-[13px] font-bold text-st-text">Your video</p>
          <input ref={fileRef} type="file" accept="video/*" className="hidden" aria-label="Choose a video file" onChange={(e) => void onVideoPicked(e.target.files)} />
          <button
            type="button"
            onClick={pickVideo}
            disabled={uploading}
            className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-full bg-st-em px-6 py-3 font-sora text-[14px] font-bold text-[#0B1512] disabled:opacity-50"
          >
            {uploading ? "Adding…" : hasVideo ? "Replace video" : "Upload video"}
          </button>
          {hasVideo ? (
            <p className="mt-2 text-xs leading-relaxed text-st-faint">Video added — pick a look below, then create your visuals.</p>
          ) : null}
          {uploadError ? <p role="alert" className="mt-2 text-xs text-st-or">{uploadError}</p> : null}
        </div>

        {/* the look: applies to every visual the plan makes */}
        <div>
          <p className="font-sora text-[13px] font-bold text-st-text">Look</p>
          <div className="mt-2">
            <AiEditStyleChooser value={styleId} onChange={changeStyle} disabled={!hasVideo || runActive} />
          </div>
          {!hasVideo ? <p className="mt-2 text-xs text-st-faint">Add a video first — the look applies to the visuals made for it.</p> : null}
        </div>

        {/* the run: one tap, then listen → plan → generate → timeline, on its own */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void startRun()}
              disabled={!hasVideo || runActive}
              className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-full bg-st-em px-6 py-3 font-sora text-[14px] font-bold text-[#0B1512] disabled:opacity-50"
            >
              {runPhase === "done" && plan.length > 0 ? "Create visuals again" : "Create visuals"}
            </button>
            {runActive ? (
              <button
                type="button"
                onClick={stopRun}
                className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-full border border-st-line px-5 py-3 font-sora text-[14px] font-bold text-st-text"
              >
                Stop
              </button>
            ) : null}
          </div>
          {runStatusText ? <p className="mt-2 text-xs leading-relaxed text-st-faint">{runStatusText}</p> : null}
          {runError ? <p role="alert" className="mt-2 text-xs text-st-or">{runError}</p> : null}
          {planDropped > 0 ? <p className="mt-2 text-xs text-st-faint">{planDropped} planned visual{planDropped === 1 ? " was" : "s were"} dropped as unusable.</p> : null}

          {runPhase === "waiting-signin" ? (
            <div className="mt-2 rounded-lg border border-st-line bg-st-raised px-3 py-3">
              <p className="text-xs leading-relaxed text-st-text">
                Sign in with your own free Puter account. Generation uses your account and its allowance — Captionit charges nothing. The visuals start generating as soon as you sign in.
              </p>
              {showSignIn ? (
                <>
                  <button
                    type="button"
                    onClick={() => void signIn()}
                    className="mt-2 inline-flex min-h-[40px] items-center justify-center rounded-full bg-st-em px-5 py-2 font-sora text-[13px] font-bold text-[#0B1512]"
                  >
                    Sign in with Puter
                  </button>
                  {signInError ? <p role="alert" className="mt-2 text-xs text-st-text">{signInError}</p> : null}
                </>
              ) : sdkStatus === "loading" ? (
                <p className="mt-2 text-xs text-st-faint">Loading the free generation service…</p>
              ) : null}
            </div>
          ) : null}
          {generationLocked && plan.length > 0 && runPhase !== "waiting-signin" && runPhase !== "done" ? (
            <p className="mt-2 text-xs text-st-faint">Generation needs a free Puter sign-in — you will be asked when the plan is ready.</p>
          ) : null}

          {plan.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {plan.map((item) => {
                const key = planKey(item);
                const status = itemStatus[key] ?? "queued";
                const itemResult = itemResults[key];
                const statusText =
                  status === "added"
                    ? itemAdded[key] ?? "On your timeline."
                    : status === "generating"
                      ? "Generating…"
                      : status === "adding"
                        ? "Adding to your timeline…"
                        : status === "failed"
                          ? "Could not be made."
                          : "Waiting…";
                return (
                  <li key={key} className="rounded-lg border border-st-line bg-st-raised p-3">
                    <p className="text-[13px] text-st-text">
                      <span className="font-sora font-bold">{formatAtMs(item.startMs)} – {formatAtMs(item.endMs)} · {item.kind === "image" ? "Image" : "Video"}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-st-faint">{item.prompt}</span>
                      {item.sourceText ? <span className="mt-0.5 block text-xs italic leading-relaxed text-st-faint">&ldquo;{item.sourceText}&rdquo;</span> : null}
                    </p>
                    <p className={`mt-2 text-xs ${status === "added" ? "text-st-em" : status === "failed" ? "text-st-or" : "text-st-faint"}`}>{statusText}</p>
                    {itemErrors[key] ? <p role="alert" className="mt-1 text-xs text-st-or">{itemErrors[key]}</p> : null}
                    {itemResult ? (
                      <div className="mt-2">
                        {itemResult.mode === "image" ? (
                          <img src={itemResult.src} alt="Generated visual for this plan item" className="w-full rounded-lg" />
                        ) : (
                          <video src={itemResult.src} controls preload="metadata" playsInline className="w-full rounded-lg" />
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {runPhase === "done" && failedKeys.length > 0 ? (
            <button
              type="button"
              onClick={() => void retryFailed()}
              className="mt-3 inline-flex min-h-[40px] items-center justify-center rounded-full border border-st-line px-5 py-2 font-sora text-[13px] font-bold text-st-text"
            >
              Retry {failedKeys.length} failed visual{failedKeys.length === 1 ? "" : "s"}
            </button>
          ) : null}
        </div>

        {/* one visual at the playhead, outside the automatic run */}
        <div>
          <p className="font-sora text-[13px] font-bold text-st-text">Or make one visual at the playhead</p>
          {hasVideo ? (
            <>
              <div role="group" aria-label="What to generate" className="mt-2 flex gap-2">
                {(["image", "video"] as AiGenerateMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => { setMode(m); setError(""); setValidation(""); }}
                    className={`inline-flex min-h-[36px] items-center gap-2 rounded-full px-4 py-2 font-sora text-[13px] font-semibold ${mode === m ? "bg-st-em text-[#0B1512]" : "border border-st-line text-st-text"}`}
                  >
                    {m === "image" ? <ImageIcon className="h-4 w-4" aria-hidden /> : <Film className="h-4 w-4" aria-hidden />}
                    {m === "image" ? "Image" : "Video"}
                  </button>
                ))}
              </div>
              {mode === "video" ? (
                <p className="mt-2 text-xs leading-relaxed text-st-faint">
                  Video uses much more of your Puter allowance than images, and takes longer — usually tens of seconds to a few minutes for a {AI_VIDEO_SECONDS}-second clip.
                </p>
              ) : null}
              <div className="mt-2">
                <label htmlFor="ai-edit-prompt" className="font-sora text-[13px] font-bold text-st-text">{copy.label}</label>
                <textarea
                  id="ai-edit-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={copy.placeholder}
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-st-line bg-st-raised p-3 text-[14px] leading-relaxed text-st-text placeholder:text-st-faint"
                />
                {validation ? <p role="alert" className="mt-2 text-xs text-st-or">{validation}</p> : null}
                <button
                  type="button"
                  onClick={() => void generate()}
                  disabled={busy || adding || sdkStatus !== "ready" || signedIn !== true}
                  className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-full bg-st-em px-6 py-3 font-sora text-[14px] font-bold text-[#0B1512] disabled:opacity-50"
                >
                  {busy ? copy.waiting : copy.button}
                </button>
                {sdkStatus === "loading" ? <p className="mt-2 text-xs text-st-faint">Loading the free generation service…</p> : null}
                {showSignIn && runPhase !== "waiting-signin" ? (
                  <>
                    <p className="mt-2 text-xs text-st-faint">Sign in with your own free Puter account to generate — Captionit charges nothing.</p>
                    <button
                      type="button"
                      onClick={() => void signIn()}
                      className="mt-2 inline-flex min-h-[40px] items-center justify-center rounded-full bg-st-em px-5 py-2 font-sora text-[13px] font-bold text-[#0B1512]"
                    >
                      Sign in with Puter
                    </button>
                    {signInError ? <p role="alert" className="mt-2 text-xs text-st-text">{signInError}</p> : null}
                  </>
                ) : null}
              </div>
              {error ? (
                <div role="alert" className="mt-2 rounded-lg border border-st-or/60 bg-st-or/15 px-3 py-2 text-sm text-st-text">
                  <p>{error}</p>
                  <Button tone="ghost" onClick={() => void generate()} disabled={busy || sdkStatus !== "ready"} className="mt-2">Try again</Button>
                </div>
              ) : null}
              {addedMsg ? <p className="mt-2 text-xs text-st-em">{addedMsg}</p> : null}
              {result ? (
                <div className="mt-2 rounded-lg border border-st-line bg-st-raised p-3">
                  {resultFailed ? (
                    <p role="alert" className="text-xs leading-relaxed text-st-text">The result could not be displayed here. Try generating again, or open it from the link below.</p>
                  ) : result.mode === "image" ? (
                    <img src={result.src} alt="Image generated from your prompt" className="w-full rounded-lg" onError={() => setResultFailed(true)} />
                  ) : (
                    <video src={result.src} controls preload="metadata" playsInline className="w-full rounded-lg" onError={() => setResultFailed(true)} />
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void addToTimeline()}
                      disabled={adding || (videoLocked && result.mode === "video")}
                      className="inline-flex min-h-[40px] items-center justify-center rounded-full bg-st-em px-5 py-2 font-sora text-[13px] font-bold text-[#0B1512] disabled:opacity-50"
                    >
                      {adding ? "Adding…" : "Add to timeline"}
                    </button>
                    <Button tone="ghost" onClick={() => { setResult(null); setResultFailed(false); }}>Discard</Button>
                  </div>
                  <a href={result.src} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-st-faint underline">
                    Open the generated {result.mode === "image" ? "image" : "clip"} in a new tab
                  </a>
                </div>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-xs text-st-faint">Add a video to the project first — AI Edit places visuals onto your timeline.</p>
          )}
        </div>
      </Section>
    </div>
  );
};
