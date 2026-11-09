"use client";

import React from "react";
import { createPortal } from "react-dom";

/**
 * Entrance / Exit picker: a row in the Style panel that opens a popup of looping previews, so creators pick an
 * animation by seeing it. Previews are rendered by the real composition:
 *   pnpm --filter @capseasy/compositions motion-previews   ->   public/motion/{enter,exit}-<type>.mp4
 */

const NAMES: Record<string, string> = {
  none: "None", fade: "Fade", rise: "Rise", drop: "Drop", pop: "Pop", zoom: "Zoom", "slide-left": "Slide from left", "slide-right": "Slide from right",
  "blur-in": "Blur in", wave: "Wave", flip: "Flip", elastic: "Elastic", glitch: "Glitch", "glitch-slice": "Glitch slice", typewriter: "Typewriter", "mask-reveal": "Wipe",
  flicker: "Neon flicker", scramble: "Decode scramble", "block-reveal": "Block reveal", roll: "Word roll", "write-on": "Pen reveal", jelly: "Jelly settle",
  "letter-spin": "Spin-in letters", "letter-elastic": "Elastic letters", "letter-snap": "Snap-in letters", "letter-burst": "Centre burst", "letter-stretch": "Stretch-up letters",
  "zoom-out": "Zoom out", "blur-out": "Blur out", fall: "Fall", "slide-up": "Slide up",
};
/** the letter animators leave the card backwards, so they read as "out" in the Exit picker */
const EXIT_NAMES: Record<string, string> = {
  "letter-spin": "Spin-out letters", "letter-elastic": "Elastic letters out", "letter-snap": "Snap-out letters", "letter-burst": "Centre collapse", "letter-stretch": "Stretch-down letters",
};
export const motionName = (t: string, kind: "enter" | "exit" = "enter") => (kind === "exit" ? EXIT_NAMES[t] : undefined) ?? NAMES[t] ?? t.replace(/-/g, " ");

export interface MotionGroup {
  label: string;
  hint?: string;
  types: readonly string[];
  /** shown greyed out (the current look can't play them) */
  disabled?: boolean;
}

const Preview: React.FC<{ kind: "enter" | "exit"; type: string; className?: string }> = ({ kind, type, className = "" }) =>
  type === "none" ? (
    <span className={`grid place-items-center bg-st-raised text-[11px] font-medium text-st-muted ${className}`}>No animation</span>
  ) : (
    <video src={`/motion/${kind}-${type}.mp4`} autoPlay loop muted playsInline preload="metadata" aria-hidden className={`bg-side object-cover ${className}`} />
  );

interface Props {
  label: string;
  kind: "enter" | "exit";
  value: string;
  groups: MotionGroup[];
  onChange: (type: string) => void;
}

export const MotionPicker: React.FC<Props> = ({ label, kind, value, groups, onChange }) => {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="flex items-center justify-between gap-3 text-sm text-st-text/90">
        <span>{label}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="flex min-w-0 items-center gap-2 rounded-lg border border-st-line bg-st-panel py-1 pl-1 pr-2.5 hover:border-st-lav hover:bg-st-raised"
        >
          <Preview kind={kind} type={value} className="h-7 w-14 shrink-0 rounded-md" />
          <span className="truncate text-sm">{motionName(value, kind)}</span>
          <span aria-hidden className="text-st-muted">›</span>
        </button>
      </div>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setOpen(false)}>
              <div role="dialog" aria-label={label} onClick={(e) => e.stopPropagation()} className="flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-st-line bg-st-panel pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-h-[85vh] sm:rounded-2xl">
                <div className="flex items-center justify-between border-b border-st-line px-5 py-4">
                  <h2 className="text-lg font-semibold">{label}</h2>
                  <button onClick={() => setOpen(false)} aria-label="Close" className="-mr-2 grid h-10 w-10 place-items-center rounded-full text-st-muted hover:bg-st-raised hover:text-st-text">✕</button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                  {groups.filter((g) => g.types.length).map((g) => (
                    <section key={g.label} className="mb-5 last:mb-0">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-st-muted">{g.label}</h3>
                      {g.hint ? <p className="mt-0.5 text-xs text-st-faint">{g.hint}</p> : null}
                      <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                        {g.types.map((t) => {
                          const on = t === value;
                          return (
                            <button
                              key={t}
                              type="button"
                              disabled={g.disabled}
                              aria-pressed={on}
                              onClick={() => { onChange(t); setOpen(false); }}
                              className={`group overflow-hidden rounded-xl border text-left transition-[border-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-40 ${on ? "border-obsidian ring-2 ring-side" : "border-st-line hover:border-st-lav"}`}
                            >
                              <Preview kind={kind} type={t} className="block aspect-[2/1] w-full" />
                              <span className="flex items-center justify-between px-2.5 py-2 text-sm">
                                {motionName(t, kind)}
                                {on ? <span className="rounded-full bg-emerald-accent px-2 py-0.5 text-[10px] font-semibold text-[#141412]">In use</span> : null}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
};
