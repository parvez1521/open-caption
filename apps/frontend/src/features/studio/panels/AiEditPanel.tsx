"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { SourceBadge } from "@/features/create/SourceBadge";
import { sourceNote } from "@/features/create/model";
import type { GenerationDeps } from "@/features/create/service";
import { LOOKS } from "@capseasy/templates";
import {
  brollQueryFor,
  savedBrollKey,
  searchBroll,
  type BrollSuggestion,
} from "../../clipper/broll";
import {
  AI_EDIT_STYLES,
  aiEditStyle,
  buildAiEditPlan,
  groundAiEditIntent,
  resolveAiEditIntent,
  type AiEditPlanResult,
} from "../aiEdit";
import type { AutoZoomIntensity } from "../autoZooms";
import {
  applyPolishPlan,
  revertAllPolish,
  revertPolishStep,
  type PolishAppliedRecord,
  type PolishProjectState,
  type PolishStepKind,
} from "../polish";
import { generateTitleCardTitle, transcriptTextOf } from "../titleCard";
import { Button, Section } from "../controls";
import { useClipTitleDeps } from "./ClipCreateControls";

interface Props {
  /** the current project state, assembled by StudioPage from its stores */
  state: PolishProjectState;
  sourceTitle: string;
  peaks?: Float32Array | null;
  hopMs: number;
  /** commit a whole plan state as ONE undo step (StudioPage -> editAll) */
  onCommit: (next: PolishProjectState) => void;
  /** stage preview (W1): while previewing, the panel pushes the plan applied to a
   *  THROWAWAY state and StudioPage's stage renders it; null restores the stage.
   *  Previewing never calls onCommit — Apply stays the only commit path. */
  onPreviewChange?: (next: PolishProjectState | null) => void;
  /** D5: import one chosen B-roll suggestion into the project's media bin */
  onImportBroll: (s: BrollSuggestion) => Promise<void>;
  /** generation deps override (tests); defaults to the clipper's assembly */
  deps?: GenerationDeps;
}

type IntensityChoice = AutoZoomIntensity | "off";

const ANY_LOOK = "__any";

/**
 * AI Edit (2026-11-11): style pick + an optional plain-language instruction
 * → one routed free-AI call returns a plan intent → the deterministic
 * builder grounds it into a checklist the user REVIEWS before anything
 * happens (the preview is the approval gate) → apply rides the Polish
 * machinery as one undo step, with per-step revert. When no AI route
 * answers, the plan is the style's deterministic defaults and the whole
 * surface is badged "Template engine" — never AI. B-roll (D5) is a row of
 * default-OFF stock search suggestions beside the checklist: nothing is
 * searched or imported until the user clicks.
 */
