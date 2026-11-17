"use client";

import { useCallback, useState } from "react";
import Script from "next/script";
import { Film, Image as ImageIcon } from "@/components/ui/icons";
import { getPuter, puterErrorMessage } from "../../ai-generator/puter";
import { usePuterSdk } from "../../ai-generator/usePuterSdk";
import { Button, Section } from "../controls";
import { listProjectAssets } from "../mediaStore";
import type { ImportError } from "../useMediaAssets";
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

/**
 * AI Edit — generate an image or a short clip with Puter.js and drop it on
 * the timeline. The visitor signs in with their OWN free Puter account
 * (User-Pays, never the owner's cost); no API key, no backend, no cost to
 * Captionit. Images land as timed overlays, videos as B-roll segments, both
 * through the existing systems — so they show in the preview and burn into
 * export exactly like any other overlay or segment.
 *
 * This is NOT the removed edit-planner AI Edit (features/studio/aiEdit.ts,
 * dead code, left alone): this panel only generates media with Puter.
 */

export interface AiGeneratePanelProps {
  projectId: string;
  getTimeMs: () => number;
  /** false when the project has no video (or its source is gone): there is no timeline to place onto */
  hasVideo: boolean;
  videoLocked: boolean;
  onImportMedia: (files: File[]) => Promise<ImportError[]>;
  onPlaceImage: (asset: { id: string; name: string }) => void;
  /** insert a video segment at the playhead; false when the insert was refused (e.g. too close to a cut) */
  onInsertVideo: (asset: { id: string; name: string; durationMs: number }, atMs: number) => boolean;
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

export const AiGeneratePanel: React.FC<AiGeneratePanelProps> = ({
  projectId,
  getTimeMs,
  hasVideo,
  videoLocked,
  onImportMedia,
  onPlaceImage,
  onInsertVideo,
}) => {
  const { sdkStatus, signedIn, loadAttempt, signInError, retryLoad, signIn, refreshSignedIn, handleScriptLoad, handleScriptError } = usePuterSdk();
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
          setError("Puter returned an image with no address. Try again.");
        } else {
          setResult({ mode, src: image.src });
        }
      } else {
        const video = await puter.ai.txt2vid(prompt.trim(), { seconds: AI_VIDEO_SECONDS, size: AI_VIDEO_SIZE });
        if (!video?.src) {
          setError("Puter returned a clip with no address. Try again.");
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
      <Section title="AI Edit" hint="Describe a visual — Puter makes it with your free account, then it drops onto the timeline.">
        {sdkStatus === "failed" ? (
          <div role="alert" className="rounded-lg border border-st-or/60 bg-st-or/15 px-3 py-2 text-sm text-st-text">
            <p>Puter.js could not be loaded — check your connection and try again.</p>
            <Button tone="ghost" onClick={retryLoad} className="mt-2">Try loading again</Button>
          </div>
        ) : !hasVideo ? (
          <p className="text-xs text-st-faint">Add a video to the project first — AI Edit places visuals onto your timeline.</p>
        ) : (
          <>
            <div role="tablist" aria-label="What to generate" className="flex gap-2">
              {(["image", "video"] as AiGenerateMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => { setMode(m); setError(""); setValidation(""); }}
                  className={`inline-flex min-h-[36px] items-center gap-2 rounded-full px-4 py-2 font-sora text-[13px] font-semibold ${mode === m ? "bg-st-em text-[#0B1512]" : "border border-st-line text-st-text"}`}
                >
                  {m === "image" ? <ImageIcon className="h-4 w-4" aria-hidden /> : <Film className="h-4 w-4" aria-hidden />}
                  {m === "image" ? "Image" : "Video"}
                </button>
              ))}
            </div>

            {mode === "video" ? (
              <p className="text-xs leading-relaxed text-st-faint">
                Video uses much more of your Puter allowance than images, and takes longer — usually tens of seconds to a few minutes for a {AI_VIDEO_SECONDS}-second clip.
              </p>
            ) : null}

            {showSignIn ? (
              <div className="rounded-lg border border-st-line bg-st-raised px-3 py-3">
                <p className="text-xs leading-relaxed text-st-text">
                  You are not signed in to Puter yet. Generation uses your own free Puter account and its allowance — Captionit charges nothing.
                </p>
                <button
                  type="button"
                  onClick={() => void signIn()}
                  className="mt-2 inline-flex min-h-[40px] items-center justify-center rounded-full bg-st-em px-5 py-2 font-sora text-[13px] font-bold text-[#0B1512]"
                >
                  Sign in with Puter
                </button>
                {signInError ? <p role="alert" className="mt-2 text-xs text-st-text">{signInError}</p> : null}
                <p className="mt-2 text-xs leading-relaxed text-st-faint">Or just press Generate below — Puter will ask you to sign in then.</p>
              </div>
            ) : null}

            <div>
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
                disabled={busy || adding || sdkStatus !== "ready"}
                className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-full bg-st-em px-6 py-3 font-sora text-[14px] font-bold text-[#0B1512] disabled:opacity-50"
              >
                {busy ? copy.waiting : copy.button}
              </button>
              {sdkStatus === "loading" ? <p className="mt-2 text-xs text-st-faint">Loading Puter.js…</p> : null}
            </div>

            {error ? (
              <div role="alert" className="rounded-lg border border-st-or/60 bg-st-or/15 px-3 py-2 text-sm text-st-text">
                <p>{error}</p>
                <Button tone="ghost" onClick={() => void generate()} disabled={busy || sdkStatus !== "ready"} className="mt-2">Try again</Button>
              </div>
            ) : null}

            {addedMsg ? <p className="text-xs text-st-em">{addedMsg}</p> : null}

            {result ? (
              <div className="rounded-lg border border-st-line bg-st-raised p-3">
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
        )}
      </Section>
    </div>
  );
};
