"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLowEndDevice } from "@/lib/device";
import { motion } from "framer-motion";
import { Player, type PlayerRef } from "@remotion/player";
import { CaptionedVideo, computePages } from "@capseasy/compositions";
import { getLook, getTemplate, loadFontFamily, resolveStyle } from "@capseasy/templates";
import { CaptionDocSchema, ProjectSettingsSchema, type CaptionDoc, type CaptionStyleV2, type Page, type ProjectSettings } from "@capseasy/shared";
import { useIsMobile } from "./useIsMobile";

/* ── shared pieces for the four showcase cards ───────────────────
 * Every demo runs the REAL caption renderer (the composition the
 * studio previews and the Companion exports) over real footage and a
 * real local-whisper transcript (public/hero/<clip>.json, written by
 * packages/compositions/scripts/hero-clips.ts --data).
 * ─────────────────────────────────────────────────────────────── */

export const INK = "#FFFFEB";
/**
 * Card surface in the dark theme. This was `CREAM = "#FFFFEB"` in the light design, where INK was
 * #1A1A1A; the dark-theme hex sweep flipped INK to #FFFFEB but left this background constant
 * untouched, so every showcase card rendered cream text on a cream panel (the 2026-11-10 contrast
 * bug). The surface is now the dark elevated token #1C1C1A — never a light colour.
 */
export const SURFACE = "#1C1C1A";
export const FPS = 30;
/** clips are cut to the corridor card shape */
export const CLIP_W = 432;
export const CLIP_H = 600;

type Transcript = { language: string; durationMs: number; words: { id: string; text: string; startMs: number; endMs: number }[] };

const cache = new Map<string, Promise<Transcript>>();
export function useTranscript(clip: string) {
  const [t, setT] = useState<Transcript | null>(null);
  useEffect(() => {
    let alive = true;
    if (!cache.has(clip)) cache.set(clip, fetch(`/hero/${clip}.json`).then((r) => r.json()));
    void cache.get(clip)!.then((v) => alive && setT(v));
    return () => {
      alive = false;
    };
  }, [clip]);
  const doc = useMemo<CaptionDoc | null>(() => (t ? CaptionDocSchema.parse({ version: 2, language: t.language, words: t.words }) : null), [t]);
  return { transcript: t, doc };
}

/** A look's complete style + settings, sized for the small demo frame, never more than 3 words per card. */
export function lookFor(lookId: string, size = 1.35): { style: CaptionStyleV2; settings: ProjectSettings } {
  const look = getLook(lookId);
  const style = resolveStyle(look?.style ?? {});
  const oneWord = getTemplate(style.templateId).layout === "word";
  const stack = getTemplate(style.templateId).layout === "stack3";
  return {
    style: { ...style, fontSize: style.fontSize * (stack ? size * 1.3 : size), maxWidth: Math.max(style.maxWidth, 0.9), position: { x: 0.5, y: 0.7 } },
    settings: ProjectSettingsSchema.parse({ ...look?.settings, maxWordsPerCard: oneWord ? 1 : 3 }),
  };
}

/** Pages exactly as the renderer lays them out (real font metrics), for the side panels. */
export function usePages(doc: CaptionDoc | null, style: CaptionStyleV2, settings: ProjectSettings): Page[] {
  const key = [style.fontId, style.hero.fontId ?? "", ...getTemplate(style.templateId).fonts].join("|");
  const [loadedKey, setLoadedKey] = useState("");
  const ready = loadedKey === key;
  useEffect(() => {
    let alive = true;
    void Promise.all(key.split("|").filter(Boolean).map(loadFontFamily)).then(() => alive && setLoadedKey(key));
    return () => {
      alive = false;
    };
  }, [key]);
  return useMemo(() => (doc && ready ? computePages(doc, settings, style, { width: CLIP_W, height: CLIP_H, fps: FPS }) : []), [doc, ready, settings, style]);
}

/** Plays while on screen, pauses when not (four players share the page). */
function useVisiblePlay(box: React.RefObject<HTMLDivElement | null>, player: React.RefObject<PlayerRef | null>, enabled: boolean) {
  useEffect(() => {
    if (!box.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && enabled && !reduced) player.current?.play();
      else player.current?.pause();
    }, { threshold: 0.2 });
    io.observe(box.current);
    return () => io.disconnect();
  }, [box, player, enabled]);
}

export interface ClipPlayerProps {
  clip: string;
  doc: CaptionDoc | null;
  durationMs: number;
  style: CaptionStyleV2;
  settings: ProjectSettings;
  mode?: "burn" | "overlay";
  /** plain video, no captions */
  bare?: boolean;
  onTime?: (ms: number) => void;
  playerRef?: React.RefObject<PlayerRef | null>;
  className?: string;
  style_?: React.CSSProperties;
}

