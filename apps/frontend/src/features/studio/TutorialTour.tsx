"use client";

import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { TUTORIAL_STEPS, isFirstStep, isLastStep, markTutorialSeen, stepIndexAfter } from "./tutorial";

/**
 * Coach-mark tour over the studio: a dim overlay with a highlight ring around the current step's
 * anchor (`data-tour` element), plus a small popover card. The overlay covers the whole screen and
 * swallows pointer events, so a stray click while touring can never edit the document underneath.
 * If the anchor is missing or hidden (e.g. a mobile tab that isn't open), the card centres itself
 * with no highlight instead of breaking.
 */

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6;

export const TutorialTour: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = TUTORIAL_STEPS[index]!;
  const total = TUTORIAL_STEPS.length;

  const finish = useCallback(() => {
    markTutorialSeen();
    onClose();
  }, [onClose]);

  const measure = useCallback(() => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
    if (!el) return setRect(null);
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return setRect(null);
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step.anchor]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const on = () => measure();
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    const t = setInterval(measure, 400);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on, true);
      clearInterval(t);
    };
  }, [measure]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  // popover placement: below the anchor when there is room, above when there isn't, centred without one
  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;
  const cardW = Math.min(330, Math.max(260, vw - 32));
  let cardStyle: React.CSSProperties;
  if (rect) {
    const below = rect.top + rect.height + 190 < vh;
    const top = below ? rect.top + rect.height + PAD + 10 : Math.max(12, rect.top - PAD - 10 - 178);
    const left = Math.min(Math.max(12, rect.left), Math.max(12, vw - cardW - 12));
    cardStyle = { position: "absolute", top, left, width: cardW };
  } else {
    cardStyle = { position: "absolute", top: "50%", left: "50%", width: cardW, transform: "translate(-50%, -50%)" };
  }

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Studio tour">
      {/* dim + input shield: covers everything, swallows every click so the doc can't be edited mid-tour */}
      <div className="absolute inset-0" style={{ background: rect ? "transparent" : "rgba(26,26,26,0.55)" }} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        {rect ? (
          <div
            aria-hidden
            className="absolute rounded-xl"
            style={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
              boxShadow: "0 0 0 9999px rgba(26,26,26,0.55)",
              border: "2px solid #34D399",
              pointerEvents: "none",
            }}
          />
        ) : null}
      </div>

      <div className="rounded-2xl border border-[#1A1A1A]/15 bg-[#FFFFEB] p-5 shadow-[0_18px_50px_-12px_rgba(26,26,26,0.45)]" style={cardStyle}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1A1A1A]/50">
          Step {index + 1} of {total}
        </p>
        <h2 className="mt-1.5 font-display text-lg font-bold text-[#1A1A1A]">{step.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[#1A1A1A]/70">{step.body}</p>
        <div className="mt-3 flex items-center gap-1.5" aria-hidden>
          {TUTORIAL_STEPS.map((s, i) => (
            <span key={s.id} className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-[#34D399]" : "w-1.5 bg-[#1A1A1A]/20"}`} />
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={finish} className="rounded-full px-3 py-2 text-sm font-medium text-[#1A1A1A]/60 transition hover:text-[#1A1A1A]">
            Skip tour
          </button>
          <span className="flex-1" />
          {!isFirstStep(index) ? (
            <button type="button" onClick={() => setIndex((i) => stepIndexAfter(i, -1))} className="rounded-full border border-[#1A1A1A]/20 bg-[#FFFFEB] px-4 py-2 text-sm font-semibold text-[#1A1A1A] transition hover:bg-[#E4E4D0]">
              Back
            </button>
          ) : null}
          {isLastStep(index) ? (
            <button type="button" onClick={finish} className="rounded-full bg-[#1A1A1A] px-4 py-2 text-sm font-semibold text-[#FFFFEB] transition hover:bg-[#1A1A1A]/85">
              Finish
            </button>
          ) : (
            <button type="button" onClick={() => setIndex((i) => stepIndexAfter(i, 1))} className="rounded-full bg-[#1A1A1A] px-4 py-2 text-sm font-semibold text-[#FFFFEB] transition hover:bg-[#1A1A1A]/85">
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
