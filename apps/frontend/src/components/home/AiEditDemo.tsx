"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { CaptionedVideo } from "@capseasy/compositions";
import { ProjectSettingsSchema, type CaptionDoc, type OverlayItem, type ProjectSettings } from "@capseasy/shared";
import { getLook } from "@capseasy/templates";
import { AI_EDIT_STYLES, aiEditStyle } from "@/features/studio/aiEdit";
import { useLowEndDevice } from "@/lib/device";
import { CLIP_H, CLIP_W, FPS, lookFor, useTranscript } from "../spatial/ShowcaseKit";

/**
 * The homepage AI Edit demonstration. Everything the visitor sees happen to the
 * clip is REAL: the footage is a credited sample (public/hero, WIKITONGUES via
 * Wikimedia Commons), the transcript is its real Whisper transcript, and both
 * the "before" and "after" states are rendered by the same CaptionedVideo
 * composition the Studio previews and the export renders — the after state is
 * an ordinary settings object (the Punchy look, a hero-emphasised word, a hook
 * text overlay, one punch-in zoom as segment keyframes), exactly the state an
 * applied AI Edit plan produces. The style chips and the checklist beside the
 * frame are this demo's narration of the panel's flow; the four steps listed
 * are precisely the four effects visible in the render.
 */

export const DEMO_CLIP = "mckensie";
export const DEMO_STYLE_ID = "punchy";
export const DEMO_KEY_WORD = "world";
export const DEMO_HOOK_TEXT = "So we welcome people";
/** the Punchy chip lights up */
export const DEMO_CHIP_MS = 900;
/** the plan steps materialise, one by one */
export const DEMO_STEP_MS = [1500, 2050, 2600, 3150] as const;
/** the frame the static (reduced-motion) presentation rests on: the key word
 *  spoken, mid punch-in, hook still up */
export const DEMO_STILL_MS = 2100;

export interface DemoStep {
  label: string;
  detail: string;
}

/** The plan the demo narrates — labels and details in the panel's own phrasing. */
export function demoSteps(): DemoStep[] {
  const style = aiEditStyle(DEMO_STYLE_ID) ?? AI_EDIT_STYLES[0]!;
  const lookName = getLook(style.lookId)?.name ?? style.lookId;
  return [
    { label: "Caption look", detail: `Apply the “${lookName}” caption look` },
    { label: "Emphasise key words", detail: `Emphasise 1 word: “${DEMO_KEY_WORD}”` },
    { label: "Auto punch-in zooms", detail: `1 zoom at ${style.pacing.zoomIntensity ?? "strong"}` },
    { label: "Hook text", detail: `Show “${DEMO_HOOK_TEXT}” at the start` },
  ];
}

/** How much of the plan is visible at a moment of the first ("before") pass. */
export function demoPlanAt(ms: number): { stylePicked: boolean; stepsShown: number } {
  return {
    stylePicked: ms >= DEMO_CHIP_MS,
    stepsShown: DEMO_STEP_MS.filter((t) => ms >= t).length,
  };
}

/**
 * The edited state: the SAME doc with the key word hero-emphasised, and the
 * Punchy look's settings carrying the hook overlay + one punch-in zoom on the
 * key word (segment keyframes, the renderer's own zoom mechanism).
 */
export function buildDemoAfter(doc: CaptionDoc, durationMs: number): { doc: CaptionDoc; settings: ProjectSettings } {
  const style = aiEditStyle(DEMO_STYLE_ID) ?? AI_EDIT_STYLES[0]!;
  const base = lookFor(style.lookId);
  let hit = false;
  const afterDoc: CaptionDoc = {
    ...doc,
    words: doc.words.map((w) => {
      if (!hit && w.text.replace(/[^a-z]/gi, "").toLowerCase() === DEMO_KEY_WORD) {
        hit = true;
        return { ...w, emphasis: "hero" as const };
      }
      return w;
    }),
  };
  const hook: OverlayItem = {
    id: "ai-edit-demo-hook",
    kind: "text",
    text: DEMO_HOOK_TEXT,
    startMs: 0,
    endMs: 2400,
    x: 0.5,
    y: 0.16,
    scale: 1,
    rotation: 0,
    color: "#FFFFEB",
    fontSize: 76,
  };
  const settings = ProjectSettingsSchema.parse({
    ...base.settings,
    overlays: [hook],
    composition: {
      ...base.settings.composition,
      videoSegments: [
        {
          id: "ai-edit-demo-seg",
          sourceInMs: 0,
          sourceOutMs: durationMs,
          keyframes: [
            { id: "k1", atMs: 1500, property: "scale", value: 1, easing: "linear" },
            { id: "k2", atMs: 2150, property: "scale", value: 1.22, easing: "ease-out" },
            { id: "k3", atMs: 3000, property: "scale", value: 1.22, easing: "linear" },
            { id: "k4", atMs: 3600, property: "scale", value: 1, easing: "ease-in-out" },
          ],
        },
      ],
    },
  });
  return { doc: afterDoc, settings };
}

type Pass = "before" | "after";

