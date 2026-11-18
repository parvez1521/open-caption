"use client";

import React, { useEffect, useRef, useState } from "react";
import type { SegmentTransition } from "@capseasy/shared";
import {
  TRANSITION_CATEGORIES,
  paramTransitionStyle,
  transitionsInCategory,
  type TransitionBase,
  type TransitionParams,
  type TransitionRegistryEntry,
} from "@capseasy/compositions";
import { Button, Section, Slider } from "../controls";

/**
 * Drag source format (phase 2: the timeline drop target reads this).
 *   dataTransfer type: "application/x-captionit-transition"
 *   payload (JSON): { "type": "<registry id>", "durationMs": <number> }
 *   effectAllowed: "copy". A plain "text/plain" copy of the transition name is
 *   set alongside for debugging only — the drop target must read the MIME above.
 * Click-to-apply still works; dropping on a cut marker applies at that cut.
 */
export const TRANSITION_DRAG_MIME = "application/x-captionit-transition";
export interface TransitionDragPayload {
  type: string;
  durationMs: number;
}

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
  /**
   * Human label of the SELECTED join, e.g. "Cut after Clip 1" (null = no join
   * selected). The panel applies to the selected JOIN — the clip AFTER the cut —
   * never to "the selected cut" (there is no such concept in the code). Left
   * `undefined` by legacy callers that do not report join selection; then the
   * panel falls back to `transitionsDisabled` and still explains the state.
   */
  selectedJoinLabel?: string | null;
  /** True when the timeline has at least one join (cut) to select. */
  hasJoins?: boolean;
  /**
   * CAP-T12: true when the project has at least one video clip. Left
   * `undefined` by legacy callers; then the no-join box keeps the generic
   * copy. `false` = blank project (no video at all) — the box must not tell
   * the user to click a cut marker that does not exist.
   */
  hasVideo?: boolean;
  /** Select the first join in the timeline (offered when no join is selected). */
  onSelectFirstJoin?: () => void;
  /**
   * CAP-T05: the live cap for the selected join's transition
   * (`min(neighbour durations) - 1`). The duration slider stops at the cap
   * instead of inviting a drag the op can only silently clamp.
   */
  transitionDurationCapMs?: number;
}

/* ------------------------------------------------------------------ */
/* Live miniature previews.                                            */
/*                                                                     */
/* Each card renders the transition's OWN motion in miniature: two     */
/* scene blocks (emerald = outgoing clip, orange = incoming clip)      */
/* styled by paramTransitionStyle — the exact pure style function the   */
/* Remotion TransitionSeries export path uses for the same entry —      */
/* driven by a looping 30 fps rAF clock. No video is needed.           */
/*                                                                     */
/* Performance guardrails, same pattern as AnimatedTemplatePreview:    */
/*  - the still (mid-transition frame, p = 0.5) shows first; the live  */
/*    layer only starts when the card is in or near the viewport       */
/*    (IntersectionObserver, 240px margin),                            */
/*  - at most 3 transition previews animate at once (local FIFO slot   */
/*    budget below — the shared livePreviewBudget.ts kinds are          */
/*    "template" | "social" and this file may not extend it),          */
/*  - leaving the viewport releases the slot and stops the clock;      */
/*    unmounting does the same,                                        */
/*  - prefers-reduced-motion keeps the still, always.                  */
/*                                                                     */
/* The overlays (dip colour, light leak, glitch slice, stinger bars)   */
/* mirror paramOverlay in packages/compositions/src/transitions.tsx    */
/* with the same formulas — that function is not exported, so the      */
/* miniature re-implements it; keep the two in sync. One deliberate    */
/* deviation: rotate uses perspective(360px) instead of the export's    */
/* perspective(1200px) — at card size 1200px reads flat; the rotation  */
/* angles are unchanged, only the foreshortening distance.             */
/* ------------------------------------------------------------------ */

