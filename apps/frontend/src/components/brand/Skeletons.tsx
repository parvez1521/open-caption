import React from "react";
import { LoadingMark } from "./LoadingMark";

/** A shimmering placeholder block. Sized by the caller; shaped like the thing that is about to appear. */
export const Skel = ({ className = "", style }: { className?: string; style?: React.CSSProperties }) => (
  <div className={`skel ${className}`} style={style} aria-hidden />
);

/** Placeholder project cards (same size as the real ones, so nothing jumps when they load). */
export function ProjectCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading your projects">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex h-32 flex-col justify-between rounded-xl border border-sand-200 bg-white p-4 sm:h-40 sm:p-5" style={{ opacity: 1 - i * 0.12 }}>
          <div className="space-y-2.5">
            <Skel className="h-4 w-3/5 rounded-md" />
            <Skel className="h-3 w-16 rounded-md" />
          </div>
          <div className="flex items-center justify-between">
            <Skel className="h-6 w-24 rounded-full" />
            <Skel className="h-3 w-14 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The dashboard page body while its data loads: heading, button and cards. */
export function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-10 sm:py-10" aria-busy>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-sand-200 pb-8">
        <div className="min-w-0 flex-1 space-y-3">
          <Skel className="h-9 w-64 max-w-full rounded-lg sm:h-10" />
          <Skel className="h-3.5 w-full max-w-md rounded-md" />
        </div>
        <Skel className="h-11 w-36 rounded-full" />
      </div>
      <div className="pt-8">
        <ProjectCardsSkeleton />
      </div>
    </div>
  );
}

/** The whole studio while a project opens: top bar, captions list, preview, properties and timeline. */
export function StudioSkeleton({ label = "Opening your project" }: { label?: string }) {
  return (
    <main id="main-content" className="studio flex h-[100dvh] flex-col" aria-busy aria-label={`${label}…`}>
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-st-line bg-st-panel px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Skel className="h-9 w-9 rounded-full" />
          <Skel className="hidden h-5 w-28 rounded-md sm:block" />
          <Skel className="h-5 w-36 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skel className="hidden h-9 w-9 rounded-xl sm:block" />
          <Skel className="hidden h-9 w-9 rounded-xl sm:block" />
          <Skel className="h-9 w-20 rounded-full" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(300px,24vw)_minmax(0,1fr)_minmax(320px,23vw)] lg:grid-rows-[minmax(0,1fr)_minmax(250px,38%)]">
        {/* captions list */}
        <section className="hidden min-h-0 flex-col gap-3 border-b border-r border-st-line bg-st-panel p-4 lg:flex" aria-hidden>
          <div className="flex items-baseline justify-between">
            <Skel className="h-6 w-24 rounded-md" />
            <Skel className="h-3 w-14 rounded-md" />
          </div>
          <Skel className="h-9 w-full rounded-lg" />
          {[78, 62, 84, 55, 70].map((w, i) => (
            <div key={i} className="space-y-2 pt-1" style={{ opacity: 1 - i * 0.14 }}>
              <Skel className="h-3 w-10 rounded" />
              <div className="flex gap-2">
                {[w * 0.32, w * 0.28, w * 0.34].map((cw, k) => (
                  <Skel key={k} className="h-8 rounded-lg" style={{ width: `${cw}%` }} />
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* preview */}
        <section className="grid min-h-[260px] shrink-0 place-items-center border-b border-st-line bg-st-bg p-3 max-lg:h-[44dvh] lg:min-h-0" aria-hidden>
          <div className="relative grid h-full max-h-full place-items-center overflow-hidden rounded-xl bg-[#0B0B0A] shadow-[0_18px_40px_-18px_rgba(0,0,0,0.45)]" style={{ aspectRatio: "9 / 16", maxWidth: "100%" }}>
            <div className="skel absolute inset-0 !bg-[#FFFFEB]/10 opacity-30" />
            <LoadingMark height={44} tone="light" className="relative" />
          </div>
        </section>

        {/* properties */}
        <aside className="hidden min-h-0 flex-col gap-4 border-l border-st-line bg-st-panel p-4 lg:row-span-2 lg:flex" aria-hidden>
          <div className="flex gap-2">
            <Skel className="h-9 flex-1 rounded-lg" />
            <Skel className="h-9 flex-1 rounded-lg" />
            <Skel className="h-9 flex-1 rounded-lg" />
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2" style={{ opacity: 1 - i * 0.14 }}>
              <Skel className="h-3 w-24 rounded" />
              <Skel className="h-8 w-full rounded-lg" />
            </div>
          ))}
        </aside>

        {/* timeline */}
        <section className="hidden min-h-0 flex-col gap-2 bg-st-panel p-3 lg:col-span-2 lg:flex" aria-hidden>
          <Skel className="h-9 w-72 rounded-lg" />
          <Skel className="h-11 w-full rounded-lg" />
          <Skel className="h-14 w-full rounded-lg" />
          <Skel className="h-11 w-full rounded-lg" />
        </section>

        {/* phone: the panel under the preview */}
        <section className="min-h-0 flex-1 space-y-3 bg-st-panel p-4 lg:hidden" aria-hidden>
          {[70, 52, 80, 60].map((w, i) => (
            <div key={i} className="flex gap-2" style={{ opacity: 1 - i * 0.16 }}>
              {[w * 0.3, w * 0.25, w * 0.3].map((cw, k) => (
                <Skel key={k} className="h-8 rounded-lg" style={{ width: `${cw}%` }} />
              ))}
            </div>
          ))}
        </section>
      </div>

      <nav className="grid shrink-0 grid-cols-5 gap-2 border-t border-st-line bg-st-panel px-3 py-2.5 lg:hidden" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skel key={i} className="mx-auto h-8 w-12 rounded-full" />
        ))}
      </nav>
    </main>
  );
}
