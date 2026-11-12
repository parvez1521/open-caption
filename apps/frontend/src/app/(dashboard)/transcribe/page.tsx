"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { fmtSrtTime } from "@motion-ai/caption-engine/core";
import type { Page, Word } from "@capseasy/shared";
import StudioShell from "@/components/studio/StudioShell";
import { CaptionProgress } from "@/components/brand/CaptionProgress";
import { Check, Copy, Film, Upload } from "@/components/ui/icons";
import { uploadLimitLabel } from "@/lib/billing/pricingDisplay";
import { canTranscribeInBrowser, preloadSpeechModel } from "@/features/transcribe/browserWhisper";
import { SHIPPED_LANGUAGES, likelySpeechLanguage, saveSpeechLanguage, savedSpeechLanguage, type SpeechLanguage } from "@/features/transcribe/runtime";
import {
  STAGE_LABELS,
  TRANSCRIBE_ACCEPT,
  TRANSCRIBE_LIMITS,
  buildTranscriptDownloads,
  pageText,
  probeMediaFile,
  runStandaloneTranscribe,
  transcriptPlainText,
  validateTranscribeFile,
  wordsToTranscriptPages,
  type StandaloneRun,
  type StandaloneStage,
} from "@/features/transcribe/standalone";

/**
 * Standalone Transcribe — upload a file and get its transcript.
 * No Studio project is created and nothing is uploaded: the speech model runs in this browser.
 * Guest-friendly by construction: this page never asks who the user is (the
 * dashboard layout boots a guest session for signed-out visitors, same as
 * the Studio's guest doors).
 */

type Phase = "idle" | "ready" | "running" | "done" | "error";

