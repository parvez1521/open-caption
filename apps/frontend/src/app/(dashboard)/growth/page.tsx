"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import StudioShell from "@/components/studio/StudioShell";
import { AccountsBar } from "@/features/growth/AccountsBar";
import { GrowthCoach } from "@/features/growth/GrowthCoach";
import { fetchGrowthPosts } from "@/features/growth/api";
import { starterQuestions, type CoachSections } from "@/features/growth/coach";
import type { GrowthPost } from "@/features/growth/model";
import {
  computeBestHours,
  computeOverview,
  computeTopBottom,
  computeTrend,
} from "@/features/growth/report";

/** The report sections the Coach's starter questions read — the same set the chat route builds server-side. */
function sectionsAt(posts: GrowthPost[], now: number): CoachSections {
  return {
    overview: computeOverview(posts, now),
    bestHours: computeBestHours(posts),
    topBottom: computeTopBottom(posts, now),
    trend: computeTrend(posts, now),
  };
}

/**
 * Growth Studio — chat-first (owner order 2026-11-11: vidIQ-style page).
 *
 * The page is exactly two things: the accounts bar at the top (connected
 * YouTube / Instagram, sync, disconnect) and the Growth Coach filling the
 * rest of the viewport. The old dashboard sections that used to sit under
 * the coach (the post list with its manual form, the spreadsheet import,
 * the competitor profiles, and the weekly report and plan cards) were
 * removed from this page on the same order; their APIs, tables and stored
 * data are untouched (sync still fills growth_posts, the Coach still
 * answers from those rows server-side, and the Reel Analyzer still saves
 * competitor breakdowns), and the removal is reversible from git.
 *
 * The only data this page itself loads is the caller's post list, and only
 * to compute the Coach's starter questions from data presence — nothing
 * of it is rendered.
 */
export default function GrowthPage() {
  const router = useRouter();
  const [starters, setStarters] = useState<string[]>([]);
  const [growthReady, setGrowthReady] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push(isSupabaseConfigured() ? "/login" : "/start");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchGrowthPosts();
        if (cancelled) return;
        setGrowthReady(list.ready);
        setStarters(starterQuestions(list.posts, sectionsAt(list.posts, Date.now())));
      } catch {
        if (cancelled) return;
        // Starters fall back to the getting-started set; the accounts bar
        // and the Coach run on their own routes either way.
        setGrowthReady(true);
        setStarters(starterQuestions([], sectionsAt([], Date.now())));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, reloadKey]);

  return (
    <StudioShell>
      <div className="mx-auto flex min-h-[calc(100dvh-57px)] w-full max-w-5xl flex-col px-4 pb-4 pt-5 sm:px-10 sm:pt-6 md:min-h-dvh">
        <AccountsBar onSynced={() => setReloadKey((k) => k + 1)} />
        {!growthReady ? (
          <p role="alert" className="mt-4 rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-4 py-3 text-[13px] leading-relaxed text-obsidian">
            Growth Studio is not set up on the server yet — a database update is pending. Connecting an
            account and asking the Coach won&apos;t work until then.
          </p>
        ) : null}
        <GrowthCoach starters={starters} />
      </div>
    </StudioShell>
  );
}
