"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import { projectsService } from "@/services/projects";
import StudioShell from "@/components/studio/StudioShell";
import { ProjectCardsSkeleton } from "@/components/brand/Skeletons";
import { AiClipperWorkspace } from "@/features/ai-clipper/AiClipperWorkspace";

/**
 * AI Clipper — a separate section from the Clipper panel (/clipper), not a
 * rename and not a redirect. Same shipped highlight engine underneath, with
 * Slice 1 on top: cross-window rerank calibration, durable runs that resume
 * after a closed tab, and a real Cancel button. Pick a captioned project and
 * the section ranks its moments; uploading and transcription still happen in
 * the project's Studio — this page never takes a link or a file.
 */
function AiClipperPageInner() {
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
  const queryClient = useQueryClient();
  const selectedId = searchParams.get("project");
  const select = (id: string) => {
    router.replace(`/ai-clipper?project=${id}`, { scroll: false });
  };

  const startNew = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const used = projects.map((p) => /^Untitled (\d+)$/i.exec(p.title.trim())?.[1]).filter(Boolean).map(Number);
      const project = await projectsService.createProject(`Untitled ${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0")}`);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      select(project.id);
      setCreating(false);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Couldn't create a project. Try again.");
      setCreating(false);
    }
  };

  return (
    <StudioShell>
      <div className="min-h-full bg-[#141412] px-4 sm:px-10 py-8 sm:py-10">
        <div className="max-w-5xl mx-auto">
          <div className="pb-8 border-b border-[#FFFFEB]/10">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#FFFFEB]">AI Clipper</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-[#FFFFEB]/70 max-w-2xl">
              Long-form video in, ranked short clips out. Moments are scored across the whole video. Runs resume where they stopped. Scores are editorial estimates, never performance predictions.
            </p>
            <button
              onClick={() => void startNew()}
              disabled={creating}
              className="mt-5 rounded-full bg-[#34D399] px-5 py-2.5 text-sm font-bold text-[#141412] disabled:opacity-50"
            >
              {creating ? "Creating project…" : "Start with a new long video"}
            </button>
            <p className="mt-3 text-[13px] text-[#FFFFEB]/60">Your plan&apos;s length limit applies — Free covers up to 5 minutes.</p>
            {createError ? <p role="alert" className="mt-3 text-[13px] font-medium text-[#FFA946]">{createError}</p> : null}
          </div>

          <div className="pt-8">
            {isLoading ? (
              <ProjectCardsSkeleton />
            ) : isError ? (
              <div className="rounded-xl border border-[#FFA946]/60 bg-[#FFA946]/10 p-8 text-center space-y-3">
                <p className="text-[14px] font-semibold text-[#FFFFEB]">Couldn&apos;t load your projects.</p>
                <button onClick={() => refetch()} className="rounded-full border border-[#FFFFEB]/20 px-4 py-2 text-sm font-semibold text-[#FFFFEB]">Retry</button>
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#FFFFEB]/20 bg-[#1C1C1A] px-8 py-16 text-center">
                <p className="text-2xl font-bold text-[#FFFFEB]">No long video yet.</p>
                <p className="mx-auto mt-2 max-w-md text-[14px] text-[#FFFFEB]/70">Start with a new long video above. Upload it in the studio. Let the captions finish. The ranked clips will appear here.</p>
              </div>
            ) : (
              <>
                <h2 className="text-[13px] font-bold uppercase tracking-wider text-[#FFFFEB]/60">Pick a project to clip</h2>
                <ul className="mt-4 space-y-2">
                  {projects.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        aria-pressed={selectedId === p.id}
                        onClick={() => select(p.id)}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left ${selectedId === p.id ? "border-[#34D399] bg-[#1C1C1A]" : "border-[#FFFFEB]/10 bg-[#1C1C1A]"}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold text-[#FFFFEB]">{p.title}</span>
                          <span className="block text-[12px] text-[#FFFFEB]/60">Last edited {new Date(p.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
                        </span>
                        <span className="shrink-0 text-[12px] font-semibold text-[#FFFFEB]/60">{selectedId === p.id ? "Selected" : "Clip this →"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {selectedId ? (
            <div className="pt-8">
              <h2 className="text-[13px] font-bold uppercase tracking-wider text-[#FFFFEB]/60">
                {projects.find((p) => p.id === selectedId)?.title ?? "Project"} — ranked clips
              </h2>
              <div className="mt-4 rounded-2xl border border-[#FFFFEB]/10 bg-[#1C1C1A] p-4 sm:p-6">
                <AiClipperWorkspace key={selectedId} projectId={selectedId} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </StudioShell>
  );
}

export default function AiClipperPage() {
  return (
    <Suspense fallback={null}>
      <AiClipperPageInner />
    </Suspense>
  );
}