export function ClipPlayer({ clip, doc, durationMs, style, settings, mode = "burn", bare, onTime, playerRef, className = "", style_ }: ClipPlayerProps) {
  const own = useRef<PlayerRef>(null);
  const ref = playerRef ?? own;
  const box = useRef<HTMLDivElement>(null);
  const empty = useMemo(() => CaptionDocSchema.parse({ version: 2, language: "en", words: [] }), []);
  const input = useMemo(
    () => ({ src: mode === "overlay" ? null : `/hero/${clip}.raw.mp4`, media: { width: CLIP_W, height: CLIP_H, fps: FPS, durationMs, rotation: 0 }, doc: bare || !doc ? empty : doc, style, settings, mode }),
    [clip, durationMs, doc, bare, empty, style, settings, mode],
  );
  // mount the player only once it is near the screen: a page of idle players is what made phones stutter
  const [near, setNear] = useState(false);
  const lowEnd = useLowEndDevice(); // budget phones: the still frame only, no live player
  useEffect(() => {
    const el = box.current;
    if (!el || near) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setNear(true), { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  useVisiblePlay(box, ref, !!doc && near);
  useEffect(() => {
    const p = ref.current;
    if (!p || !onTime) return;
    const on = (e: { detail: { frame: number } }) => onTime((e.detail.frame / FPS) * 1000);
    p.addEventListener("frameupdate", on);
    return () => p.removeEventListener("frameupdate", on);
  }, [ref, onTime, doc]);

  return (
    <div ref={box} className={`relative overflow-hidden ${className}`} style={style_}>
      {mode === "burn" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/hero/${clip}.raw.webp`} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
      {doc && near && !lowEnd ? (
        <Player
          ref={ref}
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
    </div>
  );
}

/** Phone-ish frame around a clip. */
export function Frame({ children, width, className = "", tilt = 0 }: { children: React.ReactNode; width: number; className?: string; tilt?: number }) {
  return (
    <div
      className={`relative overflow-hidden rounded-[22px] bg-[#0d0d0d] ${className}`}
      style={{ width, height: Math.round((width * CLIP_H) / CLIP_W), boxShadow: "0 0 0 6px #000000, 0 0 0 7px rgba(255,255,255,0.12), 0 30px 60px -18px rgba(0,0,0,0.55)", transform: tilt ? `rotate(${tilt}deg)` : undefined }}
    >
      {children}
    </div>
  );
}

export const fmt = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${((ms % 60000) / 1000).toFixed(2).padStart(5, "0")}`;

/* ── the card shell ─────────────────────────────────────────── */

const NATIVE_W = 1040;
const NATIVE_H = 684;

export interface ShowcaseProps {
  index: number;
  eyebrow: string;
  /** accent for the italic word, eyebrow dot and border sweep */
  accent: string;
  /** soft wash behind the demo */
  wash: string;
  title: string;
  titleAccent: string;
  body: string;
  points: { k: string; v: string }[];
  children: React.ReactNode;
}

const rise = (d: number) => ({
  initial: { opacity: 0, y: 14, filter: "blur(6px)" },
  whileInView: { opacity: 1, y: 0, filter: "blur(0px)" },
  viewport: { once: true, amount: 0.3 },
  transition: { delay: d, duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
});

function Eyebrow({ index, eyebrow, accent }: Pick<ShowcaseProps, "index" | "eyebrow" | "accent">) {
  return (
    <motion.div {...rise(0.05)} className="flex items-center gap-3">
      <span className="flex h-8 items-center gap-2 rounded-full border border-[#FFFFEB]/10 bg-[#232320] px-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#B4B4AA]">
        <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
        {eyebrow}
      </span>
      <span className="font-mono text-[12px] text-[#8F8F86]">{String(index).padStart(2, "0")} / 04</span>
    </motion.div>
  );
}

function Title({ title, titleAccent, accent, className }: Pick<ShowcaseProps, "title" | "titleAccent" | "accent"> & { className: string }) {
  const ink = accent === INK;
  return (
    <motion.h3 {...rise(0.12)} className={`font-bold tracking-[-0.035em] ${className}`}>
      {title}
      <br />
      <em className="font-accent font-normal tracking-[-0.01em]">
        <span style={ink ? undefined : { background: `linear-gradient(100deg, ${INK} 0%, ${accent} 120%)`, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>{titleAccent}</span>
      </em>
    </motion.h3>
  );
}

function Points({ points, accent, className = "" }: Pick<ShowcaseProps, "points" | "accent"> & { className?: string }) {
  return (
    <ul className={`flex flex-col gap-3.5 ${className}`}>
      {points.map((p, i) => (
        <motion.li key={p.k} {...rise(0.28 + i * 0.07)} className="flex items-start gap-3">
          <span className="mt-[3px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: `${accent}26` }}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path d="M2 5.2 4.1 7.3 8 2.8" fill="none" stroke={accent} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "brightness(0.75)" }} />
            </svg>
          </span>
          <span className="text-[15px] leading-[1.45] text-[#FFFFEB]/72">
            <b className="font-semibold text-[#FFFFEB]">{p.k}</b> {p.v}
          </span>
        </motion.li>
      ))}
    </ul>
  );
}

/** Room kept at the top of the pinned showcase for its heading (desktop). */
const HEADER = 110;

/** Demo area is authored at 560 x 684. */
const DEMO_W = 560;

export function ShowcaseCard({ index, eyebrow, accent, wash, title, titleAccent, body, points, children }: ShowcaseProps) {
  const isMobile = useIsMobile();
  const isPhone = useIsMobile(700);
  const [vw, setVw] = useState(1440);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setVw(w);
      setScale(w > 1024 ? Math.min(1, w / 1440, (h - HEADER - 64) / NATIVE_H) : Math.max(0.28, (w - 24) / NATIVE_W));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const shell = "relative overflow-hidden font-sans text-[#FFFFEB]";
  const shellStyle = { background: SURFACE, boxShadow: "0 0 0 1px rgba(255,255,235,0.08), 0 40px 80px -30px rgba(0,0,0,0.6)" };
  const glow = (
    <>
      <div aria-hidden className="absolute inset-0" style={{ background: wash }} />
      <div aria-hidden className="absolute -left-24 -top-24 h-72 w-72 rounded-full blur-3xl" style={{ background: accent, opacity: 0.14 }} />
    </>
  );

  // phones: copy on top at a readable size, the live demo below scaled to the screen
  if (isPhone) {
    const cw = Math.min(vw - 24, 520);
    const z = cw / DEMO_W;
    return (
      <section className="flex min-h-[100svh] w-screen items-center justify-center bg-[#1E1E1B] py-6">
        <div className={shell} style={{ ...shellStyle, width: cw, borderRadius: 28 }}>
          {glow}
          <div className="relative z-10 px-5 pt-6">
            <Eyebrow index={index} eyebrow={eyebrow} accent={accent} />
            <Title title={title} titleAccent={titleAccent} accent={accent} className="mt-4 text-[34px] leading-[1.04]" />
            <motion.p {...rise(0.2)} className="mt-3 text-[15px] leading-[1.55] text-[#FFFFEB]/68">
              {body}
            </motion.p>
          </div>
          <div className="relative" style={{ width: DEMO_W, height: NATIVE_H - 40, zoom: z, marginTop: -20 }}>
            {children}
          </div>
        </div>
      </section>
    );
  }

  const card = (
    <div className={shell} style={{ ...shellStyle, width: NATIVE_W, height: NATIVE_H, borderRadius: 32 }}>
      {glow}
      <div className="absolute left-[60px] top-[64px] z-10 flex w-[392px] flex-col">
        <Eyebrow index={index} eyebrow={eyebrow} accent={accent} />
        <Title title={title} titleAccent={titleAccent} accent={accent} className="mt-6 text-[52px] leading-[1.02]" />
        <motion.p {...rise(0.2)} className="mt-5 text-[17px] leading-[1.6] text-[#FFFFEB]/68">
          {body}
        </motion.p>
        <Points points={points} accent={accent} className="mt-7" />
      </div>
      <div className="absolute inset-y-0 right-0" style={{ width: DEMO_W }}>{children}</div>
    </div>
  );

  return (
    <section
      style={{ width: "100vw", height: isMobile ? "auto" : "100vh", display: "flex", alignItems: "center", justifyContent: "center", paddingTop: isMobile ? 0 : HEADER - 24 }}
      className={isMobile ? "min-h-[100svh] overflow-hidden bg-[#1E1E1B]" : ""}
    >
      {/* zoom, not transform: scale. It scales layout too, so the Players measure the size they are drawn at
          (a transform makes their size observer and their layout disagree, and they re-measure forever) */}
      <div style={{ flexShrink: 0, width: NATIVE_W, height: NATIVE_H, zoom: scale }}>{card}</div>
    </section>
  );
}

/** Small frosted label used across the demos. */
export function Tag({ children, dark = false, className = "" }: { children: React.ReactNode; dark?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10.5px] font-medium tracking-wide ${dark ? "bg-[#262622] text-[#FFFFEB]" : "border border-[#FFFFEB]/10 bg-[#232320] text-[#B4B4AA]"} ${className}`}>
      {children}
    </span>
  );
}
