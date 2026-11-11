"use client";

import React from "react";
import { SourceBadge } from "@/features/create/SourceBadge";
import type { HighlightClip, HighlightSource } from "./highlights/types";

/**
 * The AI clip card's score block — the scoring-honesty law made visible:
 * the number is labelled "Editorial score" with "estimate — not a
 * performance prediction" on its face; the hook is the clip's verbatim
 * opening line; the reason and the full breakdown (every row tagged
 * model-judged or measured; unjudged rows say so) are one click away at
 * most. Signals-only runs badge themselves instead of borrowing the AI's
 * clothes.
 */
export const ClipScoreBlock: React.FC<{ clip: HighlightClip; source: HighlightSource }> = ({ clip, source }) => (
  <div className="mt-2 rounded-lg border border-st-line bg-st-panel px-3 py-2">
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-sora text-lg font-bold tabular-nums text-st-text">{clip.score}</span>
      <span className="text-xs font-semibold text-st-text">Editorial score</span>
      <span className="text-[11px] text-st-faint">estimate — not a performance prediction</span>
      <span className="ml-auto">
        {source === "signals" ? (
          <span
            data-source="signals"
            className="inline-flex items-center gap-1.5 rounded-full border border-sand-300 bg-sand-100 px-2.5 py-1 font-sora text-[11px] font-semibold text-sand-800"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-sand-500" />
            Signals only — free AI unavailable
          </span>
        ) : (
          <SourceBadge source={source === "cloud" ? "cloud" : "model"} />
        )}
      </span>
    </div>
    <p className="mt-1.5 text-sm text-st-text">
      <span className="font-semibold">Hook:</span> &ldquo;{clip.hook}&rdquo;
    </p>
    {clip.summary ? <p className="mt-0.5 text-xs text-st-muted">{clip.summary}</p> : null}
    {clip.reason ? <p className="mt-0.5 text-xs text-st-muted">{clip.reason}</p> : null}
    <details className="mt-1.5">
      <summary className="cursor-pointer text-[11px] font-medium text-st-faint">Why this score</summary>
      <ul className="mt-1.5 space-y-1">
        {clip.breakdown.map((row) => (
          <li key={row.key} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-st-muted">
              {row.label}{" "}
              <span className="text-[10px] uppercase tracking-wide text-st-faint">
                {row.kind === "model" ? "model-judged" : "measured"}
              </span>
            </span>
            <span className="tabular-nums font-semibold text-st-text">{row.value === null ? "Not judged" : row.value}</span>
          </li>
        ))}
      </ul>
    </details>
  </div>
);
