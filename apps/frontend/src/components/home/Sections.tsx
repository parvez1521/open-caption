"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { MOTION_TEMPLATES, defaultMotionConfig } from "@capseasy/motion";
import type { OverlayItem, OverlaySocialVariant } from "@capseasy/shared";
import { FAQS } from "./faqs";
import { HeroCylinder } from "./HeroCylinder";

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
import { Logo as BrandLogo } from "@/components/brand/Logo";
import { InstallApp } from "@/components/pwa/InstallApp";
import { LEGAL, LEGAL_PAGES } from "@/lib/legal";
import { BRAND_NAME, BRAND_WORDMARK_ACCENT, BRAND_WORDMARK_LEAD } from "@/lib/brand";

// Motion Studio previews: the real animated graphics, loaded lazily like the other live previews
const MotionPreview = dynamic(() => import("@/features/motion/MotionPreview").then((m) => m.MotionPreview), { ssr: false, loading: () => <div className="aspect-[700/360] w-full animate-pulse bg-[#141412]" /> });
// The AI Edit demonstration: a real sample clip edited live by the real renderer, loaded lazily
const AiEditDemo = dynamic(() => import("./AiEditDemo").then((m) => m.AiEditDemo), { ssr: false, loading: () => <div className="aspect-[4/3] w-full animate-pulse rounded-[2rem] bg-[#1C1C1A]" /> });

const INK = "#FFFFEB";
/** Product Hunt badge: set NEXT_PUBLIC_PRODUCT_HUNT_POST_ID (and _SLUG) on Vercel once the launch is scheduled; hidden until then. */
const PH_POST_ID = process.env.NEXT_PUBLIC_PRODUCT_HUNT_POST_ID || "";
const PH_SLUG = process.env.NEXT_PUBLIC_PRODUCT_HUNT_SLUG || "";

/** Start warming the speech model only on a real click (intent): a casual
 * hover over "Start free" used to kick off a multi-MB model download. */
const warmModel = () => void import("@/features/transcribe/runtime").then((m) => m.prefetchWhenIdle());

export function Logo({ light = false }: { light?: boolean }) {
  return <BrandLogo tone="light" height={28} />;
}