export function AiEditDemo() {
  const { transcript, doc } = useTranscript(DEMO_CLIP);
  const durationMs = transcript?.durationMs ?? 6500;
  const lowEnd = useLowEndDevice();
  // reduced motion is read once, up front (this component only ever mounts
  // client-side): the demo then rests on the composed after-frame, never playing
  const [reduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [pass, setPass] = useState<Pass>(() => (reduced ? "after" : "before"));
  const [ms, setMs] = useState(0);
  const playerRef = useRef<PlayerRef | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const prevMs = useRef(0);
  const [near, setNear] = useState(false);

  const beforeLook = useMemo(() => lookFor(aiEditStyle("clean")!.lookId), []);
  const after = useMemo(() => (doc ? buildDemoAfter(doc, durationMs) : null), [doc, durationMs]);
  const input = useMemo(() => {
    if (!doc) return null;
    const state = pass === "after" && after ? after : { doc, settings: beforeLook.settings };
    const style = pass === "after" && after ? lookFor(aiEditStyle(DEMO_STYLE_ID)!.lookId).style : beforeLook.style;
    return {
      src: `/hero/${DEMO_CLIP}.raw.mp4`,
      media: { width: CLIP_W, height: CLIP_H, fps: FPS, durationMs, rotation: 0 },
      doc: state.doc,
      style,
      settings: state.settings,
      mode: "burn" as const,
    };
  }, [doc, pass, after, beforeLook, durationMs]);

  // mount the player only when the section approaches (the page's lazy pattern)
  useEffect(() => {
    const el = boxRef.current;
    if (!el || near) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setNear(true), { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  // play while on screen, pause off-screen; never autoplay under reduced motion
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !near || lowEnd) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting && !reduced) playerRef.current?.play();
        else playerRef.current?.pause();
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near, lowEnd, reduced]);

  // reduced motion: rest on the composed after-frame
  useEffect(() => {
    if (reduced && near && doc) playerRef.current?.seekTo(Math.round((DEMO_STILL_MS / 1000) * FPS));
  }, [reduced, near, doc, pass]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const on = (e: { detail: { frame: number } }) => {
      const t = (e.detail.frame / FPS) * 1000;
      // the loop wrapped: the edited pass follows the planning pass, then it repeats
      if (prevMs.current > durationMs - 1500 && t < 1000) setPass((cur) => (cur === "before" ? "after" : "before"));
      prevMs.current = t;
      setMs(t);
    };
    p.addEventListener("frameupdate", on);
    return () => p.removeEventListener("frameupdate", on);
  }, [durationMs, near, doc]);

  const steps = demoSteps();
  const plan = pass === "after" ? { stylePicked: true, stepsShown: steps.length } : demoPlanAt(ms);

  return (
    <div data-ai-edit-demo className="overflow-hidden rounded-[2rem] border border-[#FFFFEB]/10 bg-[#1E1E1B] p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row">
        <div ref={boxRef} className="relative mx-auto w-full max-w-[240px] shrink-0 overflow-hidden rounded-[18px] bg-[#0d0d0d]" style={{ aspectRatio: `${CLIP_W} / ${CLIP_H}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/hero/${DEMO_CLIP}.raw.webp`} alt="Still from the sample clip" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
          {doc && near && !lowEnd && input ? (
            <Player
              ref={playerRef}
              component={CaptionedVideo as unknown as React.ComponentType<Record<string, unknown>>}
              inputProps={input as unknown as Record<string, unknown>}
              durationInFrames={Math.max(1, Math.ceil((durationMs / 1000) * FPS))}
              fps={FPS}
              compositionWidth={CLIP_W}
              compositionHeight={CLIP_H}
              style={{ width: "100%", height: "100%", position: "relative" }}
              loop
              controls={false}
              clickToPlay={false}
              acknowledgeRemotionLicense
              numberOfSharedAudioTags={0}
            />
          ) : null}
          <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white">
            {pass === "after" ? "After AI Edit" : "Before"}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Edit styles">
            {AI_EDIT_STYLES.map((s) => {
              const picked = plan.stylePicked && s.id === DEMO_STYLE_ID;
              return (
                <span
                  key={s.id}
                  aria-pressed={picked}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-300 ${picked ? "border-[#34D399] bg-[#34D399] text-[#141412]" : "border-[#FFFFEB]/15 text-[#FFFFEB]/60"}`}
                >
                  {s.name}
                </span>
              );
            })}
          </div>
          <ul className="mt-4 space-y-2" aria-label="The edit plan">
            {steps.map((step, i) => (
              <li
                key={step.label}
                className={`flex items-start gap-2.5 rounded-xl border border-[#FFFFEB]/10 bg-[#262622] px-3.5 py-2.5 transition-opacity duration-500 ${i < plan.stepsShown ? "opacity-100" : "pointer-events-none opacity-0"}`}
                aria-hidden={i >= plan.stepsShown}
              >
                <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded bg-[#34D399] text-[10px] font-bold text-[#141412]">✓</span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-[#FFFFEB]">{step.label}</span>
                  <span className="block text-xs text-[#FFFFEB]/60">{step.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-[#FFFFEB]/55" aria-live="polite">
            {pass === "after" ? "The same clip with the plan applied." : "AI Edit reads the transcript and drafts the plan — you approve every step."}
          </p>
        </div>
      </div>
      <p className="mt-4 border-t border-[#FFFFEB]/10 pt-3 text-[11px] leading-relaxed text-[#FFFFEB]/45">
        Demonstration · Sample clip: “Mckensie speaking English” (WIKITONGUES), CC BY-SA 4.0, via Wikimedia Commons — your videos edit the same way.
      </p>
    </div>
  );
}
