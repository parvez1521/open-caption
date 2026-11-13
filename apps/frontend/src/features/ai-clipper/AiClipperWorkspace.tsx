"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useStudio } from "@/features/studio/useStudio";
import { useDeviceVideo } from "@/features/upload/useDeviceVideo";
import { useWaveform, PEAKS_PER_SECOND } from "@/features/studio/useWaveform";
import { detectSilences } from "@/features/clipper/analysis";
import { useSceneAnalysis } from "@/features/clipper/useSceneAnalysis";
import { createClipProject, fmtClipRange } from "@/features/clipper/clipper";
import { ClipScoreBlock } from "@/features/clipper/ClipScoreBlock";
import { runHighlightEngine } from "@/features/clipper/highlights/engine";
import { resolveHighlightRunner } from "@/features/clipper/highlights/adapter";
import { CONTENT_TYPE_RUBRICS } from "@/features/clipper/highlights/rubrics";
import type { ContentTypeId, HighlightClip, HighlightSource } from "@/features/clipper/highlights/types";
import { fetchClipAiStatus, runClipCloudModel } from "@/features/clipper/highlightAi";
import { onModelState, runLocalModel } from "@/features/create/localModel";
import { deleteClipperRun, getClipperRun, saveClipperRun, type ClipperRunCheckpoint } from "@/features/upload/localVideos";
import {
  isResumable,
  newRunCheckpoint,
  resumeSeeds,
  withCancelledCheckpoint,
  withFinishedCheckpoint,
  withWindowCheckpoint,
} from "./checkpoints";
import { runRerankCalibration } from "./rerank";

const DURATION_PRESETS: Record<string, { min: number; max: number }> = {
  "15-30": { min: 15, max: 30 },
  "30-60": { min: 30, max: 60 },
  "60-90": { min: 60, max: 90 },
};

type Phase = "idle" | "running" | "done" | "cancelled";

/**
 * AI Clipper — a separate section from the Clipper panel (/clipper). Same
 * shipped highlight engine, one workflow: pick a captioned project, run the
 * clipper, get ranked clips. Slice 1 on top of the engine: cross-window
 * rerank calibration (one extra free Groq call), durable runs (IndexedDB
 * checkpoints with resume), and a real Cancel button.
 *
 * Honest states only: progress comes from the engine's real stage events,
 * scores stay labelled "Editorial score — estimate", and a cancelled run
 * never looks finished. Uploading and transcription still happen in the
 * Studio — this section never takes a link or a file.
 */
