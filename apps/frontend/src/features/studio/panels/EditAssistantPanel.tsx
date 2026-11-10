"use client";

import React, { useState } from "react";
import { SourceBadge } from "@/features/create/SourceBadge";
import { sourceNote } from "@/features/create/model";
import type { GenerationDeps } from "@/features/create/service";
import {
  ASSISTANT_INTENTS,
  ASSISTANT_NO_ROUTE_REASON,
  assistantRouteAvailable,
  buildAssistantPlan,
  runAssistantTurn,
  type AssistantContext,
} from "../editAssistant";
import {
  applyPolishPlan,
  revertAllPolish,
  type PolishAppliedRecord,
  type PolishPlan,
  type PolishProjectState,
} from "../polish";
import { Button, Section } from "../controls";
import { useClipTitleDeps } from "./ClipCreateControls";

interface Props {
  /** the current project state, assembled by StudioPage from its stores */
  state: PolishProjectState;
  /** waveform peaks for the project (useWaveform pipeline), when decoded */
  peaks?: Float32Array | null;
  hopMs: number;
  /** commit a whole assistant state as ONE undo step (StudioPage -> editAll) */
  onCommit: (next: PolishProjectState) => void;
  /** generation deps override (tests); defaults to the clipper's assembly */
  deps?: GenerationDeps;
}

interface Exchange {
  role: "user" | "assistant";
  text: string;
}

/**
 * Edit Assistant (Phase 8, Addition A8) — honest Chat-to-Edit.
 *
 * The user types an instruction; a Phase-3 route reads it into ONE command
 * from the fixed intent set (editAssistant.ts); the panel builds the plan
 * locally and shows it BEFORE anything happens; Apply commits it as one
 * undo step through polish's apply + StudioPage's editAll. Refusals and
 * "nothing to change" outcomes are plain assistant messages — no state
 * change, no fake progress. When no AI route is configured the input is
 * disabled with the reason shown (the A1 precedent): there is no template
 * or keyword fallback pretending to understand language.
 */
export const EditAssistantPanel: React.FC<Props> = ({ state, peaks, hopMs, onCommit, deps: depsProp }) => {
  const hookDeps = useClipTitleDeps();
  const deps = depsProp ?? hookDeps;
  const available = assistantRouteAvailable(deps);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [plan, setPlan] = useState<PolishPlan | null>(null);
  const [record, setRecord] = useState<PolishAppliedRecord | null>(null);

  const context: AssistantContext = {
    segmentCount: state.comp.videoClips.length,
    hasMusicTrack: state.comp.audioTracks.some((t) => t.role === "music"),
    currentLookId: state.lookId,
  };

  const say = (role: Exchange["role"], line: string) =>
    setExchanges((prev) => [...prev, { role, text: line }]);

  const submit = async () => {
    const instruction = text.trim();
    if (!instruction || busy || !available) return;
    setBusy(true);
    setPlan(null);
    setRecord(null);
    say("user", instruction);
    setText("");
    try {
      const turn = await runAssistantTurn(instruction, context, deps);
      if (turn.status === "unavailable") {
        say("assistant", turn.reason);
        return;
      }
      if (turn.status === "refusal") {
        say("assistant", `${turn.refusal.message} By hand: ${turn.refusal.manualPath}.`);
        return;
      }
      const outcome = buildAssistantPlan(
        { doc: state.doc, comp: state.comp, settings: state.settings, lookId: state.lookId, peaks: peaks ?? null, hopMs },
        turn.command,
        { badge: { source: turn.source, fellBack: turn.fellBack, ...(turn.note ? { note: turn.note } : {}) } },
      );
      if (outcome.plan.steps.length === 0) {
        say("assistant", outcome.emptyReason ?? "Understood — but there is nothing to change for that in this project.");
        return;
      }
      if (turn.note) say("assistant", turn.note);
      setPlan(outcome.plan);
    } catch {
      say("assistant", "Something went wrong reading that instruction. Nothing was changed — try again, or do it by hand in the panels.");
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!plan) return;
    const { state: next, record: rec } = applyPolishPlan(state, plan, plan.steps.map((s) => s.id));
    if (rec.steps.length === 0) return;
    onCommit(next);
    setRecord(rec);
    setPlan(null);
    say("assistant", "Applied — that's one undo step (Ctrl+Z undoes the whole thing).");
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
        title="Edit Assistant"
        hint="Type an edit in plain words. The site's free AI (or the on-device model) reads it into one edit from the fixed list below — nothing else is possible — and shows you the exact plan before anything is applied. Applying is one undo step. It cannot generate media, voices or B-roll."
      >
        <div className="space-y-2">
          <label className="block text-sm text-st-text/90">
            <span className="sr-only">Edit instruction</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={!available || busy}
              rows={3}
              placeholder={available ? "e.g. Remove the ums and uhs" : "Assistant unavailable"}
              className="w-full rounded-lg border border-st-line bg-st-panel px-3 py-2 text-sm text-st-text outline-none focus:border-st-lav disabled:opacity-50"
            />
          </label>
          {!available ? (
            <p role="note" className="text-xs text-st-muted">{ASSISTANT_NO_ROUTE_REASON}</p>
          ) : null}
          <Button tone="primary" disabled={!available || busy || text.trim().length === 0} onClick={() => void submit()} className="w-full">
            {busy ? "Reading…" : "Show me the plan"}
          </Button>
        </div>

        {exchanges.length > 0 ? (
          <div className="space-y-2" aria-live="polite">
            {exchanges.map((ex, i) => (
              <p
                key={i}
                className={`rounded-xl border border-st-line p-3 text-sm ${ex.role === "user" ? "bg-st-lav/40 text-st-text" : "bg-st-raised/50 text-st-muted"}`}
              >
                {ex.text}
              </p>
            ))}
          </div>
        ) : null}

        {plan ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-st-text">Here is the plan — nothing has been applied yet:</p>
            {plan.steps.map((step) => (
              <article key={step.id} className="rounded-xl border border-st-line bg-st-raised/50 p-3">
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
              </article>
            ))}
            <Button tone="primary" onClick={apply} className="w-full">
              Apply plan — one undo step
            </Button>
            <Button onClick={() => setPlan(null)} className="w-full">Discard plan</Button>
          </div>
        ) : null}

        {record && record.steps.length > 0 ? (
          <div className="space-y-2">
            {record.steps.map((entry) => (
              <div key={entry.stepId} className="rounded-xl border border-st-line bg-st-raised/50 p-3">
                <p className="text-sm font-medium text-st-text">{entry.label}</p>
                <p className="mt-0.5 text-xs text-st-muted">{entry.detail}</p>
              </div>
            ))}
            <Button disabled={record.steps.every((s) => s.reverted)} onClick={revertAll} className="w-full">
              Revert applied plan
            </Button>
          </div>
        ) : null}
      </Section>

      <Section title="What I can do" hint="The full list — the assistant can only ever propose these edits. Anything else gets an honest refusal and the manual path.">
        <ul className="space-y-2">
          {ASSISTANT_INTENTS.map((def) => (
            <li key={def.id} className="text-sm">
              <span className="font-medium text-st-text">{def.label}</span>
              <span className="block text-xs text-st-muted">{def.description}</span>
              <span className="block text-xs text-st-faint">Try: “{def.example}”</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
};
