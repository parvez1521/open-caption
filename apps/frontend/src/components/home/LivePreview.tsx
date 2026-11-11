"use client";

import React, { useEffect, useMemo, useRef, useSyncExternalStore, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { CaptionedVideo } from "@capseasy/compositions";
import { getLook, type LookDefinition } from "@capseasy/templates";

const FPS = 30;

/** Demo transcript with word timings, like the ones our engine produces from speech. */
function demoDoc(text: string, gapMs = 330) {
  const words = text.split(" ").map((t, i) => ({ id: `d${i}`, text: t, startMs: 200 + i * gapMs, endMs: 200 + i * gapMs + gapMs - 30 }));
  return { version: 2 as const, language: "en", direction: "ltr" as const, words, manualBreaks: [], noBreakAfter: [], cards: {}, meta: { userEdited: false } };
}

const BACKDROPS = [
  "linear-gradient(160deg,#1f3b33 0%,#0f231d 55%,#0a1512 100%)",
  // No purple anywhere on the site (owner ban list): the second demo backdrop
  // is deep graphite instead of the old plum tone.
  "linear-gradient(160deg,#232a33 0%,#14181d 60%,#0d0f12 100%)",
  "linear-gradient(160deg,#4a3218 0%,#241a10 60%,#140e08 100%)",
  "linear-gradient(160deg,#1c2a44 0%,#101828 60%,#0a0f19 100%)",
];

interface Props {
  lookId: string;
  text?: string;
  /** play only while visible (saves CPU when many previews are on a page) */
  playWhenVisible?: boolean;
  backdrop?: number;
  className?: string;
}

/**
 * The REAL caption renderer (same composition the editor and exports use), playing a look over a
 * gradient "video". What you see on the landing page is literally what the product renders.
 */
export function LivePreview({ lookId, text = "Stop scrolling and watch this incredible trick right now", playWhenVisible = true, backdrop = 0, className = "" }: Props) {
  const look = getLook(lookId) as LookDefinition | undefined;
  const ref = useRef<PlayerRef>(null);
  const box = useRef<HTMLDivElement>(null);
  const doc = useMemo(() => demoDoc(text), [text]);
  const lite = useSyncExternalStore(() => () => {}, () => window.matchMedia("(pointer: coarse) and (max-width: 900px)").matches, () => false);
  const durationMs = doc.words[doc.words.length - 1]!.endMs + 900;
  const input = useMemo(
    () => (look ? { src: null, media: { width: 1080, height: 1920, fps: FPS, durationMs, rotation: 0 }, doc, style: look.style, settings: look.settings, mode: "overlay" as const } : null),
    [look, doc, durationMs],
  );

  useEffect(() => {
    if (!playWhenVisible || !box.current) return;
    const io = new IntersectionObserver(([e]) => (e?.isIntersecting ? ref.current?.play() : ref.current?.pause()), { threshold: 0.25 });
    io.observe(box.current);
    return () => io.disconnect();
  }, [playWhenVisible]);

  if (!look || !input) return null;
  if (lite) {
    // phones: the same look, pre-rendered by the real composition (`pnpm --filter @capseasy/compositions previews`)
    return (
      <div className={`relative overflow-hidden ${className}`} style={{ background: BACKDROPS[backdrop % BACKDROPS.length] }}>
        <video src={`/looks/${lookId}.mp4`} poster={`/looks/${lookId}.webp`} className="absolute inset-0 h-full w-full object-contain" autoPlay muted loop playsInline preload="metadata" />
      </div>
    );
  }
  return (
    <div ref={box} className={`relative overflow-hidden ${className}`} style={{ background: BACKDROPS[backdrop % BACKDROPS.length] }}>
      {/* soft "subject" silhouette so captions read like they sit on real footage */}
      <div aria-hidden className="absolute inset-x-[18%] top-[18%] bottom-[28%] rounded-[45%_45%_38%_38%] bg-white/[0.06] blur-2xl" />
      <Player
        ref={ref}
        component={CaptionedVideo as unknown as React.ComponentType<Record<string, unknown>>}
        inputProps={input as unknown as Record<string, unknown>}
        durationInFrames={Math.ceil((durationMs / 1000) * FPS)}
        fps={FPS}
        compositionWidth={1080}
        compositionHeight={1920}
        style={{ width: "100%", height: "100%", position: "relative" }}
        loop
        autoPlay={!playWhenVisible}
        controls={false}
        clickToPlay={false}
        acknowledgeRemotionLicense
        numberOfSharedAudioTags={0}
      />
    </div>
  );
}

/** Cycles through several looks (hero phone). */
export function CyclingPreview({ lookIds, intervalMs = 4600, className = "" }: { lookIds: string[]; intervalMs?: number; className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % lookIds.length), intervalMs);
    return () => clearInterval(t);
  }, [lookIds.length, intervalMs]);
  const id = lookIds[i]!;
  return (
    <div className={`relative ${className}`}>
      <LivePreview key={id} lookId={id} playWhenVisible={false} backdrop={i} className="h-full w-full" text="Don't edit your captions just upload the video" />
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold text-[#FFFFEB]/90">
        {getLook(id)?.name}
      </div>
    </div>
  );
}
