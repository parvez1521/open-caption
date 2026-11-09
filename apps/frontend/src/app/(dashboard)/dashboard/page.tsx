"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { projectsService } from "@/services/projects";
import { authService } from "@/services/auth";
import { isSupabaseConfigured } from "@/services/auth/supabaseClient";
import { Project, ProjectStatus, User } from "@/services/types";
import StudioShell from "@/components/studio/StudioShell";
import { useBrandNav } from "@/components/brand/BrandNav";
import { LogoWave } from "@/components/brand/LogoWave";
import { ProjectCardsSkeleton } from "@/components/brand/Skeletons";
import { studioService } from "@/services/studio";

const STATUS_CHIP: Record<ProjectStatus, { label: string; cls: string; pulse?: boolean }> = {
  CREATED: { label: "draft", cls: "border border-sand-300 text-sand-700 bg-white" },
  UPLOADED: { label: "ready to style", cls: "bg-sand-200 text-sand-800" },
  PROCESSING: { label: "processing", cls: "bg-sand-200 text-sand-800", pulse: true },
  COMPLETED: { label: "rendered", cls: "bg-ink text-dune-white" },
  FAILED: { label: "failed", cls: "border border-orange-accent/60 text-obsidian bg-orange-accent/10" },
};

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function DashboardPage() {
  const router = useRouter();
  const nav = useBrandNav();
  const qc = useQueryClient();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  // signed in on this device? (read from the stored session: the projects request must not wait on anything else)
  const [signedIn, setSignedIn] = useState(false);
  /** how many deletions are still finishing on the server */
  const [deleting, setDeleting] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  /** cards removed from the screen the moment delete is confirmed (the server catches up in the background) */
  const [hiding, setHiding] = useState<string[]>([]);

  // fetch the speech model files while the person is on their way to the studio (idle, and not on a metered connection)
  useEffect(() => { void import("@/features/transcribe/browserWhisper").then((m) => m.warmSpeechModel()); }, []);

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      // No backend configured: there is no sign-in to bounce to — send them to
      // the guest entry, which explains the state. Configured: as before.
      router.push(isSupabaseConfigured() ? "/login" : "/start");
      return;
    }
    setSignedIn(true);
    authService.getCurrentUser().then(setCurrentUser);
  }, [router]);

  const {
    data: projects = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => projectsService.getProjects(),
    enabled: signedIn,
  });

  // get the studio ready before it is asked for: its code, and the newest project's data
  useEffect(() => {
    if (!projects.length) return;
    projects.slice(0, 4).forEach((p) => router.prefetch(`/projects/${p.id}`));
    void qc.prefetchQuery({ queryKey: ["studio", projects[0]!.id], queryFn: () => studioService.getStudio(projects[0]!.id), staleTime: 15_000 });
  }, [projects, router, qc]);
  const warmProject = (id: string) => void qc.prefetchQuery({ queryKey: ["studio", id], queryFn: () => studioService.getStudio(id), staleTime: 15_000 });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    setCreateError(null);
    const done = nav.busy("Creating your project");
    try {
      const created = await projectsService.createProject(newTitle.trim());
      setCreateOpen(false);
      setNewTitle("");
      // the wave carries straight on into opening the new project
      nav.go(`/projects/${created.id}`, "Opening your project");
    } catch (err: any) {
      setCreateError(err.message || "Couldn't create the project. Please try again.");
    } finally {
      done();
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    // gone from the screen this instant; the server (and the wave pill) catch up in the background
    setHiding((h) => [...h, target.id]);
    setDeleting((n) => n + 1);
    try {
      await Promise.all([projectsService.deleteProject(target.id), new Promise((r) => setTimeout(r, 700))]);
      qc.removeQueries({ queryKey: ["studio", target.id] });
    } catch (err: any) {
      setHiding((h) => h.filter((id) => id !== target.id));
      window.alert(err?.message || "Couldn't delete the project. It is back in your list.");
    } finally {
      setDeleting((n) => n - 1);
      refetch();
    }
  };

  const firstName = currentUser?.name?.split(" ")[0];

  return (
    <StudioShell>
      <div className="px-4 sm:px-10 py-8 sm:py-10 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 pb-8 border-b border-sand-200">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-[-0.015em] text-ink break-words">
              {firstName ? (
                <>
                  Welcome back, <em className="italic text-sand-600">{firstName}.</em>
                </>
              ) : (
                "Your projects"
              )}
            </h1>
            <p className="mt-2 text-[14px] text-sand-800">
              Every clip you're captioning, in one place. Projects are deleted automatically 24 hours after they're created, so export what you need.
            </p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="rounded-full bg-ink px-6 py-3 font-sora text-[13px] font-semibold text-dune-white hover:bg-sand-800 active:scale-[0.98] transition-all cursor-pointer"
          >
            + New project
          </button>
        </div>

        {/* Body */}
        <div className="pt-8">
          {isLoading ? (
            <ProjectCardsSkeleton />
          ) : isError ? (
            <div className="rounded-xl border border-orange-accent/60 bg-orange-accent/10 p-8 text-center space-y-3">
              <p className="font-sora text-[14px] font-semibold text-obsidian">
                Couldn't load your projects.
              </p>
              <p className="text-[13px] text-obsidian">
                The backend may be offline. Start it, then try again.
              </p>
              <button
                onClick={() => refetch()}
                className="rounded-full border border-orange-accent/60 px-5 py-2 font-sora text-[12px] font-semibold text-obsidian hover:bg-orange-accent/20 transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-sand-300 bg-sand-50 px-8 py-16 text-center">
              <p className="font-serif text-2xl font-semibold text-ink">
                Nothing here yet — <em className="italic text-sand-600">let's fix that.</em>
              </p>
              <p className="mx-auto mt-3 max-w-[42ch] text-[14px] leading-relaxed text-sand-800">
                Create a project, drop in a talking-head clip, and you'll have
                cinematic captions on it in minutes.
              </p>
              <button
                onClick={() => setCreateOpen(true)}
                className="mt-7 rounded-full bg-ink px-7 py-3 font-sora text-[13px] font-semibold text-dune-white hover:bg-sand-800 transition-all cursor-pointer"
              >
                Create your first project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {projects.filter((p) => !hiding.includes(p.id)).map((project) => {
                const chip = STATUS_CHIP[project.status] ?? STATUS_CHIP.CREATED;
                return (
                  <div
                    key={project.id}
                    onClick={() => nav.go(`/projects/${project.id}`, "Opening your project")}
                    onPointerEnter={() => warmProject(project.id)}
                    onTouchStart={() => warmProject(project.id)}
                    className="group relative flex h-32 cursor-pointer flex-col justify-between rounded-xl border border-sand-200 bg-white p-4 sm:h-40 sm:p-5 transition-all hover:border-sand-500 hover:shadow-sand-soft"
                  >
                    <div className="min-w-0">
                      <h3 className="truncate pr-8 font-sora text-[15px] font-bold text-ink">
                        {project.title}
                      </h3>
                      <p className="mt-1 font-mono text-[11px] text-sand-600">
                        {project.id.slice(0, 8)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between">
                      <span
                        className={`rounded-full px-3 py-1 font-sora text-[11px] font-semibold ${chip.cls}`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {chip.pulse && (
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sand-600" />
                          )}
                          {chip.label}
                        </span>
                      </span>
                      <span className="text-[12px] text-sand-600">{timeAgo(project.created_at)}</span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteError(null);
                        setDeleteTarget(project);
                      }}
                      title="Delete project"
                      aria-label="Delete project"
                      className="absolute right-2 top-2 rounded-lg p-2.5 text-sand-500 opacity-100 transition-all hover:bg-orange-accent/10 hover:text-obsidian sm:right-3 sm:top-3 sm:p-2 sm:text-sand-400 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 cursor-pointer"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] p-4"
          onClick={() => !creating && setCreateOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sand-deep animate-fade-in-up sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-serif text-2xl font-semibold text-ink">New project</h3>
            <p className="mt-1 text-[13px] text-sand-800">
              Name it after the clip — you can change this later.
            </p>

            {createError && (
              <div className="mt-4 rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-4 py-3 text-[13px] text-obsidian">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreate} className="mt-5 space-y-5">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Podcast ep. 12 — hook cut"
                autoFocus
                required
                disabled={creating}
                className="w-full rounded-lg border border-sand-300 bg-white px-4 py-3 text-[14px] text-ink placeholder:text-sand-500 outline-none transition-colors focus:border-sand-600 focus:ring-2 focus:ring-sand-200"
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  disabled={creating}
                  className="rounded-full border border-sand-300 px-5 py-2.5 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newTitle.trim()}
                  className="rounded-full bg-ink px-6 py-2.5 font-sora text-[12px] font-semibold text-dune-white hover:bg-sand-800 disabled:opacity-60 transition-all cursor-pointer"
                >
                  {creating ? "Creating…" : "Create project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sand-deep animate-fade-in-up sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-serif text-2xl font-semibold text-ink">Delete this project?</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-sand-800">
              <strong className="text-ink">"{deleteTarget.title}"</strong> and its uploads,
              transcript, and exports will be removed. This can't be undone.
            </p>

            {deleteError && (
              <div className="mt-4 rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-4 py-3 text-[13px] text-obsidian">
                {deleteError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-full border border-sand-300 px-5 py-2.5 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink transition-colors cursor-pointer"
              >
                Keep it
              </button>
              <button
                onClick={handleDelete}
                className="rounded-full bg-orange-accent px-6 py-2.5 font-sora text-[12px] font-semibold text-obsidian hover:bg-orange-accent/85 transition-all cursor-pointer"
              >
                Delete project
              </button>
            </div>
          </div>
        </div>
      )}
      {deleting > 0 && (
        <div role="status" aria-live="polite" className="ce-veil-card fixed bottom-6 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-5 py-3 font-sora text-[13px] font-semibold text-dune-white shadow-sand-deep">
          <LogoWave height={18} />
          Deleting project…
        </div>
      )}
    </StudioShell>
  );
}
