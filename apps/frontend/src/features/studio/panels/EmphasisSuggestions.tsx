"use client";

import React, { useEffect, useState } from "react";
import type { CaptionDoc } from "@capseasy/shared";
import { SourceBadge } from "@/features/create/SourceBadge";
import { sourceNote } from "@/features/create/model";
import { fetchCloudAiStatus, runCloudModel } from "@/features/create/cloudAi";
import { onModelState, runLocalModel } from "@/features/create/localModel";
import type { GenerationDeps } from "@/features/create/service";
import {
  EMPHASIS_NO_ROUTE_REASON,
  applyEmphasisSuggestions,
  emphasisRouteAvailable,
  generateEmphasisSuggestions,
  type EmphasisOutcome,
  type EmphasisSuggestion,
} from "../emphasis";
import { Button, fmtTime } from "../controls";

/**
 * "Suggest emphasis" (Phase 5, addition A1) — the review surface for
 * auto-emphasis + keyword-emoji suggestions, rendered inside CaptionsPanel.
 *
 * Honesty rules, enforced here and in emphasis.ts:
 * - Suggestions come ONLY from a real AI route (cloud Groq or the opt-in
 *   on-device model). There is no template fallback: with no route configured
 *   the action is disabled with the reason shown, and a route that fails
 *   reports unavailable instead of degrading to a heuristic.
 * - The batch is badged with the existing SourceBadge — local-model
 *   suggestions are labelled as the local model's.
 * - NOTHING mutates the doc while reviewing. Accepting (per item or all)
 *   applies the accepted set through ONE `edit()` call — one undo step.
 *   Discarding closes the review and leaves the doc untouched.
 */

type Review = Extract<EmphasisOutcome, { status: "ok" }>;

/** Assembles the Phase-3 generation deps exactly as ClipCreateControls' hook does. */
function useEmphasisDeps(injected?: GenerationDeps): GenerationDeps {
  const [cloudOn, setCloudOn] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  useEffect(() => {
    if (injected) return;
    let alive = true;
    void fetchCloudAiStatus().then((status) => {
      if (alive) setCloudOn(!!status?.configured);
    });
    const off = onModelState((s) => setModelReady(s.status === "ready"));
    return () => {
      alive = false;
      off();
    };
  }, [injected]);
  if (injected) return injected;
  return { runCloud: cloudOn ? runCloudModel : undefined, modelEnabled: modelReady, runModel: runLocalModel };
}

const actionLabel = (s: EmphasisSuggestion): string =>
  s.action === "supersize" ? "Supersize (key word)" : s.action === "emphasise" ? "Emphasise" : `Emoji ${s.emoji ?? ""}`.trim();

export const EmphasisSuggestions: React.FC<{
  doc: CaptionDoc;
  edit: (fn: (d: CaptionDoc) => CaptionDoc, opts?: { coalesceKey?: string }) => void;
  /** false for layouts that cannot show a key word differently (typewriter) */
  heroSupported: boolean;
  /** Test seam: generation deps; in the studio they are assembled from the cloud/local state. */
  deps?: GenerationDeps;
}> = ({ doc, edit, heroSupported, deps: injectedDeps }) => {
  const deps = useEmphasisDeps(injectedDeps);
  const available = emphasisRouteAvailable(deps);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [unavailable, setUnavailable] = useState<string | null>(null);

  const applicable = (s: EmphasisSuggestion) => s.action !== "supersize" || heroSupported;

  const generate = async () => {
    setBusy(true);
    setUnavailable(null);
    try {
      const outcome = await generateEmphasisSuggestions(doc, deps);
      if (outcome.status === "unavailable") {
        setReview(null);
        setUnavailable(outcome.reason);
        return;
      }
      setReview(outcome);
      setAccepted(new Set(outcome.suggestions.filter(applicable).map((s) => s.id)));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setReview(null);
    setAccepted(new Set());
  };

  const applyAccepted = () => {
    if (!review) return;
    const chosen = review.suggestions.filter((s) => accepted.has(s.id) && applicable(s));
    if (chosen.length === 0) return;
    // one edit() call for the whole accepted set = exactly one undo step
    edit((d) => applyEmphasisSuggestions(d, chosen));
    close();
  };

  const toggle = (id: string, on: boolean) =>
    setAccepted((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const acceptedCount = review ? review.suggestions.filter((s) => accepted.has(s.id) && applicable(s)).length : 0;

  return (
    <div className="space-y-2 border-b border-st-line p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-st-text">Emphasis &amp; emoji suggestions</p>
        {review ? <SourceBadge source={review.source} /> : null}
      </div>
      <p className="text-xs text-st-faint">
        Suggested by the free AI or the on-device model — which words to emphasise, supersize, or pair with an
        emoji. Nothing changes until you accept, and this feature has no template fallback.
      </p>

      {!review ? (
        <>
          <Button disabled={busy || !available || doc.words.length === 0} onClick={() => void generate()} className="!py-1 text-xs">
            {busy ? "Asking for suggestions…" : "Suggest emphasis"}
          </Button>
          {!available ? (
            <p className="text-xs text-st-faint" role="note">{EMPHASIS_NO_ROUTE_REASON}</p>
          ) : null}
          {unavailable ? (
            <p className="text-xs text-st-text" role="alert">{unavailable}</p>
          ) : null}
        </>
      ) : review.suggestions.length === 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-st-muted" role="status">No suggestions for these captions.</p>
          <p className="text-[11px] leading-snug text-st-faint">{sourceNote(review.source)}</p>
          {review.note ? <p className="text-[11px] leading-snug text-st-muted">{review.note}</p> : null}
          <Button onClick={close} className="!py-1 text-xs">Close</Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] leading-snug text-st-faint">{sourceNote(review.source)}</p>
          {review.note ? <p className="text-[11px] leading-snug text-st-muted">{review.note}</p> : null}
          <ul className="space-y-1" aria-label="Emphasis suggestions">
            {review.suggestions.map((s) => {
              const blocked = !applicable(s);
              return (
                <li key={s.id} className="flex items-center gap-2 rounded-md bg-st-raised px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={!blocked && accepted.has(s.id)}
                    disabled={blocked}
                    onChange={(e) => toggle(s.id, e.target.checked)}
                    aria-label={`Accept suggestion: ${actionLabel(s)} on "${s.text}"`}
                    className="h-4 w-4 shrink-0 accent-[#34D399]"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-st-text">
                    {s.text} <span className="text-xs text-st-faint">· {actionLabel(s)}</span>
                    {blocked ? <span className="block text-[11px] text-st-faint">This template layout does not show a key word.</span> : null}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-st-faint">{fmtTime(s.startMs)}</span>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-1.5">
            <Button tone="primary" disabled={acceptedCount === 0} onClick={applyAccepted} className="!py-1 text-xs">
              Apply accepted ({acceptedCount})
            </Button>
            <Button
              onClick={() => setAccepted(new Set(review.suggestions.filter(applicable).map((s) => s.id)))}
              className="!py-1 text-xs"
            >
              Accept all
            </Button>
            <Button onClick={close} className="!py-1 text-xs">Discard</Button>
          </div>
        </div>
      )}
    </div>
  );
};
