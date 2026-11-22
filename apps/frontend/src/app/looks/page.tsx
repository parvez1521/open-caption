"use client";

import { Footer, Nav } from "@/components/home/Sections";
import LooksGallery from "@/features/looks/LooksGallery";
import { LOOKS } from "@capseasy/templates";

/**
 * /looks — the dedicated looks gallery. Every built-in look, grouped by
 * section, with search. Tapping a look starts a new project with it.
 * Full dark, one column, stacked sections — same page shape as
 * /ai-generator. No three-cards-in-a-row, no bento grid, no glass card,
 * no dot-grid background, no hover animation, no purple gradient.
 *
 * A client component: the look count below comes from @capseasy/templates,
 * which is client-only (it uses React hooks and Remotion), so no server
 * component on this route may import it.
 */
export default function LooksPage() {
  return (
    <div className="min-h-screen bg-[#141412] text-[#FFFFEB]">
      <Nav />
      <main id="main-content" className="mx-auto max-w-6xl px-5 pb-24 pt-28 sm:pt-32">
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#34D399]">Caption looks</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold leading-[1.08] tracking-[-0.015em] sm:text-5xl">Every look, in one place</h1>
        <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-[#FFFFEB]/80">
          {LOOKS.length} animated caption looks for Shorts, Reels and TikTok. Each one is a complete style: layout,
          motion and type. Tap any look to start a project with it, then recolour it or save your own version in the
          Studio.
        </p>
        <LooksGallery />
      </main>
      <Footer />
    </div>
  );
}