export const AiEditPanel: React.FC<Props> = ({ state, sourceTitle, peaks, hopMs, onCommit, onPreviewChange, onImportBroll, deps: depsProp }) => {
  const hookDeps = useClipTitleDeps();
  const deps = depsProp ?? hookDeps;
  const [stylePick, setStylePick] = useState<string>("clean");
  const [anyLookId, setAnyLookId] = useState<string>("");
  const [intensity, setIntensity] = useState<IntensityChoice>("subtle");
  const [instruction, setInstruction] = useState("");
  const [stage, setStage] = useState<"ai" | "build" | null>(null);
  const [result, setResult] = useState<AiEditPlanResult | null>(null);
  const [unchecked, setUnchecked] = useState<ReadonlySet<PolishStepKind>>(new Set());
  const [previewOn, setPreviewOn] = useState(false);
  const [record, setRecord] = useState<PolishAppliedRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [brollResults, setBrollResults] = useState<Record<string, BrollSuggestion[]>>({});
  const [brollBusy, setBrollBusy] = useState<string | null>(null);
  const [brollError, setBrollError] = useState<string | null>(null);
  const [imported, setImported] = useState<ReadonlySet<number>>(new Set());

  const style = stylePick === ANY_LOOK ? AI_EDIT_STYLES[0]! : (aiEditStyle(stylePick) ?? AI_EDIT_STYLES[0]!);
  const anyLookOptions = LOOKS.filter((l) => l.id !== state.lookId);
  const resolvedLookId = stylePick === ANY_LOOK ? (anyLookId || anyLookOptions[0]?.id || style.lookId) : style.lookId;

  const pickStyle = (id: string) => {
    setStylePick(id);
    const s = id === ANY_LOOK ? AI_EDIT_STYLES[0]! : aiEditStyle(id);
    setIntensity(s?.pacing.zoomIntensity ?? "off");
  };

  const buildPlan = async () => {
    setPreviewOn(false);
    setError(null);
    const routeAvailable = Boolean(deps.runCloud) || Boolean(deps.modelEnabled && deps.runModel);
    setStage(routeAvailable ? "ai" : "build");
    try {
      const ctxInput = {
        doc: state.doc, comp: state.comp, lookId: state.lookId, style,
        instruction, peaks: peaks ?? null, hopMs,
      };
      const [outcome, titleResult] = await Promise.all([
        routeAvailable ? resolveAiEditIntent(ctxInput, deps).catch(() => null) : Promise.resolve(null),
        style.toggles.title
          ? generateTitleCardTitle(
              { sourceTitle, transcriptText: transcriptTextOf(state.doc), durationMs: state.comp.durationMs },
              deps,
            ).catch(() => null)
          : Promise.resolve(null),
      ]);
      setStage("build");
      const grounded = outcome ? groundAiEditIntent(outcome.intent, { doc: state.doc, durationMs: state.comp.durationMs }) : null;
      const badge = outcome
        ? { source: outcome.source, fellBack: outcome.fellBack, ...(outcome.note ? { note: outcome.note } : {}) }
        : null;
      setResult(buildAiEditPlan(
        { doc: state.doc, comp: state.comp, settings: state.settings, lookId: state.lookId, peaks: peaks ?? null, hopMs },
        {
          style, lookId: resolvedLookId,
          intensity: intensity === "off" ? null : intensity,
          grounded, badge,
          transcriptTruncated: outcome?.truncated ?? false,
          titleResult,
        },
      ));
      setUnchecked(new Set());
      setRecord(null);
      setBrollResults({});
      setImported(new Set());
      setBrollError(null);
    } catch {
      setError("The edit plan could not be built. Nothing was changed.");
    } finally {
      setStage(null);
    }
  };

  const toggle = (id: PolishStepKind, on: boolean) =>
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });

  const plan = result?.plan ?? null;
  const checkedCount = plan ? plan.steps.filter((s) => !unchecked.has(s.id)).length : 0;

  /* W1 preview: the checked steps applied to a throwaway copy of the CURRENT
   * state. applyPolishPlan is pure — the committed state, the undo history and
   * the saved project are never touched; the result only feeds the stage.
   * Deps are the state's FIELDS (StudioPage re-creates the wrapper object every
   * render; the fields are the store's stable references). */
  const previewState = useMemo(() => {
    if (!previewOn || !plan || checkedCount === 0) return null;
    const checked = new Set(plan.steps.filter((s) => !unchecked.has(s.id)).map((s) => s.id));
    return applyPolishPlan(state, plan, checked).state;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewOn, plan, unchecked, checkedCount, state.doc, state.comp, state.settings, state.style, state.lookId]);
  const previewCbRef = useRef(onPreviewChange);
  useEffect(() => {
    previewCbRef.current = onPreviewChange;
  }, [onPreviewChange]);
  useEffect(() => {
    previewCbRef.current?.(previewState);
  }, [previewState]);
  useEffect(() => () => {
    previewCbRef.current?.(null);
  }, []);

  const apply = () => {
    if (!plan) return;
    const checked = new Set(plan.steps.filter((s) => !unchecked.has(s.id)).map((s) => s.id));
    if (checked.size === 0) return;
    const { state: next, record: rec } = applyPolishPlan(state, plan, checked);
    if (rec.steps.length === 0) return;
    setPreviewOn(false);
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

  const brollQueries = result
    ? (result.brollQueries.length > 0 ? result.brollQueries : [brollQueryFor(transcriptTextOf(state.doc))])
    : [];

  const runBrollSearch = async (query: string) => {
    const key = savedBrollKey();
    if (!key) {
      setBrollError("Add your free Pixabay key in the Sound FX panel first — B-roll search uses your own key.");
      return;
    }
    setBrollBusy(query);
    setBrollError(null);
    try {
      const results = await searchBroll(query, key);
      setBrollResults((prev) => ({ ...prev, [query]: results }));
    } catch {
      setBrollError("That B-roll search didn't go through — nothing was imported.");
    } finally {
      setBrollBusy(null);
    }
  };

  const importOne = async (s: BrollSuggestion) => {
    setBrollBusy(`import-${s.id}`);
    setBrollError(null);
    try {
      await onImportBroll(s);
      setImported((prev) => new Set(prev).add(s.id));
    } catch {
      setBrollError("That clip couldn't be imported — it was not added to the media bin.");
    } finally {
      setBrollBusy(null);
    }
  };

  const busy = stage !== null;

  return (
    <div className="h-full overflow-y-auto">
      <Section title="AI Edit" more="Pick a style, add an instruction if you like — you review every step before anything is applied.">
        {!result && !record ? (
          <div className="space-y-2">
            <label className="block">
              <span className="text-xs font-medium text-st-muted">Style</span>
              <select
                value={stylePick}
                onChange={(e) => pickStyle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-st-line bg-st-raised px-3 py-2 text-sm text-st-text"
              >
                {AI_EDIT_STYLES.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                <option value={ANY_LOOK}>Any look…</option>
              </select>
            </label>
            {stylePick === ANY_LOOK ? (
              <label className="block">
                <span className="text-xs font-medium text-st-muted">Look</span>
                <select
                  value={resolvedLookId}
                  onChange={(e) => setAnyLookId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-st-line bg-st-raised px-3 py-2 text-sm text-st-text"
                >
                  {anyLookOptions.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-xs text-st-faint">{style.description}</p>
            )}
            <div>
              <span className="text-xs font-medium text-st-muted">Edit intensity</span>
              <div className="mt-1 flex gap-1.5" role="group" aria-label="Edit intensity">
                {(["off", "subtle", "medium", "strong"] as const).map((v) => (
                  <Button key={v} tone={intensity === v ? "primary" : undefined} aria-pressed={intensity === v} onClick={() => setIntensity(v)} className="flex-1 capitalize">
                    {v}
                  </Button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-st-muted">Instruction (optional)</span>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="e.g. Keep the intro pause, cut the repeated part near the end"
                className="mt-1 w-full rounded-xl border border-st-line bg-st-raised px-3 py-2 text-sm text-st-text placeholder:text-st-faint"
              />
            </label>
            <Button tone="primary" disabled={busy} onClick={() => void buildPlan()} className="w-full">
              {stage === "ai" ? "Asking the free AI…" : stage === "build" ? "Building your plan…" : "Create my edit plan"}
            </Button>
            <p className="text-xs text-st-faint">Building a plan changes nothing.</p>
            {error ? <p role="alert" className="text-xs text-st-text">{error}</p> : null}
          </div>
        ) : null}

        {result && !record ? (
          <div className="space-y-2">
            {result.engine.kind === "ai" ? (
              <div className="flex flex-wrap items-center gap-2">
                <SourceBadge source={result.engine.badge.source} />
                <span className="text-xs text-st-faint">{sourceNote(result.engine.badge.source)}</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-st-line px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-st-muted">
                  Template engine
                </span>
                <span className="text-xs text-st-faint">No AI answer this time — this plan follows the style&apos;s set defaults.</span>
              </div>
            )}
            {result.notices.map((n, i) => (
              <p key={i} className="text-xs leading-snug text-st-muted">{n}</p>
            ))}
            {result.engine.kind === "ai" && result.engine.badge.note ? (
              <p className="text-[11px] leading-snug text-st-muted">{result.engine.badge.note}</p>
            ) : null}
            {plan && plan.steps.length === 0 ? (
              <p className="text-sm text-st-muted">
                Nothing to change for this style: no fillers or long pauses to cut, no zoom signals, and nothing else the style would add.
              </p>
            ) : (
              plan?.steps.map((step) => {
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
                      </div>
                    </div>
                  </article>
                );
              })
            )}
            {result.droppedNotes.length > 0 ? (
              <div className="rounded-xl border border-st-line p-3">
                <p className="text-xs font-medium text-st-muted">Not included</p>
                {result.droppedNotes.map((n, i) => (
                  <p key={i} className="mt-1 text-xs leading-snug text-st-faint">{n}</p>
                ))}
              </div>
            ) : null}
            {onPreviewChange ? (
              <>
                <Button disabled={checkedCount === 0} aria-pressed={previewOn} onClick={() => setPreviewOn((v) => !v)} className="w-full">
                  {previewOn ? "Stop preview" : "Preview on stage"}
                </Button>
                {checkedCount === 0 ? (
                  <p className="text-xs text-st-faint">Tick at least one step to preview it on the stage.</p>
                ) : previewOn ? (
                  <p className="text-xs text-st-faint">Showing on the stage — nothing is applied until you press Apply.</p>
                ) : null}
              </>
            ) : null}
            <Button tone="primary" disabled={checkedCount === 0} onClick={apply} className="w-full">
              {checkedCount === 0 ? "No steps checked" : `Apply ${checkedCount} step${checkedCount === 1 ? "" : "s"} — one undo step`}
            </Button>
            <Button disabled={busy} onClick={() => void buildPlan()} className="w-full">
              {busy ? "Rebuilding…" : "Rebuild plan"}
            </Button>
            <p className="text-xs text-st-faint">Unchecked steps change nothing. Ctrl+Z undoes the whole pass at once.</p>

            {/* D5 — B-roll: default-OFF import suggestions, never plan steps */}
            <div className="space-y-2 border-t border-st-line pt-3">
              <p className="text-sm font-medium text-st-text">B-roll ideas</p>
              <p className="text-xs text-st-faint">Stock clips from Pixabay with your own key. Nothing is searched or imported until you click.</p>
              {brollQueries.map((q) => (
                <div key={q} className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-st-muted">“{q}”</span>
                    <Button disabled={brollBusy !== null} onClick={() => void runBrollSearch(q)}>
                      {brollBusy === q ? "Searching…" : "Search Pixabay"}
                    </Button>
                  </div>
                  {(brollResults[q] ?? []).map((s) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-xl border border-st-line bg-st-raised/50 p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.previewUrl} alt="" className="h-10 w-16 shrink-0 rounded-md object-cover" />
                      <span className="min-w-0 flex-1 text-xs text-st-muted">{s.tags || "Pixabay clip"} · {s.durationSec}s</span>
                      <Button disabled={imported.has(s.id) || brollBusy !== null} onClick={() => void importOne(s)}>
                        {imported.has(s.id) ? "In media bin" : brollBusy === `import-${s.id}` ? "Importing…" : "Import"}
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
              {brollError ? <p role="alert" className="text-xs text-st-text">{brollError}</p> : null}
            </div>
          </div>
        ) : null}

        {record ? (
          <div className="space-y-2">
            <p className="text-sm text-st-text">AI Edit applied — the project is an ordinary editable project now.</p>
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
            <Button disabled={record.steps.every((s) => s.reverted)} onClick={revertAll} className="w-full">
              Revert all steps
            </Button>
            <Button disabled={busy} onClick={() => { setResult(null); void buildPlan(); }} className="w-full">
              Build a new plan
            </Button>
          </div>
        ) : null}
      </Section>
    </div>
  );
};
