"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CaptionDoc } from "@capseasy/shared";
import { proposeSegments } from "@motion-ai/caption-engine/core";
import { clampClipRange, createClipProject, fmtClipRange } from "@/features/clipper/clipper";
import { Button, Section } from "../controls";

interface Props {
  projectId: string;
  sourceTitle: string;
  sourceVideoId: string | null;
  /** the SOURCE video's full duration (not a clip project's clamped duration) */
  mediaDurationMs: number;
  doc: CaptionDoc;
}

/**
 * Clipper: turn this transcribed long video into short captioned clips. Proposals are smart
 * segment suggestions from your transcript — the speech runs between silences, sized 15–60s —
 * never a black box. Adjust a proposal's edges, then Create clip makes a normal caption project
 * for just that segment and opens it in the studio.
 */
export const ClipperPanel: React.FC<Props> = ({ projectId, sourceTitle, sourceVideoId, mediaDurationMs, doc }) => {
  const router = useRouter();
  const proposals = useMemo(() => proposeSegments(doc.words.filter((w) => !w.hidden)), [doc]);
  const [edits, setEdits] = useState<Record<number, { startMs: number; endMs: number }>>({});
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (doc.words.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <Section title="Clipper" hint="Smart segment suggestions from your transcript appear here once this video has captions. Upload and transcribe the long video first, then come back to this panel.">
          <p className="text-sm text-st-muted">No captions yet, so there are no segments to suggest.</p>
        </Section>
      </div>
    );
  }

  const rangeOf = (i: number) => edits[i] ?? { startMs: proposals[i]!.startMs, endMs: proposals[i]!.endMs };
  const setRange = (i: number, patch: Partial<{ startMs: number; endMs: number }>) =>
    setEdits((prev) => ({ ...prev, [i]: clampClipRange({ ...rangeOf(i), ...patch }, mediaDurationMs) }));

  const create = async (i: number) => {
    const range = clampClipRange(rangeOf(i), mediaDurationMs);
    setBusyIdx(i);
    setError(null);
    try {
      const { projectId: newId } = await createClipProject({
        sourceProjectId: projectId,
        sourceTitle,
        sourceVideoId,
        doc,
        startMs: range.startMs,
        endMs: range.endMs,
      });
      router.push(`/projects/${newId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the clip. Try again.");
      setBusyIdx(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <Section
        title="Clipper"
        hint="Smart segment suggestions from your transcript: the speech runs between silences, sized 15–60 seconds. Adjust the edges if you like, then create a clip — it becomes its own caption project. The source video is not re-encoded or cut; the clip is a range on the same file, kept on your device."
      >
        {proposals.length === 0 ? (
          <p className="text-sm text-st-muted">No speech segments found in these captions yet.</p>
        ) : (
          <div className="space-y-3">
            {proposals.map((p, i) => {
              const range = rangeOf(i);
              return (
                <article key={`${p.startMs}-${p.endMs}`} className="rounded-xl border border-st-line bg-st-raised/50 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-st-text">{fmtClipRange(range.startMs, range.endMs)}</span>
                    <span className="text-xs tabular-nums text-st-faint">
                      {Math.round((range.endMs - range.startMs) / 1000)}s · {p.wordCount} words
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-st-muted">&ldquo;{p.text}&hellip;&rdquo;</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-st-faint">Start (seconds)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={Math.round(range.startMs / 100) / 10}
                        onChange={(e) => setRange(i, { startMs: Number(e.target.value) * 1000 })}
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
                        onChange={(e) => setRange(i, { endMs: Number(e.target.value) * 1000 })}
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
                    onChange={(e) => setRange(i, { startMs: Number(e.target.value) * 1000 })}
                    className="mt-2 w-full"
                  />
                  <Button tone="primary" disabled={busyIdx !== null} onClick={() => void create(i)} className="mt-2 w-full">
                    {busyIdx === i ? "Creating clip…" : "Create clip"}
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
