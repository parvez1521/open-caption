"use client";

import React, { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { MOTION_TEMPLATES, defaultMotionConfig } from "@capseasy/motion";
import type { OverlayItem, OverlaySocialVariant } from "@capseasy/shared";
import { FAQS } from "./faqs";

/** A preview item for a motion template, built as a plain literal so this section's static
 *  bundle stays light (the renderer itself arrives with the dynamically-imported MotionPreview). */
function homeMotionItem(templateId: OverlaySocialVariant): OverlayItem {
  const cfg = defaultMotionConfig(templateId);
  return {
    id: `home-motion-${templateId}`,
    kind: "social",
    variant: cfg.variant,
    text: cfg.text,
    startMs: 0,
    endMs: cfg.durationMs,
    x: 0.5,
    y: 0.78,
    scale: 1,
    rotation: 0,
    color: cfg.color,
  };
}
import { PLANS } from "@capseasy/shared";
import { Logo as BrandLogo } from "@/components/brand/Logo";
import { LEGAL_PAGES } from "@/lib/legal";
import { BRAND_NAME, BRAND_WORDMARK_ACCENT, BRAND_WORDMARK_LEAD } from "@/lib/brand";

// the real renderer is client-only and fairly heavy: load it after the page shell
const CyclingPreview = dynamic(() => import("./LivePreview").then((m) => m.CyclingPreview), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-[#0F3D2E]" /> });
const LivePreview = dynamic(() => import("./LivePreview").then((m) => m.LivePreview), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-[#1f2b27]" /> });
const HeroCylinder = dynamic(() => import("./HeroCylinder").then((m) => m.HeroCylinder), { ssr: false, loading: () => <div className="h-[320px] w-full animate-pulse rounded-2xl bg-[#1C1C1A] sm:h-[360px]" /> });
// Motion Studio previews: the real animated graphics, loaded lazily like the other live previews
const MotionPreview = dynamic(() => import("@/features/motion/MotionPreview").then((m) => m.MotionPreview), { ssr: false, loading: () => <div className="aspect-[700/360] w-full animate-pulse bg-[#141412]" /> });

const INK = "#FFFFEB";
export const GITHUB_URL = "https://github.com/parvez1521/open-caption";
/** Product Hunt badge: set NEXT_PUBLIC_PRODUCT_HUNT_POST_ID (and _SLUG) on Vercel once the launch is scheduled; hidden until then. */
const PH_POST_ID = process.env.NEXT_PUBLIC_PRODUCT_HUNT_POST_ID || "";
const PH_SLUG = process.env.NEXT_PUBLIC_PRODUCT_HUNT_SLUG || "";

function GitHubMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/** Start fetching the speech model the moment someone shows interest in "Start free". */
const warmModel = () => void import("@/features/transcribe/runtime").then((m) => m.prefetchWhenIdle());

export function Logo({ light = false }: { light?: boolean }) {
  return <BrandLogo tone="light" height={28} />;
}

const NAV_LINKS = [
  ["How it works", "#how"],
  ["Controls", "#control"],
  ["Looks", "#looks"],
  ["No install", "#privacy"],
  ["FAQ", "#faq"],
] as const;

/** Signed in to a real account in this browser? Read straight from Supabase's stored session so the landing page doesn't load the auth SDK. */
function readSignedIn() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/^sb-.*-auth-token$/.test(k)) continue;
      const user = (JSON.parse(localStorage.getItem(k) ?? "null") as { user?: { is_anonymous?: boolean; email?: string } } | null)?.user;
      if (user && (!user.is_anonymous || user.email)) return true;
    }
  } catch { /* storage blocked: show the signed-out header */ }
  return false;
}
const useSignedIn = () => useSyncExternalStore(() => () => {}, readSignedIn, () => false);

export function Nav() {
  const [open, setOpen] = useState(false);
  const signedIn = useSignedIn();
  return (
    <div data-nav className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-2xl border border-[#FFFFEB]/10 bg-[#1E1E1B]/85 px-4 py-2.5 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)] backdrop-blur-md">
        <Link href="/" aria-label={`${BRAND_NAME} home`} className="transition-transform duration-200 hover:scale-105">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-6 whitespace-nowrap text-sm font-semibold text-[#FFFFEB]/80 lg:flex xl:gap-7">
          {NAV_LINKS.map(([label, href]) => (
            <a key={href} href={href} className="group relative py-1 transition-colors duration-200 hover:text-[#FFFFEB]">
              {label}
              <span className="absolute inset-x-0 -bottom-0.5 h-[2px] origin-left scale-x-0 rounded-full bg-[#FFA946] transition-transform duration-300 group-hover:scale-x-100" />
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="Open Caption on GitHub (open source)" title="Open source on GitHub" className="flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#FFFFEB]/15 px-2.5 text-sm font-semibold text-[#FFFFEB]/80 transition hover:border-[#FFFFEB]/40 hover:text-[#FFFFEB]">
            <GitHubMark /><span className="hidden xl:inline">Star</span>
          </a>
          <Link href={signedIn ? "/dashboard" : "/login"} className="hidden whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold text-[#FFFFEB]/80 transition hover:text-[#FFFFEB] sm:block">{signedIn ? "Dashboard" : "Sign in"}</Link>
          {/* phones: this moves into the menu */}
          <div className="conic-glow-pill hidden rounded-full p-[1px] sm:block">
            <Link href="/start" onPointerEnter={warmModel} onClick={warmModel} className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#FFFFEB]/30 bg-[#252B26] px-4 py-2 text-sm font-bold text-[#FFFFEB] transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]">
              Start free <span aria-hidden>→</span>
            </Link>
          </div>
          <button onClick={() => setOpen((v) => !v)} aria-label="Menu" aria-expanded={open} className="grid h-10 w-10 place-items-center rounded-xl border border-[#FFFFEB]/15 lg:hidden">
            <span className="relative block h-3 w-4">
              <span className={`absolute left-0 top-0 h-[2px] w-4 bg-[#FFFFEB] transition ${open ? "translate-y-[5px] rotate-45" : ""}`} />
              <span className={`absolute bottom-0 left-0 h-[2px] w-4 bg-[#FFFFEB] transition ${open ? "-translate-y-[5px] -rotate-45" : ""}`} />
            </span>
          </button>
        </div>
      </header>
      {open ? (
        <nav className="animate-fade-in-up mx-auto mt-2 grid max-w-6xl gap-1 rounded-2xl border border-[#FFFFEB]/10 bg-[#1E1E1B] p-3 shadow-lg lg:hidden">
          {NAV_LINKS.map(([label, href]) => (
            <a key={href} href={href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-base font-semibold text-[#FFFFEB] hover:bg-[#262622]/60">{label}</a>
          ))}
          <div className="mt-2 grid gap-2 border-t border-[#FFFFEB]/10 pt-3 sm:hidden">
            <Link href="/start" onClick={() => setOpen(false)} className="flex items-center justify-center gap-2 rounded-full border border-[#FFFFEB]/30 bg-[#252B26] px-5 py-3.5 text-base font-bold text-[#FFFFEB] active:scale-[0.98]">
              Start free <span aria-hidden>→</span>
            </Link>
            <Link href={signedIn ? "/dashboard" : "/login"} onClick={() => setOpen(false)} className="rounded-full px-5 py-3 text-center text-base font-semibold text-[#FFFFEB]/70">{signedIn ? "Dashboard" : "Sign in"}</Link>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

/** Hero visual: the Trending templates cylinder (HeroCylinder) — live animated previews, drag to spin. */

export function Hero() {
  return (
    <section className="relative flex min-h-[100svh] w-full flex-col overflow-hidden pt-[max(6.5rem,12vh)]">
      <div data-parallax="0.25" aria-hidden className="pointer-events-none absolute -left-40 top-16 h-[520px] w-[520px] rounded-full bg-[#252B26]/60 blur-3xl" />
      <div data-parallax="0.4" aria-hidden className="pointer-events-none absolute -right-32 top-48 h-[440px] w-[440px] rounded-full bg-[#FFA946]/25 blur-3xl" />

      <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-5 text-center">
        <div data-hero="eyebrow" className="flex flex-wrap items-center justify-center gap-2.5">
          {PH_POST_ID ? (
            <a href={`https://www.producthunt.com/posts/${PH_SLUG}?utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-${PH_SLUG}`} target="_blank" rel="noopener noreferrer" className="inline-flex transition hover:scale-[1.02]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=${PH_POST_ID}&theme=light`} alt="Open Caption on Product Hunt" width={194} height={42} className="h-[42px] w-auto" />
            </a>
          ) : null}
        </div>

        <h1 className="font-styled mt-5 text-[clamp(2.7rem,min(6.4vw,9.5vh),5.6rem)] font-bold leading-[0.9] tracking-[-0.05em] text-[#FFFFEB]">
          <span className="inline-block overflow-hidden pb-[0.06em]">
            <span data-hero="word" className="inline-block mr-3 sm:mr-4">Don&rsquo;t edit,</span>
            <span data-hero="word2" className="font-accent gradient-text-sweep inline-block pr-[0.06em] text-[1.1em] font-normal italic tracking-[-0.025em]">just upload.</span>
          </span>
        </h1>

        <p data-hero="sub" className="mx-auto mt-5 max-w-2xl text-[15px] sm:text-[17px] leading-relaxed text-[#FFFFEB]/70 px-4 font-medium">
          Animated captions for your Shorts, Reels and TikToks, made right in your browser. 150 animated looks, every word editable, no install and no watermark.
        </p>


        <div data-hero="cta" className="mt-7 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <div className="conic-glow-pill w-full rounded-full p-[1px] sm:w-auto">
            <Link href="/start" onPointerEnter={warmModel} onClick={warmModel} className="flex w-full items-center justify-center gap-2 rounded-full border border-[#FFFFEB]/30 bg-[#252B26] px-8 py-4 text-base font-bold text-[#FFFFEB] shadow-sm transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] sm:w-auto">
              Caption your first video free <span aria-hidden>→</span>
            </Link>
          </div>
          <a href="#how" className="w-full rounded-full border border-[#FFFFEB]/15 bg-[#1E1E1B]/80 px-7 py-4 text-base font-semibold text-[#FFFFEB]/80 backdrop-blur-md transition hover:bg-[#1E1E1B] hover:text-[#FFFFEB] sm:w-auto">
            See how it works
          </a>
        </div>


      </div>

      {/* trending templates on a rotating cylinder: live previews of the real templates */}
      <div data-hero="stream" className="relative z-0 mt-4 pt-2 sm:mt-auto">
        <HeroCylinder />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-[#141412]" />
      </div>
      <div className="mx-auto flex w-full max-w-6xl justify-end px-5 pb-3">
        <a href="/credits" className="inline-flex min-h-8 items-center text-[11px] text-[#FFFFEB]/60 hover:text-[#FFFFEB]">
          Clips: Wikimedia Commons, CC BY / BY-SA
        </a>
      </div>
    </section>
  );
}

export function Marquee() {
  const items = ["TikTok", "Instagram Reels", "YouTube Shorts", "YouTube", "LinkedIn", "Podcasts", "Hinglish", "Premiere Pro", "DaVinci Resolve", "Final Cut Pro"];
  const row = [...items, ...items];
  return (
    <div className="relative -rotate-1 border-y border-[#FFFFEB]/15 bg-[#262622] py-4 text-[#FFFFEB]">
      <div className="overflow-hidden">
        <div className="animate-marquee-slow gap-10 pr-10">
          {row.map((t, i) => (
            <span key={i} className="flex items-center gap-10 whitespace-nowrap font-styled text-lg font-semibold">
              {t} <span className="text-[#FFA946]" aria-hidden>✦</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function UploadArtifact() {
  return (
    <div className="rounded-2xl border border-dashed border-[#FFFFEB]/20 bg-white/90 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-[#FFFFEB]/60">drop your clip here</span>
        <span className="rounded-full bg-[#1E1E1B] border border-[#FFFFEB]/10 px-3 py-1 font-mono text-[11px] font-semibold text-[#34D399]">
          take-07_final.mp4
        </span>
      </div>
      <div className="mt-4 h-2 rounded-full bg-[#FFFFEB]/5 overflow-hidden">
        <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-[#FFA946] to-[#34D399]" />
      </div>
    </div>
  );
}

function TranscriptArtifact() {
  const rows = [
    ["00:00.42", "the first three seconds decide"],
    ["00:02.10", "whether anyone stays,"],
    ["00:03.65", "so make them unmistakable."],
  ];
  return (
    <div className="rounded-2xl bg-white/90 border border-[#FFFFEB]/10 divide-y divide-[#FFFFEB]/5 shadow-sm overflow-hidden">
      {rows.map(([t, text], i) => (
        <div key={t} className={`flex items-baseline gap-4 px-5 py-3 ${i === 1 ? "bg-[#252B26]/30" : ""}`}>
          <span className="font-mono text-[11px] text-[#FFFFEB]/50 shrink-0">{t}</span>
          <span className={`text-[13px] ${i === 1 ? "text-[#FFFFEB] font-bold" : "text-[#FFFFEB]/75"}`}>
            {text}
          </span>
        </div>
      ))}
    </div>
  );
}

function StyleArtifact() {
  return (
    <div className="rounded-2xl bg-white/90 border border-[#FFFFEB]/10 p-5 space-y-4 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {["Hormozi Box", "Karaoke Fill", "Beast Bounce", "Emerald"].map((n, i) => (
          <span
            key={n}
            className={`rounded-full px-3.5 py-1 text-[11px] font-bold transition ${
              i === 0 ? "bg-[#262622] text-[#FFFFEB]" : "bg-[#1E1E1B] border border-[#FFFFEB]/10 text-[#FFFFEB]/70"
            }`}
          >
            {n}
          </span>
        ))}
      </div>
      <div className="relative h-20 rounded-xl bg-[#262622] overflow-hidden flex items-center justify-center">
        <div className="w-[68%] h-[56%] border-2 border-dashed border-[#FFA946] rounded-lg flex items-center justify-center bg-[#FFA946]/10">
          <span className="font-styled text-xs font-bold text-[#FFFFEB]">caption box · drag me</span>
        </div>
      </div>
    </div>
  );
}

function RenderArtifact() {
  return (
    <div className="rounded-2xl bg-white/90 border border-[#FFFFEB]/10 p-5 space-y-3.5 shadow-sm">
      <div className="flex items-center justify-between font-mono text-[11px] text-[#FFFFEB]/60">
        <span>remotion render · 1080×1920 · 60fps</span>
        <span className="text-[#34D399] font-semibold">100% ready</span>
      </div>
      <div className="h-2 rounded-full bg-[#FFFFEB]/5 overflow-hidden">
        <div className="h-full w-full rounded-full bg-[#34D399]" />
      </div>
      <div className="flex items-center justify-between pt-1">
        <span className="font-styled text-xs font-bold text-[#FFFFEB]">Export burned-in MP4</span>
        <span className="rounded-full bg-[#FFFFEB] text-[#141412] px-3.5 py-1 text-xs font-bold shadow-sm">
          Download MP4
        </span>
      </div>
    </div>
  );
}

const PIPELINE_STEPS = [
  {
    n: "1",
    title: "Upload the take",
    body: "One MP4, straight from your camera roll. No timeline setup, no project files, no plugins.",
    artifact: <UploadArtifact />,
  },
  {
    n: "2",
    title: "Every word gets a timestamp",
    body: "Speech-to-text runs at word level, so the engine knows exactly when each syllable lands — and you can clean up the transcript before anything is styled.",
    artifact: <TranscriptArtifact />,
  },
  {
    n: "3",
    title: "Pick a look, direct the frame",
    body: "Choose from distinct cinematic styles, then drag the caption box anywhere in the frame and tune the hero and body text independently.",
    artifact: <StyleArtifact />,
  },
  {
    n: "4",
    title: "Render and post",
    body: "A deterministic Remotion pipeline burns the animation into a crisp 1080p vertical MP4. What you previewed is exactly what exports.",
    artifact: <RenderArtifact />,
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <div data-reveal className="max-w-2xl">
          <h2 className="font-styled text-4xl font-bold leading-tight tracking-tight text-[#FFFFEB] sm:text-6xl">
            From camera roll to <em className="font-normal italic text-[#34D399]">captioned</em> in four moves.
          </h2>
        </div>

        <div className="relative mt-16">
          <div className="space-y-12 lg:space-y-16">
            {PIPELINE_STEPS.map((s) => (
              <div key={s.n} data-step className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center">
                <div className="lg:col-span-5 lg:pl-12 relative">
                  <span
                    aria-hidden
                    className="hidden lg:grid place-items-center absolute left-0 top-1.5 w-8 h-8 rounded-full bg-[#FFFFEB] text-[#141412] font-styled font-bold text-xs shadow-sm ring-4 ring-[#141412]"
                  >
                    {s.n}
                  </span>
                  <p className="font-styled italic text-[#34D399] text-base">Step {s.n}</p>
                  <h3 className="mt-1 font-styled text-2xl font-bold text-[#FFFFEB]">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#FFFFEB]/70 max-w-md">{s.body}</p>
                </div>
                <div className="lg:col-span-7">
                  {s.artifact}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}



export function ClipperSection() {
  const rows = [
    ["0:32–1:05", "the part where the story turns"],
    ["2:10–2:48", "a complete answer, on its own"],
    ["4:02–4:57", "the example everyone replays"],
  ];
  return (
    <section id="clipper" className="px-4 py-24 sm:py-32 border-t border-[#FFFFEB]/10">
      <div className="mx-auto max-w-6xl">
        <div data-reveal className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="rounded-md bg-[#FFA946] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#141412]">Trending</span>
            <h2 className="font-styled mt-4 text-4xl font-bold leading-tight tracking-tight text-[#FFFFEB] sm:text-5xl">
              One long video, <em className="font-normal italic text-[#34D399]">many short clips.</em>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-[#FFFFEB]/70">
              The Clipper reads your transcript and proposes the segments worth clipping: the speech
              runs between silences, sized 15 to 60 seconds. Adjust the edges, create a clip, and it
              becomes its own captioned project, ready to style and post.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[#FFFFEB]/60">
              Smart segment suggestions from your transcript — no highlight magic, just your words
              and the pauses between them. Your source video is not re-encoded or cut; a clip is a
              range on the same file, kept on your device.
            </p>
            <Link href="/clipper" className="mt-7 inline-flex items-center gap-2 rounded-full border border-[#FFFFEB]/30 bg-[#252B26] px-6 py-3.5 text-base font-bold text-[#FFFFEB] transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]">
              Open the Clipper <span aria-hidden>→</span>
            </Link>
          </div>
          <div className="rounded-[2rem] border border-[#FFFFEB]/10 bg-[#1E1E1B] p-6 sm:p-8">
            <p className="font-mono text-[11px] uppercase tracking-widest text-[#FFFFEB]/50">Suggested segments · from the transcript</p>
            <div className="mt-5 space-y-3">
              {rows.map(([range, label]) => (
                <div key={range} className="flex items-center justify-between gap-3 rounded-xl border border-[#FFFFEB]/10 bg-[#262622] px-4 py-3.5">
                  <span className="font-mono text-sm font-semibold text-[#FFFFEB]">{range}</span>
                  <span className="min-w-0 truncate text-sm text-[#FFFFEB]/65">{label}</span>
                  <span className="shrink-0 rounded-full bg-[#FFFFEB] px-3 py-1 text-xs font-bold text-[#141412]">Create clip</span>
                </div>
              ))}
            </div>
            <p className="mt-5 font-mono text-[11px] leading-relaxed text-[#FFFFEB]/45">Silences split the runs · short runs merge · long runs split at the biggest pause</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Motion Studio section: four featured templates from the motion registry, playing live in a
 * horizontal scroll row (the same shared live-preview budget as the Studio picker keeps the
 * simultaneous animations capped). The previews are the real graphics — the same OverlayView
 * the Studio and the export draw — not posters or mock cards.
 */
export function MotionStudioSection() {
  const featured = React.useMemo(
    () =>
      MOTION_TEMPLATES.filter((t) => t.featured)
        .slice(0, 4)
        .map((t) => ({ template: t, item: homeMotionItem(t.id) })),
    [],
  );
  return (
    <section id="motion" className="px-4 py-24 sm:py-32 border-t border-[#FFFFEB]/10">
      <div className="mx-auto max-w-6xl">
        <div data-reveal className="max-w-2xl">
          <h2 className="font-styled text-4xl font-bold leading-tight tracking-tight text-[#FFFFEB] sm:text-5xl">
            Motion Studio: graphics that <em className="font-normal italic text-[#34D399]">move.</em>
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[#FFFFEB]/70">
            Subscribe pills, follow cards, counters and titles — animated graphics you customise with
            your own words and colour, then drop into a project. These four are playing live, exactly
            as they render in your video.
          </p>
          <Link href="/motion" className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#FFFFEB]/30 bg-[#252B26] px-6 py-3.5 text-base font-bold text-[#FFFFEB] transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]">
            Open Motion Studio <span aria-hidden>→</span>
          </Link>
        </div>
        <div className="mt-10 flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]">
          {featured.map(({ template, item }) => (
            <Link
              key={template.id}
              href={`/motion/${template.id}`}
              className="w-[280px] shrink-0 overflow-hidden rounded-xl border border-[#FFFFEB]/10 bg-[#1C1C1A] transition hover:border-[#FFFFEB]/25 sm:w-[320px]"
              aria-label={`Customise ${template.title}`}
            >
              <MotionPreview item={item} />
              <span className="block px-4 py-3">
                <span className="block font-styled text-[15px] font-bold text-[#FFFFEB]">{template.title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-[#FFFFEB]/65">{template.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function BrowserCard() {
  const rows = [
    ["Speech recognition", "runs on your device"],
    ["Your video", "never leaves it"],
    ["MP4 export", "made in this tab"],
    ["Install", "nothing, ever"],
  ];
  return (
    <div className="relative flex h-full min-h-[240px] w-full flex-col justify-center rounded-2xl border border-white/10 bg-[#050505] p-6 font-mono text-[13px] leading-relaxed text-[#FFFFEB]/90 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.5)] sm:p-8">
      {rows.map(([k, v]) => (
        <p key={k} className="flex items-baseline gap-3 border-b border-white/5 py-3 last:border-0">
          <span className="text-[#34D399]">✓</span>
          <span className="text-[#FFFFEB]/55">{k}</span>
          <span className="ml-auto text-right">{v}</span>
        </p>
      ))}
    </div>
  );
}

export function Privacy() {
  return (
    <section id="privacy" className="px-4 pb-24 sm:pb-32">
      <div data-reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] border border-[#FFFFEB]/12 bg-[#1E1E1B] px-6 py-14 text-[#FFFFEB] sm:px-14 sm:py-20 shadow-2xl">
        <div aria-hidden className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-[#FFA946]/15 blur-3xl" />
        <div aria-hidden className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-[#34D399]/10 blur-3xl" />
        
        <div className="relative grid items-center gap-10 lg:grid-cols-2">
          <div className="lg:pr-8">
            <h2 className="font-styled text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Nothing to install. <em className="font-normal italic text-[#F0D7FF]">It runs in your browser.</em></h2>
            <p className="mt-6 text-base sm:text-lg leading-relaxed text-[#FFFFEB]/75">
              Captions are written, styled and exported right in the tab you have open, on your phone or your laptop. No app, no plugin, no per-minute bill.
            </p>
          </div>
          
          <div className="min-w-0 lg:h-full">
            <BrowserCard />
          </div>
        </div>
      </div>
    </section>
  );
}

const CONTROLS = [
  {
    title: "The caption box is yours",
    body: "Drag and resize the caption region anywhere in the frame — clear of faces, product shots, or platform UI. The render honours it to the pixel.",
    tag: "layout",
  },
  {
    title: "Timing you can re-cut",
    body: "A word-level timeline lets you nudge any word's in and out points when the delivery needs a different beat than the transcript suggests.",
    tag: "timeline",
  },
  {
    title: "Clean the transcript first",
    body: "Fix names, drop filler words, and merge fragments before styling — so the animation never amplifies a typo.",
    tag: "transcript",
  },
  {
    title: "Hero and body, styled apart",
    body: "The emphasized word and the supporting line carry independent fonts, sizes, and colours. Tune one without disturbing the other.",
    tag: "typography",
  },
  {
    title: "Every export, kept",
    body: "Each render lands in the project's export history with its settings, so last week's look is one click to reproduce.",
    tag: "exports",
  },
];

export function Control() {
  return (
    <section id="control" className="px-4 py-24 sm:py-32 border-t border-[#FFFFEB]/10">
      <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div data-reveal className="lg:col-span-4">
          <div className="lg:sticky lg:top-28">
            <h2 className="font-styled text-4xl font-bold leading-tight tracking-tight text-[#FFFFEB] sm:text-5xl">
              Automatic, <em className="font-normal italic text-[#34D399]">until you disagree.</em>
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[#FFFFEB]/70 max-w-sm">
              AI creates the baseline in seconds. You keep frame-by-frame control over every word, break, position, and motion curve.
            </p>
          </div>
        </div>

        <div className="lg:col-span-8">
          <div className="divide-y divide-[#FFFFEB]/10 border-t border-b border-[#FFFFEB]/10">
            {CONTROLS.map((c) => (
              <div
                key={c.tag}
                data-reveal
                className="group grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-6 py-6 items-baseline transition-colors hover:bg-white/60 sm:px-4 sm:-mx-4 rounded-2xl"
              >
                <span className="sm:col-span-3 font-mono text-xs uppercase tracking-wider text-[#34D399] font-semibold">
                  <span className="rounded-full bg-[#252B26]/60 px-2.5 py-1 text-[11px] text-[#FFFFEB]">
                    {c.tag}
                  </span>
                </span>
                <div className="sm:col-span-9">
                  <h3 className="font-styled text-lg font-bold text-[#FFFFEB] group-hover:text-[#34D399] transition-colors">
                    {c.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#FFFFEB]/70 max-w-[54ch]">
                    {c.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}


export function Faq() {
  const [activeIdx, setActiveIdx] = useState(0);

  return (
    <section id="faq" className="px-4 pb-24 sm:pb-32">
      <div className="mx-auto max-w-6xl">
        <div data-reveal className="text-center mb-12">
          <h2 className="font-styled text-5xl sm:text-6xl font-normal italic text-[#FFFFEB]">
            Good questions.
          </h2>
        </div>

        {/* Outer Split Container Card */}
        <div data-reveal className="bg-white/60 rounded-3xl p-5 sm:p-8 border border-[#FFFFEB]/10 shadow-[0_20px_50px_-35px_rgba(0,0,0,0.3)] backdrop-blur">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            
            {/* Left Column: Questions List Card */}
            <div className="lg:col-span-6 bg-[#0F3D2E] text-[#FFFFEB] rounded-2xl p-5 sm:p-7 flex flex-col justify-between shadow-lg">
              <div>
                <h3 className="font-styled font-bold text-xl sm:text-2xl mb-5 text-[#FFFFEB] flex items-center justify-between">
                  <span>Questions</span>
                  <span className="text-xs font-mono font-normal uppercase tracking-wider text-[#34D399]">
                    {activeIdx + 1} / {FAQS.length}
                  </span>
                </h3>

                <div className="space-y-2.5">
                  {FAQS.map((faq, idx) => {
                    const isActive = activeIdx === idx;
                    return (
                      <button
                        key={idx}
                        onClick={() => setActiveIdx(idx)}
                        className={`w-full text-left p-3.5 sm:p-4 rounded-xl text-sm sm:text-[15px] leading-snug transition-all flex items-center justify-between gap-3 ${
                          isActive
                            ? "bg-[#34D399]/20 text-[#FFFFEB] font-bold border border-[#34D399]/40 shadow-sm translate-x-1"
                            : "text-[#FFFFEB]/75 hover:text-[#FFFFEB] hover:bg-white/5 border border-transparent"
                        }`}
                      >
                        <span>{faq.q}</span>
                        <span className={`text-xs transition-transform ${isActive ? "text-[#34D399] rotate-90" : "text-[#FFFFEB]/50"}`}>
                          →
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: Active Answer View */}
            <div className="lg:col-span-6 flex flex-col justify-between p-2 sm:p-4">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-xs uppercase tracking-wider text-[#34D399] font-bold">
                    Answer
                  </span>
                  <span className="text-xs text-[#FFFFEB]/60 font-mono">
                    Instant clarification
                  </span>
                </div>

                {/* Active Question Title Repeated */}
                <h4 className="font-styled text-lg sm:text-xl font-bold text-[#FFFFEB] mb-4 leading-snug">
                  {FAQS[activeIdx].q}
                </h4>

                {/* Answer Bubble Card */}
                <div className="bg-[#1E1E1B] p-6 sm:p-7 rounded-2xl border border-[#FFFFEB]/10 shadow-sm text-sm sm:text-base text-[#FFFFEB]/85 leading-relaxed">
                  {FAQS[activeIdx].a}
                </div>
              </div>

              {/* Bottom Brand Mark Accent */}
              <div className="mt-6 pt-4 border-t border-[#FFFFEB]/5 flex items-center justify-between text-xs text-[#FFFFEB]/50">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#34D399]" />
                  {BRAND_NAME}
                </span>
                <span className="font-mono">Runs in your browser</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}

export function ClosingCta() {
  return (
    <section className="px-4 pb-16">
      <div data-reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-[#0F3D2E] px-6 py-20 text-center text-[#FFFFEB] sm:py-28 shadow-2xl">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(52,211,153,0.35),transparent_60%)]" />
        <h2 className="relative font-styled text-5xl font-bold tracking-tight sm:text-7xl">Now, <em className="font-normal italic text-[#F0D7FF]">captivate.</em></h2>
        <p className="relative mx-auto mt-5 max-w-lg text-[#FFFFEB]/70 text-base sm:text-lg leading-relaxed">Your next video deserves captions people actually watch. Start free, in under a minute.</p>
        <div className="relative mt-9 inline-block">
          <div className="conic-glow-pill rounded-full p-[1px]">
            <Link href="/start" className="flex items-center gap-2 rounded-full border border-[#FFFFEB]/30 bg-[#252B26] px-8 py-4 text-base sm:text-lg font-bold text-[#FFFFEB] transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]">
              Create free captions <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const FOOTER_COLUMNS = [
  {
    title: "PRODUCT",
    links: [
      { label: "How it works", href: "/#how" },
      { label: "Pricing", href: "/pricing" },
      { label: "Clipper", href: "/clipper" },
      { label: "Looks gallery", href: "/#looks" },
      { label: "Precision controls", href: "/#control" },
    ],
  },
  {
    title: "CREATORS",
    links: [
      { label: "Looks for Shorts, Reels & TikTok", href: "/#looks" },
      { label: "Hindi & Hinglish support", href: "/#faq" },
      { label: "Export formats, incl. overlays", href: "/#faq" },
    ],
  },
  {
    title: "RESOURCES",
    links: [
      { label: "Open source on GitHub", href: GITHUB_URL },
      { label: "Frequently asked questions", href: "/#faq" },
      { label: "Project studio", href: "/dashboard" },
    ],
  },
  {
    title: "COMPANY",
    links: [
      { label: "About", href: "/about" },
      { label: "Sign in to app", href: "/login" },
      { label: "Terms of service", href: "/terms" },
      { label: "Privacy policy", href: "/privacy" },
      { label: "Cookie policy", href: "/cookies" },
      { label: "Acceptable use", href: "/acceptable-use" },
      { label: "Copyright & takedowns", href: "/copyright" },
      { label: "Credits & licences", href: "/credits" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-[#FFFFEB]/10 bg-[#1E1E1B] pt-20 pb-10 text-[#FFFFEB]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* 4 Column Footer Links Grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4 lg:gap-16 pb-16">
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title} className="space-y-4">
              <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-[#FFFFEB]/50">
                {col.title}
              </h3>
              <ul className="space-y-0.5 text-sm text-[#FFFFEB]/75 lg:space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-10 items-center transition-colors hover:text-[#34D399] hover:underline underline-offset-4 lg:min-h-0"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Giant Open Caption Bottom Logo matching Image 1 */}
        <div className="pt-10 sm:pt-14 border-t border-[#FFFFEB]/10 flex items-center justify-between overflow-hidden select-none">
          <Link href="/" className="group flex items-center gap-3 sm:gap-5 w-full">
            {/* Audio Wave Icon Bars with subtle rhythmic bounce */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 h-12 sm:h-20 md:h-28 lg:h-36 shrink-0">
              <span className="w-1.5 sm:w-3 lg:w-4 bg-[#FFFFEB] h-1/2 rounded-full animate-wave-bar-1 transition-transform group-hover:scale-y-110" />
              <span className="w-1.5 sm:w-3 lg:w-4 bg-[#FFA946] h-full rounded-full animate-wave-bar-2 transition-transform group-hover:scale-y-105" />
              <span className="w-1.5 sm:w-3 lg:w-4 bg-[#34D399] h-4/5 rounded-full animate-wave-bar-3 transition-transform group-hover:scale-y-110" />
            </div>

            {/* Giant Open Caption Typography */}
            <span className="font-styled font-black text-4xl sm:text-7xl md:text-8xl lg:text-[130px] leading-none tracking-tighter text-[#FFFFEB] transition-transform duration-300 group-hover:translate-x-1">
              {BRAND_WORDMARK_LEAD}<span className="font-serif font-normal italic text-[#FFFFEB]">{BRAND_WORDMARK_ACCENT}</span>
            </span>
          </Link>
        </div>

        {/* Bottom Legal Copyright */}
        <div className="mt-8 pt-6 border-t border-[#FFFFEB]/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#FFFFEB]/60">
          <span>© {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.</span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#34D399] animate-pulse" />
            Zero Server Cost · Local Hardware-Accelerated Rendering
          </span>
        </div>

      </div>
    </footer>
  );
}
