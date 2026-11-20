"use client";

import { useCallback, useRef, useState } from "react";
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
 * The owner's workflow, as numbered steps:
 *   1. Add your video — works on a blank project too, no sign-in needed.
 *   2. Listen to the video — planning-only in-browser transcription, so
 *      the plan follows what is actually said; nothing is saved as captions.
 *   3. Visual prompts — pick a style, the free plan turns the transcript
 *      into per-segment prompts, approve each one.
 *   4. Generate with Puter — sign in with your OWN free Puter account
 *      (User-Pays, never the owner's cost), then generate each visual.
 *   5. Add to timeline — generated visuals land at their prompt's time;
 *      or make one visual at the playhead and add it.
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

  // plan state
  const [plan, setPlan] = useState<AiEditPlanItem[]>([]);
  const [planDropped, setPlanDropped] = useState(0);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState("");
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [itemBusy, setItemBusy] = useState("");
  const [itemAdding, setItemAdding] = useState("");
  const [itemResults, setItemResults] = useState<Record<string, { mode: AiGenerateMode; src: string }>>({});
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [itemAdded, setItemAdded] = useState<Record<string, string>>({});

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

  const pickVideo = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const onVideoPicked = useCallback(async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || uploading) return;
    setUploading(true);
    setUploadError("");
    try {
      const errs = await onUploadVideo([file]);
      if (errs.length > 0) setUploadError(errs[0]!.error);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "The video could not be added.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [onUploadVideo, uploading]);

  const makePlan = useCallback(async () => {
    if (planning || transcript.words.length === 0) return;
    setPlanning(true);
    setPlanError("");
    try {
      const { plan: items, dropped } = await planRunner({
        segments: segmentsOfTranscript(transcript.words),
        styleId,
        durationMs: videoDurationMs,
      });
      setPlan(items);
      setPlanDropped(dropped);
      setApproved(Object.fromEntries(items.map((it) => [planKey(it), true])));
      if (items.length === 0) setPlanError("No visuals could be planned from this transcript — the video may have no clear speech.");
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : "The plan could not be made. Try again.");
    } finally {
      setPlanning(false);
    }
  }, [planning, transcript.words, planRunner, styleId, videoDurationMs]);

  /** Import a generated file and place it on the timeline at a plan item's time. */
  const placeGenerated = useCallback(async (item: AiEditPlanItem, mode: AiGenerateMode, src: string) => {
    const key = planKey(item);
    setItemAdding(key);
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
    } catch (err) {
      setItemErrors((prev) => ({ ...prev, [key]: err instanceof Error ? err.message : "Could not save the generated file." }));
    } finally {
      setItemAdding("");
    }
  }, [onImportMedia, projectId, onPlaceImageAt, onPlaceImage, onInsertVideo]);

  const generateItem = useCallback(async (item: AiEditPlanItem) => {
    const puter = getPuter();
    if (!puter) return;
    const key = planKey(item);
    setItemBusy(key);
    setItemErrors((prev) => ({ ...prev, [key]: "" }));
    try {
      const fullPrompt = `${item.prompt}, ${style.promptSuffix}`;
      if (item.kind === "image") {
        const image = await puter.ai.txt2img(fullPrompt);
        if (!image?.src) setItemErrors((prev) => ({ ...prev, [key]: "No image came back. Try again." }));
        else setItemResults((prev) => ({ ...prev, [key]: { mode: "image", src: image.src } }));
      } else {
        const video = await puter.ai.txt2vid(fullPrompt, { seconds: AI_VIDEO_SECONDS, size: AI_VIDEO_SIZE });
        if (!video?.src) setItemErrors((prev) => ({ ...prev, [key]: "No clip came back. Try again." }));
        else setItemResults((prev) => ({ ...prev, [key]: { mode: "video", src: video.src } }));
      }
    } catch (err) {
      setItemErrors((prev) => ({ ...prev, [key]: puterErrorMessage(err) }));
    } finally {
      setItemBusy("");
      refreshSignedIn();
    }
  }, [style, refreshSignedIn]);

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

  return (
    <div className="h-full overflow-y-auto">
      <Script key={loadAttempt} src="https://js.puter.com/v2/" strategy="afterInteractive" onLoad={handleScriptLoad} onError={handleScriptError} />
      <Section title="AI Edit" hint="Your video, planned visuals, generated with your free account — never mixed with caption projects.">
        {sdkStatus === "failed" ? (
          <div role="alert" className="rounded-lg border border-st-or/60 bg-st-or/15 px-3 py-2 text-sm text-st-text">
            <p>The free generation service could not be loaded — check your connection and try again.</p>
            <Button tone="ghost" onClick={retryLoad} className="mt-2">Try loading again</Button>
          </div>
        ) : null}

        {/* 1 — add the video: no sign-in needed, and this is the first upload on a blank project too */}
        <div>
          <p className="font-sora text-[13px] font-bold text-st-text">1. Add your video</p>
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
            <p className="mt-2 text-xs leading-relaxed text-st-faint">Video added. Listen to it in step 2.</p>
          ) : null}
          {uploadError ? <p role="alert" className="mt-2 text-xs text-st-or">{uploadError}</p> : null}
        </div>

        {/* 2 — listen: planning-only transcription in this tab, nothing saved as captions */}
        <div>
          <p className="font-sora text-[13px] font-bold text-st-text">2. Listen to the video</p>
          {!hasVideo ? (
            <p className="mt-2 text-xs leading-relaxed text-st-faint">Add a video first — the plan is built from the words in your video.</p>
          ) : transcript.state === "idle" ? (
            <>
              <p className="mt-2 text-xs leading-relaxed text-st-faint">First the video is listened to in this tab, so the plan follows what is actually said. Nothing is saved as captions.</p>
              <button
                type="button"
                onClick={() => onTranscribe?.()}
                disabled={!onTranscribe}
                className="mt-2 inline-flex min-h-[40px] items-center justify-center rounded-full bg-st-em px-5 py-2 font-sora text-[13px] font-bold text-[#0B1512] disabled:opacity-50"
              >
                Listen to the video
              </button>
            </>
          ) : transcript.state === "transcribing" ? (
            <p className="mt-2 text-xs text-st-faint">Listening to the video… {Math.round((transcript.progress ?? 0) * 100)}%</p>
          ) : transcript.state === "error" ? (
            <div role="alert" className="mt-2 rounded-lg border border-st-or/60 bg-st-or/15 px-3 py-2 text-sm text-st-text">
              <p>{transcript.error ?? "The video could not be listened to."}</p>
              <Button tone="ghost" onClick={() => onTranscribe?.()} disabled={!onTranscribe} className="mt-2">Try again</Button>
            </div>
          ) : transcript.words.length === 0 ? (
            <p className="mt-2 text-xs leading-relaxed text-st-faint">No speech was found in this video — make one visual at a time in step 5 instead.</p>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-st-faint">{transcript.words.length} words heard. Make a plan in step 3.</p>
          )}
        </div>

        {/* 3 — visual prompts: pick a style, make the plan, approve each prompt */}
        <div>
          <p className="font-sora text-[13px] font-bold text-st-text">3. Visual prompts</p>
          <div className="mt-2">
            <AiEditStyleChooser value={styleId} onChange={setStyleId} disabled={!hasVideo} />
          </div>
          {!hasVideo ? <p className="mt-2 text-xs text-st-faint">Add a video first — the style applies to the visuals planned for it.</p> : null}
          {hasVideo && transcript.state === "ready" && transcript.words.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => void makePlan()}
                disabled={planning}
                className="mt-2 inline-flex min-h-[40px] items-center justify-center rounded-full bg-st-em px-5 py-2 font-sora text-[13px] font-bold text-[#0B1512] disabled:opacity-50"
              >
                {planning ? "Planning…" : plan.length > 0 ? "Plan again" : "Make a visual plan"}
              </button>
              {planError ? <p role="alert" className="mt-2 text-xs text-st-or">{planError}</p> : null}
              {planDropped > 0 ? <p className="mt-2 text-xs text-st-faint">{planDropped} planned visual{planDropped === 1 ? " was" : "s were"} dropped as unusable.</p> : null}
            </>
          ) : hasVideo ? (
            <p className="mt-2 text-xs leading-relaxed text-st-faint">Listen to the video first — the plan follows what is said.</p>
          ) : null}
          {generationLocked && plan.length > 0 ? (
            <p className="mt-2 text-xs text-st-faint">Generation needs a free Puter sign-in — step 4.</p>
          ) : null}

          {plan.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {plan.map((item) => {
                const key = planKey(item);
                const itemResult = itemResults[key];
                const isApproved = approved[key] !== false;
                return (
                  <li key={key} className="rounded-lg border border-st-line bg-st-raised p-3">
                    <label className="flex items-start gap-2 text-[13px] text-st-text">
                      <input
                        type="checkbox"
                        checked={isApproved}
                        onChange={(e) => setApproved((prev) => ({ ...prev, [key]: e.target.checked }))}
                        className="mt-0.5 accent-[#34D399]"
                      />
                      <span>
                        <span className="font-sora font-bold">{formatAtMs(item.startMs)} – {formatAtMs(item.endMs)} · {item.kind === "image" ? "Image" : "Video"}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-st-faint">{item.prompt}</span>
                        {item.sourceText ? <span className="mt-0.5 block text-xs italic leading-relaxed text-st-faint">&ldquo;{item.sourceText}&rdquo;</span> : null}
                      </span>
                    </label>
                    {itemAdded[key] ? <p className="mt-2 text-xs text-st-em">{itemAdded[key]}</p> : null}
                    {itemErrors[key] ? <p role="alert" className="mt-2 text-xs text-st-or">{itemErrors[key]}</p> : null}
                    {itemResult ? (
                      <div className="mt-2">
                        {itemResult.mode === "image" ? (
                          <img src={itemResult.src} alt="Generated visual for this plan item" className="w-full rounded-lg" />
                        ) : (
                          <video src={itemResult.src} controls preload="metadata" playsInline className="w-full rounded-lg" />
                        )}
                        <button
                          type="button"
                          onClick={() => void placeGenerated(item, itemResult.mode, itemResult.src)}
                          disabled={itemAdding === key || (videoLocked && itemResult.mode === "video")}
                          className="mt-2 inline-flex min-h-[40px] items-center justify-center rounded-full bg-st-em px-5 py-2 font-sora text-[13px] font-bold text-[#0B1512] disabled:opacity-50"
                        >
                          {itemAdding === key ? "Adding…" : "Add to timeline"}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void generateItem(item)}
                        disabled={!isApproved || itemBusy === key || sdkStatus !== "ready" || signedIn !== true}
                        className="mt-2 inline-flex min-h-[40px] items-center justify-center rounded-full border border-st-line px-5 py-2 font-sora text-[13px] font-bold text-st-text disabled:opacity-50"
                      >
                        {itemBusy === key ? "Generating…" : `Generate this ${item.kind}`}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        {/* 4 — generate with Puter: sign-in lives here, right before generation */}
        <div>
          <p className="font-sora text-[13px] font-bold text-st-text">4. Generate with Puter</p>
          {showSignIn ? (
            <div className="mt-2 rounded-lg border border-st-line bg-st-raised px-3 py-3">
              <p className="text-xs leading-relaxed text-st-text">
                Sign in with your own free Puter account. Generation uses your account and its allowance — Captionit charges nothing.
              </p>
              <button
                type="button"
                onClick={() => void signIn()}
                className="mt-2 inline-flex min-h-[40px] items-center justify-center rounded-full bg-st-em px-5 py-2 font-sora text-[13px] font-bold text-[#0B1512]"
              >
                Sign in with Puter
              </button>
              {signInError ? <p role="alert" className="mt-2 text-xs text-st-text">{signInError}</p> : null}
            </div>
          ) : signedIn === true ? (
            <p className="mt-2 text-xs text-st-em">Signed in — press Generate on any approved prompt in step 3.</p>
          ) : sdkStatus === "loading" ? (
            <p className="mt-2 text-xs text-st-faint">Loading the free generation service…</p>
          ) : null}
        </div>

        {/* 5 — add to timeline: one visual at the playhead, then add it */}
        <div>
          <p className="font-sora text-[13px] font-bold text-st-text">5. Add to timeline</p>
          <p className="mt-2 text-xs leading-relaxed text-st-faint">Plan visuals add from step 3, at the time on each prompt. Or make one visual at the playhead:</p>
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
