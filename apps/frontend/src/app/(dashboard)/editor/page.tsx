"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, redirect } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import { projectsService } from "@/services/projects";
import StudioShell from "@/components/studio/StudioShell";
import { ProjectCardsSkeleton } from "@/components/brand/Skeletons";
import { useBrandNav } from "@/components/brand/BrandNav";
import { AI_EDIT_ENABLED } from "@/features/studio/aiEditEnabled";
import { createBlankAiEditProject } from "@/features/studio/aiEditFlow";

/**
 * AI Edit entry: the editor itself is per-project (at /projects/[id]).
 * This page is the honest front door — continue the most recent project,
 * or pick any project to edit.
 *
 * Starting a NEW AI Edit happens here too: the "New AI Edit project"
 * button creates a blank AI-Edit project (no captions, no transcription)
 * and opens it, where the guided 5-step panel (upload → listen → visual
 * prompts → Puter generate → add to timeline) lives. It used to live
 * only on the Dashboard, so opening AI Edit from the sidebar showed
 * nothing but old projects.
 *
 * HIDDEN (owner order 2026-11-25): while AI_EDIT_ENABLED is false this
 * page redirects to /dashboard instead of rendering — the Dashboard lists
 * every project, so no project access is lost. The page below stays
 * intact; flipping the flag restores this front door as-is.
 */
export default function VideoEditorPage() {
  // The flag is a module constant that never changes at runtime, so this
  // early redirect cannot reorder the hooks below it.
  if (!AI_EDIT_ENABLED) redirect("/dashboard");
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

  // New AI Edit: a BLANK project in its own flow — no captions, no
  // transcription. Same creation as the Dashboard entry; opening it lands
  // on the guided 5-step panel in the Studio.
  const handleCreateAiEdit = async () => {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    const done = nav.busy("Creating your AI Edit project");
    try {
      const blank = await createBlankAiEditProject({
        createProject: projectsService.createProject,
        // the server tag is the cross-device flag; a failed write never fails creation (the local flag still holds)
        tagProject: (id, tags) => projectsService.updateProjectOrg(id, { tags }),
      });
      nav.go(blank.timelineUrl, "Opening your AI Edit project");
    } catch (err: any) {
      setCreateError(err?.message || "Couldn't create the project. Please try again.");
    } finally {
      done();
      setCreating(false);
    }
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectsService.getAllProjects({ includeArchived: false }),
    enabled: signedIn,
  });
  const projects = data?.projects ?? [];
  const recent = projects[0];

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-5xl mx-auto">
        <div className="pb-8 border-b border-sand-200">
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink">
            AI <em className="italic text-sand-600">Edit</em>
          </h1>
          <p className="mt-2 text-[14px] text-sand-800">The editor opens per project. Captions, templates, overlays and adjust, all in one studio.</p>
          <button type="button" onClick={() => void handleCreateAiEdit()} disabled={creating} className="mt-5 rounded-full bg-ink px-6 py-2.5 font-sora text-[12px] font-semibold text-dune-white hover:bg-sand-800 disabled:opacity-60 transition-all cursor-pointer">{creating ? "Creating…" : "New AI Edit project"}</button>
          {createError ? <p role="alert" className="mt-3 text-[13px] text-red-700">{createError}</p> : null}
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
              <p className="mx-auto mt-3 max-w-[42ch] text-[14px] leading-relaxed text-sand-800">Start a new AI Edit — upload a video and the guided panel walks you through listen, visual prompts and Puter generation.</p>
              <button type="button" onClick={() => void handleCreateAiEdit()} disabled={creating} className="mt-7 inline-block rounded-full bg-ink px-7 py-3 font-sora text-[13px] font-semibold text-dune-white hover:bg-sand-800 disabled:opacity-60 transition-all cursor-pointer">{creating ? "Creating…" : "New AI Edit project"}</button>
              <p className="mt-4 text-[13px] text-sand-700">Or <Link href="/captions" className="font-semibold text-ink underline">go to Captions</Link> for a caption project.</p>
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