const MAX_LIVE_TRANSITION_PREVIEWS = 3;
let liveTransitionCount = 0;
const transitionWaiters: Array<() => void> = [];
function acquireTransitionSlot(grant: () => void): boolean {
  if (liveTransitionCount < MAX_LIVE_TRANSITION_PREVIEWS) {
    liveTransitionCount += 1;
    return true;
  }
  transitionWaiters.push(grant);
  return false;
}
function releaseTransitionSlot(): void {
  liveTransitionCount = Math.max(0, liveTransitionCount - 1);
  while (liveTransitionCount < MAX_LIVE_TRANSITION_PREVIEWS && transitionWaiters.length > 0) {
    const next = transitionWaiters.shift()!;
    liveTransitionCount += 1;
    next();
  }
}
function cancelTransitionWait(grant: () => void): void {
  const i = transitionWaiters.indexOf(grant);
  if (i >= 0) transitionWaiters.splice(i, 1);
}

const reducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const fmt = (n: number): string => String(round3(n));

/** Outgoing scene: emerald block with a dark disc + bar marker. */
const SceneA: React.FC = () => (
  <div className="absolute inset-0" style={{ backgroundColor: "#34D399" }}>
    <div className="absolute left-[14%] top-[20%] h-[42%] w-[28%] rounded-full" style={{ backgroundColor: "#141412" }} />
    <div className="absolute bottom-[16%] left-[14%] h-[10%] w-[48%] rounded-sm" style={{ backgroundColor: "#141412", opacity: 0.85 }} />
  </div>
);

/** Incoming scene: orange block with a dark square + bar marker (distinct from A). */
const SceneB: React.FC = () => (
  <div className="absolute inset-0" style={{ backgroundColor: "#FFA946" }}>
    <div className="absolute right-[14%] top-[20%] h-[42%] w-[28%] rounded-sm" style={{ backgroundColor: "#141412" }} />
    <div className="absolute bottom-[16%] right-[14%] h-[10%] w-[48%] rounded-sm" style={{ backgroundColor: "#141412", opacity: 0.85 }} />
  </div>
);

/** Overlay layers for one base at progress p — mirrors paramOverlay (transitions.tsx). */
const TransitionOverlay: React.FC<{
  base: TransitionBase;
  params: TransitionParams;
  direction: "entering" | "exiting";
  p: number;
  children: React.ReactNode;
}> = ({ base, params, direction, p, children }) => {
  const entering = direction === "entering";
  if (base === "fade" && params.color) {
    return <div style={{ position: "absolute", inset: 0, backgroundColor: params.color, opacity: entering ? 1 - p : p, pointerEvents: "none" }} />;
  }
  if (base === "light") {
    const color = params.color ?? "#ffffff";
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `radial-gradient(circle at 30% 20%, ${color}, transparent 70%)`,
          opacity: fmt(Math.sin(Math.PI * Math.max(0, Math.min(1, p))) * 0.9),
        }}
      />
    );
  }
  if (base === "glitch") {
    const intensity = params.intensity ?? 0.5;
    const slices = params.slices ?? 3;
    const top = (17 + slices * 7 + Math.floor(p * 6) * 11) % 70;
    const height = 9 + ((slices * 3) % 6);
    const sign = params.shift === "left" ? -1 : params.shift === "right" ? 1 : entering ? 1 : -1;
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          clipPath: `inset(${fmt(top)}% 0 ${fmt(100 - top - height)}% 0)`,
          transform: `translateX(${fmt(sign * intensity * 28 * Math.cos(p * 14))}px)`,
        }}
      >
        {children}
      </div>
    );
  }
  if (base === "stinger") {
    const color = params.color ?? "#ffffff";
    const bars = params.bars ?? 1;
    const flash = fmt((1 - Math.abs(2 * p - 1)) * 0.9);
    const barEls = [];
    for (let i = 0; i < bars; i++) {
      barEls.push(
        <div
          key={i}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: "10%",
            left: `${fmt(p * 130 - 15 - i * 14)}%`,
            backgroundColor: color,
            transform: "skewX(-12deg)",
          }}
        />,
      );
    }
    return (
      <>
        <div style={{ position: "absolute", inset: 0, backgroundColor: color, opacity: flash, pointerEvents: "none" }} />
        {barEls}
      </>
    );
  }
  return null;
};

