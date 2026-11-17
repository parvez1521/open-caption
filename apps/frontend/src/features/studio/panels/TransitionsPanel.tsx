"use client";

import React from "react";
import type { SegmentTransition } from "@capseasy/shared";
import { TRANSITION_CATEGORIES, transitionsInCategory } from "@capseasy/compositions";
import { Button, Section, Slider } from "../controls";

export interface TransitionsPanelProps {
  /** The transition into the selected cut (null = plain cut). */
  currentTransition: SegmentTransition | null;
  /** Apply a transition at the selected cut. */
  onApplyTransition: (transition: SegmentTransition) => void;
  /** Clear the transition at the selected cut (plain cut). */
  onClearTransition: () => void;
  /** Split the clip under the playhead into two clips. */
  onSplitAtPlayhead: () => void;
  /** True when there is no cut to apply a transition to (a single clip has no join). */
  transitionsDisabled?: boolean;
  /** True when there is no clip under the playhead to split. */
  splitDisabled?: boolean;
}

/**
 * Transitions: 100 premium transitions in 10 groups, plus split. Tapping a card
 * applies that transition at the selected cut with its default duration; the
 * duration slider adjusts the applied one. Cards are static labels — no fake
 * animated previews. The coordinator wires onApplyTransition to StudioPage's
 * setSegmentTransition commit and onSplitAtPlayhead to splitVideoAtPlayhead.
 */
export const TransitionsPanel: React.FC<TransitionsPanelProps> = ({
  currentTransition,
  onApplyTransition,
  onClearTransition,
  onSplitAtPlayhead,
  transitionsDisabled = false,
  splitDisabled = false,
}) => {
  return (
    <div className="h-full overflow-y-auto">
      <Section title="Split">
        <Button tone="primary" onClick={onSplitAtPlayhead} disabled={splitDisabled} className="w-full">
          Split at playhead
        </Button>
      </Section>
      <Section title="Transitions" hint="Tap a transition to apply it at the selected cut.">
        {currentTransition ? (
          <>
            <Slider
              label="Duration"
              value={currentTransition.durationMs}
              min={100}
              max={2000}
              step={50}
              unit=" ms"
              onChange={(v) => onApplyTransition({ type: currentTransition.type, durationMs: v })}
            />
            <Button onClick={onClearTransition} disabled={transitionsDisabled}>
              Plain cut
            </Button>
          </>
        ) : null}
        {TRANSITION_CATEGORIES.map((group) => {
          const entries = transitionsInCategory(group.id);
          if (entries.length === 0) return null;
          return (
            <div key={group.id}>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-st-muted">{group.label}</h4>
              <div className="grid grid-cols-2 gap-2">
                {entries.map((entry) => {
                  const selected = currentTransition?.type === entry.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`Apply ${entry.name}`}
                      disabled={transitionsDisabled}
                      onClick={() => onApplyTransition({ type: entry.id, durationMs: entry.defaultDurationMs })}
                      className={`rounded-lg border px-2.5 py-2 text-left text-[12px] font-semibold leading-tight disabled:cursor-not-allowed disabled:opacity-40 ${
                        selected ? "border-st-em bg-st-raised text-st-text" : "border-st-line bg-st-panel text-st-text"
                      }`}
                    >
                      {entry.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </Section>
    </div>
  );
};