const fmtClock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TranscribePage() {
  const [file, setFile] = useState<File | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [language, setLanguage] = useState<SpeechLanguage>("en");
  // The choice is explicit only when the user picked it before (saved) or picks it now: a browser
  // guess is never treated as a choice, so a guessed English keeps Whisper auto-detect — the same
  // rule the Studio session uses. Guess after mount only: the server renders "en", so a mount-time
  // guess can never cause a hydration mismatch.
  const [languageExplicit, setLanguageExplicit] = useState(false);
  useEffect(() => {
    const saved = savedSpeechLanguage();
    setLanguage(saved ?? likelySpeechLanguage());
    setLanguageExplicit(saved !== null);
  }, []);
  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState<{ stage: StandaloneStage; progress: number; device?: string } | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const runRef = useRef<StandaloneRun | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The model downloads once into this browser's cache; start it early so the
  // Transcribe tap doesn't wait on the download.
  useEffect(() => {
    if (canTranscribeInBrowser()) preloadSpeechModel(false, language);
  }, [language]);

  const pick = useCallback(async (f: File) => {
    const problem = validateTranscribeFile(f);
    if (problem) {
      setError(problem);
      setPhase("error");
      return;
    }
    setFile(f);
    setWords([]);
    setError(null);
    setPhase("idle");
    try {
      const probed = await probeMediaFile(f);
      setDurationMs(probed.durationMs);
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't read this file.");
      setPhase("error");
    }
  }, []);

  const transcribe = useCallback(async () => {
    if (!file || phase === "running") return;
    if (!canTranscribeInBrowser()) {
      setError("This browser can't run transcription (it needs Web Workers and WebAssembly).");
      setPhase("error");
      return;
    }
    setError(null);
    setWords([]);
    setStage({ stage: "download", progress: 0 });
    setPhase("running");
    const run = runStandaloneTranscribe(
      file,
      language,
      {
        onStatus: (s, progress, device) => setStage({ stage: s, progress, device }),
        onPartial: (w) => setWords(w),
      },
      { explicitLanguage: languageExplicit },
    );
    runRef.current = run;
    try {
      const result = await run.promise;
      setWords(result.words);
      setDurationMs(result.durationMs);
      setPhase("done");
    } catch (e) {
      if ((e as { code?: string }).code === "ABORTED") {
        setPhase(file ? "ready" : "idle");
        setStage(null);
        return;
      }
      setError(e instanceof Error ? e.message : "Transcription failed. Try again.");
      setPhase("error");
    } finally {
      runRef.current = null;
    }
  }, [file, language, languageExplicit, phase]);

  const cancel = useCallback(() => {
    runRef.current?.cancel();
  }, []);

  const reset = useCallback(() => {
    runRef.current?.cancel();
    setFile(null);
    setWords([]);
    setError(null);
    setStage(null);
    setPhase("idle");
  }, []);

  const pages: Page[] = words.length ? wordsToTranscriptPages(words) : [];
  const baseName = file ? file.name.replace(/\.[^.]+$/, "") : "transcript";
  const downloads = phase === "done" ? buildTranscriptDownloads(words) : null;

  const copyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(transcriptPlainText(pages));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy didn't work in this browser — use a download instead.");
    }
  }, [pages]);

  const running = phase === "running";
  const progress = stage ? Math.round(stage.progress * 100) : 0;

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-5xl mx-auto">
        <div className="pb-8 border-b border-sand-200">
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink">Transcribe</h1>
          <p className="mt-2 text-[14px] text-sand-800 max-w-2xl">Upload a file. Get its transcript.</p>
        </div>

        <div className="py-8 space-y-6">
          {phase !== "done" && (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void pick(f);
                }}
                className={`rounded-2xl border border-dashed px-6 py-10 text-center ${
                  dragOver ? "border-[#34D399] bg-[#34D399]/10" : "border-sand-300 bg-[#1C1C1A]"
                }`}
              >
                <Film className="mx-auto h-8 w-8 text-sand-600" aria-hidden />
                {file ? (
                  <div className="mt-4">
                    <p className="text-[15px] font-semibold text-ink break-all">{file.name}</p>
                    <p className="mt-1 text-[13px] text-sand-600">
                      {durationMs > 0 ? `${fmtClock(durationMs)} · ` : ""}
                      {(file.size / (1024 * 1024)).toFixed(1)} MB
                    </p>
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="mt-3 text-[13px] font-semibold text-[#34D399] underline underline-offset-4"
                    >
                      Choose a different file
                    </button>
                  </div>
                ) : (
                  <div className="mt-4">
                    <p className="text-[15px] font-semibold text-ink">Drop a video or audio file here</p>
                    <p className="mt-1 text-[13px] text-sand-600">
                      MP4, MOV, WebM, MKV, MP3, M4A, WAV, OGG · up to {Math.round(TRANSCRIBE_LIMITS.maxDurationSec / 60)} min ·{" "}
                      {uploadLimitLabel(TRANSCRIBE_LIMITS.maxBytes)} max
                    </p>
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#34D399] px-5 py-2.5 text-[14px] font-bold text-[#141412]"
                    >
                      <Upload className="h-4 w-4" aria-hidden /> Choose a file
                    </button>
                  </div>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept={TRANSCRIBE_ACCEPT}
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void pick(f);
                    e.target.value = "";
                  }}
                />
              </div>

              <div>
                <label htmlFor="transcribe-language" className="block text-[13px] font-semibold text-ink">
                  What&apos;s spoken in the file?
                </label>
                <select
                  id="transcribe-language"
                  value={language}
                  disabled={running}
                  onChange={(e) => {
                    const l = e.target.value as SpeechLanguage;
                    setLanguage(l);
                    setLanguageExplicit(true);
                    saveSpeechLanguage(l);
                  }}
                  className="mt-2 w-full max-w-sm rounded-xl border border-sand-300 bg-[#1C1C1A] px-3 py-2.5 text-[14px] text-ink"
                >
                  {SHIPPED_LANGUAGES.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.choiceLabel}
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <p role="alert" className="rounded-xl border border-[#E5484D]/40 bg-[#E5484D]/10 px-4 py-3 text-[14px] text-ink">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void transcribe()}
                  disabled={!file || phase !== "ready" || running}
                  className="rounded-full bg-[#34D399] px-6 py-3 text-[15px] font-bold text-[#141412] disabled:opacity-40"
                >
                  Transcribe
                </button>
                {running && (
                  <button
                    type="button"
                    onClick={cancel}
                    className="rounded-full border border-sand-300 px-5 py-3 text-[14px] font-semibold text-ink"
                  >
                    Cancel
                  </button>
                )}
                {file && !running && (
                  <button type="button" onClick={reset} className="text-[13px] font-semibold text-sand-600 underline underline-offset-4">
                    Start over
                  </button>
                )}
              </div>

              {running && stage && (
                <div aria-live="polite" className="rounded-2xl border border-sand-200 bg-[#1C1C1A] px-5 py-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[14px] font-semibold text-ink">
                      {STAGE_LABELS[stage.stage]}
                      {stage.device ? <span className="ml-2 font-normal text-sand-600">on {stage.device}</span> : null}
                    </p>
                    <p className="font-mono text-[13px] text-sand-600">{progress}%</p>
                  </div>
                  <CaptionProgress className="mt-3" percent={progress} trackClassName="bg-[#232320]" />
                  {words.length > 0 && (
                    <p className="mt-3 text-[13px] leading-relaxed text-sand-800">
                      {transcriptPlainText(wordsToTranscriptPages(words)).slice(-220)}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {phase === "done" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[14px] text-sand-800">
                  {words.length} words · {fmtClock(durationMs)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copyAll()}
                    className="inline-flex items-center gap-2 rounded-full border border-sand-300 px-4 py-2 text-[13px] font-semibold text-ink"
                  >
                    {copied ? <Check className="h-4 w-4 text-[#34D399]" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                  {downloads &&
                    (
                      [
                        ["TXT", "text/plain", downloads.txt],
                        ["SRT", "text/plain", downloads.srt],
                        ["VTT", "text/vtt", downloads.vtt],
                      ] as const
                    ).map(([label, type, content]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => downloadFile(`${baseName}.${label.toLowerCase()}`, content, type)}
                      className="rounded-full border border-sand-300 px-4 py-2 text-[13px] font-semibold text-ink"
                    >
                      Download {label}
                    </button>
                  ))}
                  <button type="button" onClick={reset} className="rounded-full bg-[#34D399] px-4 py-2 text-[13px] font-bold text-[#141412]">
                    Transcribe another
                  </button>
                </div>
              </div>
              {pages.length === 0 ? (
                <p className="rounded-2xl border border-sand-200 bg-[#1C1C1A] px-5 py-6 text-[14px] text-sand-800">
                  No speech was found in this file.
                </p>
              ) : (
                <ol className="space-y-3">
                  {pages.map((p) => (
                    <li key={p.id} className="rounded-2xl border border-sand-200 bg-[#1C1C1A] px-5 py-4">
                      <p className="font-mono text-[12px] text-[#34D399]">{fmtSrtTime(p.startMs)}</p>
                      <p className="mt-1 text-[15px] leading-relaxed text-ink">{pageText(p)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
