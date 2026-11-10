"use client";

import React, { useState } from "react";
import { SourceBadge } from "@/features/create/SourceBadge";
import { sourceNote } from "@/features/create/model";
import type { GenerationDeps } from "@/features/create/service";
import {
  applyPolishPlan,
  buildPolishPlan,
  revertAllPolish,
  revertPolishStep,
  type PolishAppliedRecord,
  type PolishPlan,
  type PolishProjectState,
  type PolishStepKind,
} from "../polish";
import { generateTitleCardTitle, transcriptTextOf } from "../titleCard";
import { resolvePolishAiChoices, defaultPolishLookCandidates } from "../polish";
import { Button, Section } from "../controls";
import { useClipTitleDeps } from "./ClipCreateControls";

interface Props {
  /** the current project state, assembled by StudioPage from its stores */
  state: PolishProjectState;
  sourceTitle: string;
  /** waveform peaks for the project (useWaveform pipeline), when decoded */
  peaks?: Float32Array | null;
  hopMs: number;
  /** commit a whole polish state as ONE undo step (StudioPage -> editAll) */
  onCommit: (next: PolishProjectState) => void;
  /** generation deps override (tests); defaults to the clipper's assembly */
  deps?: GenerationDeps;
}

/**
 * One-click Polish (Phase 5, Addition A2): an automated edit pass the user
 * REVIEWS before anything happens. Building the plan may ask the Phase-3
 * routes for a title and for the look/zoom choices — every such step is
 * badged with its real source, and when no route answers the plan uses its
 * stated deterministic defaults and says "automatic". Applying runs only
 * the checked steps as one undo step; afterwards each applied step can be
 * reverted on its own (newest first is exact — see polish.ts).
 */
