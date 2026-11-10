"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CaptionDoc } from "@capseasy/shared";
import { clampClipRange, createClipProject, fmtClipRange, rankClipProposals } from "@/features/clipper/clipper";
import { detectSilences } from "@/features/clipper/analysis";
import { useSceneAnalysis } from "@/features/clipper/useSceneAnalysis";
import { ClipExplanation } from "@/features/clipper/ClipExplanation";
import { PEAKS_PER_SECOND } from "../useWaveform";
import { DEFAULT_CROP_WINDOW, needsVerticalReframe, type CropWindow } from "@/features/clipper/reframe";
import { Button, Section } from "../controls";
import { ClipTitleControl, ReframeControl, useClipTitleDeps, type ClipTitleState } from "./ClipCreateControls";

interface Props {
  projectId: string;
  sourceTitle: string;
  sourceVideoId: string | null;
  /** the SOURCE video's full duration (not a clip project's clamped duration) */
  mediaDurationMs: number;
  doc: CaptionDoc;
  /** waveform peaks for the source video (useWaveform pipeline), when decoded */
  peaks?: Float32Array | null;
  /** playable source-video URL, for on-device frame-difference scene sampling */
  videoUrl?: string | null;
  /** Phase 5 (5.4): the source video's real dimensions + playable URL, for the 9:16 crop window */
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  sourceUrl?: string | null;
}

/**
 * Clipper: turn this transcribed long video into short captioned clips. Proposals are
 * segment suggestions measured on-device by deterministic checks — transcript gaps,
 * audio-energy silence from the waveform peaks, and frame-difference scene changes —
 * sized 15–60s, edges always on word boundaries, never a black box. Each suggestion
 * shows the measured signals behind its order (A7); there is no score. Adjust a
 * proposal's edges, then Create clip makes a normal caption project for just that
 * segment and opens it in the studio.
 */
