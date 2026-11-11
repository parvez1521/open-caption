"use client";

import React from "react";
import type { ClipSignals } from "./clipper";

/**
 * A7 — ranking transparency for one suggested clip. Shows the MEASURED signals with
 * their real values and the plain-language explanation built from them. There is no
 * score anywhere in this component, by design: the order is explained, not numbered
 * as quality. All values come from deterministic measurement (transcript timings,
 * audio-energy silence, frame-difference scene changes) — labelled as such.
 */

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toString();

export const ClipExplanation: React.FC<{ signals: ClipSignals; explanation: string }> = ({ signals, explanation }) => {
  const rows: [string, string][] = [
    [
      "First 3 s hook check",
      signals.hook.detected
        ? `${signals.hook.kinds.join(" + ")} detected${signals.hook.matched ? ` — "${signals.hook.matched}"` : ""}`
        : "no question, number or claim detected",
    ],
    ["Word rate", `${Math.round(signals.wordRateWpm)} words/min`],
    ["Pause density", `${fmt1(signals.pausesPerMinute)} pauses/min (${signals.pauseCount} ${signals.pauseCount === 1 ? "pause" : "pauses"})`],
    ["Scene changes inside", String(signals.sceneChangeCount)],
    ["Caption density", `${fmt1(signals.wordsPerSecond)} words/sec`],
    ["Measured silence inside", `${fmt1(signals.silenceMsInside / 1000)} s`],
    ["Start edge", signals.startBoundary.label],
    ["End edge", signals.endBoundary.label],
  ];
  return (
    <details className="mt-3 rounded-lg border border-st-line bg-st-panel px-3 py-2">
      <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-st-faint">
        Why this ranks here — measured signals
      </summary>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-2">
            <dt className="text-[11px] text-st-faint">{label}</dt>
            <dd className="text-right text-[11px] font-medium tabular-nums text-st-text">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-st-muted">{explanation}</p>
      {/* The "measured on your device… no score is assigned" line used to repeat under every
          clip; it now lives once in the Clipper panel's intro. */}
    </details>
  );
};
