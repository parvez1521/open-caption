"use client";

import React, { useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { INTRO_A_MS } from "./intro";

/* ── brand intro ─────────────────────────────────────────────────
 * Pure CSS keyframes, shipped in the server HTML; they start once the
 * loader is painted (see intro.ts) and run on the compositor (transform + opacity only),
 * so it stays smooth while the rest of the page hydrates and mounts
 * videos, players and WebGL. It exits once the app has hydrated, and
 * the hero's CSS entrance is released by the same class (html.ce-out).
 *
 * Once per browser session (always in dev, or with ?intro), never for
 * reduced-motion users.
 *
 * What it shows: the caption-lines mark above a caption card, where our own
 * line — "Every word, on screen, on time." — types itself word by word with
 * the highlight wipe (the wipe is a caption mechanic, so it belongs here).
 * The progress is a caption line growing with an orange cursor block at its
 * tip, tied to this entrance's own playback timeline — it is the entrance
 * playing, not a load percentage, so there is no % counter anywhere.
 * ─────────────────────────────────────────────────────────────── */

const WORDS = ["Every", "word,", "on", "screen,", "on", "time."];
const EXPO_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const BACK_OUT = "cubic-bezier(0.34, 1.56, 0.64, 1)";
const POWER3_OUT = "cubic-bezier(0.215, 0.61, 0.355, 1)";
const POWER3_IN = "cubic-bezier(0.55, 0.055, 0.675, 0.19)";
const EXPO_IN_OUT = "cubic-bezier(0.87, 0, 0.13, 1)";
const SINE = "cubic-bezier(0.37, 0, 0.63, 1)";

/** ms after the intro starts (html.ce-go) */
const WORD_AT = (i: number) => 600 + i * 230;
const SHEET_DELAY = 180;
const SHEET_MS = 950;

const CSS = `
html[data-intro="skip"] .ce-intro{display:none}
@media (prefers-reduced-motion: reduce){.ce-intro{display:none}}
html:not(.ce-go) .ce-intro *{animation-play-state:paused!important}
.ce-intro [data-mark]{animation:ce-mark-in .7s ${EXPO_OUT} both}
@keyframes ce-mark-in{from{opacity:0;transform:translateY(10px) scale(.94)}to{opacity:1;transform:none}}
.ce-intro [data-card]{animation:ce-card-in .7s ${EXPO_OUT} 120ms both}
@keyframes ce-card-in{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.ce-intro [data-w]{animation:ce-pop .45s ${BACK_OUT} both}
@keyframes ce-pop{from{opacity:0;transform:translateY(14px) scale(.92)}to{opacity:1;transform:none}}
.ce-intro [data-wt]{animation:ce-dim .25s ease-out both}
@keyframes ce-dim{from{opacity:1}to{opacity:.45}}
.ce-intro [data-hl]{transform-origin:0 50%;animation:ce-hl-in .32s ${POWER3_OUT} both,ce-hl-out .2s ease-out forwards}
.ce-intro [data-hl].last{animation:ce-hl-in .32s ${POWER3_OUT} both}
@keyframes ce-hl-in{from{opacity:0;transform:scaleX(.2)}to{opacity:1;transform:none}}
@keyframes ce-hl-out{to{opacity:0}}
.ce-intro [data-capline]{animation:ce-capline ${INTRO_A_MS}ms cubic-bezier(.45,0,.55,1) 50ms both}
@keyframes ce-capline{from{width:0}to{width:240px}}
html.ce-out .ce-intro [data-inner]{animation:ce-out .45s ${POWER3_IN} both}
html.ce-out .ce-intro [data-foot]{animation:ce-fade .3s ease-in both}
html.ce-out .ce-intro [data-sheet]{animation:ce-sheet ${SHEET_MS}ms ${EXPO_IN_OUT} ${SHEET_DELAY}ms both}
@keyframes ce-out{to{opacity:0;transform:translateY(-36px)}}
@keyframes ce-fade{to{opacity:0}}
@keyframes ce-sheet{to{transform:translateY(calc(-100% - 16vh))}}
`;

export function Loader({ onDone }: { onDone: () => void }) {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (html.dataset.intro !== "play" || reduced) {
      onDone();
      const t = setTimeout(() => setGone(true), 0);
      return () => clearTimeout(t);
    }
    // the app has hydrated: exit as soon as the entrance sequence has finished (it may already have)
    html.style.overflow = "hidden";
    const timers: ReturnType<typeof setTimeout>[] = [];
    let left = false;
    const leave = () => {
      if (left) return;
      left = true;
      html.classList.add("ce-out");
      timers.push(
        setTimeout(() => {
          html.style.overflow = "";
          onDone();
        }, SHEET_DELAY + 120),
        setTimeout(() => {
          html.dataset.intro = "skip"; // client navigation back home never replays it
          setGone(true);
        }, SHEET_DELAY + SHEET_MS + 80),
      );
    };
    const check = () => {
      if (html.classList.contains("ce-a-done") || html.classList.contains("ce-out")) leave();
    };
    const mo = new MutationObserver(check);
    mo.observe(html, { attributes: true, attributeFilter: ["class"] });
    check();
    return () => {
      mo.disconnect();
      timers.forEach(clearTimeout);
      html.style.overflow = "";
    };
  }, [onDone]);

  if (gone) return null;
  return (
    <div className="ce-intro pointer-events-none fixed inset-0 z-[100]" aria-hidden>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div data-sheet className="pointer-events-auto absolute inset-0 bg-[#1E1E1B]">
        {/* curved lip under the sheet: the edge you see as it slides away */}
        <div className="absolute left-[-10%] top-full h-[16vh] w-[120%] rounded-b-[50%] bg-[#1E1E1B]" />
        <div className="absolute inset-0 overflow-hidden">
          {/* the same soft glows as the hero, so the reveal feels continuous */}
          <div className="absolute -left-32 top-10 h-[420px] w-[420px] rounded-full bg-[#252B26]/70 blur-3xl" />
          <div className="absolute -right-24 bottom-10 h-[380px] w-[380px] rounded-full bg-[#FFA946]/25 blur-3xl" />

          <div data-inner className="relative grid h-full place-items-center px-6">
            <div className="flex flex-col items-center">
              <div data-mark>
                <Logo variant="mark" tone="light" height={36} />
              </div>

              {/* the caption card: our line, played as a caption — a highlight wipes onto each word as it's "spoken" */}
              <div data-card className="mt-6 rounded-2xl border border-[#FFFFEB]/10 bg-[#141412] px-6 py-5 sm:px-8">
                <div className="flex flex-wrap items-center justify-center gap-x-[14px] gap-y-2 text-[18px] font-extrabold uppercase tracking-[-0.01em] text-[#FFFFEB] sm:text-[22px]">
                  {WORDS.map((w, i) => {
                    const last = i === WORDS.length - 1;
                    return (
                      <span key={w} data-w className="relative inline-block" style={{ animationDelay: `${WORD_AT(i)}ms` }}>
                        <span
                          data-hl
                          className={`absolute -inset-x-[6px] -inset-y-[4px] rounded-[10px] ${last ? "last bg-[#34D399]" : "bg-[#252B26]"}`}
                          style={{ animationDelay: last ? `${WORD_AT(i)}ms` : `${WORD_AT(i)}ms, ${WORD_AT(i + 1)}ms` }}
                        />
                        <span data-wt={last ? undefined : ""} className={`relative ${last ? "text-[#141412]" : ""}`} style={last ? undefined : { animationDelay: `${WORD_AT(i + 1)}ms` }}>
                          {w}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* caption-line progress: one line growing with an orange cursor block at its tip, tied to this entrance's own timeline */}
              <div data-foot className="mt-8 flex flex-col items-center gap-3">
                <div className="relative h-[13px] w-[240px]">
                  <div data-capline className="absolute left-0 top-0 h-full rounded-full bg-[#FFFFEB]">
                    <span className="absolute right-0 top-0 h-[13px] w-[13px] translate-x-1/2 rounded-[2.5px] bg-[#FFA946]" />
                  </div>
                </div>
                <p className="text-[13px] font-semibold text-[#FFFFEB]/70">Opening your studio…</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