/** Full-frame perspective reads flat at card size; keep the angles, shorten the distance. */
const previewStyle = (style: React.CSSProperties): React.CSSProperties =>
  typeof style.transform === "string" && style.transform.includes("perspective(1200px)")
    ? { ...style, transform: style.transform.replace("perspective(1200px)", "perspective(360px)") }
    : style;

const TransitionPreviewInner: React.FC<{ entry: TransitionRegistryEntry }> = ({ entry }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [live, setLive] = useState(false);
  // Still frame until live: the transition midpoint, so the poster already shows the motion.
  const [p, setP] = useState(0.5);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || reducedMotion() || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => setNear(entries.some((e) => e.isIntersecting)), { rootMargin: "240px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near) {
      setLive(false);
      setP(0.5);
      return;
    }
    let granted = false;
    const grant = () => {
      granted = true;
      setLive(true);
    };
    if (acquireTransitionSlot(grant)) grant();
    return () => {
      if (granted) {
        setLive(false);
        releaseTransitionSlot();
      } else {
        cancelTransitionWait(grant);
      }
    };
  }, [near]);

  // Looping clock at 30 fps: the transition plays over its default duration,
  // holds the settled incoming scene ~500 ms, then restarts.
  useEffect(() => {
    if (!live) return;
    const loopMs = entry.defaultDurationMs + 500;
    let raf = 0;
    const frameMs = 1000 / 30;
    const t0 = performance.now();
    let lastStep = -1;
    const tick = (now: number) => {
      const step = Math.floor((now - t0) / frameMs);
      if (step !== lastStep) {
        lastStep = step;
        const cycle = (now - t0) % loopMs;
        setP(Math.min(1, cycle / entry.defaultDurationMs));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live, entry.defaultDurationMs]);

  const exitStyle = previewStyle(paramTransitionStyle(entry.base, entry.params, "exiting", p));
  const enterStyle = previewStyle(paramTransitionStyle(entry.base, entry.params, "entering", p));
  return (
    <div
      ref={boxRef}
      data-transition-preview={entry.id}
      {...(live ? { "data-transition-live": "true" } : {})}
      className="relative aspect-[16/9] overflow-hidden rounded-md bg-black"
      aria-hidden
    >
      <div className="absolute inset-0" style={exitStyle}>
        <SceneA />
        <TransitionOverlay base={entry.base} params={entry.params} direction="exiting" p={p}>
          <SceneA />
        </TransitionOverlay>
      </div>
      <div className="absolute inset-0" style={enterStyle}>
        <SceneB />
        <TransitionOverlay base={entry.base} params={entry.params} direction="entering" p={p}>
          <SceneB />
        </TransitionOverlay>
      </div>
    </div>
  );
};

/** Memoized on the entry alone: entries are module constants, so a parent re-render (a
 *  selection change, the playback time feed) must not re-render 100 previews. */
const TransitionPreview = React.memo(TransitionPreviewInner, (a, b) => a.entry === b.entry);

/**
 * Transitions: 100 premium transitions in 10 groups, plus split. Each card shows a
 * real animated miniature of that transition (same style math as the export path),
 * looping while near the viewport. Tapping a card applies that transition at the
 * SELECTED JOIN — the clip after the cut — with its default duration; the
 * duration slider adjusts the applied one. Dragging a card onto a cut marker in
 * the timeline applies it there (phase 2 drop target).
 */
export const TransitionsPanel: React.FC<TransitionsPanelProps> = ({
  currentTransition,
  onApplyTransition,
  onClearTransition,
  onSplitAtPlayhead,
  transitionsDisabled = false,
  splitDisabled = false,
  selectedJoinLabel,
  hasJoins = false,
  hasVideo,
  onSelectFirstJoin,
  transitionDurationCapMs,
}) => {
  // selectedJoinLabel === undefined: legacy caller, no join info — fall back to the
  // old disabled flag. === null: the caller reports no join selected.
  const noJoinSelected = selectedJoinLabel === undefined ? transitionsDisabled : selectedJoinLabel === null;
  // CAP-T05: the slider's max is the live cap (never above the 2000 ms schema
  // bound, never below the 100 ms floor); without a cap the schema bound stands.
  const durationMaxMs = transitionDurationCapMs == null ? 2000 : Math.max(100, Math.min(2000, transitionDurationCapMs));
  const durationCapped = transitionDurationCapMs != null && transitionDurationCapMs < 2000;
  const hint = selectedJoinLabel
    ? `Applying to ${selectedJoinLabel}. Drag onto a cut in the timeline, or tap to apply at the selected cut.`
    : "Drag onto a cut in the timeline, or tap to apply at the selected cut.";

  return (
    <div className="h-full overflow-y-auto">
      <Section title="Split">
        <Button tone="primary" onClick={onSplitAtPlayhead} disabled={splitDisabled} className="w-full">
          Split at playhead
        </Button>
      </Section>
      <Section title="Transitions" hint={hint}>
        {selectedJoinLabel ? (
          <p className="mb-2 text-[12px] font-semibold text-st-text">Applying to {selectedJoinLabel}</p>
        ) : null}
        {noJoinSelected ? (
          <div className="mb-3 rounded-lg border border-st-line bg-st-panel p-3">
            <p className="text-[12px] leading-snug text-st-text">
              {/* CAP-T12: three states, not one impossible instruction. No video
                  at all: say so (and hide the split button — there is nothing to
                  split). One clip: split first. Joins exist: the old copy. Legacy
                  callers (hasVideo undefined) keep the old copy. */}
              {hasVideo === false
                ? "Add a video first — transitions need a clip to join."
                : hasVideo === true && !hasJoins
                  ? "No cuts yet — split the video at the playhead to create a cut, then pick a transition."
                  : "No cut selected — click a cut marker in the timeline to pick a join, or split at the playhead."}
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {hasVideo === false ? null : (
                <Button tone="primary" onClick={onSplitAtPlayhead} disabled={splitDisabled} className="w-full">
                  Split at playhead to create a cut
                </Button>
              )}
              {hasJoins && onSelectFirstJoin ? (
                <Button onClick={onSelectFirstJoin} className="w-full">
                  Select the first cut
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {currentTransition ? (
          <>
            <Slider
              label="Duration"
              value={currentTransition.durationMs}
              min={100}
              max={durationMaxMs}
              step={50}
              unit=" ms"
              onChange={(v) => onApplyTransition({ type: currentTransition.type, durationMs: v })}
            />
            {durationCapped ? (
              <p className="text-[12px] leading-snug text-st-muted">
                Max {durationMaxMs} ms — a neighbouring clip is too short for a longer transition.
              </p>
            ) : null}
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
                      aria-disabled={transitionsDisabled || noJoinSelected}
                      aria-label={`Apply ${entry.name}`}
                      disabled={transitionsDisabled}
                      draggable={!transitionsDisabled}
                      onDragStart={(e) => {
                        const payload: TransitionDragPayload = { type: entry.id, durationMs: entry.defaultDurationMs };
                        e.dataTransfer.setData(TRANSITION_DRAG_MIME, JSON.stringify(payload));
                        e.dataTransfer.setData("text/plain", entry.name);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => {
                        if (transitionsDisabled) return;
                        // CAP-T01: never swallow a tap — with no join selected
                        // the apply handler surfaces the "Select a cut…"
                        // note instead of doing nothing silently.
                        onApplyTransition({ type: entry.id, durationMs: entry.defaultDurationMs });
                      }}
                      className={`relative rounded-lg border p-1.5 text-left disabled:cursor-not-allowed disabled:opacity-40 ${
                        selected ? "border-st-em bg-st-raised text-st-text" : "border-st-line bg-st-panel text-st-text"
                      }`}
                    >
                      <TransitionPreview entry={entry} />
                      {selected ? (
                        <span className="absolute right-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ backgroundColor: "#34D399", color: "#141412" }}>
                          Applied
                        </span>
                      ) : null}
                      <span className="mt-1 block px-1 pb-0.5 text-[12px] font-semibold leading-tight">{entry.name}</span>
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
