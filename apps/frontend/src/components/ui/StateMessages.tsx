"use client";

import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Shared empty / error / success / forbidden states (production-pages
 * audit). The app had the same patterns written ad hoc in ProjectsList,
 * billing, exports and stickers — one component each, same copy slots, so
 * a surface that already works keeps its words and the next one does not
 * invent new ones. All copy comes from the caller; nothing here invents
 * product facts.
 */

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-sand-300 bg-sand-50 px-8 py-12 text-center" role="status">
      <p className="font-sora text-[14px] font-semibold text-ink">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-sand-800">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = "Retry",
}: {
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-orange-accent/60 bg-orange-accent/10 p-8 text-center" role="alert">
      <p className="font-sora text-[14px] font-semibold text-obsidian">{title}</p>
      {description ? <p className="text-[13px] text-obsidian">{description}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-orange-accent/60 px-5 py-2 font-sora text-[12px] font-semibold text-obsidian hover:bg-orange-accent/20 transition-colors cursor-pointer"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function SuccessState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1 rounded-xl border border-emerald-accent/60 bg-emerald-accent/10 p-5" role="status">
      <p className="font-sora text-[14px] font-semibold text-obsidian">{title}</p>
      {description ? <p className="text-[13.5px] leading-relaxed text-obsidian">{description}</p> : null}
    </div>
  );
}

/**
 * Permission-denied state (production-pages audit, 403 row). Says what is
 * restricted and what to do — sign in, or continue as a guest where that
 * is allowed — and never names the protected thing that was refused.
 */
export function ForbiddenState({
  title = "You don't have access to this",
  description = "This needs a signed-in account. Sign in to continue, or keep going as a guest where that is allowed.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <main id="main-content" className="grid min-h-[100svh] place-items-center bg-[#141412] px-6 text-center text-[#FFFFEB]">
      <div>
        <p className="font-mono text-sm text-[#FFFFEB]/60">403</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mx-auto mt-2 max-w-[46ch] text-[15px] leading-relaxed text-[#FFFFEB]/65">{description}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/login" className="inline-block rounded-full bg-[#FFFFEB] px-5 py-2.5 text-sm font-semibold text-[#141412]">
            Sign in
          </Link>
          <Link href="/start" className="inline-block rounded-full border border-[#FFFFEB]/25 px-5 py-2.5 text-sm font-semibold text-[#FFFFEB]">
            Continue as guest
          </Link>
        </div>
      </div>
    </main>
  );
}
