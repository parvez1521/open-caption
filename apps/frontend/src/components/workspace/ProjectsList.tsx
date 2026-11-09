"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { projectsService } from "@/services/projects";
import { Project, ProjectStatus } from "@/services/types";
import { useBrandNav } from "@/components/brand/BrandNav";
import { LogoWave } from "@/components/brand/LogoWave";
import { ProjectCardsSkeleton } from "@/components/brand/Skeletons";
import { studioService } from "@/services/studio";
import { countByView, filterProjects, type ProjectView } from "@/lib/workspace/projects-filter";

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

const VIEWS: { id: ProjectView; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "archived", label: "Archived" },
  { id: "all", label: "All" },
];

/**
 * The projects list, shared by Dashboard and Captions: search by title,
 * Active / Archived / All views, create + open flows, and per-project actions
 * (Open, Duplicate, Archive / Unarchive, Delete) wired to the real project APIs.
 */
export default function ProjectsList() {
  const router = useRouter();
  const nav = useBrandNav();
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteError] = useState<string | null>(null);
  const [hiding, setHiding] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ProjectView>("active");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  useEffect(() => { void import("@/features/transcribe/browserWhisper").then((m) => m.warmSpeechModel()); }, []);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectsService.getProjectsPage({ includeArchived: true, limit: 100 }),
  });
  const projects = data?.projects ?? [];

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

  const runAction = async (label: string, fn: () => Promise<unknown>) => {
    setMenuFor(null);
    setActionBusy(label);
    try {
      await fn();
      await refetch();
    } catch (err: any) {
      window.alert(err?.message || `${label} failed. Please try again.`);
    } finally {
      setActionBusy(null);
    }
  };

  const counts = countByView(projects);
  const visible = filterProjects(projects, query, view).filter((p) => !hiding.includes(p.id));

  return (
    <div>
      {/* Toolbar: search, archive views, create */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-52 flex-1 items-center gap-2 rounded-lg border border-sand-300 bg-white px-3 py-2.5 sm:max-w-xs">
          <svg className="h-4 w-4 shrink-0 text-sand-500" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M20 20l-3.5-3.5" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects by title" aria-label="Search projects by title" className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-sand-500" />
        </label>
        <div className="flex rounded-full border border-sand-300 p-1" role="tablist" aria-label="Project views">
          {VIEWS.map((v) => (
            <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)} className={`rounded-full px-3.5 py-1.5 font-sora text-[12px] font-semibold transition-colors cursor-pointer ${view === v.id ? "bg-ink text-dune-white" : "text-sand-700 hover:text-ink"}`}>
              {v.label} ({counts[v.id]})
            </button>
          ))}
        </div>
        <button onClick={() => setCreateOpen(true)} className="ml-auto rounded-full bg-ink px-6 py-3 font-sora text-[13px] font-semibold text-dune-white hover:bg-sand-800 active:scale-[0.98] transition-all cursor-pointer">
          + New project
        </button>
      </div>
      {actionBusy ? <p role="status" className="mt-3 text-[13px] text-sand-700">{actionBusy}…</p> : null}

      <div className="pt-6">
        {isLoading ? (
          <ProjectCardsSkeleton />
        ) : isError ? (
          <div className="rounded-xl border border-orange-accent/60 bg-orange-accent/10 p-8 text-center space-y-3">
            <p className="font-sora text-[14px] font-semibold text-obsidian">Couldn&apos;t load your projects.</p>
            <p className="text-[13px] text-obsidian">The backend may be offline. Start it, then try again.</p>
            <button onClick={() => refetch()} className="rounded-full border border-orange-accent/60 px-5 py-2 font-sora text-[12px] font-semibold text-obsidian hover:bg-orange-accent/20 transition-colors cursor-pointer">Retry</button>
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-sand-300 bg-sand-50 px-8 py-16 text-center">
            <p className="font-serif text-2xl font-semibold text-ink">Nothing here yet — <em className="italic text-sand-600">let&apos;s fix that.</em></p>
            <p className="mx-auto mt-3 max-w-[42ch] text-[14px] leading-relaxed text-sand-800">Create a project, drop in a talking-head clip, and you&apos;ll have cinematic captions on it in minutes.</p>
            <button onClick={() => setCreateOpen(true)} className="mt-7 rounded-full bg-ink px-7 py-3 font-sora text-[13px] font-semibold text-dune-white hover:bg-sand-800 transition-all cursor-pointer">Create your first project</button>
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-sand-300 bg-sand-50 px-8 py-12 text-center">
            <p className="font-sora text-[14px] font-semibold text-ink">{query ? `No projects match “${query}” in this view.` : view === "archived" ? "No archived projects." : "Nothing in this view."}</p>
            {query ? <button onClick={() => setQuery("")} className="mt-4 rounded-full border border-sand-300 px-5 py-2 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink transition-colors cursor-pointer">Clear search</button> : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {visible.map((project) => {
              const chip = STATUS_CHIP[project.status] ?? STATUS_CHIP.CREATED;
              const menuOpen = menuFor === project.id;
              return (
                <div key={project.id} onClick={() => nav.go(`/projects/${project.id}`, "Opening your project")} onPointerEnter={() => warmProject(project.id)} onTouchStart={() => warmProject(project.id)} className="group relative flex h-32 cursor-pointer flex-col justify-between rounded-xl border border-sand-200 bg-white p-4 sm:h-40 sm:p-5 transition-all hover:border-sand-500 hover:shadow-sand-soft">
                  <div className="min-w-0">
                    <h3 className="truncate pr-10 font-sora text-[15px] font-bold text-ink">{project.title}</h3>
                    <p className="mt-1 font-mono text-[11px] text-sand-600">{project.id.slice(0, 8)}{project.archived_at ? " · archived" : ""}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`rounded-full px-3 py-1 font-sora text-[11px] font-semibold ${chip.cls}`}>
                      <span className="inline-flex items-center gap-1.5">
                        {chip.pulse && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sand-600" />}
                        {chip.label}
                      </span>
                    </span>
                    <span className="text-[12px] text-sand-600">{timeAgo(project.created_at)}</span>
                  </div>

                  <button onClick={(e) => { e.stopPropagation(); setMenuFor(menuOpen ? null : project.id); }} title="Project actions" aria-label={`Actions for ${project.title}`} aria-expanded={menuOpen} className="absolute right-2 top-2 rounded-lg p-2.5 text-sand-500 transition-all hover:bg-sand-100 hover:text-ink sm:right-3 sm:top-3 sm:p-2 cursor-pointer">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
                  </button>
                  {menuOpen ? (
                    <>
                      <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuFor(null); }} />
                      <div role="menu" className="absolute right-2 top-11 z-20 w-44 rounded-xl border border-sand-200 bg-white p-1.5 shadow-sand-deep" onClick={(e) => e.stopPropagation()}>
                        <button role="menuitem" onClick={() => { setMenuFor(null); nav.go(`/projects/${project.id}`, "Opening your project"); }} className="block w-full rounded-lg px-3 py-2 text-left font-sora text-[13px] font-semibold text-ink hover:bg-sand-100 cursor-pointer">Open</button>
                        <button role="menuitem" onClick={() => void runAction("Duplicating project", () => projectsService.duplicateProject(project.id))} className="block w-full rounded-lg px-3 py-2 text-left font-sora text-[13px] font-semibold text-ink hover:bg-sand-100 cursor-pointer">Duplicate</button>
                        {project.archived_at ? (
                          <button role="menuitem" onClick={() => void runAction("Restoring project", () => projectsService.unarchiveProject(project.id))} className="block w-full rounded-lg px-3 py-2 text-left font-sora text-[13px] font-semibold text-ink hover:bg-sand-100 cursor-pointer">Unarchive</button>
                        ) : (
                          <button role="menuitem" onClick={() => void runAction("Archiving project", () => projectsService.archiveProject(project.id))} className="block w-full rounded-lg px-3 py-2 text-left font-sora text-[13px] font-semibold text-ink hover:bg-sand-100 cursor-pointer">Archive</button>
                        )}
                        <button role="menuitem" onClick={() => { setMenuFor(null); setDeleteTarget(project); }} className="block w-full rounded-lg px-3 py-2 text-left font-sora text-[13px] font-semibold text-orange-accent hover:bg-orange-accent/10 cursor-pointer">Delete</button>
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Create modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] p-4" onClick={() => !creating && setCreateOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sand-deep animate-fade-in-up sm:p-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-2xl font-semibold text-ink">New project</h3>
            <p className="mt-1 text-[13px] text-sand-800">Name it after the clip — you can change this later.</p>
            {createError && <div className="mt-4 rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-4 py-3 text-[13px] text-obsidian">{createError}</div>}
            <form onSubmit={handleCreate} className="mt-5 space-y-5">
              <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Podcast ep. 12 — hook cut" autoFocus required disabled={creating} className="w-full rounded-lg border border-sand-300 bg-white px-4 py-3 text-[14px] text-ink placeholder:text-sand-500 outline-none transition-colors focus:border-sand-600 focus:ring-2 focus:ring-sand-200" />
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setCreateOpen(false)} disabled={creating} className="rounded-full border border-sand-300 px-5 py-2.5 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink transition-colors cursor-pointer">Cancel</button>
                <button type="submit" disabled={creating || !newTitle.trim()} className="rounded-full bg-ink px-6 py-2.5 font-sora text-[12px] font-semibold text-dune-white hover:bg-sand-800 disabled:opacity-60 transition-all cursor-pointer">{creating ? "Creating…" : "Create project"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] p-4" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sand-deep animate-fade-in-up sm:p-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-2xl font-semibold text-ink">Delete this project?</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-sand-800"><strong className="text-ink">&quot;{deleteTarget.title}&quot;</strong> and its uploads, transcript, and exports will be removed. This can&apos;t be undone.</p>
            {deleteError && <div className="mt-4 rounded-lg border border-orange-accent/60 bg-orange-accent/10 px-4 py-3 text-[13px] text-obsidian">{deleteError}</div>}
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="rounded-full border border-sand-300 px-5 py-2.5 font-sora text-[12px] font-semibold text-sand-800 hover:border-ink hover:text-ink transition-colors cursor-pointer">Keep it</button>
              <button onClick={handleDelete} className="rounded-full bg-orange-accent px-6 py-2.5 font-sora text-[12px] font-semibold text-obsidian hover:bg-orange-accent/85 transition-all cursor-pointer">Delete project</button>
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
    </div>
  );
}