export const PolishPanel: React.FC<Props> = ({ state, sourceTitle, peaks, hopMs, onCommit, deps: depsProp }) => {
  const hookDeps = useClipTitleDeps();
  const deps = depsProp ?? hookDeps;
  const [plan, setPlan] = useState<PolishPlan | null>(null);
  const [unchecked, setUnchecked] = useState<ReadonlySet<PolishStepKind>>(new Set());
  const [record, setRecord] = useState<PolishAppliedRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildPlan = async () => {
    setBusy(true);
    setError(null);
    try {
      const transcriptText = transcriptTextOf(state.doc);
      const candidates = defaultPolishLookCandidates().filter((id) => id !== state.lookId);
      const [titleResult, aiChoices] = await Promise.all([
        transcriptText
          ? generateTitleCardTitle({ sourceTitle, transcriptText, durationMs: state.comp.durationMs }, deps).catch(() => null)
          : Promise.resolve(null),
        resolvePolishAiChoices({ transcriptText, lookCandidateIds: candidates }, deps).catch(() => null),
      ]);
      setPlan(buildPolishPlan(
        { doc: state.doc, comp: state.comp, settings: state.settings, lookId: state.lookId, peaks: peaks ?? null, hopMs },
        { titleResult, aiChoices },
      ));
      setUnchecked(new Set());
      setRecord(null);
    } catch {
      setError("The polish plan could not be built. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: PolishStepKind, on: boolean) =>
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });

  const checkedCount = plan ? plan.steps.filter((s) => !unchecked.has(s.id)).length : 0;

  const apply = () => {
    if (!plan) return;
    const checked = new Set(plan.steps.filter((s) => !unchecked.has(s.id)).map((s) => s.id));
    if (checked.size === 0) return;
    const { state: next, record: rec } = applyPolishPlan(state, plan, checked);
    if (rec.steps.length === 0) return;
    onCommit(next);
    setRecord(rec);
  };

  const revertStep = (stepId: PolishStepKind) => {
    if (!record) return;
    const { state: next, record: rec } = revertPolishStep(record, stepId);
    onCommit(next);
    setRecord(rec);
  };

  const revertAll = () => {
    if (!record) return;
    const { state: next, record: rec } = revertAllPolish(record);
    onCommit(next);
    setRecord(rec);
  };

  return (
    <div className="h-full overflow-y-auto">
      <Section
        title="One-click Polish"
        hint="An automated edit pass over this project, built from the editor's own tools: filler and long-pause cuts, punch-in zooms, a caption look, a title card and music ducking. The plan is shown before anything is applied, every step can be unchecked, applying is one undo step, and each applied step can be reverted on its own. Steps marked AI-suggested had a choice made by the badged source; everything else is a deterministic automatic step."
      >
        {!plan && !record ? (
          <div className="space-y-2">
            <Button tone="primary" disabled={busy} onClick={() => void buildPlan()} className="w-full">
              {busy ? "Building plan…" : "Build my polish plan"}
            </Button>
            <p className="text-xs text-st-faint">
              Building a plan changes nothing. Where a choice exists — the caption look, the zoom intensity, the
              title — the free AI or on-device model may suggest it when available; otherwise the plan uses its
              stated defaults and labels those steps automatic.
            </p>
            {error ? <p role="alert" className="text-xs text-st-text">{error}</p> : null}
          </div>
        ) : null}

        {plan && !record ? (
          <div className="space-y-2">
            {plan.steps.length === 0 ? (
              <p className="text-sm text-st-muted">
                Nothing to polish: no fillers or long pauses to cut, no zoom signals, no other caption look to
                apply, and no music track to duck.
              </p>
            ) : (
              plan.steps.map((step) => {
                const on = !unchecked.has(step.id);
                return (
                  <article key={step.id} className="rounded-xl border border-st-line bg-st-raised/50 p-3">
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => toggle(step.id, e.target.checked)}
                        aria-label={`Include step: ${step.label}`}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#34D399]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-st-text">{step.label}</span>
                          <span className="rounded-md border border-st-line px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-st-muted">
                            {step.source === "ai-suggested" ? "AI-suggested" : "Automatic"}
                          </span>
                          {step.badge ? <SourceBadge source={step.badge.source} /> : null}
                        </div>
                        <p className="mt-1 text-sm text-st-muted">{step.detail}</p>
                        {step.badge ? <p className="mt-1 text-[11px] leading-snug text-st-faint">{sourceNote(step.badge.source)}</p> : null}
                        {step.badge?.note ? <p className="mt-1 text-[11px] leading-snug text-st-muted">{step.badge.note}</p> : null}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
            <Button tone="primary" disabled={checkedCount === 0} onClick={apply} className="w-full">
              {checkedCount === 0 ? "No steps checked" : `Apply ${checkedCount} step${checkedCount === 1 ? "" : "s"} — one undo step`}
            </Button>
            <Button disabled={busy} onClick={() => void buildPlan()} className="w-full">
              {busy ? "Rebuilding…" : "Rebuild plan"}
            </Button>
            <p className="text-xs text-st-faint">Unchecked steps change nothing. Ctrl+Z undoes the whole pass at once.</p>
          </div>
        ) : null}

        {record ? (
          <div className="space-y-2">
            <p className="text-sm text-st-text">Polish applied — the project is an ordinary editable project now.</p>
            {record.steps.map((entry) => (
              <div key={entry.stepId} className="flex items-center justify-between gap-2 rounded-xl border border-st-line bg-st-raised/50 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-st-text">{entry.label}</p>
                  <p className="mt-0.5 text-xs text-st-muted">{entry.detail}</p>
                </div>
                <Button disabled={entry.reverted} onClick={() => revertStep(entry.stepId)}>
                  {entry.reverted ? "Reverted" : "Revert"}
                </Button>
              </div>
            ))}
            <Button
              disabled={record.steps.every((s) => s.reverted)}
              onClick={revertAll}
              className="w-full"
            >
              Revert all steps
            </Button>
            <p className="text-xs text-st-faint">
              Each revert is its own undo step and restores exactly what that step changed. Reverting newest first
              is exact; the two cut steps share their scope, so reverting either restores both cuts.
            </p>
            <Button disabled={busy} onClick={() => void buildPlan()} className="w-full">
              Build a new plan
            </Button>
          </div>
        ) : null}
      </Section>
    </div>
  );
};
