"use client";

import React, { useEffect, useState } from "react";

/* ── brand intro ─────────────────────────────────────────────────
 * Pure CSS keyframes, shipped in the server HTML; they start once the
 * loader is painted (see intro.ts) and run on the compositor (transform + opacity only),
 * so it stays smooth while the rest of the page hydrates and mounts
 * videos, players and WebGL. It exits once the app has hydrated, and
 * the hero's CSS entrance is released by the same class (html.ce-out).
 *
 * Once per browser session (always in dev, or with ?intro), never for
 * reduced-motion users.
 * ─────────────────────────────────────────────────────────────── */

const WORDS = ["Don't", "edit,", "just", "upload."];
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
.ce-intro [data-bar]{transform-origin:50% 100%;animation:1.75s ${SINE} both}
.ce-intro [data-bar]:nth-child(1){animation-name:ce-bar1}
.ce-intro [data-bar]:nth-child(2){animation-name:ce-bar2;animation-delay:70ms}
.ce-intro [data-bar]:nth-child(3){animation-name:ce-bar3;animation-delay:140ms}
@keyframes ce-bar1{0%{transform:scaleY(0);animation-timing-function:${BACK_OUT}}24%{transform:scaleY(1)}38%{transform:scaleY(.55)}52%{transform:scaleY(1.25)}66%{transform:scaleY(.7)}80%{transform:scaleY(1.1)}100%{transform:scaleY(1)}}
@keyframes ce-bar2{0%{transform:scaleY(0);animation-timing-function:${BACK_OUT}}24%{transform:scaleY(1)}38%{transform:scaleY(1.2)}52%{transform:scaleY(.6)}66%{transform:scaleY(1.3)}80%{transform:scaleY(.8)}100%{transform:scaleY(1)}}
@keyframes ce-bar3{0%{transform:scaleY(0);animation-timing-function:${BACK_OUT}}24%{transform:scaleY(1)}38%{transform:scaleY(.8)}52%{transform:scaleY(1.3)}66%{transform:scaleY(.6)}80%{transform:scaleY(1.15)}100%{transform:scaleY(1)}}
.ce-intro [data-bars]{transform-origin:50% 100%;animation:ce-idle 1.1s ${SINE} 1.9s infinite alternate both}
@keyframes ce-idle{from{transform:scaleY(1)}to{transform:scaleY(.82)}}
.ce-intro [data-char]{display:inline-block;animation:ce-rise .8s ${EXPO_OUT} both}
@keyframes ce-rise{from{transform:translateY(115%) rotate(4deg)}to{transform:none}}
.ce-intro [data-w]{animation:ce-pop .45s ${BACK_OUT} both}
@keyframes ce-pop{from{opacity:0;transform:translateY(14px) scale(.92)}to{opacity:1;transform:none}}
.ce-intro [data-wt]{animation:ce-dim .25s ease-out both}
@keyframes ce-dim{from{opacity:1}to{opacity:.45}}
.ce-intro [data-hl]{transform-origin:0 50%;animation:ce-hl-in .32s ${POWER3_OUT} both,ce-hl-out .2s ease-out forwards}
.ce-intro [data-hl].last{animation:ce-hl-in .32s ${POWER3_OUT} both}
@keyframes ce-hl-in{from{opacity:0;transform:scaleX(.2)}to{opacity:1;transform:none}}
@keyframes ce-hl-out{to{opacity:0}}
.ce-intro [data-line]{transform-origin:0 50%;animation:ce-line 1.6s cubic-bezier(.45,0,.55,1) 50ms both}
@keyframes ce-line{from{transform:scaleX(0)}to{transform:none}}
@property --ce-n{syntax:"<integer>";inherits:false;initial-value:0}
.ce-intro [data-count]{counter-reset:ce-n var(--ce-n);animation:ce-count 1.6s cubic-bezier(.45,0,.55,1) 50ms both}
.ce-intro [data-count]::before{content:counter(ce-n, decimal-leading-zero)}
@keyframes ce-count{to{--ce-n:100}}
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
              <div className="flex items-end gap-3 sm:gap-4">
                <div data-bars className="flex h-[52px] items-end gap-[6px] sm:h-[64px]">
                  {["#FFFFEB", "#FFA946", "#34D399"].map((c, i) => (
                    <span key={c} data-bar className="block w-[10px] rounded-full sm:w-3" style={{ background: c, height: ["62%", "100%", "80%"][i] }} />
                  ))}
                </div>
                <div className="overflow-hidden pb-1 text-[44px] font-extrabold leading-none tracking-[-0.04em] text-[#FFFFEB] sm:text-[64px]">
                  {"Captions".split("").map((ch, i) => (
                    <span key={`m${i}`} data-char style={{ animationDelay: `${100 + i * 24}ms` }}>
                      {ch}
                    </span>
                  ))}
                  {"Easy".split("").map((ch, i) => (
                    <span key={`a${i}`} data-char className="font-accent text-[1.08em] font-normal tracking-[-0.01em]" style={{ animationDelay: `${100 + (8 + i) * 24}ms` }}>
                      {ch}
                    </span>
                  ))}
                </div>
              </div>

              {/* the hero line, played as a caption: a highlight wipes onto each word as it's "spoken" */}
              <div className="mt-7 flex items-center gap-[14px] text-[18px] font-extrabold uppercase tracking-[-0.01em] text-[#FFFFEB] sm:mt-9 sm:text-[22px]">
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
          </div>

          {/* progress: one hairline across the bottom, a big quiet counter above its left end */}
          <div data-foot className="absolute bottom-7 left-6 font-extrabold leading-none tracking-[-0.05em] text-[#FFFFEB]/[0.14] tabular-nums sm:bottom-9 sm:left-10">
            <span data-count className="text-[72px] sm:text-[120px]" />
            <span className="ml-1 align-top text-[22px] sm:text-[34px]">%</span>
          </div>
          <div data-foot className="absolute bottom-5 left-6 right-6 h-px bg-[#FFFFEB]/10 sm:bottom-6 sm:left-10 sm:right-10">
            <div data-line className="h-full bg-gradient-to-r from-[#FFA946] via-[#FFFFEB] to-[#34D399]" />
          </div>
        </div>
      </div>
    </div>
  );
}
