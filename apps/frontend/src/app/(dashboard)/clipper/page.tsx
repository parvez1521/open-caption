"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import { projectsService } from "@/services/projects";
import StudioShell from "@/components/studio/StudioShell";
import { ProjectCardsSkeleton } from "@/components/brand/Skeletons";
import { useBrandNav } from "@/components/brand/BrandNav";

/**
 * Clipper entry: long-form video in, short captioned clips out. The real work reuses the normal
 * studio flow — a project is uploaded and transcribed on-device exactly as always, and its
 * Clipper panel (opened directly from here) proposes segments from the transcript and creates
 * a normal caption project per clip. This page is the honest front door, not a second pipeline.
 */
export default function ClipperPage() {
  const router = useRouter();
  const nav = useBrandNav();
  const [signedIn, setSignedIn] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      router.push(isSupabaseConfigured() ? "/login" : "/start");
      return;
    }
    setSignedIn(true);
  }, [router]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectsService.getProjectsPage({ includeArchived: false, limit: 100 }),
    enabled: signedIn,
  });
  const projects = data?.projects ?? [];

  const startNew = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const used = projects.map((p) => /^Untitled (\d+)$/i.exec(p.title.trim())?.[1]).filter(Boolean).map(Number);
      const project = await projectsService.createProject(`Untitled ${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0")}`);
      // the studio's upload + on-device transcription run as normal; the Clipper panel opens when captions land
      router.push(`/projects/${project.id}?clipper=1`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Couldn't create a project. Try again.");
      setCreating(false);
    }
  };

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-5xl mx-auto">
        <div className="pb-8 border-b border-sand-200">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink">
              <em className="italic text-sand-600">Clipper</em>
            </h1>
          </div>
          <p className="mt-2 text-[14px] text-sand-800 max-w-2xl">
            Long-form video in, short captioned clips out. Clipper suggests 15–60 second segments
            from your transcript — the speech between the silences — measured on your device. Pick a
            project that already has captions, or start with a new long video.
          </p>
          <button
            onClick={() => void startNew()}
            disabled={creating}
            className="mt-5 rounded-full bg-ink px-5 py-2.5 font-sora text-[13px] font-semibold text-dune-white transition hover:opacity-85 disabled:opacity-50 cursor-pointer"
          >
            {creating ? "Creating project…" : "Start with a new long video"}
          </button>
          {createError ? <p role="alert" className="mt-3 text-[13px] font-medium text-obsidian">{createError}</p> : null}
        </div>

        <div className="pt-8">
          {isLoading ? (
            <ProjectCardsSkeleton />
          ) : isError ? (
            <div className="rounded-xl border border-orange-accent/60 bg-orange-accent/10 p-8 text-center space-y-3">
              <p className="font-sora text-[14px] font-semibold text-obsidian">Couldn&apos;t load your projects.</p>
              <button onClick={() => refetch()} className="rounded-full border border-orange-accent/60 px-5 py-2 font-sora text-[12px] font-semibold text-obsidian hover:bg-orange-accent/20 transition-colors cursor-pointer">Retry</button>
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-sand-300 bg-sand-50 px-8 py-16 text-center">
              <p className="font-serif text-2xl font-semibold text-ink">No long video <em className="italic text-sand-600">yet.</em></p>
              <p className="mx-auto mt-2 max-w-md text-[14px] text-sand-800">Start with a new long video above: upload it in the studio, let the captions finish, and the Clipper panel will suggest the segments.</p>
            </div>
          ) : (
            <>
              <h2 className="font-sora text-[13px] font-bold uppercase tracking-wider text-sand-600">Open a project in the Clipper</h2>
              <ul className="mt-4 space-y-2">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/projects/${p.id}?clipper=1`}
                      onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); nav.go(`/projects/${p.id}?clipper=1`, "Opening the Clipper"); }}
                      className="flex items-center justify-between gap-3 rounded-xl border border-sand-200 bg-sand-50 px-4 py-3 transition hover:border-sand-300 hover:bg-sand-100"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-sora text-[14px] font-semibold text-ink">{p.title}</span>
                        <span className="block text-[12px] text-sand-600">Last edited {new Date(p.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
                      </span>
                      <span className="shrink-0 font-sora text-[12px] font-semibold text-sand-600">Open Clipper →</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[13px] text-sand-700">A project without captions yet opens in the studio first — once its transcript is ready, its Clipper panel lists the suggested segments.</p>
            </>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
