"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import { projectsService } from "@/services/projects";
import StudioShell from "@/components/studio/StudioShell";
import { ProjectCardsSkeleton } from "@/components/brand/Skeletons";
import { ClipperWorkspace } from "@/features/clipper/ClipperWorkspace";

/**
 * Clipper — the standalone workspace (Package 3 item I.1: it opens in its own tab from the
 * nav and from the Studio's launch card). Pick a captioned project and the workspace below
 * proposes segments measured from its transcript, its audio silences and its scene changes,
 * and creates a normal caption project per clip. Uploading and transcription still happen
 * in the project's Studio — this page never pretends otherwise.
 */
function ClipperPageInner() {
  const router = useRouter();
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
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("project"));
  useEffect(() => {
    const q = searchParams.get("project");
    if (q) setSelectedId(q);
  }, [searchParams]);
  const select = (id: string) => {
    setSelectedId(id);
    router.replace(`/clipper?project=${id}`, { scroll: false });
  };

  const startNew = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const used = projects.map((p) => /^Untitled (\d+)$/i.exec(p.title.trim())?.[1]).filter(Boolean).map(Number);
      const project = await projectsService.createProject(`Untitled ${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0")}`);
      // selected here straight away: the workspace shows its honest no-video state, with
      // the link into the Studio where uploading + transcription actually happen
      select(project.id);
      setCreating(false);
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
            Long-form video in, short captioned clips out. Suggestions are measured on your device
            from the transcript, the audio&apos;s silence spans and frame-difference scene changes.
            Pick a project that already has captions, or start with a new long video.
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
              <p className="mx-auto mt-2 max-w-md text-[14px] text-sand-800">Start with a new long video above: upload it in the studio, let the captions finish, and the suggestions will appear here.</p>
            </div>
          ) : (
            <>
              <h2 className="font-sora text-[13px] font-bold uppercase tracking-wider text-sand-600">Pick a project to clip</h2>
              <ul className="mt-4 space-y-2">
                {projects.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-pressed={selectedId === p.id}
                      onClick={() => select(p.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${selectedId === p.id ? "border-ink bg-sand-100" : "border-sand-200 bg-sand-50 hover:border-sand-300 hover:bg-sand-100"}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-sora text-[14px] font-semibold text-ink">{p.title}</span>
                        <span className="block text-[12px] text-sand-600">Last edited {new Date(p.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
                      </span>
                      <span className="shrink-0 font-sora text-[12px] font-semibold text-sand-600">{selectedId === p.id ? "Selected" : "Clip this →"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {selectedId ? (
          <div className="pt-8">
            <h2 className="font-sora text-[13px] font-bold uppercase tracking-wider text-sand-600">
              {projects.find((p) => p.id === selectedId)?.title ?? "Project"} — clip suggestions
            </h2>
            <div className="mt-4">
              <ClipperWorkspace key={selectedId} projectId={selectedId} />
            </div>
          </div>
        ) : null}
      </div>
    </StudioShell>
  );
}

export default function ClipperPage() {
  return (
    <Suspense fallback={null}>
      <ClipperPageInner />
    </Suspense>
  );
}