export const AiClipperWorkspace: React.FC<{ projectId: string }> = ({ projectId }) => {
  const s = useStudio(projectId);
  const { data } = s;
  const device = useDeviceVideo(data?.video ?? null);
  const video = device.video;
  const wave = useWaveform(video?.id, video?.url, video?.size);
  const scene = useSceneAnalysis(data?.video?.id ?? null, video?.url ?? null, data?.video?.durationMs ?? 0);
  const silences = useMemo(() => (wave.peaks ? detectSilences(wave.peaks, 1000 / PEAKS_PER_SECOND) : []), [wave.peaks]);
  const visibleWords = useMemo(() => (s.doc ? s.doc.words.filter((w) => !w.hidden) : []), [s.doc]);
  const analysis = useMemo(() => ({ silences, sceneCuts: scene.cuts ?? undefined }), [silences, scene.cuts]);

  const [clipAiOn, setClipAiOn] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetchClipAiStatus().then((st) => {
      if (alive) setClipAiOn(!!st?.configured);
    });
    const off = onModelState((st) => setModelReady(st.status === "ready"));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const [contentType, setContentType] = useState<ContentTypeId>("general");
  const [clipCount, setClipCount] = useState(5);
  const [durChoice, setDurChoice] = useState("30-60");
  const [phase, setPhase] = useState<Phase>("idle");
  const [cancelling, setCancelling] = useState(false);
  const [stageText, setStageText] = useState("");
  const [clips, setClips] = useState<HighlightClip[]>([]);
  const [source, setSource] = useState<HighlightSource>("signals");
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [interrupted, setInterrupted] = useState<ClipperRunCheckpoint | null>(null);
  const [previous, setPrevious] = useState<ClipperRunCheckpoint | null>(null);
  const [created, setCreated] = useState<Record<string, string>>({});
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recordRef = useRef<ClipperRunCheckpoint | null>(null);

  useEffect(() => {
    let alive = true;
    setInterrupted(null);
    setPrevious(null);
    setClips([]);
    setNotes([]);
    setPhase("idle");
    void getClipperRun(projectId).then((record) => {
      if (!alive || !record) return;
      if (record.status === "done" && record.clips.length > 0) setPrevious(record);
      else if (isResumable(record)) setInterrupted(record);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  if (s.query.isLoading) return <p className="text-sm text-[#FFFFEB]/70">Loading the project…</p>;
  if (!data) return <p className="text-sm text-[#FFFFEB]/70">This project could not be found.</p>;
  if (!data.video) {
    return (
      <div className="text-sm text-[#FFFFEB]/70">
        <p>This project has no video yet.</p>
        <Link href={`/projects/${projectId}`} className="mt-2 inline-block font-semibold text-[#FFFFEB] underline decoration-[#34D399] decoration-2 underline-offset-4">
          Open the project to add one
        </Link>
      </div>
    );
  }
  if (!s.doc) {
    return (
      <div className="text-sm text-[#FFFFEB]/70">
        <p>No captions yet. Clips are ranked from the transcript. So this video needs its captions first.</p>
        <Link href={`/projects/${projectId}`} className="mt-2 inline-block font-semibold text-[#FFFFEB] underline decoration-[#34D399] decoration-2 underline-offset-4">
          Open the project to caption it
        </Link>
      </div>
    );
  }

  const resolveRunner = () =>
    resolveHighlightRunner({
      runClipCloud: clipAiOn ? runClipCloudModel : undefined,
      modelEnabled: modelReady,
      runModel: runLocalModel,
    });

  const startRun = async (resumeFrom?: ClipperRunCheckpoint | null) => {
    const dur = DURATION_PRESETS[durChoice]!;
    const request = {
      contentType,
      clipCount,
      minSec: dur.min,
      maxSec: dur.max,
      aspect: "9:16" as const,
    };
    const controller = new AbortController();
    abortRef.current = controller;
    recordRef.current = resumeFrom ?? newRunCheckpoint(projectId, 0);
    setPhase("running");
    setCancelling(false);
    setError(null);
    setNotes([]);
    setClips([]);
    setInterrupted(null);
    setStageText(resumeFrom ? `Resuming at section ${resumeFrom.windowsDone + 1}` : "Reading the transcript");
    try {
      const resolved = resolveRunner();
      const result = await runHighlightEngine({
        words: visibleWords,
        analysis,
        peaks: wave.peaks ?? null,
        hopMs: 1000 / PEAKS_PER_SECOND,
        request,
        runner: resolved?.runner ?? null,
        runnerSource: resolved?.source ?? null,
        concurrency: resolved?.concurrency,
        seedWindows: resumeFrom ? resumeSeeds(resumeFrom) : undefined,
        signal: controller.signal,
        onStage: (event) => {
          if (event.type === "windows") {
            const record = recordRef.current;
            if (record && record.windowsTotal === 0) {
              recordRef.current = {
                ...record,
                windowsTotal: event.total,
                seedWindows: Array.from({ length: event.total }, (_, i) => record.seedWindows[i] ?? null),
              };
            }
            setStageText(`${event.total} section${event.total === 1 ? "" : "s"} to read`);
          }
          if (event.type === "window-done") setStageText(`Section ${event.done} of ${event.total}`);
          if (event.type === "postprocess") setStageText(`${event.rawCandidates} candidates found`);
          if (event.type === "ranking") setStageText("Ranking clips");
        },
        onWindowCandidates: (wi, candidates) => {
          const record = recordRef.current;
          if (!record) return;
          recordRef.current = withWindowCheckpoint(record, wi, candidates);
          void saveClipperRun(recordRef.current);
        },
      });
      const allNotes = [...result.notes];
      let finalClips = result.clips;
      // Slice 1 rerank: one extra call on the same free route, comparing all
      // candidates across windows. Skipped for signals-only runs (no model
      // scores to calibrate) and for a single clip (nothing to compare).
      if (resolved && result.source !== "signals") {
        setStageText("Re-ranking clips against each other");
        const reranked = await runRerankCalibration({
          clips: result.clips,
          contentType,
          runner: resolved.runner,
          signal: controller.signal,
        });
        finalClips = reranked.clips;
        allNotes.push(reranked.note);
      }
      const record = recordRef.current;
      if (record) {
        recordRef.current = withFinishedCheckpoint(record, finalClips, allNotes);
        void saveClipperRun(recordRef.current);
      }
      setClips(finalClips);
      setSource(result.source);
      setNotes(allNotes);
      setPhase("done");
      setStageText("");
    } catch (e) {
      if ((e as { name?: string } | null)?.name === "AbortError") {
        const record = recordRef.current;
        if (record) {
          recordRef.current = withCancelledCheckpoint(record);
          void saveClipperRun(recordRef.current);
          setInterrupted(recordRef.current);
        }
        setPhase("cancelled");
        setStageText("");
        setClips([]);
      } else {
        setError(e instanceof Error ? e.message : "Finding clips didn't work. Try again.");
        setPhase("idle");
        setStageText("");
      }
    } finally {
      setCancelling(false);
      abortRef.current = null;
    }
  };

  const cancelRun = () => {
    setCancelling(true);
    abortRef.current?.abort();
  };

  const startOver = async () => {
    await deleteClipperRun(projectId);
    setInterrupted(null);
    setPrevious(null);
    setClips([]);
    setNotes([]);
    setPhase("idle");
    await startRun(null);
  };

  const createClip = async (clip: HighlightClip) => {
    if (!s.doc || !data) return;
    setCreatingId(clip.id);
    try {
      const made = await createClipProject({
        sourceProjectId: projectId,
        sourceTitle: data.project.title,
        sourceVideoId: data.video?.id ?? null,
        doc: s.doc,
        startMs: clip.startMs,
        endMs: clip.endMs,
        title: clip.title || undefined,
        aspect: "9:16",
      });
      setCreated((prev) => ({ ...prev, [clip.id]: made.projectId }));
    } catch {
      setError("Creating that clip didn't work. Try again.");
    } finally {
      setCreatingId(null);
    }
  };

  const selectClass = "rounded-lg border border-[#FFFFEB]/15 bg-[#232320] px-3 py-2 text-sm text-[#FFFFEB]";

  return (
    <div className="space-y-6">
      {interrupted ? (
        <div className="rounded-xl border border-[#FFA946]/60 bg-[#FFA946]/10 px-4 py-3">
          <p className="text-sm font-semibold text-[#FFFFEB]">
            Run interrupted at section {interrupted.windowsDone} of {interrupted.windowsTotal}.
          </p>
          <p className="mt-1 text-[13px] text-[#FFFFEB]/70">Resume picks up where it stopped. Finished sections are not read again.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void startRun(interrupted)} className="rounded-full bg-[#34D399] px-4 py-2 text-sm font-bold text-[#141412]">
              Resume run
            </button>
            <button type="button" onClick={() => void startOver()} className="rounded-full border border-[#FFFFEB]/20 px-4 py-2 text-sm font-semibold text-[#FFFFEB]">
              Start over
            </button>
          </div>
        </div>
      ) : null}
      {previous && phase === "idle" ? (
        <div className="rounded-xl border border-[#FFFFEB]/10 bg-[#1C1C1A] px-4 py-3">
          <p className="text-sm text-[#FFFFEB]/80">
            Previous run finished with {previous.clips.length} clip{previous.clips.length === 1 ? "" : "s"}.
          </p>
          <button
            type="button"
            onClick={() => {
              setClips(previous.clips);
              setNotes(previous.notes);
              setPhase("done");
              setPrevious(null);
            }}
            className="mt-2 rounded-full border border-[#FFFFEB]/20 px-4 py-2 text-sm font-semibold text-[#FFFFEB]"
          >
            Show those clips
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#FFFFEB]/60">
          Video type
          <select aria-label="Video type" value={contentType} onChange={(e) => setContentType(e.target.value as ContentTypeId)} className={selectClass} disabled={phase === "running"}>
            {CONTENT_TYPE_RUBRICS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#FFFFEB]/60">
          Clips
          <select aria-label="Clips" value={clipCount} onChange={(e) => setClipCount(Number(e.target.value))} className={selectClass} disabled={phase === "running"}>
            {[3, 5, 10].map((n) => (
              <option key={n} value={n}>
                {n} clips
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-[#FFFFEB]/60">
          Length
          <select aria-label="Length" value={durChoice} onChange={(e) => setDurChoice(e.target.value)} className={selectClass} disabled={phase === "running"}>
            <option value="15-30">15–30 seconds</option>
            <option value="30-60">30–60 seconds</option>
            <option value="60-90">60–90 seconds</option>
          </select>
        </label>
        {phase === "running" ? (
          <button type="button" onClick={cancelRun} disabled={cancelling} className="rounded-full border border-[#FFA946] px-5 py-2.5 text-sm font-bold text-[#FFA946] disabled:opacity-50">
            {cancelling ? "Cancelling…" : "Cancel run"}
          </button>
        ) : (
          <button type="button" onClick={() => void startRun(null)} className="rounded-full bg-[#34D399] px-5 py-2.5 text-sm font-bold text-[#141412]">
            Find clips
          </button>
        )}
      </div>

      {phase === "running" ? (
        <p role="status" className="text-sm text-[#FFFFEB]/80">
          {stageText || "Finding clips…"}
        </p>
      ) : null}
      {phase === "cancelled" ? (
        <p role="status" className="text-sm text-[#FFFFEB]/80">
          Run cancelled — nothing here is a finished result. Resume or start over above.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-[#FFA946]">
          {error}
        </p>
      ) : null}

      {phase === "done" ? (
        <div>
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-[#FFFFEB]/60">
            Ranked clips{clips.some((c) => c.calibrated) ? " · re-ranked across sections" : ""}
          </h2>
          {clips.length === 0 ? (
            <p className="mt-3 text-sm text-[#FFFFEB]/70">No moments in this video stand on their own as clips.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {clips.map((clip) => (
                <li key={clip.id} className="rounded-xl border border-[#FFFFEB]/10 bg-[#1C1C1A] px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-[#FFFFEB]">
                      {clip.rank}. {clip.title || "Untitled clip"}
                    </p>
                    <span className="font-mono text-[12px] text-[#FFFFEB]/60">{fmtClipRange(clip.startMs, clip.endMs)}</span>
                  </div>
                  <ClipScoreBlock clip={clip} source={source} />
                  {created[clip.id] ? (
                    <Link href={`/projects/${created[clip.id]}`} className="mt-3 inline-block text-sm font-semibold text-[#34D399] underline underline-offset-4">
                      Open the clip project
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void createClip(clip)}
                      disabled={creatingId === clip.id}
                      className="mt-3 rounded-full bg-[#FFFFEB] px-4 py-2 text-sm font-bold text-[#141412] disabled:opacity-50"
                    >
                      {creatingId === clip.id ? "Creating…" : "Create clip"}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
          {notes.length > 0 ? (
            <ul className="mt-4 space-y-1">
              {notes.map((n, i) => (
                <li key={i} className="text-[13px] text-[#FFFFEB]/60">
                  {n}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