const NAV_LINKS = [
  ["How it works", "#how"],
  ["Editor", "#control"],
  ["Looks", "#looks"],
  ["On your device", "#privacy"],
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
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-2xl border border-[#FFFFEB]/10 bg-[#1C1C1A] px-4 py-2.5 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)]">
        <Link href="/" aria-label={`${BRAND_NAME} home`}>
          <Logo />
        </Link>
        <nav className="hidden items-center gap-6 whitespace-nowrap text-sm font-semibold text-[#FFFFEB]/80 lg:flex xl:gap-7">
          {NAV_LINKS.map(([label, href]) => (
            <a key={href} href={href} className="py-1 hover:text-[#FFFFEB]">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href={signedIn ? "/dashboard" : "/login"} className="hidden whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold text-[#FFFFEB]/80 transition hover:text-[#FFFFEB] sm:block">{signedIn ? "Dashboard" : "Sign in"}</Link>
          {/* phones: this moves into the menu */}
          <Link href="/start?choose=1" onClick={warmModel} className="hidden items-center gap-1.5 whitespace-nowrap rounded-full bg-[#34D399] px-4 py-2 text-sm font-bold text-[#141412] sm:flex">
            Start free <span aria-hidden>→</span>
          </Link>
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
            <Link href="/start?choose=1" onClick={() => setOpen(false)} className="flex items-center justify-center gap-2 rounded-full bg-[#34D399] px-5 py-3.5 text-base font-bold text-[#141412]">
              Start free <span aria-hidden>→</span>
            </Link>
            <Link href={signedIn ? "/dashboard" : "/login"} onClick={() => setOpen(false)} className="rounded-full px-5 py-3 text-center text-base font-semibold text-[#FFFFEB]/70">{signedIn ? "Dashboard" : "Sign in"}</Link>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

/** Motion preference, guarded: jsdom (and very old browsers) have no matchMedia. */
function prefersReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Hinglish claim, in the owner's exact words (2026-11-13): "95% Hinglish caption accurate".
 * Framed as Captionit's claim for everyday Hindi-English speech — NOT a measured
 * benchmark: no test, methodology or verification is claimed anywhere in this copy.
 * The number counts 0 → 95 once the hero entrance has played (the CSS entrance ends
 * first, so the count is never hidden behind the intro curtain); a 7s fallback covers
 * reduced-motion and coarse pointers, where the CSS animation is disabled and no
 * animationend fires. Reduced motion jumps straight to 95.
 */
export function HinglishClaim() {
  const [started, setStarted] = useState(false);
  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setStarted(true);
      return;
    }
    const t = setTimeout(() => setStarted(true), 7000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!started) return;
    if (prefersReducedMotion()) {
      setPct(95);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 1100);
      setPct(Math.round(95 * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started]);
  return (
    <p
      data-hero="claim"
      role="group"
      aria-label="95% Hinglish caption accurate. Captionit's claim for Hindi-English speech."
      onAnimationEnd={() => setStarted(true)}
      className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1"
    >
      <span aria-hidden className="font-styled text-2xl font-bold text-[#34D399] sm:text-3xl">
        {pct}%
      </span>
      <span aria-hidden className="text-base font-bold text-[#FFFFEB] sm:text-lg">Hinglish caption accurate</span>
      <span aria-hidden className="w-full text-xs leading-relaxed text-[#FFFFEB]/50 sm:w-auto">
        Captionit&rsquo;s claim for Hindi-English speech. Try it on your own clip.
      </span>
    </p>
  );
}

/**
 * Hero: a split layout, not a centred headline over a strip of clips. The copy sits on
 * the left; below it, the trending caption looks ride a slowly rotating 3D cylinder —
 * drag to spin it, or let it turn by itself. Every card is a live preview of the real
 * template motion, and the headline entrance is the page's existing CSS-timed fade
 * (data-hero attributes, see globals.css).
 */
export function Hero() {
  return (
    <section className="relative mx-auto flex min-h-[100svh] w-full max-w-6xl flex-col justify-center px-5 pb-16 pt-[max(7rem,14vh)]">
      <div className="relative z-10 max-w-2xl">
        <div data-hero="eyebrow" className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-[#34D399]">Free caption studio · Runs in your browser</span>
          {PH_POST_ID ? (
            <a href={`https://www.producthunt.com/posts/${PH_SLUG}?utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-${PH_SLUG}`} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=${PH_POST_ID}&theme=light`} alt="Captionit on Product Hunt" width={194} height={42} className="h-[42px] w-auto" />
            </a>
          ) : null}
        </div>

        <h1 className="font-styled mt-5 text-[clamp(2.6rem,6vw,4.6rem)] font-bold leading-[0.95] tracking-[-0.04em] text-[#FFFFEB]">
          <span data-hero="word" className="block">Every word,</span>
          <span data-hero="word2" className="font-accent block pr-[0.06em] font-normal italic tracking-[-0.025em] text-[#34D399]">on screen, on time.</span>
        </h1>

        <p data-hero="sub" className="mt-5 max-w-lg text-[15px] leading-relaxed text-[#FFFFEB]/70 sm:text-[17px] font-medium">
          Captionit turns speech into animated, word-timed captions. For Shorts, Reels and TikTok. 150 looks and 14 languages. No watermark. All in the tab you already have open.
        </p>

        <div data-hero="cta" className="mt-7 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link href="/start?choose=1" onClick={warmModel} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#34D399] px-8 py-4 text-base font-bold text-[#141412] sm:w-auto">
            Caption your first video free <span aria-hidden>→</span>
          </Link>
          <a href="#looks" className="w-full rounded-full border border-[#FFFFEB]/15 bg-[#1C1C1A] px-7 py-4 text-center text-base font-semibold text-[#FFFFEB]/80 hover:text-[#FFFFEB] sm:w-auto">
            Browse the looks
          </a>
        </div>
        <p data-hero="editor-door" className="mt-3 text-sm text-[#FFFFEB]/60">
          Just want to edit?{" "}
          <Link href="/start?mode=editor" className="font-semibold text-[#FFFFEB]/85 underline decoration-[#FFA946] decoration-2 underline-offset-4 hover:text-[#FFFFEB]">
            Open the plain editor — no captions
          </Link>
        </p>
        <p data-hero="points" className="mt-6 font-mono text-xs tracking-wide text-[#FFFFEB]/50">
          150 looks · 14 languages · No watermark
        </p>
        <HinglishClaim />
      </div>

      {/* the captions are the visual: the trending looks on a rotating 3D cylinder */}
      <div className="relative z-0 mt-12 w-full">
        <HeroCylinder />
        <p className="mt-3 text-center text-xs text-[#FFFFEB]/50">Drag to spin the ring. Live previews of trending looks.</p>
      </div>
    </section>
  );
}

/** The four ways in, as full-width rows: captions, plain editing, AI Edit, transcribe. */
const DOORS = [
  { href: "/start?mode=captions", tag: "Captions", title: "Add captions", body: "Upload a clip and get word-timed captions in one of 150 looks." },
  { href: "/start?mode=editor", tag: "Editor", title: "Edit a video", body: "The plain editor, no captions attached. Cut, trim and arrange." },
  { href: "/start?mode=ai-edit", tag: "AI Edit", title: "AI Edit", body: "Describe the edit, then approve the plan before anything is applied." },
  { href: "/transcribe", tag: "Transcribe", title: "Transcribe", body: "A file in, a timed transcript out, in 14 languages." },
  { href: "/auto-caption-generator", tag: "Captions", title: "Auto caption generator", body: "How automatic captions work, what they cost, and what they cannot do." },
];

export function ToolDoors() {
  return (
    <section className="px-4 pb-24 sm:pb-32">
      <div className="mx-auto max-w-6xl">
        <div data-reveal className="max-w-2xl">
          <h2 className="font-styled text-3xl font-bold tracking-tight text-[#FFFFEB] sm:text-4xl">Start with what you need.</h2>
        </div>
        <div data-reveal className="mt-8 border-t border-[#FFFFEB]/10">
          {DOORS.map((d) => (
            <Link key={d.href} href={d.href} className="group grid grid-cols-1 gap-1 border-b border-[#FFFFEB]/10 py-6 sm:grid-cols-12 sm:items-baseline sm:gap-6">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-[#34D399] sm:col-span-2">{d.tag}</span>
              <span className="font-styled text-xl font-bold text-[#FFFFEB] sm:col-span-4">{d.title}</span>
              <span className="text-sm leading-relaxed text-[#FFFFEB]/70 sm:col-span-5">{d.body}</span>
              <span aria-hidden className="hidden text-right text-[#FFFFEB]/50 transition group-hover:text-[#FFFFEB] sm:col-span-1 sm:block">→</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function UploadArtifact() {
  return (
    <div className="rounded-2xl border border-dashed border-[#FFFFEB]/20 bg-[#1C1C1A] p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-[#FFFFEB]/60">drop your clip here</span>
        <span className="rounded-full bg-[#1E1E1B] border border-[#FFFFEB]/10 px-3 py-1 font-mono text-[11px] font-semibold text-[#34D399]">
          reel-draft.mp4
        </span>
      </div>
      <div className="mt-4 h-2 rounded-full bg-[#FFFFEB]/5 overflow-hidden">
        <div className="h-full w-[72%] rounded-full bg-[#34D399]" />
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
    <div className="rounded-2xl bg-[#1C1C1A] border border-[#FFFFEB]/10 divide-y divide-[#FFFFEB]/5 shadow-sm overflow-hidden">
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
    <div className="rounded-2xl bg-[#1C1C1A] border border-[#FFFFEB]/10 p-5 space-y-4 shadow-sm">
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
    <div className="rounded-2xl bg-[#1C1C1A] border border-[#FFFFEB]/10 p-5 space-y-3.5 shadow-sm">
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
    title: "Drop in a clip",
    body: "One video file, straight from your camera roll. The file stays on your device.",
    artifact: <UploadArtifact />,
  },
  {
    n: "2",
    title: "Speech becomes timed words",
    body: "The speech model runs in your browser. It stamps every word with its moment. Fix a name or drop a filler first.",
    artifact: <TranscriptArtifact />,
  },
  {
    n: "3",
    title: "Choose the look, place the box",
    body: "Start from 150 animated looks. Drag the caption box clear of faces and buttons. Then tune the hero word and body line apart.",
    artifact: <StyleArtifact />,
  },
  {
    n: "4",
    title: "Export the finished video",
    body: "The same renderer burns the captions into a 1080p vertical MP4. What you saw is what posts.",
    artifact: <RenderArtifact />,
  },
];

/**
 * How it works: a sticky heading on the left, the four steps as a plain list on the
 * right, each with its artifact underneath. No alternating two-column rows.
 */
export function HowItWorks() {
  return (
    <section id="how" className="relative px-4 py-24 sm:py-32">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 lg:grid-cols-12">
        <div data-reveal className="lg:col-span-4">
          <div className="lg:sticky lg:top-28">
            <h2 className="font-styled text-4xl font-bold leading-tight tracking-tight text-[#FFFFEB] sm:text-5xl">
              Four steps, <em className="font-normal italic text-[#34D399]">then post.</em>
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#FFFFEB]/70">
              No timeline to set up. No project files to manage.
            </p>
          </div>
        </div>

        <div className="lg:col-span-8">
          <div className="space-y-12">
            {PIPELINE_STEPS.map((s) => (
              <div key={s.n} data-step>
                <p className="font-mono text-xs font-semibold uppercase tracking-wider text-[#34D399]">Step {s.n}</p>
                <h3 className="mt-1 font-styled text-2xl font-bold text-[#FFFFEB]">{s.title}</h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-[#FFFFEB]/70">{s.body}</p>
                <div className="mt-4">{s.artifact}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * HIDDEN for now (owner order 2026-11-13, "abhi ke liye"): the Clipper section is not
 * rendered on the homepage and neither /clipper nor /ai-clipper is linked from it.
 * The component, routes and pages stay live and untouched — restore by re-adding
 * <ClipperSection /> to (home)/page.tsx and the footer links below.
 */
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
          <div className="lg:order-2">
            <span className="rounded-md bg-[#FFA946] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#141412]">Trending</span>
            <h2 className="font-styled mt-4 text-4xl font-bold leading-tight tracking-tight text-[#FFFFEB] sm:text-5xl">
              One long take, <em className="font-normal italic text-[#34D399]">cut into clips worth posting.</em>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-[#FFFFEB]/70">
              The Clipper reads your transcript and proposes the segments worth clipping: measured
              suggestions from the speech between silences, or the AI Clipping Studio&rsquo;s
              ranked moments. Trim the edges, create a clip, and it becomes its own captioned
              project, ready to style and post.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[#FFFFEB]/60">
              The AI ranks moments with an Editorial score — an estimate, never a performance
              prediction — and the measured suggestions show the signals behind their order. Your
              source video is not re-encoded or cut; a clip is a range on the same file, kept on
              your device. The separate AI Clipper section compares every clip against the whole
              video, and its runs resume where they stopped.
            </p>
            <Link href="/clipper" className="mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-[#34D399] px-6 py-3.5 text-base font-bold text-[#141412]">
              Open the Clipper <span aria-hidden>→</span>
            </Link>
            <Link href="/ai-clipper" className="ml-3 mt-7 inline-flex items-center justify-center gap-2 rounded-full border border-[#FFFFEB]/20 px-6 py-3.5 text-base font-bold text-[#FFFFEB]">
              Open the AI Clipper <span aria-hidden>→</span>
            </Link>
          </div>
          <div className="rounded-[2rem] border border-[#FFFFEB]/10 bg-[#1E1E1B] p-6 sm:p-8 lg:order-1">
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
            <p className="mt-5 font-mono text-[11px] leading-relaxed text-[#FFFFEB]/45">Silences split runs · short runs merge · long runs split on pauses</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function TranscribeSection() {
  return (
    <section id="transcribe" className="px-4 py-24 sm:py-32 border-t border-[#FFFFEB]/10">
      <div className="mx-auto max-w-6xl">
        <div data-reveal className="grid items-center gap-10 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-[#FFFFEB]/10 bg-[#1E1E1B] p-6 sm:p-8 lg:order-1">
            <p className="font-mono text-[11px] uppercase tracking-widest text-[#FFFFEB]/50">Transcript · timed segments</p>
            <div className="mt-5 space-y-3">
              {[
                ["0:00", "hello, and welcome back to the show"],
                ["0:04", "today we are looking at three free tools"],
                ["0:09", "the first one runs entirely in your browser"],
              ].map(([time, line]) => (
                <div key={time} className="flex items-baseline gap-3 rounded-xl border border-[#FFFFEB]/10 bg-[#262622] px-4 py-3.5">
                  <span className="shrink-0 font-mono text-sm font-semibold text-[#34D399]">{time}</span>
                  <span className="min-w-0 text-sm text-[#FFFFEB]/80">{line}</span>
                </div>
              ))}
            </div>
            <p className="mt-5 font-mono text-[11px] leading-relaxed text-[#FFFFEB]/45">TXT · SRT · VTT downloads · 14 languages</p>
          </div>
          <div className="lg:order-2">
            <h2 className="font-styled text-4xl font-bold leading-tight tracking-tight text-[#FFFFEB] sm:text-5xl">
              A file in, <em className="font-normal italic text-[#34D399]">a transcript out.</em>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-[#FFFFEB]/70">
              Transcribe turns a video or audio file into a timed transcript. In 14 languages. The speech model runs in your browser. Copy it, or download it as TXT, SRT or VTT.
            </p>
            <Link href="/transcribe" className="mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-[#34D399] px-6 py-3.5 text-base font-bold text-[#141412]">
              Open Transcribe <span aria-hidden>→</span>
            </Link>
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
            Subscribe pills, follow cards, counters and titles. Animated graphics with your own words and colour. Drop them into a project. These four play live, exactly as they render.
          </p>
          <Link href="/motion" className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-[#34D399] px-6 py-3.5 text-base font-bold text-[#141412]">
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
          <Link
            href="/motion"
            className="flex w-[280px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-[#FFFFEB]/10 bg-[#1C1C1A] px-4 py-3 transition hover:border-[#FFFFEB]/25 sm:w-[320px]"
            aria-label="Explore more motion templates"
          >
            <span className="font-styled text-[15px] font-bold text-[#FFFFEB]">
              Explore more <span aria-hidden>→</span>
            </span>
            <span className="text-[13px] leading-snug text-[#FFFFEB]/65">See all motion templates</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * AI Edit section: the demonstration is the product's real machinery on a real
 * sample clip — the style chips and plan checklist narrate the panel's flow
 * while the real composition renders the before and the edited states.
 */
export function AiEditSection() {
  return (
    <section id="ai-edit" className="px-4 py-24 sm:py-32 border-t border-[#FFFFEB]/10">
      <div className="mx-auto max-w-6xl">
        <div data-reveal className="grid items-center gap-10 lg:grid-cols-2">
          <div className="lg:order-1">
            <AiEditDemo />
          </div>
          <div className="lg:order-2">
            <span className="rounded-md bg-[#34D399] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#141412]">New</span>
            <h2 className="font-styled mt-4 text-4xl font-bold leading-tight tracking-tight text-[#FFFFEB] sm:text-5xl">
              Describe the edit. <em className="font-normal italic text-[#34D399]">Check the plan. Keep what works.</em>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-[#FFFFEB]/70">
              Choose a look. Add a line of instruction if you like. AI Edit drafts the whole edit as a checklist: the caption look, punch-in zooms, key words and a hook. Nothing is applied until you approve it. Every step can be previewed and undone.
            </p>
            <Link href="/start?choose=1" className="mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-[#34D399] px-6 py-3.5 text-base font-bold text-[#141412]">
              Try AI Edit <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function BrowserCard() {
  const rows = [
    ["Speech recognition", "on this device"],
    ["Your video file", "never uploaded for captions or export"],
    ["MP4 export", "made in this tab"],
    ["Install", "nothing, ever"],
  ];
  return (
    <div className="relative flex h-full min-h-[240px] w-full flex-col justify-center rounded-2xl border border-white/10 bg-[#141412] p-6 font-mono text-[13px] leading-relaxed text-[#FFFFEB]/90 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.5)] sm:p-8">
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
        <div className="relative grid items-center gap-10 lg:grid-cols-2">
          <div className="min-w-0 lg:h-full lg:order-1">
            <BrowserCard />
          </div>
          <div className="lg:pr-8 lg:order-2">
            <h2 className="font-styled text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Your video <em className="font-normal italic text-[#34D399]">never leaves</em> this tab.</h2>
            <p className="mt-6 text-base sm:text-lg leading-relaxed text-[#FFFFEB]/75">
              Transcription, styling and the MP4 export run in this tab. On your phone or your laptop. No app, no plugin, no per-minute bill.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const CONTROLS = [
  {
    n: "01",
    title: "Move the caption box",
    body: "Drag and resize the caption region anywhere in the frame. Keep it clear of faces, product shots and buttons. The export honours it to the pixel.",
  },
  {
    n: "02",
    title: "Re-cut the timing",
    body: "A word-level timeline lets you nudge any word's in and out points when the delivery needs a different beat than the transcript suggests.",
  },
  {
    n: "03",
    title: "Fix the transcript first",
    body: "Correct names, drop filler words and merge fragments first. Then the animation never amplifies a typo.",
  },
  {
    n: "04",
    title: "Style the hero word apart",
    body: "The emphasized word has its own font, size and colour. So does the supporting line. Tune one without touching the other.",
  },
  {
    n: "05",
    title: "Every export is saved",
    body: "Each render lands in the project's export history with its settings, so last week's look is one click to reproduce.",
  },
];

/**
 * Editor controls: a plain numbered list, no tag pills, no sticky side column.
 * The facts are the same five the editor offers; the wording is rewritten.
 */
export function Control() {
  return (
    <section id="control" className="px-4 py-24 sm:py-32 border-t border-[#FFFFEB]/10">
      <div className="mx-auto max-w-6xl">
        <div data-reveal className="max-w-2xl">
          <h2 className="font-styled text-4xl font-bold leading-tight tracking-tight text-[#FFFFEB] sm:text-5xl">
            You stay in charge of <em className="font-normal italic text-[#34D399]">every word.</em>
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[#FFFFEB]/70">
            The first pass is automatic. After that, you can change every word, break, position and motion curve.
          </p>
        </div>
        <div className="mt-12 border-t border-[#FFFFEB]/10">
          {CONTROLS.map((c) => (
            <div key={c.n} data-reveal className="grid grid-cols-1 gap-1 border-b border-[#FFFFEB]/10 py-6 sm:grid-cols-12 sm:gap-6">
              <span className="font-mono text-xs font-semibold text-[#34D399] sm:col-span-1">{c.n}</span>
              <h3 className="font-styled text-lg font-bold text-[#FFFFEB] sm:col-span-4">{c.title}</h3>
              <p className="max-w-[54ch] text-sm leading-relaxed text-[#FFFFEB]/70 sm:col-span-7">{c.body}</p>
            </div>
          ))}
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
        <div data-reveal className="max-w-2xl">
          <h2 className="font-styled text-4xl font-bold leading-tight tracking-tight text-[#FFFFEB] sm:text-5xl">
            Questions, answered.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[#FFFFEB]/70">
            The things people ask before their first caption.
          </p>
        </div>

        <div data-reveal className="mt-10 border-t border-[#FFFFEB]/10">
          {FAQS.map((faq, idx) => {
            const isActive = activeIdx === idx;
            return (
              <div key={idx} className="border-b border-[#FFFFEB]/10">
                <button
                  onClick={() => setActiveIdx(isActive ? -1 : idx)}
                  aria-expanded={isActive}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left"
                >
                  <span className="font-styled text-lg font-bold text-[#FFFFEB] sm:text-xl">{faq.q}</span>
                  <span aria-hidden className="shrink-0 font-mono text-lg text-[#34D399]">{isActive ? "−" : "+"}</span>
                </button>
                {isActive ? (
                  <p className="max-w-3xl pb-6 text-sm leading-relaxed text-[#FFFFEB]/80 sm:text-base">{faq.a}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function ClosingCta() {
  return (
    <section className="px-4 pb-16">
      <div data-reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-[#0F3D2E] px-6 py-14 text-[#FFFFEB] shadow-2xl sm:px-12 sm:py-16">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <h2 className="font-styled text-4xl font-bold tracking-tight sm:text-5xl">Start with one clip.</h2>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-[#FFFFEB]/70 sm:text-lg">Upload a video and see your words on screen in under a minute. Free, no watermark.</p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2">
            <Link href="/start?choose=1" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#34D399] px-8 py-4 text-base font-bold text-[#141412] sm:text-lg">
              Create free captions <span aria-hidden>→</span>
            </Link>
            <InstallApp />
          </div>
        </div>
      </div>
    </section>
  );
}

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/#how" },
      { label: "Pricing", href: "/pricing" },
      { label: "Auto caption generator", href: "/auto-caption-generator" },
      { label: "Transcribe", href: "/transcribe" },
      { label: "Looks gallery", href: "/#looks" },
      { label: "Precision controls", href: "/#control" },
    ],
  },
  {
    title: "For creators",
    links: [
      { label: "Looks for Shorts, Reels & TikTok", href: "/#looks" },
      { label: "Hindi & Hinglish support", href: "/#faq" },
      { label: "Export formats, incl. overlays", href: "/#faq" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Frequently asked questions", href: "/#faq" },
      { label: "Project studio", href: "/dashboard" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Support", href: `mailto:${LEGAL.email}` },
      { label: "Sign in to app", href: "/login" },
      { label: "Terms of service", href: "/terms" },
      { label: "Privacy policy", href: "/privacy" },
      { label: "Cookie policy", href: "/cookies" },
      { label: "Acceptable use", href: "/acceptable-use" },
      { label: "Copyright & takedowns", href: "/copyright" },
      { label: "Subprocessors", href: "/subprocessors" },
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

        {/* Giant Captionit Bottom Logo matching Image 1 */}
        <div className="pt-10 sm:pt-14 border-t border-[#FFFFEB]/10 flex items-center justify-between overflow-hidden select-none">
          <Link href="/" className="group flex items-center gap-3 sm:gap-5 w-full">
            {/* Caption-lines mark, same geometry as the logo */}
            <svg viewBox="0 0 100 100" className="h-12 w-auto shrink-0 sm:h-20 md:h-28 lg:h-36" aria-hidden role="presentation">
              <rect x="16" y="32" width="46" height="13" rx="6.5" fill="#FFFFEB" />
              <rect x="16" y="55" width="60" height="13" rx="6.5" fill="#FFFFEB" />
              <rect x="80" y="55" width="13" height="13" rx="2.5" fill="#FFA946" />
            </svg>

            {/* Giant Captionit Typography */}
            <span className="font-styled font-black text-4xl sm:text-7xl md:text-8xl lg:text-[130px] leading-none tracking-tighter text-[#FFFFEB]">
              {BRAND_WORDMARK_LEAD}<span className="font-serif font-normal italic text-[#FFFFEB]">{BRAND_WORDMARK_ACCENT}</span>
            </span>
          </Link>
        </div>

        {/* Bottom Legal Copyright */}
        <div className="mt-8 pt-6 border-t border-[#FFFFEB]/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#FFFFEB]/60">
          <span>© {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.</span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#34D399]" />
            Zero Server Cost · Local Hardware-Accelerated Rendering
          </span>
        </div>

      </div>
    </footer>
  );
}
