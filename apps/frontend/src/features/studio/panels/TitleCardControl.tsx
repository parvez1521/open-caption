"use client";

import React, { useState } from "react";
import type { OverlayItem } from "@capseasy/shared";
import { SourceBadge } from "@/features/create/SourceBadge";
import { sourceNote } from "@/features/create/model";
import type { GenerationDeps } from "@/features/create/service";
import { Button } from "../controls";
import { generateTitleCardTitle, makeTitleCardOverlay, type TitleCardResult } from "../titleCard";
import { useClipTitleDeps } from "./ClipCreateControls";

/**
 * A5 (editor half) — the "Add title card" control in the Text panel.
 *
 * One click generates a title from the project's transcript through the
 * Phase-3 routing (deps assembled exactly like the clipper's, via
 * `useClipTitleDeps` — an explicit `deps` prop overrides for tests). The
 * generated title is shown WITH its `SourceBadge` for confirmation/edit —
 * a template-engine title is badged as the template engine, never as AI —
 * and only the confirmed text is placed, as a normal text overlay at the
 * project start via `onPlace` (the StudioPage commit path; one undo step).
 */
export interface TitleCardState extends TitleCardResult {
  /** the title text as the user last edited it (starts as the generated title) */
  text: string;
}

export const TitleCardControl: React.FC<{
  sourceTitle: string;
  transcriptText: string;
  durationMs: number;
  onPlace: (item: OverlayItem) => void;
  deps?: GenerationDeps;
}> = ({ sourceTitle, transcriptText, durationMs, onPlace, deps: depsProp }) => {
  const hookDeps = useClipTitleDeps();
  const deps = depsProp ?? hookDeps;
  const [state, setState] = useState<TitleCardState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await generateTitleCardTitle({ sourceTitle, transcriptText, durationMs }, deps);
      setState({ ...result, text: result.title });
    } catch {
      setError("The title could not be generated. You can still add a text overlay below and type your own title.");
      setState(null);
    } finally {
      setBusy(false);
    }
  };

  if (!state) {
    return (
      <div className="mb-3">
        <Button disabled={busy} onClick={() => void generate()} className="w-full">
          {busy ? "Writing title…" : "Add title card"}
        </Button>
        <p className="mt-1.5 text-[11px] leading-snug text-st-faint">
          Writes a title from your transcript using the same generation as Creator Studio — the free AI when it
          is on, the on-device model when enabled, otherwise the template engine. You confirm the title, with
          its source shown, before it is placed at the start of the project as a normal text overlay.
        </p>
        {error ? <p role="alert" className="mt-2 text-xs text-st-text">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mb-3 space-y-2 rounded-lg border border-st-line bg-st-panel/60 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge source={state.source} />
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy}
          className="text-[11px] font-medium text-st-muted underline decoration-st-line underline-offset-2 transition hover:text-st-text disabled:opacity-50"
        >
          {busy ? "Writing…" : "Regenerate"}
        </button>
      </div>
      <p className="text-[11px] leading-snug text-st-faint">{sourceNote(state.source)}</p>
      {state.note ? <p className="text-[11px] leading-snug text-st-muted">{state.note}</p> : null}
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-st-faint">Title card text (editable)</span>
        <input
          type="text"
          value={state.text}
          maxLength={120}
          onChange={(e) => setState({ ...state, text: e.target.value })}
          className="w-full rounded-lg border border-st-line bg-st-panel px-2 py-1.5 text-sm outline-none focus:border-st-ink/40"
        />
      </label>
      <div className="flex flex-wrap gap-1.5">
        <Button
          tone="primary"
          disabled={busy || !state.text.trim()}
          onClick={() => {
            onPlace(makeTitleCardOverlay(state.text, durationMs));
            setState(null);
          }}
        >
          Place title card at start
        </Button>
        <Button disabled={busy} onClick={() => setState(null)}>Cancel</Button>
      </div>
    </div>
  );
};