export const ClipperPanel: React.FC<Props> = ({ projectId, sourceTitle, sourceVideoId, mediaDurationMs, doc, peaks, videoUrl, sourceWidth = null, sourceHeight = null, sourceUrl = null }) => {
  const router = useRouter();
  const scene = useSceneAnalysis(sourceVideoId, videoUrl, mediaDurationMs);
  const silences = useMemo(
    () => (peaks ? detectSilences(peaks, 1000 / PEAKS_PER_SECOND) : []),
    [peaks],
  );
  const proposals = useMemo(
    () => rankClipProposals(doc.words.filter((w) => !w.hidden), { silences, sceneCuts: scene.cuts }),
    [doc, silences, scene.cuts],
  );
  // Per-proposal user state is keyed by the proposal's own range (the same identity the
  // article's React key uses), NOT by list position: when scene analysis lands, proposals
  // re-rank, and index-keyed edits silently attached themselves to different clips.
  const keyOf = (p: (typeof proposals)[number]) => `${p.startMs}-${p.endMs}`;
  const [edits, setEdits] = useState<Record<string, { startMs: number; endMs: number }>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Phase 5 (5.4): per-proposal crop windows + generated titles, keyed like `edits`.
  // Reframing defaults ON (centred window) exactly when the source is wider than 9:16;
  // the user can position the window or switch it off per clip.
  const canReframe = needsVerticalReframe(sourceWidth, sourceHeight);
  const [reframeOff, setReframeOff] = useState<Record<string, boolean>>({});
  const [windows, setWindows] = useState<Record<string, CropWindow>>({});
  const [titles, setTitles] = useState<Record<string, ClipTitleState | null>>({});
  const titleDeps = useClipTitleDeps();

  if (doc.words.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <Section title="Clipper" hint="Clip suggestions appear here once this video has captions.">
          <p className="text-sm text-st-muted">No captions yet — transcribe the video first, then come back.</p>
        </Section>
      </div>
    );
  }

  const rangeOf = (p: (typeof proposals)[number]) => edits[keyOf(p)] ?? { startMs: p.startMs, endMs: p.endMs };
  const setRange = (p: (typeof proposals)[number], patch: Partial<{ startMs: number; endMs: number }>) =>
    setEdits((prev) => ({ ...prev, [keyOf(p)]: clampClipRange({ ...rangeOf(p), ...patch }, mediaDurationMs) }));

  const create = async (p: (typeof proposals)[number]) => {
    const k = keyOf(p);
    const range = clampClipRange(rangeOf(p), mediaDurationMs);
    setBusyKey(k);
    setError(null);
    try {
      const { projectId: newId } = await createClipProject({
        sourceProjectId: projectId,
        sourceTitle,
        sourceVideoId,
        doc,
        startMs: range.startMs,
        endMs: range.endMs,
        // a generated title the user confirmed (blank text = never mind, plain range title)
        title: titles[k]?.text.trim() ? titles[k]!.text : undefined,
        // the chosen crop window, only when reframing is on for this clip
        reframeWindow: canReframe && !reframeOff[k] ? (windows[k] ?? DEFAULT_CROP_WINDOW) : undefined,
      });
      router.push(`/projects/${newId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the clip. Try again.");
      setBusyKey(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <Section
        title="Clipper"
        hint="Clips suggested from your transcript, silences and scene changes — measured on your device."
        more="Clips are ordered by the signals on each clip; no score is assigned. Adjust the edges, then create a clip: it becomes its own caption project, and your source video is not cut."
      >
        <p className="mb-3 text-xs text-st-faint">
          Analysis on this video: {peaks ? `${silences.length} silence span${silences.length === 1 ? "" : "s"} measured from the audio` : "audio silence not measured yet (waveform still loading)"}
          {" · "}
          {scene.state === "ready" ? `${scene.cuts.length} scene change${scene.cuts.length === 1 ? "" : "s"} measured from frame differences` : "scene changes still being measured — ordering uses the signals available so far"}.
        </p>
        {proposals.length === 0 ? (
          <p className="text-sm text-st-muted">No speech segments found in these captions yet.</p>
        ) : (
          <div className="space-y-3">
            {proposals.map((p, i) => {
              const k = keyOf(p);
              const range = rangeOf(p);
              return (
                <article key={k} className="rounded-xl border border-st-line bg-st-raised/50 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-st-text">
                      <span className="mr-2 text-st-faint">#{p.rank}</span>
                      {fmtClipRange(range.startMs, range.endMs)}
                    </span>
                    <span className="text-xs tabular-nums text-st-faint">
                      {Math.round((range.endMs - range.startMs) / 1000)}s · {p.wordCount} words
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-st-muted">&ldquo;{p.text}&hellip;&rdquo;</p>
                  <ClipExplanation signals={p.signals} explanation={p.explanation} />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-st-faint">Start (seconds)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={Math.round(range.startMs / 100) / 10}
                        onChange={(e) => setRange(p, { startMs: Number(e.target.value) * 1000 })}
                        className="w-full rounded-lg border border-st-line bg-st-panel px-2 py-1.5 text-sm tabular-nums outline-none focus:border-st-ink/40"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-st-faint">End (seconds)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={Math.round(range.endMs / 100) / 10}
                        onChange={(e) => setRange(p, { endMs: Number(e.target.value) * 1000 })}
                        className="w-full rounded-lg border border-st-line bg-st-panel px-2 py-1.5 text-sm tabular-nums outline-none focus:border-st-ink/40"
                      />
                    </label>
                  </div>
                  <input
                    type="range"
                    aria-label={`Adjust start of clip ${i + 1}`}
                    min={0}
                    max={Math.max(1, Math.round(mediaDurationMs / 1000))}
                    step={1}
                    value={Math.round(range.startMs / 1000)}
                    onChange={(e) => setRange(p, { startMs: Number(e.target.value) * 1000 })}
                    className="mt-2 w-full"
                  />
                  {canReframe && sourceWidth && sourceHeight ? (
                    <ReframeControl
                      sourceUrl={sourceUrl}
                      sourceWidth={sourceWidth}
                      sourceHeight={sourceHeight}
                      startMs={range.startMs}
                      enabled={!reframeOff[k]}
                      onEnabledChange={(on) => setReframeOff((prev) => ({ ...prev, [k]: !on }))}
                      window={windows[k] ?? DEFAULT_CROP_WINDOW}
                      onWindowChange={(win) => setWindows((prev) => ({ ...prev, [k]: win }))}
                    />
                  ) : null}
                  <ClipTitleControl
                    sourceTitle={sourceTitle}
                    segmentText={p.text}
                    startMs={range.startMs}
                    endMs={range.endMs}
                    deps={titleDeps}
                    state={titles[k] ?? null}
                    onState={(next) => setTitles((prev) => ({ ...prev, [k]: next }))}
                  />
                  <Button tone="primary" disabled={busyKey !== null} onClick={() => void create(p)} className="mt-2 w-full">
                    {busyKey === k ? "Creating clip…" : "Create clip"}
                  </Button>
                </article>
              );
            })}
          </div>
        )}
        {error ? <p role="alert" className="mt-3 rounded-lg border border-st-or/60 bg-st-or/15 px-3 py-2 text-sm text-st-text">{error}</p> : null}
      </Section>
    </div>
  );
};
