"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Copy, Download, Film, Image as ImageIcon, Keyboard } from "@/components/ui/icons";
import { extractChatText, getPuter, puterErrorMessage } from "./puter";

/**
 * /ai-generator — Text / Image / Video generation powered by Puter.js.
 *
 * No Captionit account, no API key, no backend: the Puter.js script runs in
 * the visitor's browser and each call is billed to their own free Puter
 * account and its allowance. Captionit charges nothing and stores nothing —
 * prompts go to Puter (a third party), results stay on this page.
 *
 * Honest states only: idle, loading, signed-out affordance, SDK-unreachable,
 * error with retry. No mock or sample output is ever rendered as generated.
 * The Video tab never shows a fake progress bar — generation takes tens of
 * seconds to several minutes (docs: Puter waits up to 14 minutes), so the
 * waiting copy says so plainly.
 */

type Mode = "text" | "image" | "video";
type SdkStatus = "loading" | "ready" | "failed";

const MODES: Array<{ id: Mode; label: string }> = [
  { id: "text", label: "Text" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
];

/** Modest video defaults (verified docs.puter.com/AI/txt2vid/): the default
 *  model Wan 2.7 bills per second, 2–15 s, default 5 s, 720P/1080P. 5 s at
 *  720P is the smallest honest default that keeps a visitor's allowance
 *  lasting; the model itself shortens a clip to fit a low balance. */
const VIDEO_SECONDS = 5;
const VIDEO_SIZE = "720P";

const MODE_COPY: Record<Mode, { label: string; placeholder: string; button: string; waiting: string }> = {
  text: {
    label: "What should it write?",
    placeholder: "e.g. Write a one-line hook for a Reel about a free caption app",
    button: "Generate text",
    waiting: "Generating…",
  },
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

export default function AiGenerator() {
  const [mode, setMode] = useState<Mode>("text");
  const [sdkStatus, setSdkStatus] = useState<SdkStatus>("loading");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [validation, setValidation] = useState("");
  const [textResult, setTextResult] = useState("");
  const [imageSrc, setImageSrc] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const [videoSrc, setVideoSrc] = useState("");
  const [videoFailed, setVideoFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const sdkTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // The Script onLoad/onError callbacks are the primary signal, but the SDK
  // can already be present (back/forward navigation, cached script), so
  // also poll for window.puter briefly after mount. After 10 s with no SDK,
  // say so honestly instead of spinning forever — and offer a retry, so a
  // slow phone connection does not look broken.
  const startSdkWait = useCallback(() => {
    if (sdkTimer.current) clearInterval(sdkTimer.current);
    setSdkStatus("loading");
    if (getPuter()) {
      setSdkStatus("ready");
      return;
    }
    const started = Date.now();
    sdkTimer.current = setInterval(() => {
      if (getPuter()) {
        if (sdkTimer.current) clearInterval(sdkTimer.current);
        setSdkStatus("ready");
      } else if (Date.now() - started > 10000) {
        if (sdkTimer.current) clearInterval(sdkTimer.current);
        setSdkStatus((s) => (s === "ready" ? s : "failed"));
      }
    }, 500);
  }, []);

  useEffect(() => {
    startSdkWait();
    return () => {
      if (sdkTimer.current) clearInterval(sdkTimer.current);
    };
  }, [startSdkWait]);

  // Retry after a failed load: remount the script tag (new key) and wait
  // again from scratch. The prompt stays put — only the SDK load restarts.
  const retryLoad = useCallback(() => {
    setLoadAttempt((a) => a + 1);
    startSdkWait();
  }, [startSdkWait]);

  const refreshSignedIn = useCallback(() => {
    const puter = getPuter();
    if (!puter) return;
    try {
      setSignedIn(puter.auth.isSignedIn());
    } catch {
      setSignedIn(null);
    }
  }, []);

  useEffect(() => {
    if (sdkStatus === "ready") refreshSignedIn();
  }, [sdkStatus, refreshSignedIn]);

  const handleScriptLoad = useCallback(() => {
    if (getPuter()) {
      setSdkStatus("ready");
    } else {
      setSdkStatus("failed");
    }
  }, []);

  const handleSignIn = useCallback(async () => {
    const puter = getPuter();
    if (!puter) return;
    try {
      await puter.auth.signIn();
    } catch (err) {
      // Sign-in cancelled / popup blocked: the real reason, not a generic line.
      setError(puterErrorMessage(err));
      return;
    }
    refreshSignedIn();
  }, [refreshSignedIn]);

  const clearResults = useCallback(() => {
    setTextResult("");
    setImageSrc("");
    setImageFailed(false);
    setVideoSrc("");
    setVideoFailed(false);
    setCopied(false);
    setCopyFailed(false);
  }, []);

  const generate = useCallback(async () => {
    const puter = getPuter();
    if (!puter) {
      setSdkStatus("failed");
      return;
    }
    const trimmed = prompt.trim();
    if (!trimmed) {
      setValidation("Describe what you want first.");
      return;
    }
    setValidation("");
    setError("");
    clearResults();
    setBusy(true);
    try {
      if (mode === "text") {
        const response = await puter.ai.chat(trimmed, { normalize: true });
        const text = extractChatText(response);
        if (!text) {
          setError("Puter returned an empty reply. Try again with a different prompt.");
        } else {
          setTextResult(text);
        }
      } else if (mode === "image") {
        const image = await puter.ai.txt2img(trimmed);
        if (!image?.src) {
          setError("Puter returned an image with no address. Try again.");
        } else {
          setImageSrc(image.src);
        }
      } else {
        const video = await puter.ai.txt2vid(trimmed, { seconds: VIDEO_SECONDS, size: VIDEO_SIZE });
        if (!video?.src) {
          setError("Puter returned a clip with no address. Try again.");
        } else {
          setVideoSrc(video.src);
        }
      }
    } catch (err) {
      setError(puterErrorMessage(err));
    } finally {
      setBusy(false);
      refreshSignedIn();
    }
  }, [mode, prompt, clearResults, refreshSignedIn]);

  const copyText = useCallback(async () => {
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(textResult);
      setCopied(true);
    } catch {
      setCopyFailed(true);
    }
  }, [textResult]);

  const copy = MODE_COPY[mode];
  const showSignIn = sdkStatus === "ready" && signedIn === false;

  return (
    <div>
      <Script
        key={loadAttempt}
        src="https://js.puter.com/v2/"
        strategy="afterInteractive"
        onLoad={handleScriptLoad}
        onError={() => setSdkStatus("failed")}
      />

      {sdkStatus === "failed" ? (
        <div role="alert" className="rounded-2xl border border-white/10 bg-[#1C1C1A] p-5">
          <p className="text-[15px] leading-relaxed text-[#FFFFEB]/80">
            Puter.js could not be loaded — check your connection and try again.
          </p>
          <button
            type="button"
            onClick={retryLoad}
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/25 px-5 py-2.5 font-sora text-[14px] font-semibold text-[#FFFFEB]"
          >
            Try loading again
          </button>
        </div>
      ) : (
        <>
          <div role="group" aria-label="What to generate" className="flex gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={mode === m.id}
                onClick={() => {
                  setMode(m.id);
                  setError("");
                  setValidation("");
                }}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-sora text-[14px] font-semibold ${
                  mode === m.id ? "bg-[#34D399] text-[#0B1512]" : "border border-white/25 text-[#FFFFEB]"
                }`}
              >
                {m.id === "text" ? (
                  <Keyboard className="h-4 w-4" aria-hidden />
                ) : m.id === "image" ? (
                  <ImageIcon className="h-4 w-4" aria-hidden />
                ) : (
                  <Film className="h-4 w-4" aria-hidden />
                )}
                {m.label}
              </button>
            ))}
          </div>

          {mode === "video" ? (
            <p className="mt-4 text-[14px] leading-relaxed text-[#FFFFEB]/70">
              Video uses much more of your Puter allowance than text or images, and takes longer — usually tens
              of seconds to a few minutes for a {VIDEO_SECONDS}-second clip. Keep each prompt short and
              only generate the clips you need.
            </p>
          ) : null}

          {showSignIn ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-[#1C1C1A] p-5">
              <p className="text-[15px] leading-relaxed text-[#FFFFEB]/80">
                You are not signed in to Puter yet. Generation uses your own free Puter account and its
                allowance — Captionit charges nothing.
              </p>
              <button
                type="button"
                onClick={handleSignIn}
                className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#34D399] px-6 py-3 font-sora text-[14px] font-bold text-[#0B1512]"
              >
                Sign in with Puter
              </button>
              <p className="mt-3 text-[13px] leading-relaxed text-[#FFFFEB]/60">
                Or just press Generate below — Puter will ask you to sign in then.
              </p>
            </div>
          ) : null}

          <div className="mt-6">
            <label htmlFor="ai-generator-prompt" className="font-sora text-[15px] font-bold">
              {copy.label}
            </label>
            <textarea
              id="ai-generator-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={copy.placeholder}
              rows={4}
              className="mt-2 w-full rounded-2xl border border-white/15 bg-[#1C1C1A] p-4 text-[15px] leading-relaxed text-[#FFFFEB] placeholder:text-[#FFFFEB]/40"
            />
            {validation ? (
              <p role="alert" className="mt-2 text-[14px] text-[#FFA946]">
                {validation}
              </p>
            ) : null}
            <button
              type="button"
              onClick={generate}
              disabled={busy || sdkStatus !== "ready"}
              className="mt-4 inline-flex items-center justify-center rounded-full bg-[#34D399] px-6 py-3 font-sora text-[14px] font-bold text-[#0B1512] disabled:opacity-50"
            >
              {busy ? copy.waiting : copy.button}
            </button>
            {sdkStatus === "loading" ? (
              <p className="mt-3 text-[13px] text-[#FFFFEB]/60">Loading Puter.js…</p>
            ) : null}
          </div>

          {error ? (
            <div role="alert" className="mt-6 rounded-2xl border border-white/10 bg-[#1C1C1A] p-5">
              <p className="text-[15px] leading-relaxed text-[#FFFFEB]/80">{error}</p>
              <button
                type="button"
                onClick={generate}
                disabled={busy || sdkStatus !== "ready"}
                className="mt-4 inline-flex items-center justify-center rounded-full border border-white/25 px-5 py-2.5 font-sora text-[14px] font-semibold text-[#FFFFEB] disabled:opacity-50"
              >
                Try again
              </button>
            </div>
          ) : null}

          {mode === "text" && textResult ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-[#1C1C1A] p-5">
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-[#FFFFEB]/85">{textResult}</p>
              <button
                type="button"
                onClick={copyText}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 font-sora text-[14px] font-semibold text-[#FFFFEB]"
              >
                <Copy className="h-4 w-4" aria-hidden />
                {copied ? "Copied" : "Copy text"}
              </button>
              {copyFailed ? (
                <p role="alert" className="mt-2 text-[13px] text-[#FFA946]">
                  Copy did not work in this browser — select the text and copy it yourself.
                </p>
              ) : null}
            </div>
          ) : null}

          {mode === "image" && imageSrc ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-[#1C1C1A] p-5">
              {imageFailed ? (
                <p role="alert" className="text-[15px] leading-relaxed text-[#FFFFEB]/80">
                  The image could not be displayed here. Try generating again.
                </p>
              ) : (
                <img src={imageSrc} alt="Image generated from your prompt" className="w-full rounded-xl" onError={() => setImageFailed(true)} />
              )}
              <a
                href={imageSrc}
                download="captionit-ai-image.png"
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 font-sora text-[14px] font-semibold text-[#FFFFEB]"
              >
                <Download className="h-4 w-4" aria-hidden />
                Download image
              </a>
              <p className="mt-3 text-[13px] leading-relaxed text-[#FFFFEB]/60">
                If the download does not start, the link opens the image in a new tab instead — save it from there.
              </p>
            </div>
          ) : null}

          {mode === "video" && videoSrc ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-[#1C1C1A] p-5">
              {videoFailed ? (
                <div>
                  <p role="alert" className="text-[15px] leading-relaxed text-[#FFFFEB]/80">
                    The clip could not be played on this page — its address was blocked or could not be reached.
                    The clip itself may still be fine: open it directly, or generate again.
                  </p>
                  <a
                    href={videoSrc}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 font-sora text-[14px] font-semibold text-[#FFFFEB]"
                  >
                    <Film className="h-4 w-4" aria-hidden />
                    Open clip in a new tab
                  </a>
                </div>
              ) : (
                <video
                  src={videoSrc}
                  controls
                  preload="metadata"
                  playsInline
                  className="w-full rounded-xl"
                  onError={() => setVideoFailed(true)}
                />
              )}
              <a
                href={videoSrc}
                download="captionit-ai-video.mp4"
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 font-sora text-[14px] font-semibold text-[#FFFFEB]"
              >
                <Download className="h-4 w-4" aria-hidden />
                Download video
              </a>
              <p className="mt-3 text-[13px] leading-relaxed text-[#FFFFEB]/60">
                If the download does not start, the link opens the clip in a new tab instead — save it from there.
                Provider clip links are temporary, so download the ones you want to keep.
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
