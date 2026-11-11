"use client";

import React, { useMemo, useState } from "react";
import type { CaptionDoc } from "@capseasy/shared";
import {
  BREATH_MARGIN_MS,
  DEFAULT_PAUSE_THRESHOLD_MS,
  proposeTrimCuts,
  type TrimRange,
} from "../trim";
import { PEAKS_PER_SECOND } from "../useWaveform";
import { Button, Section, fmtTime } from "../controls";

interface Props {
  doc: CaptionDoc;
  /** waveform peaks for the project (useWaveform pipeline), when decoded */
  peaks?: Float32Array | null;
  /** project timeline duration (for a trailing pause) */
  durationMs: number;
  /** seek the preview to a proposal's start, when the studio wires it */
  onSeek?: (ms: number) => void;
  /** apply the checked ranges as ONE undo step (StudioPage -> commitComposition) */
  onApply: (ranges: TrimRange[]) => void;
}

/**
 * Trim fillers & pauses (Phase 5, Addition A3): review deterministic cut
 * proposals measured from the transcript and the audio levels — filler words
 * and over-long pauses — then apply the checked ones through the composition
 * in a single undo step. Proposals are derived from the current doc, so after
 * applying they recompute against the new timings automatically.
 */
export const TrimPanel: React.FC<Props> = ({ doc, peaks, durationMs, onSeek, onApply }) => {
  const [thresholdMs, setThresholdMs] = useState(DEFAULT_PAUSE_THRESHOLD_MS);
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());

  const proposals = useMemo(
    () => proposeTrimCuts({ words: doc.words, peaks: peaks ?? null, hopMs: 1000 / PEAKS_PER_SECOND, durationMs, thresholdMs }),
    [doc, peaks, durationMs, thresholdMs],
  );
  const checked = proposals.filter((p) => !unchecked.has(p.id));
  const checkedMs = checked.reduce((sum, p) => sum + p.durationMs, 0);

  const toggle = (id: string, on: boolean) =>
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });

  if (doc.words.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <Section title="Trim">
          <p className="text-sm text-st-muted">No captions yet, so there is nothing to trim.</p>
        </Section>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <Section
        title="Trim fillers & pauses"
        hint="From your transcript and audio levels — deterministic, not AI."
      >
        <label className="block text-sm text-st-text/90">
          <span className="mb-1 flex justify-between">
            <span>Minimum pause length</span>
            <span className="tabular-nums text-st-muted">{(thresholdMs / 1000).toFixed(1)}s</span>
          </span>
          <input
            type="range"
            aria-label="Minimum pause length"
            className="w-full accent-[#34D399]"
            min={300}
            max={2000}
            step={100}
            value={thresholdMs}
            onChange={(e) => setThresholdMs(Number(e.target.value))}
          />
        </label>
        {!peaks ? (
          <p className="text-xs text-st-faint">
            Audio levels are not measured yet (waveform still loading) — pauses below are proposed from transcript gaps only for now.
          </p>
        ) : null}

        {proposals.length === 0 ? (
          <p className="text-sm text-st-muted">
            No filler words or pauses of {(thresholdMs / 1000).toFixed(1)}s or longer found in this transcript.
          </p>
        ) : (
          <div className="space-y-2">
            {proposals.map((p) => {
              const on = !unchecked.has(p.id);
              return (
                <article key={p.id} className="rounded-xl border border-st-line bg-st-raised/50 p-3">
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => toggle(p.id, e.target.checked)}
                      aria-label={`Include cut: ${p.label} at ${fmtTime(p.startMs)}`}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#34D399]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-st-text">
                          <span className="mr-2 rounded-md border border-st-line px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-st-muted">
                            {p.kind === "filler" ? "Filler" : "Pause"}
                          </span>
                          {p.label}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-st-faint">
                          {(p.durationMs / 1000).toFixed(1)}s
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-st-muted">&ldquo;{p.contextText}&rdquo;</p>
                      <div className="mt-1.5 flex items-center gap-3 text-xs text-st-faint">
                        {onSeek ? (
                          <button
                            type="button"
                            onClick={() => onSeek(p.startMs)}
                            aria-label={`Play from ${fmtTime(p.startMs)}`}
                            className="font-mono tabular-nums underline-offset-2 hover:text-st-text hover:underline"
                          >
                            {fmtTime(p.startMs)} &#9654;
                          </button>
                        ) : (
                          <span className="font-mono tabular-nums">{fmtTime(p.startMs)}</span>
                        )}
                        {p.kind === "pause" && !p.silenceConfirmed ? <span>transcript gap only</span> : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <Button
          tone="primary"
          disabled={checked.length === 0}
          onClick={() => onApply(checked.map((p) => ({ startMs: p.startMs, endMs: p.endMs })))}
          className="w-full"
        >
          {checked.length === 0
            ? "No cuts checked"
            : `Apply ${checked.length} cut${checked.length === 1 ? "" : "s"} — removes ${(checkedMs / 1000).toFixed(1)}s`}
        </Button>
        <p className="text-xs text-st-faint">Unchecked cuts change nothing. Applying is one undo step — Ctrl+Z brings everything back.</p>
      </Section>
    </div>
  );
};
