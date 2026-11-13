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
 * Video Editor entry: the editor itself is per-project (at /projects/[id]).
 * This page is the honest front door — continue the most recent project,
 * or pick any project to edit.
 */
export default function VideoEditorPage() {
  const router = useRouter();
  const nav = useBrandNav();
  const [signedIn, setSignedIn] = useState(false);

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
  const recent = projects[0];

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-5xl mx-auto">
        <div className="pb-8 border-b border-sand-200">
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink">
            Video <em className="italic text-sand-600">Editor</em>
          </h1>
          <p className="mt-2 text-[14px] text-sand-800">The editor opens per project. Captions, templates, overlays and adjust, all in one studio.</p>
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
              <p className="font-serif text-2xl font-semibold text-ink">No project to edit <em className="italic text-sand-600">yet.</em></p>
              <p className="mx-auto mt-3 max-w-[42ch] text-[14px] leading-relaxed text-sand-800">Create a project first. The editor opens as soon as it exists.</p>
              <Link href="/captions" className="mt-7 inline-block rounded-full bg-ink px-7 py-3 font-sora text-[13px] font-semibold text-dune-white hover:bg-sand-800 transition-all">Go to Captions</Link>
            </div>
          ) : (
            <>
              {recent ? (
                <button onClick={() => nav.go(`/projects/${recent.id}`, "Opening your project")} className="block w-full rounded-xl border border-sand-200 bg-white p-6 text-left transition-colors hover:border-sand-500 cursor-pointer">
                  <p className="font-sora text-[11px] font-semibold uppercase tracking-wider text-sand-500">Continue editing</p>
                  <p className="mt-2 truncate font-sora text-[18px] font-bold text-ink">{recent.title}</p>
                  <p className="mt-1 text-[13px] text-sand-700">Your most recent project — jump straight back into the studio.</p>
                </button>
              ) : null}
              <h2 className="mt-8 font-sora text-[15px] font-bold text-ink">All projects</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((p) => (
                  <button key={p.id} onClick={() => nav.go(`/projects/${p.id}`, "Opening your project")} className="rounded-xl border border-sand-200 bg-white p-5 text-left transition-colors hover:border-sand-500 cursor-pointer">
                    <p className="truncate font-sora text-[14px] font-bold text-ink">{p.title}</p>
                    <p className="mt-1 text-[12px] text-sand-600">{new Date(p.created_at).toLocaleDateString()}</p>
                    <p className="mt-3 font-sora text-[12px] font-semibold text-sand-800">Open in editor</p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
